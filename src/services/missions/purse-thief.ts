import type { ChatInputCommandInteraction, Message, TextBasedChannel } from "discord.js";
import { prisma } from "../../db/client.js";
import {
  BECO_KONOHA_CHANNEL_ID,
  PRACA_VILA_DA_FOLHA_CHANNEL_ID,
} from "../../data/scenarios/index.js";
import { getMission } from "../../data/missions/index.js";
import { getOrCreateCharacter } from "../characters/character-service.js";
import { getActiveSession, startCombat } from "../combat/combat-engine.js";
import { partyMemberIds } from "../party/party-service.js";
import { NpcAiService } from "../npc-ai/npc-ai-service.js";
import { getPersona } from "../npc-ai/personas.js";
import { sendAsPersona, formatPersonaLines } from "../discord/persona-webhook.js";
import { cacheAttrs, gatherPartyPlayers } from "./combat-party.js";
import {
  completeMission,
  getActiveInstanceByType,
  getInstance,
  markObjective,
  readState,
  setState,
} from "./mission-service.js";
import type { RenderEntity } from "../maps/renderer.js";

const OLD_LADY_KEY = "velinha";
const THIEF_KEY = "ladrao_bolsas";
const OLD_LADY_PERSONA = "old_lady_purse";
const THIEF_PERSONA = "purse_thief";

export interface PurseTheftState {
  stage?: "REPORT" | "TO_ALLEY" | "THIEF_TALK" | "FIGHT" | "RETURN" | "DONE";
  activeNpc?: string | null;
  npcTurns?: Record<string, number>;
  thiefIntroduced?: boolean;
  combatStarted?: boolean;
  bagRecovered?: boolean;
}

export interface PurseNpcChoice {
  key: string;
  name: string;
}

interface PurseContext {
  inst: NonNullable<Awaited<ReturnType<typeof getInstance>>>;
  def: NonNullable<ReturnType<typeof getMission>>;
  ownerCharId: string;
}

function ensureState(raw: string): PurseTheftState {
  const state = readState<PurseTheftState>(raw);
  state.stage = state.stage ?? "REPORT";
  state.activeNpc = state.activeNpc ?? null;
  state.npcTurns = state.npcTurns ?? {};
  return state;
}

function turns(def: PurseContext["def"], key: "reportTurns" | "thiefTurns" | "thanksTurns", fallback: number): number {
  return Number(def.data?.[key] ?? fallback);
}

function thiefTemplate(def: PurseContext["def"]): string {
  return String(def.data?.thiefTemplate ?? "purse_thief");
}

async function findContextByCharId(charId: string): Promise<PurseContext | null> {
  const c = await getActiveInstanceByType(charId, "PURSE_THIEF");
  if (!c) return null;
  return { inst: c.inst, def: c.def, ownerCharId: charId };
}

// Acha a missao de roubo de bolsa do usuario ou de alguem da party.
export async function resolvePurseTheft(discordId: string, guildId: string): Promise<PurseContext | null> {
  const own = await prisma.userCharacter.findUnique({
    where: { discordId_guildId: { discordId, guildId } },
    select: { id: true },
  });
  if (own) {
    const ctx = await findContextByCharId(own.id);
    if (ctx) return ctx;
  }

  for (const did of await partyMemberIds(guildId, discordId)) {
    if (did === discordId) continue;
    const uc = await prisma.userCharacter.findUnique({
      where: { discordId_guildId: { discordId: did, guildId } },
      select: { id: true },
    });
    if (!uc) continue;
    const ctx = await findContextByCharId(uc.id);
    if (ctx) return ctx;
  }
  return null;
}

export function availablePurseNpcs(state: PurseTheftState, channelId: string): PurseNpcChoice[] {
  const stage = state.stage ?? "REPORT";
  if (channelId === PRACA_VILA_DA_FOLHA_CHANNEL_ID && (stage === "REPORT" || stage === "RETURN")) {
    return [{ key: OLD_LADY_KEY, name: stage === "RETURN" ? "Senhora (devolver bolsa)" : "Senhora" }];
  }
  if (channelId === BECO_KONOHA_CHANNEL_ID && stage === "THIEF_TALK") {
    return [{ key: THIEF_KEY, name: "Ladrao de Bolsas" }];
  }
  return [];
}

