import type { TextBasedChannel } from "discord.js";
import { prisma } from "../../db/client.js";
import { getOrCreateCharacter, attrsFromRow } from "../characters/character-service.js";
import { partyMemberIds } from "../party/party-service.js";
import type { SessionFull, StartPlayer } from "../combat/combat-engine.js";
import { characterPassiveMods } from "../combat/passives.js";

// Personagem que dispara o combate (já carregado pelo chamador).
export interface StarterChar {
  charId: string;
  name: string;
  hpCurrent: number;
  hpMax: number;
  chakra: number;
  energia: number;
  jutsuIds: string[];
  attrs: Record<string, number>;
}

// Monta a lista de jogadores de um combate de missão: quem disparou + os membros
// da party dele (criados sob demanda). Retorna também o cache de atributos por
// charId, para gravar nos flags da sessão depois (a engine lê atributos dos flags).
export function gatherSoloPlayer(
  starter: StarterChar,
): { players: StartPlayer[]; attrsById: Map<string, Record<string, number>> } {
  return {
    players: [{
      charId: starter.charId,
      name: starter.name,
      hpCurrent: starter.hpCurrent,
      hpMax: starter.hpMax,
      chakra: starter.chakra,
      energia: starter.energia,
      jutsuIds: starter.jutsuIds,
    }],
    attrsById: new Map([[starter.charId, starter.attrs]]),
  };
}

export async function gatherPartyPlayers(
  channel: TextBasedChannel | null,
  guildId: string,
  starter: StarterChar,
): Promise<{ players: StartPlayer[]; attrsById: Map<string, Record<string, number>> }> {
  const players: StartPlayer[] = [
    {
      charId: starter.charId,
      name: starter.name,
      hpCurrent: starter.hpCurrent,
      hpMax: starter.hpMax,
      chakra: starter.chakra,
      energia: starter.energia,
      jutsuIds: starter.jutsuIds,
    },
  ];
  const attrsById = new Map<string, Record<string, number>>([[starter.charId, starter.attrs]]);

  const caller = await prisma.userCharacter.findUnique({
    where: { id: starter.charId },
    select: { discordId: true },
  });
  if (!caller) return { players, attrsById };

  for (const did of await partyMemberIds(guildId, caller.discordId)) {
    if (did === caller.discordId) continue;
    let username = did;
    try {
      const u = await channel?.client.users.fetch(did);
      if (u) username = u.username;
    } catch {
      /* usa o id como nome se não achar */
    }
    const uc = await getOrCreateCharacter(did, guildId, username);
    if (!uc.attributes || !uc.resources) continue;
    players.push({
      charId: uc.id,
      name: uc.name,
      hpCurrent: uc.hpCurrent,
      hpMax: uc.hpMax,
      chakra: uc.resources.chakra,
      energia: uc.resources.energia,
      jutsuIds: uc.jutsus.map((j) => j.jutsuId),
    });
    attrsById.set(uc.id, attrsFromRow(uc.attributes));
  }
  return { players, attrsById };
}

// Grava o cache de atributos de cada jogador nos flags da sessão (usado pela engine).
export async function cacheAttrs(
  session: SessionFull,
  attrsById: Map<string, Record<string, number>>,
): Promise<void> {
  const priorities = new Map<string, number>();
  for (const p of session.participants) {
    if (p.isNpc || !p.charId) {
      priorities.set(p.id, 0);
      continue;
    }
    const a = attrsById.get(p.charId);
    if (a) {
      const nodes = await prisma.characterSkillNode.findMany({
        where: { charId: p.charId },
        select: { nodeId: true },
      });
      await prisma.combatParticipant.update({
        where: { id: p.id },
        data: { flagsJson: JSON.stringify({ attrs: a, nodes: nodes.map((n) => n.nodeId) }) },
      });
      priorities.set(
        p.id,
        characterPassiveMods(nodes.map((n) => n.nodeId)).initiativePriority,
      );
    }
  }

  // Os combates de missao montam o snapshot depois de criar a sessao. Reordena
  // aqui para que passivas de iniciativa tambem funcionem neles.
  const order = [...session.turnOrder].sort(
    (a, b) => (priorities.get(b) ?? 0) - (priorities.get(a) ?? 0),
  );
  await prisma.combatSession.update({
    where: { id: session.id },
    data: { turnOrderJson: JSON.stringify(order) },
  });
  session.turnOrder = order;
}
