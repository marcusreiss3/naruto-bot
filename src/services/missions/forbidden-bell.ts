import { EmbedBuilder, type ChatInputCommandInteraction, type Message, type TextBasedChannel } from "discord.js";
import { prisma } from "../../db/client.js";
import {
  CAVERNA_CHANNEL_ID,
  CENTRO_COMERCIAL_CHANNEL_ID,
  HOSPITAL_KONOHA_CHANNEL_ID,
  MANSAO_HOKAGE_CHANNEL_ID,
  ROTA_COMERCIAL_KONOHA_CHANNEL_ID,
} from "../../data/scenarios/index.js";
import { getMission } from "../../data/missions/index.js";
import { sendMissionNotice } from "../../ui/mission-notice-v2.js";
import { getOrCreateCharacter, attrsFromRow } from "../characters/character-service.js";
import { getActiveSession, startCombat } from "../combat/combat-engine.js";
import { formatPersonaLines, sendAsPersona } from "../discord/persona-webhook.js";
import type { RenderEntity } from "../maps/renderer.js";
import { NpcAiService } from "../npc-ai/npc-ai-service.js";
import { getPersona } from "../npc-ai/personas.js";
import { partyMemberIds } from "../party/party-service.js";
import { cacheAttrs, gatherPartyPlayers, type StarterChar } from "./combat-party.js";
import {
  buildMissionCompleteEmbed,
  completeMission,
  getActiveMissions,
  getInstance,
  markObjective,
  readState,
  setState,
} from "./mission-service.js";

type BellStage =
  | "BRIEFING"
  | "SACRISTAN_TALK"
  | "SACRISTAN_FIGHT"
  | "SCRIBE_TALK"
  | "SCRIBE_FIGHT"
  | "GUARD_TALK"
  | "GUARD_FIGHT"
  | "FINAL_TALK"
  | "FINAL_FIGHT"
  | "RETURN"
  | "DONE";

type FragmentId = "sound" | "look" | "buried";

interface BellNpc {
  key: string;
  name: string;
  persona: string;
  imageFile: string;
  cell: string;
}

export interface ForbiddenBellState {
  stage?: BellStage;
  activeNpc?: string | null;
  talks?: Record<string, number>;
  combatStarted?: boolean;
  fragments?: FragmentId[];
}

interface ForbiddenBellContext {
  inst: NonNullable<Awaited<ReturnType<typeof getInstance>>>;
  def: NonNullable<ReturnType<typeof getMission>>;
  ownerCharId: string;
}

const clerkNpc: BellNpc = {
  key: "forbidden_bell_clerk",
  name: "Chika Nara",
  persona: "forbidden_bell_clerk",
  imageFile: "npcs/mission-clerk.png",
  cell: "C4",
};

const sacristanNpc: BellNpc = {
  key: "forbidden_bell_sacristan",
  name: "Sacristão Enji",
  persona: "forbidden_bell_sacristan",
  imageFile: "npcs/merchant.png",
  cell: "D4",
};

const scribeNpc: BellNpc = {
  key: "forbidden_bell_scribe",
  name: "Escrivã Tomoe",
  persona: "forbidden_bell_scribe",
  imageFile: "npcs/medical-shiori.png",
  cell: "C4",
};

const guardNpc: BellNpc = {
  key: "forbidden_bell_guard",
  name: "Guarda Masaru",
  persona: "forbidden_bell_guard",
  imageFile: "npcs/alley-witness.png",
  cell: "D3",
};

const reikaNpc: BellNpc = {
  key: "forbidden_bell_reika",
  name: "Reika de Oto",
  persona: "forbidden_bell_reika",
  imageFile: "enemies/reika-oto.png",
  cell: "D5",
};

