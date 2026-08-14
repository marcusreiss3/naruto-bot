import { prisma } from "../../db/client.js";
import { createHash, randomBytes } from "node:crypto";
import { identifyCharacter, type IdentifiedCharacter, type Identification } from "./vision.js";
import { perceptualHashFromUrl, hammingDistance } from "./image-hash.js";
import { downloadImageBuffer } from "./image-download.js";
import { BlobError, createObject, deleteObject, hasBlob } from "../blob/blob-client.js";
import { log } from "../../utils/logger.js";

// Distância de Hamming máxima (em 64 bits) p/ considerar duas imagens "a mesma OC".
const OC_HASH_MATCH_THRESHOLD = 10;
const APPEARANCE_IMAGE_EXPIRE_DAYS = 90;
const APPEARANCE_RESERVATION_MS = 180 * 24 * 60 * 60_000;

export type ClaimResult =
  | { status: "OK"; characterName: string; confidence: number; reassignedFrom?: string }
  | { status: "TAKEN"; characterName: string; holderId: string }
  | { status: "NOT_RECOGNIZED" }
  | { status: "AI_UNAVAILABLE" }
  | { status: "STORAGE_UNAVAILABLE" };

// Verifica se um usuário ainda está no servidor.
export type MemberPresenceCheck = (discordId: string) => Promise<boolean>;

function objectName(guildId: string, discordId: string): string {
  const token = createHash("sha256")
    .update(`${guildId}:${discordId}:${Date.now()}:${randomBytes(8).toString("hex")}`)
    .digest("hex")
    .slice(0, 24);
  return `app_${token}`;
}

async function storeAppearanceImage(sourceUrl: string, guildId: string, discordId: string) {
  if (!hasBlob()) throw new BlobError("MISSING_API_KEY", "Blob indisponivel.");
  const image = await downloadImageBuffer(sourceUrl, "aparencia/blob");
  if (!image) throw new Error("Nao foi possivel baixar a imagem para armazenamento.");
  return createObject({
    file: image.buffer,
    mimeType: image.mime,
    name: objectName(guildId, discordId),
    prefix: "appearance",
    expire: APPEARANCE_IMAGE_EXPIRE_DAYS,
  });
}

async function removeBlobObject(objectId: string | null | undefined, reason: string): Promise<void> {
  if (!objectId || !hasBlob()) return;
  try {
    await deleteObject(objectId);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    log.warn(`[aparencia] nao foi possivel apagar Blob (${reason}): ${detail}`);
  }
}

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
  await purgeExpiredAppearances();
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
          await removeBlobObject(oc.blobObjectId, "dono ausente");
          break;
        }
      }
    }
  }

  // já existe alguém com essa aparência (key) neste servidor?
  let existing = await prisma.characterAppearance.findUnique({
    where: { guildId_characterKey: { guildId, characterKey: key } },
  });
  if (existing?.discordId === discordId) existing = null;

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
    await removeBlobObject(existing.blobObjectId, "dono ausente");
  }

  // o usuário pode já ter outra aparência neste servidor -> substitui (1 por usuário)
  let stored: Awaited<ReturnType<typeof storeAppearanceImage>>;
  try {
    stored = await storeAppearanceImage(imageUrl, guildId, discordId);
  } catch (error) {
    log.error("[aparencia] falha ao salvar imagem no Blob:", error);
    return { status: "STORAGE_UNAVAILABLE" };
  }

  const previous = await getAppearance(discordId, guildId);
  try {
    await prisma.characterAppearance.upsert({
      where: { discordId_guildId: { discordId, guildId } },
      create: {
        discordId, guildId, characterKey: key, characterName: name, imageUrl: stored.url,
        blobObjectId: stored.id, imageHash, confidence,
        expiresAt: new Date(Date.now() + APPEARANCE_RESERVATION_MS),
      },
      update: {
        characterKey: key, characterName: name, imageUrl: stored.url, blobObjectId: stored.id,
        imageHash, confidence, expiresAt: new Date(Date.now() + APPEARANCE_RESERVATION_MS),
      },
    });
  } catch (error) {
    await removeBlobObject(stored.id, "falha ao reservar");
    throw error;
  }
  await prisma.characterProfile.updateMany({
    where: { character: { discordId, guildId } },
    data: { appearanceUrl: stored.url },
  });
  if (previous?.blobObjectId && previous.blobObjectId !== stored.id) {
    await removeBlobObject(previous.blobObjectId, "imagem substituida");
  }

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
  const appearances = await prisma.characterAppearance.findMany({ where: { discordId, guildId } });
  if (!appearances.length) return false;
  await prisma.characterAppearance.deleteMany({ where: { discordId, guildId } });
  await Promise.all(appearances.map((appearance) => removeBlobObject(appearance.blobObjectId, "reserva liberada")));
  return true;
}

export async function purgeExpiredAppearances(now = new Date()): Promise<number> {
  const legacyCutoff = new Date(now.getTime() - APPEARANCE_RESERVATION_MS);
  const expired = await prisma.characterAppearance.findMany({
    where: {
      OR: [
        { expiresAt: { lte: now } },
        { expiresAt: null, createdAt: { lte: legacyCutoff } },
      ],
    },
  });
  if (!expired.length) return 0;
  await prisma.characterAppearance.deleteMany({ where: { id: { in: expired.map((row) => row.id) } } });
  await Promise.all(expired.map((appearance) => removeBlobObject(appearance.blobObjectId, "reserva expirada")));
  return expired.length;
}

let cleanupTimer: NodeJS.Timeout | null = null;

export async function startAppearanceCleanupScheduler(): Promise<void> {
  if (cleanupTimer) clearInterval(cleanupTimer);
  const run = async () => {
    const count = await purgeExpiredAppearances();
    if (count) log.info(`[aparencia] ${count} reserva(s) expirada(s) liberada(s).`);
  };
  await run();
  cleanupTimer = setInterval(() => void run().catch((error) => log.error("[aparencia] falha na limpeza:", error)), 6 * 60 * 60_000);
  cleanupTimer.unref?.();
}

export function stopAppearanceCleanupScheduler(): void {
  if (cleanupTimer) clearInterval(cleanupTimer);
  cleanupTimer = null;
}
