import type { GuildMember } from "discord.js";
import { prisma } from "../../db/client.js";
import { VILLAGE_MANSIONS } from "../village-service.js";
import { villageFromMemberStrict } from "./village-sync.js";
import { EconomyError } from "./errors.js";
import type { VillageId } from "../../data/villages.js";

// Quem esta olhando o painel e o que pode fazer.
//
// Regra dura da etapa 04: NENHUMA operacao financeira usa o fallback silencioso
// de villageFromMember() para Konoha. Sem cargo de vila valido, a operacao
// falha explicando — creditar a vila errada e' pior que recusar.
export interface VillageViewer {
  villageId: VillageId;
  charId: string;
  isKage: boolean;
  isStaff: boolean;
  // Kage jogador so' opera dentro da mansao da propria vila. Staff opera pelo
  // /admin-vila, nao por aqui.
  inMansion: boolean;
}

export function requireVillage(member: GuildMember | null | undefined): VillageId {
  const villageId = villageFromMemberStrict(member);
  if (!villageId) {
    throw new EconomyError(
      "Você não tem cargo de vila. Procure a staff antes de usar qualquer função econômica.",
    );
  }
  return villageId;
}

// Kage ativo = kageDiscordId preenchido. `managedByStaff` marca Kage NPC: a
// vila e' operada pela staff via /admin-vila, com as mesmas restricoes.
export async function resolveKage(villageId: VillageId, discordId: string): Promise<boolean> {
  const village = await prisma.village.findUnique({
    where: { id: villageId },
    select: { kageDiscordId: true },
  });
  return Boolean(village?.kageDiscordId && village.kageDiscordId === discordId);
}

export function isMansionChannel(villageId: VillageId, channelId: string): boolean {
  return VILLAGE_MANSIONS[villageId] === channelId;
}

// Poderes de Kage exigem as duas coisas: ser o Kage E estar na mansao da
// propria vila. Ser Kage nao concede /admin-vila.
export function canActAsKage(viewer: VillageViewer): boolean {
  return viewer.isKage && viewer.inMansion;
}