const STAGE_CHANNELS: Partial<Record<BellStage, string>> = {
  BRIEFING: MANSAO_HOKAGE_CHANNEL_ID,
  SACRISTAN_TALK: CENTRO_COMERCIAL_CHANNEL_ID,
  SACRISTAN_FIGHT: CENTRO_COMERCIAL_CHANNEL_ID,
  SCRIBE_TALK: HOSPITAL_KONOHA_CHANNEL_ID,
  SCRIBE_FIGHT: HOSPITAL_KONOHA_CHANNEL_ID,
  GUARD_TALK: ROTA_COMERCIAL_KONOHA_CHANNEL_ID,
  GUARD_FIGHT: ROTA_COMERCIAL_KONOHA_CHANNEL_ID,
  FINAL_TALK: CAVERNA_CHANNEL_ID,
  FINAL_FIGHT: CAVERNA_CHANNEL_ID,
  RETURN: MANSAO_HOKAGE_CHANNEL_ID,
};

const MISSION_CHANNELS = new Set([
  MANSAO_HOKAGE_CHANNEL_ID,
  CENTRO_COMERCIAL_CHANNEL_ID,
  HOSPITAL_KONOHA_CHANNEL_ID,
  ROTA_COMERCIAL_KONOHA_CHANNEL_ID,
  CAVERNA_CHANNEL_ID,
]);

const FRAGMENTS: Record<FragmentId, { title: string; text: string }> = {
  sound: {
    title: "Fragmento 1 - O som falso",
    text: "O sino não precisa tocar para ser ouvido. O som é plantado direto na percepção da vítima.",
  },
  look: {
    title: "Fragmento 2 - O olhar roubado",
    text: "Quem olha para o campanário quando ouve o sino esquece o rosto do culpado.",
  },
  buried: {
    title: "Fragmento 3 - O sino enterrado",
    text: "O sino verdadeiro está sob o templo. A torre é apenas a isca.",
  },
};

function ensureState(raw: string): ForbiddenBellState {
  const state = readState<ForbiddenBellState>(raw);
  state.stage = state.stage ?? "BRIEFING";
  state.activeNpc = state.activeNpc ?? null;
  state.talks = state.talks ?? {};
  state.combatStarted = state.combatStarted ?? false;
  state.fragments = state.fragments ?? [];
  return state;
}

function hasAllFragments(state: ForbiddenBellState): boolean {
  const fragments = new Set(state.fragments ?? []);
  return fragments.has("sound") && fragments.has("look") && fragments.has("buried");
}

async function findContextByCharId(charId: string, channelId?: string): Promise<ForbiddenBellContext | null> {
  for (const inst of await getActiveMissions(charId)) {
    const def = getMission(inst.missionId);
    if (!def || def.type !== "FORBIDDEN_BELL") continue;
    if (channelId && !MISSION_CHANNELS.has(channelId)) continue;
    return { inst, def, ownerCharId: charId };
  }
  return null;
}

export async function resolveForbiddenBell(
  discordId: string,
  guildId: string,
  channelId?: string,
): Promise<ForbiddenBellContext | null> {
  const own = await prisma.userCharacter.findUnique({
    where: { discordId_guildId: { discordId, guildId } },
    select: { id: true },
  });
  if (own) {
    const ctx = await findContextByCharId(own.id, channelId);
    if (ctx) return ctx;
  }
  for (const did of await partyMemberIds(guildId, discordId)) {
    if (did === discordId) continue;
    const uc = await prisma.userCharacter.findUnique({
      where: { discordId_guildId: { discordId: did, guildId } },
      select: { id: true },
    });
    if (!uc) continue;
    const ctx = await findContextByCharId(uc.id, channelId);
    if (ctx) return ctx;
  }
  return null;
}

