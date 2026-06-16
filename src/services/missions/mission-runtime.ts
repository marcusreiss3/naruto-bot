import type { ChatInputCommandInteraction, Message, TextBasedChannel } from "discord.js";
import { prisma } from "../../db/client.js";
import { getMission } from "../../data/missions/index.js";
import { getOrCreateCharacter } from "../characters/character-service.js";
import type { SessionFull } from "../combat/combat-engine.js";
import { startCombat, getActiveSession } from "../combat/combat-engine.js";
import { NpcAiService } from "../npc-ai/npc-ai-service.js";
import { getPersona } from "../npc-ai/personas.js";
import { sendAsPersona, formatPersonaLines } from "../discord/persona-webhook.js";
import { resolveBandit, type BanditState } from "./investigation.js";
import { gatherPartyPlayers, cacheAttrs } from "./combat-party.js";
import { onEscortCombatWon } from "./escort.js";
import { onPurseTheftCombatWon } from "./purse-thief.js";
import { onRoofCleanupCombatWon } from "./roof-cleanup.js";
import {
  completeMission,
  getInstance,
  markObjective,
  readState,
  setState,
} from "./mission-service.js";

// Timeout do diálogo do líder: se o jogador não responder em 5 min, ele vai embora.
const BANDIT_TIMEOUT_MS = 5 * 60 * 1000;
const banditTimers = new Map<string, NodeJS.Timeout>();
const btKey = (channelId: string, charId: string) => `${channelId}:${charId}`;

function clearBanditTimeout(channelId: string, charId: string): void {
  const t = banditTimers.get(btKey(channelId, charId));
  if (t) {
    clearTimeout(t);
    banditTimers.delete(btKey(channelId, charId));
  }
}

function armBanditTimeout(o: BanditTurnOpts): void {
  clearBanditTimeout(o.channelId, o.charId);
  const t = setTimeout(async () => {
    banditTimers.delete(btKey(o.channelId, o.charId));
    try {
      const inst = await getInstance(o.instanceId);
      if (!inst) return;
      const st = readState<BanditState>(inst.stateJson);
      if (st.combatStarted) return;
      st.dialogue = 0;
      await setState(o.instanceId, st);
      const persona = getPersona("bandit_leader");
      await sendAsPersona(o.channel, {
        key: "bandit_leader",
        name: persona?.displayName ?? "Líder dos Bandidos",
        avatarFile: persona?.avatarFile,
        lines: ["- Cansei de esperar... some daqui.", "**O líder some entre as árvores.**"],
      });
    } catch {
      /* ignora */
    }
  }, BANDIT_TIMEOUT_MS);
  banditTimers.set(btKey(o.channelId, o.charId), t);
}

interface BanditTurnOpts {
  channel: TextBasedChannel | null;
  channelId: string;
  guildId: string;
  charId: string;
  charName: string;
  hpCurrent: number;
  hpMax: number;
  chakra: number;
  energia: number;
  jutsuIds: string[];
  attrs: Record<string, number>;
  instanceId: string;
  playerMessage: string;
  // envia mensagem de sistema (combate começou, fala em texto se webhook falhar)
  reply: (content: string) => Promise<void>;
}

// Dispara o confronto na Floresta (a partir do /mapa, com as pistas obtidas).
export async function triggerBanditForest(
  interaction: ChatInputCommandInteraction,
  char: {
    id: string;
    name: string;
    hpCurrent: number;
    hpMax: number;
    resources?: { chakra: number; energia: number } | null;
    attributes?: { ninjutsu: number; iryo: number; taijutsu: number; genjutsu: number; kenjutsu: number } | null;
    jutsus: { jutsuId: string }[];
  },
  instanceId: string,
): Promise<void> {
  // marca etapa FIGHT
  const inst = await getInstance(instanceId);
  if (inst) {
    const st = readState<BanditState>(inst.stateJson);
    st.stage = "FIGHT";
    await setState(instanceId, st);
  }
  await runBanditTurn({
    channel: interaction.channel,
    channelId: interaction.channelId,
    guildId: interaction.guildId ?? "global",
    charId: char.id,
    charName: char.name,
    hpCurrent: char.hpCurrent,
    hpMax: char.hpMax,
    chakra: char.resources?.chakra ?? 100,
    energia: char.resources?.energia ?? 100,
    jutsuIds: char.jutsus.map((j) => j.jutsuId),
    attrs: {
      ninjutsu: char.attributes?.ninjutsu ?? 1,
      iryo: char.attributes?.iryo ?? 1,
      taijutsu: char.attributes?.taijutsu ?? 1,
      genjutsu: char.attributes?.genjutsu ?? 1,
      kenjutsu: char.attributes?.kenjutsu ?? 1,
    },
    instanceId,
    playerMessage: "(o ninja chega na floresta, pronto para o confronto)",
    reply: (c) =>
      c.trim() && interaction.channel && "send" in interaction.channel
        ? interaction.channel.send(c).then(() => undefined)
        : Promise.resolve(),
  });
}

