// Reset de ficha (admin). Apaga o personagem e tudo que impede /ficha de rodar
// de novo: rascunho da criacao, canal privado, viagem ativa, party, sessoes de
// UI e a reserva de aparencia. Os cargos voltam ao estado de nao registrado.
//
// O que NAO some: VillageLedger (livro-caixa da vila e' historico contabil e
// guarda charId solto de proposito) e as sessoes de combate ja' encerradas.
import type { Guild } from "discord.js";
import { prisma } from "../../db/client.js";
import { releaseAppearance } from "../appearance/appearance-service.js";
import {
  REGISTERED_ROLE_ID,
  SHEET_LOCATION_ROLES,
  SHEET_VILLAGE_ROLES,
  UNREGISTERED_ROLE_ID,
} from "../../data/sheet-creation.js";
import { ALL_TRAVEL_ROLE_IDS } from "../../data/travel.js";

export type SheetResetOptions = {
  // Mantem a aparencia reservada (o jogador refaz a ficha com o mesmo OC).
  keepAppearance?: boolean;
};

export type SheetResetReport = {
  // Preenchido quando o reset foi recusado; nesse caso nada foi apagado.
  blocked?: "COMBATE_ATIVO";
  hadCharacter: boolean;
  charName: string | null;
  clearedDraft: boolean;
  deletedChannelId: string | null;
  releasedAppearance: boolean;
  canceledTravel: boolean;
  leftParty: boolean;
  rolesChanged: boolean;
};

// Nao pode apagar personagem que esta' num combate em andamento: o participante
// perderia o charId no meio do turno. O admin encerra o combate antes.
async function activeCombat(charId: string): Promise<boolean> {
  const part = await prisma.combatParticipant.findFirst({
    where: { charId, session: { status: "ACTIVE" } },
    select: { id: true },
  });
  return Boolean(part);
}

async function resetRoles(guild: Guild, discordId: string): Promise<boolean> {
  const member = await guild.members.fetch(discordId).catch(() => null);
  if (!member) return false;
  const reason = "Reset de ficha (admin)";
  const remove = new Set<string>([
    REGISTERED_ROLE_ID,
    ...Object.values(SHEET_VILLAGE_ROLES),
    ...Object.values(SHEET_LOCATION_ROLES),
    ...ALL_TRAVEL_ROLE_IDS,
  ]);
  for (const roleId of remove) {
    if (member.roles.cache.has(roleId)) {
      await member.roles.remove(roleId, reason).catch(() => undefined);
    }
  }
  if (!member.roles.cache.has(UNREGISTERED_ROLE_ID)) {
    await member.roles.add(UNREGISTERED_ROLE_ID, reason).catch(() => undefined);
  }
  return true;
}

export async function resetSheet(
  guild: Guild,
  discordId: string,
  options: SheetResetOptions = {},
): Promise<SheetResetReport> {
  const guildId = guild.id;
  const char = await prisma.userCharacter.findUnique({
    where: { discordId_guildId: { discordId, guildId } },
    include: { profile: true },
  });

  if (char && (await activeCombat(char.id))) {
    return {
      blocked: "COMBATE_ATIVO",
      hadCharacter: true,
      charName: char.displayName ?? char.name,
      clearedDraft: false,
      deletedChannelId: null,
      releasedAppearance: false,
      canceledTravel: false,
      leftParty: false,
      rolesChanged: false,
    };
  }

  // Rascunho da criacao + canal privado dela.
  const draft = await prisma.sheetCreationSession.findUnique({
    where: { guildId_discordId: { guildId, discordId } },
  });
  let deletedChannelId: string | null = null;
  if (draft?.channelId) {
    const channel = await guild.channels.fetch(draft.channelId).catch(() => null);
    if (channel) {
      await channel.delete("Reset de ficha (admin)").catch(() => undefined);
      deletedChannelId = draft.channelId;
    }
  }
  if (draft) await prisma.sheetCreationSession.delete({ where: { id: draft.id } });

  if (char) {
    // Tabelas que apontam para charId sem relacao no schema: o cascade do
    // Prisma nao alcanca, entao a limpeza e' explicita.
    await prisma.combatParticipant.deleteMany({ where: { charId: char.id } });
    await prisma.collectionOrderMember.deleteMany({ where: { charId: char.id } });
    await prisma.discordUiSession.deleteMany({ where: { charId: char.id } });
    // O resto (atributos, jutsus, inventario, missoes, imposto, ...) cai por
    // onDelete: Cascade.
    await prisma.userCharacter.delete({ where: { id: char.id } });
  }

  const travel = await prisma.activeTravel.deleteMany({ where: { guildId, discordId } });
  const party = await prisma.partyMember.deleteMany({ where: { guildId, discordId } });
  // Party sem lider vira party fantasma: some junto (membros caem no cascade).
  await prisma.party.deleteMany({ where: { guildId, leaderId: discordId } });

  const releasedAppearance = options.keepAppearance
    ? false
    : await releaseAppearance(discordId, guildId);

  const rolesChanged = await resetRoles(guild, discordId);

  return {
    hadCharacter: Boolean(char),
    charName: char ? char.displayName ?? char.name : null,
    clearedDraft: Boolean(draft),
    deletedChannelId,
    releasedAppearance,
    canceledTravel: travel.count > 0,
    leftParty: party.count > 0,
    rolesChanged,
  };
}