export function availableForbiddenBellNpcs(state: ForbiddenBellState, channelId: string): { key: string; name: string }[] {
  const current = ensureState(JSON.stringify(state));
  if (channelId === MANSAO_HOKAGE_CHANNEL_ID) {
    if (current.stage === "BRIEFING") return [{ key: clerkNpc.key, name: `${clerkNpc.name} (dossiê)` }];
    if (current.stage === "RETURN") return [{ key: clerkNpc.key, name: `${clerkNpc.name} (relatório)` }];
  }
  if (channelId === CENTRO_COMERCIAL_CHANNEL_ID && current.stage === "SACRISTAN_TALK") {
    return [{ key: sacristanNpc.key, name: sacristanNpc.name }];
  }
  if (channelId === HOSPITAL_KONOHA_CHANNEL_ID && current.stage === "SCRIBE_TALK") {
    return [{ key: scribeNpc.key, name: scribeNpc.name }];
  }
  if (channelId === ROTA_COMERCIAL_KONOHA_CHANNEL_ID && current.stage === "GUARD_TALK") {
    return [{ key: guardNpc.key, name: guardNpc.name }];
  }
  if (channelId === CAVERNA_CHANNEL_ID && current.stage === "FINAL_TALK") {
    return [{ key: reikaNpc.key, name: reikaNpc.name }];
  }
  return [];
}

export async function forbiddenBellMapHandle(
  interaction: ChatInputCommandInteraction,
  ctx: ForbiddenBellContext,
  entities: RenderEntity[],
): Promise<string | null> {
  const state = ensureState(ctx.inst.stateJson);
  entities.push(...entitiesForStage(state, interaction.channelId));

  if (state.stage?.endsWith("_FIGHT")) {
    if (STAGE_CHANNELS[state.stage] === interaction.channelId) {
      await retryCombatIfNeeded(interaction, ctx, state);
      return fightNote(ctx.def.name, state.stage);
    }
    return nextNote(ctx.def.name, state);
  }

  if (availableForbiddenBellNpcs(state, interaction.channelId).length > 0) {
    return `\nMissão ativa: **${ctx.def.name}** - fale com o NPC usando \`/interagir npc\`.`;
  }
  return nextNote(ctx.def.name, state);
}

function entitiesForStage(state: ForbiddenBellState, channelId: string): RenderEntity[] {
  if (channelId === MANSAO_HOKAGE_CHANNEL_ID && (state.stage === "BRIEFING" || state.stage === "RETURN")) {
    return [npcEntity(clerkNpc)];
  }
  if (channelId === CENTRO_COMERCIAL_CHANNEL_ID && state.stage === "SACRISTAN_TALK") {
    return [npcEntity(sacristanNpc), { cell: "E4", label: "SOM", color: "#9b59b6", kind: "MARKER", name: "Eco preso" }];
  }
  if (channelId === HOSPITAL_KONOHA_CHANNEL_ID && state.stage === "SCRIBE_TALK") {
    return [npcEntity(scribeNpc), { cell: "D4", label: "MEM", color: "#74b9ff", kind: "MARKER", name: "Frase no braço" }];
  }
  if (channelId === ROTA_COMERCIAL_KONOHA_CHANNEL_ID && state.stage === "GUARD_TALK") {
    return [npcEntity(guardNpc), { cell: "E4", label: "MAP", color: "#f1c40f", kind: "MARKER", name: "Mapa da cripta" }];
  }
  if (channelId === CAVERNA_CHANNEL_ID && state.stage === "FINAL_TALK") {
    return [
      npcEntity(reikaNpc),
      { cell: "C5", label: "SINO", color: "#8e44ad", kind: "MARKER", name: "Sino enterrado" },
    ];
  }
  return [];
}

function npcEntity(npc: BellNpc): RenderEntity {
  return {
    cell: npc.cell,
    name: npc.name,
    label: npc.name.slice(0, 3),
    color: "#8e44ad",
    kind: "NPC",
    imageFile: npc.imageFile,
  };
}

function nextNote(missionName: string, state: ForbiddenBellState): string | null {
  const channelId = STAGE_CHANNELS[state.stage ?? "BRIEFING"];
  if (!channelId) return null;
  return `\nMissão ativa: **${missionName}** - próxima etapa em <#${channelId}>.`;
}

function fightNote(missionName: string, stage: BellStage): string {
  const text: Record<string, string> = {
    SACRISTAN_FIGHT: "derrote o Eco do Sino antes que ele roube a lembrança do sacristão.",
    SCRIBE_FIGHT: "proteja Tomoe e derrote o apagador de memórias.",
    GUARD_FIGHT: "derrube o titereiro antes que ele destrua o mapa da cripta.",
    FINAL_FIGHT: "derrote Reika de Oto e quebre a ressonância do sino enterrado.",
  };
  return `\nMissão ativa: **${missionName}** - ${text[stage] ?? "combate em andamento"}`;
}

