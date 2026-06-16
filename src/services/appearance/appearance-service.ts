import { prisma } from "../../db/client.js";
import { identifyCharacter, type IdentifiedCharacter, type Identification } from "./vision.js";
import { perceptualHashFromUrl, hammingDistance } from "./image-hash.js";

// Distância de Hamming máxima (em 64 bits) p/ considerar duas imagens "a mesma OC".
const OC_HASH_MATCH_THRESHOLD = 10;

export type ClaimResult =
  | { status: "OK"; characterName: string; confidence: number; reassignedFrom?: string }
  | { status: "TAKEN"; characterName: string; holderId: string }
  | { status: "NOT_RECOGNIZED" }
  | { status: "AI_UNAVAILABLE" };

// Verifica se um usuário ainda está no servidor.
export type MemberPresenceCheck = (discordId: string) => Promise<boolean>;

// Identifica o personagem numa imagem (sem salvar). Usado para o passo de confirmação.
export { identifyCharacter };
export type { IdentifiedCharacter, Identification };

// Reserva a aparência dado um personagem JÁ identificado (via IA ou digitado pelo usuário).
// - Se já houver dono ativo no servidor, bloqueia.
// - Se o dono saiu do servidor, libera e reatribui.
// - Se for o próprio usuário, atualiza a imagem.
export async function claimWithIdentified(
  discordId: string,
  guildId: string,
  imageUrl: string,
  identified: IdentifiedCharacter,
  isMemberPresent: MemberPresenceCheck,
): Promise<ClaimResult> {
  // OC = personagem original: chave única por usuário; dedup entre usuários
  // é feito por similaridade de imagem (hash perceptual), não pelo nome.
  const key = identified.isOc ? `oc:${discordId}` : identified.key;
  const name = identified.isOc ? "OC (personagem original)" : identified.name;
  const confidence = identified.confidence;

  let reassignedFrom: string | undefined;
  let imageHash: string | null = null;

  // ---- OC: dedup por imagem ----
  if (identified.isOc) {
    imageHash = await perceptualHashFromUrl(imageUrl);
    if (imageHash) {
      const ocs = await prisma.characterAppearance.findMany({
        where: { guildId, characterKey: { startsWith: "oc:" } },
      });
      for (const oc of ocs) {
        if (!oc.imageHash) continue;
        if (oc.discordId === discordId) continue; // própria OC tratada adiante
        if (hammingDistance(imageHash, oc.imageHash) <= OC_HASH_MATCH_THRESHOLD) {
          const present = await isMemberPresent(oc.discordId);
          if (present) {
            return { status: "TAKEN", characterName: "Essa OC", holderId: oc.discordId };
          }
          // dono saiu -> libera e reatribui
          reassignedFrom = oc.discordId;
          await prisma.characterAppearance.delete({ where: { id: oc.id } });
          break;
        }
      }
    }
  }

  // já existe alguém com essa aparência (key) neste servidor?
  const existing = await prisma.characterAppearance.findUnique({
    where: { guildId_characterKey: { guildId, characterKey: key } },
  });

  if (existing) {
    if (existing.discordId === discordId) {
      // próprio dono: atualiza imagem
      await prisma.characterAppearance.update({
        where: { id: existing.id },
        data: { imageUrl, characterName: name, confidence, imageHash },
      });
      return { status: "OK", characterName: name, confidence };
    }

    // outro dono: ainda está no servidor?
    const present = await isMemberPresent(existing.discordId);
    if (present) {
      return { status: "TAKEN", characterName: name, holderId: existing.discordId };
    }

    // dono saiu -> libera
    reassignedFrom = existing.discordId;
    await prisma.characterAppearance.delete({ where: { id: existing.id } });
  }

  // o usuário pode já ter outra aparência neste servidor -> substitui (1 por usuário)
  await prisma.characterAppearance.upsert({
    where: { discordId_guildId: { discordId, guildId } },
    create: { discordId, guildId, characterKey: key, characterName: name, imageUrl, imageHash, confidence },
    update: { characterKey: key, characterName: name, imageUrl, imageHash, confidence },
  });

  return reassignedFrom
    ? { status: "OK", characterName: name, confidence, reassignedFrom }
    : { status: "OK", characterName: name, confidence };
}

export async function getAppearance(discordId: string, guildId: string) {
  return prisma.characterAppearance.findUnique({
    where: { discordId_guildId: { discordId, guildId } },
  });
}

// Remove a aparência de um usuário (saída do servidor ou liberação por admin).
export async function releaseAppearance(discordId: string, guildId: string): Promise<boolean> {
  const res = await prisma.characterAppearance.deleteMany({ where: { discordId, guildId } });
  return res.count > 0;
}
