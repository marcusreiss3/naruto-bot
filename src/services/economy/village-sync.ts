import type { GuildMember } from "discord.js";
import { prisma } from "../../db/client.js";
import { VILLAGE_ROLES } from "../village-service.js";
import { VILLAGE_IDS, type VillageId } from "../../data/villages.js";

// A vila do jogador vive no cargo do Discord, mas a economia precisa dela
// gravada: a missao registra a vila do instante da conclusao, e completeMission
// nao recebe o membro (sao ~45 pontos de chamada). Entao espelhamos o cargo no
// banco a cada interacao, de um lugar so'.
//
// Diferente de villageFromMember(), aqui NAO existe fallback para Konoha: sem
// cargo de vila o valor e' null, e null nao acumula imposto. Creditar Konoha
// por acidente seria pior que nao cobrar.
export function villageFromMemberStrict(member: GuildMember | null | undefined): VillageId | null {
  if (!member) return null;
  for (const village of VILLAGE_IDS) {
    if (member.roles.cache.has(VILLAGE_ROLES[village])) return village;
  }
  return null;
}

// Grava so' quando mudou: o caminho normal e' um SELECT barato por interacao,
// sem escrita.
export async function syncCharacterVillage(
  discordId: string,
  guildId: string,
  member: GuildMember | null | undefined,
): Promise<void> {
  const villageId = villageFromMemberStrict(member);
  if (!villageId) return;
  await prisma.userCharacter.updateMany({
    where: { discordId, guildId, NOT: { villageId } },
    data: { villageId },
  });
}