async function speak(channel: TextBasedChannel | null, npc: BellNpc, message: string, extra: string, fallbackIndex: number): Promise<void> {
  const text = await NpcAiService.say(npc.persona, message, extra, fallbackIndex);
  const persona = getPersona(npc.persona);
  const sent = await sendAsPersona(channel, {
    key: npc.persona,
    name: persona?.displayName ?? npc.name,
    avatarFile: persona?.avatarFile,
    lines: formatPersonaLines(text),
  });
  if (!sent && channel && "send" in channel) await channel.send(text.slice(0, 1900));
}

export async function interactForbiddenBell(interaction: ChatInputCommandInteraction, npcKey: string): Promise<void> {
  const guildId = interaction.guildId ?? "global";
  const ctx = await resolveForbiddenBell(interaction.user.id, guildId, interaction.channelId);
  if (!ctx) {
    await interaction.reply({ content: "Você (ou sua party) não tem essa missão ativa.", ephemeral: true });
    return;
  }
  const state = ensureState(ctx.inst.stateJson);
  const choice = availableForbiddenBellNpcs(state, interaction.channelId).find((npc) => npc.key === npcKey);
  if (!choice) {
    await interaction.reply({ content: "Esse NPC não está disponível nesta etapa.", ephemeral: true });
    return;
  }
  if (state.activeNpc && state.activeNpc !== npcKey) {
    await interaction.reply({ content: "Termine a conversa atual antes de falar com outro NPC.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  state.activeNpc = npcKey;
  await setState(ctx.inst.id, state);
  await runDialogue(interaction.channel, interaction.channelId, guildId, ctx, npcKey, "(o time inicia a conversa)", interaction.user);
  await interaction.editReply(`Você se aproxima de **${choice.name}**. Continue por mensagens normais no canal.`);
}

export async function continueForbiddenBellMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.guildId) return false;
  const ctx = await resolveForbiddenBell(message.author.id, message.guildId, message.channelId);
  if (!ctx) return false;
  const state = ensureState(ctx.inst.stateJson);
  if (!state.activeNpc) return false;
  if (!availableForbiddenBellNpcs(state, message.channelId).some((npc) => npc.key === state.activeNpc)) return false;
  await runDialogue(message.channel, message.channelId, message.guildId, ctx, state.activeNpc, message.content || "...", message.author);
  return true;
}

async function runDialogue(
  channel: TextBasedChannel | null,
  channelId: string,
  guildId: string,
  ctx: ForbiddenBellContext,
  npcKey: string,
  playerMessage: string,
  actor: { id: string; username: string },
): Promise<void> {
  const inst = await getInstance(ctx.inst.id);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "FORBIDDEN_BELL") return;
  const state = ensureState(inst.stateJson);
  const turn = (state.talks?.[npcKey] ?? 0) + 1;
  state.talks![npcKey] = turn;

  if (npcKey === clerkNpc.key && state.stage === "BRIEFING") {
    const done = turn >= 3;
    await speak(
      channel,
      clerkNpc,
      playerMessage,
      done
        ? "A cena deve terminar com Chika encaminhando naturalmente o time ao Centro Comercial para ouvir Enji, o sacristão que fugiu da vila aliada."
        : "Chika deve responder ao jogador com uma hipótese objetiva: o sino pode ser genjutsu sonoro de Otogakure, usado para apagar testemunhas específicas.",
      done ? 2 : Math.min(turn - 1, 1),
    );
    if (done) {
      state.stage = "SACRISTAN_TALK";
      state.activeNpc = null;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "receber_dossie_sino");
      await setState(inst.id, state);
      await sendMissionNotice(channel, {
        kind: "investigacao",
        title: "Sacristão encontrado em Konoha",
        description: "Enji pode confirmar se o som vinha do sino físico ou de uma técnica de genjutsu.",
        items: [`**Centro Comercial de Konoha** — <#${CENTRO_COMERCIAL_CHANNEL_ID}>`],
        itemsTitle: "Destino da investigação",
        footer: "Use /mapa e depois /interagir npc para ouvir o sacristão.",
      });
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === sacristanNpc.key && state.stage === "SACRISTAN_TALK") {
    const done = turn >= 3;
    await speak(
      channel,
      sacristanNpc,
      playerMessage,
      done
        ? "Enji deve entregar a pista de que o sino físico não vibrava; no fim da fala, ele percebe que um Eco do Sino se aproxima para roubar sua lembrança."
        : "Enji deve contar que todos ouviam o sino, mas o metal da torre ficava parado.",
      done ? 1 : 0,
    );
    if (done) {
      state.stage = "SACRISTAN_FIGHT";
      state.activeNpc = null;
      state.combatStarted = true;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "ouvir_sacristao");
      await setState(inst.id, state);
      await startForbiddenBellCombat(channel, channelId, guildId, actor, inst.id, def, state, "SACRISTAN_FIGHT");
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === scribeNpc.key && state.stage === "SCRIBE_TALK") {
    const done = turn >= 3;
    await speak(
      channel,
      scribeNpc,
      playerMessage,
      done
        ? "Tomoe deve concluir que olhar para o campanário completa o genjutsu; no fim da fala, ela percebe a invasão do apagador de memórias."
        : "Tomoe deve mostrar a frase escrita no braço e descrever o vazio deixado na memória.",
      done ? 1 : 0,
    );
    if (done) {
      state.stage = "SCRIBE_FIGHT";
      state.activeNpc = null;
      state.combatStarted = true;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "ouvir_escriva_memoria");
      await setState(inst.id, state);
      await startForbiddenBellCombat(channel, channelId, guildId, actor, inst.id, def, state, "SCRIBE_FIGHT");
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === guardNpc.key && state.stage === "GUARD_TALK") {
    const done = turn >= 3;
    await speak(
      channel,
      guardNpc,
      playerMessage,
      done
        ? "Masaru deve revelar que o sino verdadeiro está sob o templo; no fim da fala, fios sonoros aparecem para destruir o mapa."
        : "Masaru deve contar que a torre era isca e que fios de chakra protegiam o acesso ao altar.",
      done ? 1 : 0,
    );
    if (done) {
      state.stage = "GUARD_FIGHT";
      state.activeNpc = null;
      state.combatStarted = true;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "ouvir_guarda_ferido");
      await setState(inst.id, state);
      await startForbiddenBellCombat(channel, channelId, guildId, actor, inst.id, def, state, "GUARD_FIGHT");
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === reikaNpc.key && state.stage === "FINAL_TALK") {
    const done = turn >= 3;
    await speak(
      channel,
      reikaNpc,
      playerMessage,
      done
        ? hasAllFragments(state)
          ? "Reika deve reconhecer que os três fragmentos quebraram parte da ressonância, mas decidir lutar para impedir que levem o badalo."
          : "Reika deve perceber que o time chegou incompleto e lutar com a ressonância do sino inteira."
        : "Confronte o time na cripta, explique a utilidade de apagar memórias e pressione pelo tratado roubado.",
      done ? 2 : Math.min(turn - 1, 1),
    );
    if (done) {
      state.stage = "FINAL_FIGHT";
      state.activeNpc = null;
      state.combatStarted = true;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "confrontar_reika");
      await setState(inst.id, state);
      await startForbiddenBellCombat(channel, channelId, guildId, actor, inst.id, def, state, "FINAL_FIGHT");
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === clerkNpc.key && state.stage === "RETURN") {
    const done = turn >= 2;
    await speak(
      channel,
      clerkNpc,
      playerMessage,
      done
        ? "Chika deve aceitar o badalo selado, confirmar que o tratado será protegido e encerrar a missão de forma natural."
        : "Chika deve receber o relatório sobre Enji, Tomoe, Masaru, Reika e o sino enterrado sem repetir toda a investigação.",
      3 + Math.min(turn - 1, 1),
    );
    if (done) {
      state.stage = "DONE";
      state.activeNpc = null;
      await markObjective(inst.id, "entregar_relatorio_sino");
      await setState(inst.id, state);
      const result = await completeMission(inst.charId, inst.missionId);
      if (result && channel && "send" in channel) {
        await channel.send(buildMissionCompleteEmbed(def.name, result));
      }
      return;
    }
    await setState(inst.id, state);
  }
}