export async function purseTheftMapHandle(
  interaction: ChatInputCommandInteraction,
  ctx: PurseContext,
  entities: RenderEntity[],
): Promise<string | null> {
  const channelId = interaction.channelId;
  let state = ensureState(ctx.inst.stateJson);
  const stage = state.stage ?? "REPORT";

  if (channelId === PRACA_VILA_DA_FOLHA_CHANNEL_ID) {
    if (stage === "REPORT" || stage === "RETURN") {
      entities.push(oldLadyEntity());
      return stage === "RETURN"
        ? `\nMissao ativa: **${ctx.def.name}** - devolva a bolsa para a senhora com \`/interagir npc\`.`
        : `\nMissao ativa: **${ctx.def.name}** - fale com a senhora usando \`/interagir npc\`.`;
    }
    if (stage === "TO_ALLEY" || stage === "THIEF_TALK" || stage === "FIGHT") {
      return `\nMissao ativa: **${ctx.def.name}** - va ao **Beco de Konoha**: <#${BECO_KONOHA_CHANNEL_ID}>.`;
    }
    return null;
  }

  if (channelId !== BECO_KONOHA_CHANNEL_ID) return null;

  if (stage === "TO_ALLEY") {
    state.stage = "THIEF_TALK";
    await markObjective(ctx.inst.id, "ir_beco");
    if (!state.thiefIntroduced) {
      state.thiefIntroduced = true;
      await speak(
        interaction.channel,
        THIEF_PERSONA,
        "(o ninja encontra o ladrao no beco)",
        "Voce foi encontrado no beco com a bolsa roubada. Diga que nao vai devolver.",
        0,
      );
    }
    await setState(ctx.inst.id, state);
  }

  if (state.stage === "THIEF_TALK") {
    entities.push(thiefEntity());
    return `\nMissao ativa: **${ctx.def.name}** - confronte o ladrao usando \`/interagir npc\`.`;
  }
  if (state.stage === "FIGHT") {
    return `\nMissao ativa: **${ctx.def.name}** - derrote o ladrao para recuperar a bolsa.`;
  }
  if (state.stage === "RETURN") {
    return `\nMissao ativa: **${ctx.def.name}** - volte a Praca da Vila da Folha e devolva a bolsa.`;
  }
  return null;
}

function oldLadyEntity(): RenderEntity {
  return {
    cell: "C2",
    name: "Senhora",
    label: "Sen",
    color: "#8e44ad",
    kind: "NPC",
    imageFile: "npcs/old-lady-purse.png",
  };
}

function thiefEntity(): RenderEntity {
  return {
    cell: "D8",
    name: "Ladrao de Bolsas",
    label: "Lad",
    color: "#c0392b",
    kind: "NPC",
    imageFile: "enemies/purse-thief.png",
  };
}

async function speak(
  channel: TextBasedChannel | null,
  personaKey: string,
  playerMessage: string,
  extra: string,
  fallbackIndex: number,
): Promise<void> {
  const text = await NpcAiService.say(personaKey, playerMessage, extra, fallbackIndex);
  const persona = getPersona(personaKey);
  const sent = await sendAsPersona(channel, {
    key: personaKey,
    name: persona?.displayName ?? "NPC",
    avatarFile: persona?.avatarFile,
    lines: formatPersonaLines(text),
  });
  if (!sent && channel && "send" in channel) {
    await channel.send(text.slice(0, 1900));
  }
}