// Continua o diálogo do líder a partir de uma mensagem normal no canal (fase FIGHT).
export async function runBanditMessage(message: Message): Promise<void> {
  if (message.author.bot || !message.guildId) return;
  const guildId = message.guildId;
  const ctx = await resolveBandit(message.author.id, guildId);
  if (!ctx) return;
  const forestId = String(ctx.def.data?.forestChannelId ?? "");
  if (message.channelId !== forestId) return; // só na floresta
  const state = readState<BanditState>(ctx.inst.stateJson);
  if (state.stage !== "FIGHT") return; // só após as pistas e iniciar pelo /mapa
  if (state.combatStarted) {
    const active = await getActiveSession(message.channelId);
    if (active) return; // combate em andamento; ignora chat
  }
  // usa o personagem do próprio autor (membro da party que falar)
  const char = await getOrCreateCharacter(message.author.id, guildId, message.author.username);
  await runBanditTurn({
    channel: message.channel,
    channelId: message.channelId,
    guildId,
    charId: char.id,
    charName: char.name,
    hpCurrent: char.hpCurrent,
    hpMax: char.hpMax,
    chakra: char.resources!.chakra,
    energia: char.resources!.energia,
    jutsuIds: char.jutsus.map((j) => j.jutsuId),
    attrs: {
      ninjutsu: char.attributes!.ninjutsu,
      iryo: char.attributes!.iryo,
      taijutsu: char.attributes!.taijutsu,
      genjutsu: char.attributes!.genjutsu,
      kenjutsu: char.attributes!.kenjutsu,
    },
    instanceId: ctx.inst.id,
    playerMessage: message.content,
    reply: (c) =>
      c.trim() && "send" in message.channel
        ? message.channel.send(c).then(() => undefined)
        : Promise.resolve(),
  });
}