function starterFrom(char: Awaited<ReturnType<typeof getOrCreateCharacter>>): StarterChar {
  return {
    charId: char.id,
    name: char.name,
    level: char.level,
    hpCurrent: char.hpCurrent,
    hpMax: char.hpMax,
    chakra: char.resources?.chakra ?? 100,
    energia: char.resources?.energia ?? 100,
    jutsuIds: char.jutsus.map((j: { jutsuId: string }) => j.jutsuId),
    attrs: attrsFromRow(char.attributes ?? {}),
  };
}

async function startForbiddenBellCombat(
  channel: TextBasedChannel | null,
  channelId: string,
  guildId: string,
  actor: { id: string; username: string },
  instanceId: string,
  def: ForbiddenBellContext["def"],
  state: ForbiddenBellState,
  stage: BellStage,
): Promise<void> {
  if (await getActiveSession(channelId)) return;
  const char = await getOrCreateCharacter(actor.id, guildId, actor.username);
  const { players, attrsById } = await gatherPartyPlayers(channel, guildId, starterFrom(char));
  const session = await startCombat({
    channelId,
    guildId,
    scenarioId: scenarioFor(stage),
    players,
    npcs: npcsForStage(def, state, stage),
    missionInstanceId: instanceId,
  });
  await cacheAttrs(session, attrsById);
  await sendLine(channel, combatStartText(stage, state, players.length));
}