export async function interactPurseTheft(interaction: ChatInputCommandInteraction, npcKey: string): Promise<void> {
  const guildId = interaction.guildId ?? "global";
  const ctx = await resolvePurseTheft(interaction.user.id, guildId);
  if (!ctx) {
    await interaction.reply({ content: "Voce (ou sua party) nao tem essa missao ativa.", ephemeral: true });
    return;
  }

  const state = ensureState(ctx.inst.stateJson);
  const choices = availablePurseNpcs(state, interaction.channelId);
  const choice = choices.find((c) => c.key === npcKey);
  if (!choice) {
    await interaction.reply({ content: "Esse NPC nao esta disponivel para essa missao aqui.", ephemeral: true });
    return;
  }
  if (state.activeNpc && state.activeNpc !== npcKey) {
    await interaction.reply({ content: "Ja existe uma conversa de missao em andamento nesse local.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  state.activeNpc = npcKey;
  await setState(ctx.inst.id, state);

  const char = await getOrCreateCharacter(interaction.user.id, guildId, interaction.user.username);
  await runDialogue({
    channel: interaction.channel,
    channelId: interaction.channelId,
    guildId,
    ctx,
    char,
    npcKey,
    playerMessage: "(o ninja se aproxima para conversar)",
  });
  await interaction.editReply(`Voce se aproxima de **${choice.name}**. Continue por mensagens normais no canal.`);
}

export async function continuePurseTheftMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.guildId) return false;
  const ctx = await resolvePurseTheft(message.author.id, message.guildId);
  if (!ctx) return false;
  const state = ensureState(ctx.inst.stateJson);
  if (!state.activeNpc) return false;
  if (!availablePurseNpcs(state, message.channelId).some((c) => c.key === state.activeNpc)) return false;

  const char = await getOrCreateCharacter(message.author.id, message.guildId, message.author.username);
  await runDialogue({
    channel: message.channel,
    channelId: message.channelId,
    guildId: message.guildId,
    ctx,
    char,
    npcKey: state.activeNpc,
    playerMessage: message.content || "...",
  });
  return true;
}

async function runDialogue(o: {
  channel: TextBasedChannel | null;
  channelId: string;
  guildId: string;
  ctx: PurseContext;
  char: Awaited<ReturnType<typeof getOrCreateCharacter>>;
  npcKey: string;
  playerMessage: string;
}): Promise<void> {
  const inst = await getInstance(o.ctx.inst.id);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "PURSE_THIEF") return;
  const state = ensureState(inst.stateJson);

  if (o.npcKey === OLD_LADY_KEY && state.stage === "REPORT") {
    const turn = (state.npcTurns!.report ?? 0) + 1;
    state.npcTurns!.report = turn;
    const done = turn >= turns(def, "reportTurns", 3);
    await speak(
      o.channel,
      OLD_LADY_PERSONA,
      o.playerMessage,
      done
        ? `Esta e sua ultima fala: diga claramente que o ladrao correu para o Beco de Konoha (<#${BECO_KONOHA_CHANNEL_ID}>).`
        : "Conte sobre a bolsa roubada, mas ainda nao diga exatamente para onde o ladrao foi.",
      done ? 2 : Math.min(turn - 1, 1),
    );
    if (done) {
      state.stage = "TO_ALLEY";
      state.activeNpc = null;
      state.npcTurns!.report = 0;
      await markObjective(inst.id, "falar_velinha");
      await setState(inst.id, state);
      if (o.channel && "send" in o.channel) {
        await o.channel.send(`Va para o **Beco de Konoha** e use \`/mapa\`: <#${BECO_KONOHA_CHANNEL_ID}>.`);
      }
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (o.npcKey === THIEF_KEY && state.stage === "THIEF_TALK") {
    const turn = (state.npcTurns!.thief ?? 0) + 1;
    state.npcTurns!.thief = turn;
    const fight = turn >= turns(def, "thiefTurns", 3);
    await speak(
      o.channel,
      THIEF_PERSONA,
      o.playerMessage,
      fight
        ? "Esta e sua ultima fala: recuse devolver a bolsa e avance para o combate agora."
        : "Provoque e negue devolver a bolsa, mas ainda nao inicie combate.",
      fight ? 2 : Math.min(turn - 1, 1),
    );
    if (fight) {
      state.stage = "FIGHT";
      state.activeNpc = null;
      state.combatStarted = true;
      await setState(inst.id, state);
      await startThiefCombat(o, inst.id, def);
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (o.npcKey === OLD_LADY_KEY && state.stage === "RETURN") {
    const turn = (state.npcTurns!.thanks ?? 0) + 1;
    state.npcTurns!.thanks = turn;
    const done = turn >= turns(def, "thanksTurns", 2);
    await speak(
      o.channel,
      OLD_LADY_PERSONA,
      o.playerMessage,
      done
        ? "Esta e sua ultima fala: agradeca pela bolsa recuperada e encerre com carinho."
        : "Agradeca por recuperar a bolsa, aliviada e emocionada.",
      3 + Math.min(turn - 1, 1),
    );
    if (done) {
      state.stage = "DONE";
      state.activeNpc = null;
      await markObjective(inst.id, "devolver_bolsa");
      await setState(inst.id, state);
      const result = await completeMission(inst.charId, inst.missionId);
      if (result && o.channel && "send" in o.channel) {
        const items = result.rewards.items?.map((i) => i.name).join(", ");
        await o.channel.send(
          `Missao concluida: **${def.name}**!\nRecompensas: ${result.rewards.xp} XP, ${result.rewards.ryo} ryo${items ? `, ${items}` : ""}.`,
        );
      }
      return;
    }
    await setState(inst.id, state);
  }
}

async function startThiefCombat(
  o: {
    channel: TextBasedChannel | null;
    channelId: string;
    guildId: string;
    char: Awaited<ReturnType<typeof getOrCreateCharacter>>;
  },
  instanceId: string,
  def: NonNullable<ReturnType<typeof getMission>>,
): Promise<void> {
  if (await getActiveSession(o.channelId)) {
    if (o.channel && "send" in o.channel) await o.channel.send("O combate ja esta em andamento. Use `/mapa`.");
    return;
  }

  const { players, attrsById } = await gatherPartyPlayers(o.channel, o.guildId, {
    charId: o.char.id,
    name: o.char.name,
    hpCurrent: o.char.hpCurrent,
    hpMax: o.char.hpMax,
    chakra: o.char.resources?.chakra ?? 100,
    energia: o.char.resources?.energia ?? 100,
    jutsuIds: o.char.jutsus.map((j: { jutsuId: string }) => j.jutsuId),
    attrs: {
      ninjutsu: o.char.attributes?.ninjutsu ?? 1,
      iryo: o.char.attributes?.iryo ?? 1,
      taijutsu: o.char.attributes?.taijutsu ?? 1,
      genjutsu: o.char.attributes?.genjutsu ?? 1,
      kenjutsu: o.char.attributes?.kenjutsu ?? 1,
    },
  });

  const session = await startCombat({
    channelId: o.channelId,
    guildId: o.guildId,
    scenarioId: "beco_konoha",
    players,
    npcs: [{ templateId: thiefTemplate(def) }],
    missionInstanceId: instanceId,
  });
  await cacheAttrs(session, attrsById);
  if (o.channel && "send" in o.channel) {
    await o.channel.send(`Combate iniciado contra o **Ladrao de Bolsas**! ${players.length} ninja(s) na luta. Use \`/mapa\`.`);
  }
}

export async function onPurseTheftCombatWon(
  interaction: ChatInputCommandInteraction,
  instanceId: string,
): Promise<void> {
  const inst = await getInstance(instanceId);
  if (!inst || inst.status !== "ACTIVE") return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "PURSE_THIEF") return;

  const state = ensureState(inst.stateJson);
  state.stage = "RETURN";
  state.activeNpc = null;
  state.combatStarted = false;
  state.bagRecovered = true;
  await markObjective(inst.id, "derrotar_ladrao");
  await setState(inst.id, state);
  await interaction.followUp(
    `Voce recuperou a bolsa da senhora. Volte para a **Praca da Vila da Folha** e use \`/mapa\`: <#${PRACA_VILA_DA_FOLHA_CHANNEL_ID}>.`,
  );
}