// Núcleo: conduz uma troca do diálogo do líder (missão C).
async function runBanditTurn(o: BanditTurnOpts): Promise<void> {
  const { instanceId } = o;
  // jogador respondeu -> cancela o timeout anterior
  clearBanditTimeout(o.channelId, o.charId);
  const inst = await getInstance(instanceId);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "BANDIT_FIGHT") return;
  const state = readState<BanditState>(inst.stateJson);
  if (state.combatStarted) {
    // se a sessão ainda existe, está mesmo em andamento
    const active = await getActiveSession(o.channelId);
    if (active) {
      await o.reply("O combate já começou! Use `/mapa`.");
      return;
    }
    // estado obsoleto (combate encerrado/abortado): reseta p/ permitir recomeçar
    state.combatStarted = false;
    state.dialogue = 0;
    await setState(instanceId, state);
  }
  const turn = state.dialogue ?? 0;

  const ai = await NpcAiService.respond({
    personaKey: "bandit_leader",
    playerMessage: o.playerMessage || "...",
    turn,
  });

  state.dialogue = turn + 1;
  await setState(instanceId, state);

  // fala do líder via webhook (estilo Tupperbox: foto + nome)
  const persona = getPersona("bandit_leader");
  const lines = formatPersonaLines(ai.text);
  const sentViaWebhook = await sendAsPersona(o.channel, {
    key: "bandit_leader",
    name: persona?.displayName ?? "Líder dos Bandidos",
    avatarFile: persona?.avatarFile,
    lines,
  });
  const fala = sentViaWebhook ? "" : `🗣️ **Líder dos Bandidos:**\n${ai.text}\n\n`;

  if (ai.forceCombat) {
    state.combatStarted = true;
    await setState(instanceId, state);
    await markObjective(instanceId, "interagir_lider");

    const thugs = Number(def.data?.thugs ?? 3);
    const npcs = [{ templateId: "bandit_leader" }, ...Array.from({ length: thugs }, () => ({ templateId: "bandit_thug" }))];

    const guildId = o.guildId;
    // jogador que iniciou + membros da party (entram juntos no combate)
    const { players, attrsById } = await gatherPartyPlayers(o.channel, guildId, {
      charId: o.charId,
      name: o.charName,
      hpCurrent: o.hpCurrent,
      hpMax: o.hpMax,
      chakra: o.chakra,
      energia: o.energia,
      jutsuIds: o.jutsuIds,
      attrs: o.attrs,
    });

    const session = await startCombat({
      channelId: o.channelId,
      guildId,
      scenarioId: "floresta",
      players,
      npcs,
      missionInstanceId: instanceId,
    });
    await cacheAttrs(session, attrsById);
    clearBanditTimeout(o.channelId, o.charId); // combate começou
    await o.reply(
      `${fala}⚔️ **O combate começou!** ${thugs} capangas + o líder. ${players.length} ninja(s) na luta. Use \`/mapa\`.`,
    );
    return;
  }

  // sem forçar combate: a fala já saiu pelo webhook; só manda texto se o webhook falhou
  await o.reply(fala.trim());
  armBanditTimeout(o); // espera resposta por 5 min
}

// Chamado quando um combate termina; conclui missao de bandidos se aplicavel.
export async function onCombatEnded(
  interaction: ChatInputCommandInteraction,
  session: SessionFull,
): Promise<void> {
  if (!session.missionInstanceId) return;
  const inst = await getInstance(session.missionInstanceId);
  if (!inst || inst.status !== "ACTIVE") return;
  const def = getMission(inst.missionId);
  if (!def) return;

  // verifica se todos os NPCs (time B) foram derrotados
  const fresh = await prisma.combatParticipant.findMany({ where: { sessionId: session.id } });
  const npcsAlive = fresh.filter((p) => p.isNpc && p.hpCurrent > 0).length;
  const playersAlive = fresh.filter((p) => !p.isNpc && p.hpCurrent > 0).length;

  if (!(npcsAlive === 0 && playersAlive > 0)) return;

  // escolta: cada combate apenas avança uma etapa (a missão conclui na narração final)
  if (def.type === "ESCORT") {
    await onEscortCombatWon(interaction, inst.id);
    return;
  }

  if (def.type === "PURSE_THIEF") {
    await onPurseTheftCombatWon(interaction, inst.id);
    return;
  }

  if (def.type === "ROOF_CLEANUP") {
    await onRoofCleanupCombatWon(interaction, inst.id);
    return;
  }

  // bandidos: derrotar o líder + capangas conclui a missão
  await markObjective(inst.id, "derrotar_lider");
  const result = await completeMission(inst.charId, inst.missionId);
  if (result) {
    const items = result.rewards.items?.map((i) => i.name).join(", ");
    await interaction.followUp(
      `✅ **Missão concluída: ${def.name}!**\nRecompensas: ${result.rewards.xp} XP, ${result.rewards.ryo} ryo${items ? `, ${items}` : ""}.`,
    );
  }
}

// Chamado quando os jogadores perdem o combate; falha a missão associada.
export async function onCombatLost(
  interaction: ChatInputCommandInteraction,
  session: SessionFull,
): Promise<void> {
  if (!session.missionInstanceId) return;
  const inst = await getInstance(session.missionInstanceId);
  if (!inst || inst.status !== "ACTIVE") return;
  await prisma.missionInstance.update({ where: { id: inst.id }, data: { status: "FAILED" } });
  const def = getMission(inst.missionId);
  await interaction.followUp(
    `❌ **Missão falhou:** ${def?.name ?? inst.missionId}. Peça a um admin para reatribuir com \`/admin missao adicionar\`.`,
  );
}

export { type BanditState };