function scenarioFor(stage: BellStage): string {
  if (stage === "SACRISTAN_FIGHT") return "centro_comercial";
  if (stage === "SCRIBE_FIGHT") return "hospital_konoha";
  if (stage === "GUARD_FIGHT") return "rota_comercial_konoha";
  return "caverna";
}

function npcsForStage(def: ForbiddenBellContext["def"], state: ForbiddenBellState, stage: BellStage): { templateId: string }[] {
  if (stage === "SACRISTAN_FIGHT") return [{ templateId: String(def.data?.echoTemplate ?? "forbidden_bell_echo") }];
  if (stage === "SCRIBE_FIGHT") return [{ templateId: String(def.data?.memoryWiperTemplate ?? "forbidden_bell_memory_wiper") }];
  if (stage === "GUARD_FIGHT") return [{ templateId: String(def.data?.stringerTemplate ?? "forbidden_bell_stringer") }];
  const bossTemplate = hasAllFragments(state)
    ? String(def.data?.weakenedBossTemplate ?? "forbidden_bell_reika_weakened")
    : String(def.data?.bossTemplate ?? "forbidden_bell_reika");
  const echoes = hasAllFragments(state) ? 1 : 2;
  return [
    { templateId: bossTemplate },
    ...Array.from({ length: echoes }, () => ({ templateId: String(def.data?.echoTemplate ?? "forbidden_bell_echo") })),
  ];
}

function combatStartText(stage: BellStage, state: ForbiddenBellState, playerCount: number): string {
  const text: Record<string, string> = {
    SACRISTAN_FIGHT: "Um Eco do Sino atravessa o mercado para roubar a lembrança do sacristão.",
    SCRIBE_FIGHT: "Um apagador de memórias invade o quarto de Tomoe.",
    GUARD_FIGHT: "Fios de chakra vibram na rota, puxados por um titereiro sonoro.",
    FINAL_FIGHT: hasAllFragments(state)
      ? "Os três fragmentos quebram parte da ressonância. Reika luta enfraquecida, com apenas um eco sustentando o sino."
      : "A ressonância está inteira. Reika ergue o sino enterrado com dois ecos protegendo a cripta.",
  };
  return `${text[stage] ?? "O combate começa."} ${playerCount} ninja(s) entram no combate. Use \`/mapa\`.`;
}

