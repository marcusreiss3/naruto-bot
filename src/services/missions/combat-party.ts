import type { TextBasedChannel } from "discord.js";
import { prisma } from "../../db/client.js";
import { getOrCreateCharacter } from "../characters/character-service.js";
import { partyMemberIds } from "../party/party-service.js";
import type { SessionFull, StartPlayer } from "../combat/combat-engine.js";

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
    attrsById.set(uc.id, {
      ninjutsu: uc.attributes.ninjutsu,
      iryo: uc.attributes.iryo,
      taijutsu: uc.attributes.taijutsu,
      genjutsu: uc.attributes.genjutsu,
      kenjutsu: uc.attributes.kenjutsu,
    });
  }
  return { players, attrsById };
}

// Grava o cache de atributos de cada jogador nos flags da sessão (usado pela engine).
export async function cacheAttrs(
  session: SessionFull,
  attrsById: Map<string, Record<string, number>>,
): Promise<void> {
  for (const p of session.participants) {
    if (p.isNpc || !p.charId) continue;
    const a = attrsById.get(p.charId);
    if (a) {
      await prisma.combatParticipant.update({
        where: { id: p.id },
        data: { flagsJson: JSON.stringify({ attrs: a }) },
      });
    }
  }
}