async function retryCombatIfNeeded(
  interaction: ChatInputCommandInteraction,
  ctx: ForbiddenBellContext,
  state: ForbiddenBellState,
): Promise<void> {
  if (await getActiveSession(interaction.channelId)) return;
  const stage = state.stage;
  if (!stage?.endsWith("_FIGHT")) return;
  state.combatStarted = true;
  await setState(ctx.inst.id, state);
  await startForbiddenBellCombat(interaction.channel, interaction.channelId, interaction.guildId ?? "global", interaction.user, ctx.inst.id, ctx.def, state, stage);
}

export async function onForbiddenBellCombatWon(interaction: ChatInputCommandInteraction, instanceId: string): Promise<void> {
  const inst = await getInstance(instanceId);
  if (!inst || inst.status !== "ACTIVE") return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "FORBIDDEN_BELL") return;
  const state = ensureState(inst.stateJson);

  if (state.stage === "SACRISTAN_FIGHT") {
    state.stage = "SCRIBE_TALK";
    await addFragment(state, "sound");
    await markObjective(inst.id, "derrotar_agente_sino");
    await setAfterFight(interaction, inst.id, state, "Fragmento recuperado. A próxima vítima está no Hospital de Konoha: <#1516825458765987980>.", "sound");
    return;
  }
  if (state.stage === "SCRIBE_FIGHT") {
    state.stage = "GUARD_TALK";
    await addFragment(state, "look");
    await markObjective(inst.id, "derrotar_apagador_memoria");
    await setAfterFight(interaction, inst.id, state, "Fragmento recuperado. O guarda que subiu na torre foi visto na Rota Comercial: <#1516425270481915995>.", "look");
    return;
  }
  if (state.stage === "GUARD_FIGHT") {
    state.stage = "FINAL_TALK";
    await addFragment(state, "buried");
    await markObjective(inst.id, "derrotar_titereiro_fios");
    if (hasAllFragments(state)) await markObjective(inst.id, "reunir_fragmentos_memoria");
    await setAfterFight(interaction, inst.id, state, "Os três fragmentos apontam para a cripta sob o templo. Siga para a Caverna: <#1521879431168131132>.", "buried");
    return;
  }
  if (state.stage === "FINAL_FIGHT") {
    state.stage = "RETURN";
    await markObjective(inst.id, "derrotar_reika");
    await setAfterFight(interaction, inst.id, state, "Reika foi derrotada e o badalo do sino foi selado. Volte à Mansão do Hokage: <#1516470677962494084>.");
  }
}

async function addFragment(state: ForbiddenBellState, fragment: FragmentId): Promise<void> {
  state.fragments = state.fragments ?? [];
  if (!state.fragments.includes(fragment)) state.fragments.push(fragment);
}

async function setAfterFight(
  interaction: ChatInputCommandInteraction,
  instanceId: string,
  state: ForbiddenBellState,
  message: string,
  fragment?: FragmentId,
): Promise<void> {
  state.combatStarted = false;
  state.activeNpc = null;
  await setState(instanceId, state);
  if (fragment) {
    await interaction.followUp({ embeds: [fragmentEmbed(fragment, state)] });
  }
  await interaction.followUp(message);
}

function fragmentEmbed(fragment: FragmentId, state: ForbiddenBellState): EmbedBuilder {
  const data = FRAGMENTS[fragment];
  return new EmbedBuilder()
    .setColor(0x8e44ad)
    .setTitle(data.title)
    .setDescription(`> ${data.text}`)
    .addFields({ name: "Fragmentos", value: `> **${state.fragments?.length ?? 0}/3** recuperados` });
}

async function sendLine(channel: TextBasedChannel | null, text: string): Promise<void> {
  if (channel && "send" in channel) await channel.send(text);
}
