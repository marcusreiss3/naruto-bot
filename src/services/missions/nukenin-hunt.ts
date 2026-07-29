import {
  ActionRowBuilder,
  ComponentType,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type ChatInputCommandInteraction,
  type Message,
  type StringSelectMenuInteraction,
  type TextBasedChannel,
} from "discord.js";
import { prisma } from "../../db/client.js";
import {
  BECO_KONOHA_CHANNEL_ID,
  FLORESTA_CHANNEL_ID,
  MANSAO_HOKAGE_CHANNEL_ID,
} from "../../data/scenarios/index.js";
import { getMission } from "../../data/missions/index.js";
import { getOrCreateCharacter, attrsFromRow } from "../characters/character-service.js";
import { getActiveSession, startCombat } from "../combat/combat-engine.js";
import { formatPersonaLines, sendAsPersona } from "../discord/persona-webhook.js";
import type { RenderEntity } from "../maps/renderer.js";
import { NpcAiService } from "../npc-ai/npc-ai-service.js";
import { getPersona } from "../npc-ai/personas.js";
import { partyMemberIds } from "../party/party-service.js";
import { cacheAttrs, gatherPartyPlayers, type StarterChar } from "./combat-party.js";
import {
  completeMission,
  buildMissionCompleteEmbed,
  getActiveInstanceByType,
  getInstance,
  markObjective,
  readState,
  setState,
} from "./mission-service.js";

const CLERK_KEY = "nukenin_clerk_konoha";
const INFORMANT_KEY = "nukenin_informant";
const NUKENIN_KEY = "minor_nukenin";

interface TrackStep {
  id: string;
  title: string;
  clue: string;
  correct: string;
  success: string;
  objectiveId?: string;
  options: { value: string; label: string; description: string }[];
}

const TRACK_STEPS: TrackStep[] = [
  {
    id: "trail",
    title: "Trilha dividida",
    clue: "Pegadas pesadas seguem ao norte. Pegadas leves seguem para o leste, mas parecem feitas com sandalias amarradas ao contrario.",
    correct: "norte",
    success: "O rastro norte combina com o peso descrito na ficha do nukenin.",
    options: [
      { value: "norte", label: "Seguir norte", description: "Rastro pesado e coerente com a fuga." },
      { value: "leste", label: "Seguir leste", description: "Pegadas leves demais e invertidas." },
      { value: "dividir", label: "Dividir equipe", description: "Arrisca isolar alguem na floresta." },
    ],
  },
  {
    id: "false_camp",
    title: "Acampamento falso",
    clue: "Uma fogueira recente esta visivel demais. Ha cinzas frias por baixo das cinzas quentes.",
    correct: "ignorar",
    success: "O time reconhece a isca e encontra marcas verdadeiras atras das arvores.",
    options: [
      { value: "ignorar", label: "Ignorar a isca", description: "Preserva tempo e procura marcas ocultas." },
      { value: "acampar", label: "Esperar no local", description: "Deixa o alvo ganhar distancia." },
      { value: "mexer", label: "Revirar a fogueira", description: "Pode acionar armadilha ou destruir pistas." },
    ],
  },
  {
    id: "wire",
    title: "Fios com sinos falsos",
    clue: "Fios baixos cruzam a trilha. Alguns sinos estao soltos demais, como se fossem distração para outro disparo.",
    correct: "desarmar",
    success: "A armadilha real estava presa no galho acima dos sinos falsos.",
    objectiveId: "desarmar_armadilha_nukenin",
    options: [
      { value: "desarmar", label: "Desarmar pelo galho", description: "Procura o disparo real antes de tocar nos sinos." },
      { value: "cortar", label: "Cortar todos fios", description: "Pode acionar o fio principal por tensao." },
      { value: "saltar", label: "Saltar por cima", description: "Deixa a armadilha ativa para quem vier atras." },
    ],
  },
];

export interface NukeninHuntState {
  stage?: "BRIEFING" | "INFORMANT" | "TRACKING" | "NUKENIN_TALK" | "FIGHT" | "RETURN" | "DONE";
  activeNpc?: string | null;
  talks?: Record<string, number>;
  running?: boolean;
  trackStep?: number;
  mistakes?: number;
  combatStarted?: boolean;
  nukeninSeen?: boolean;
}

export interface NukeninHuntContext {
  inst: NonNullable<Awaited<ReturnType<typeof getInstance>>>;
  def: NonNullable<ReturnType<typeof getMission>>;
  ownerCharId: string;
}

function ensureState(raw: string): NukeninHuntState {
  const state = readState<NukeninHuntState>(raw);
  state.stage = state.stage ?? "BRIEFING";
  state.activeNpc = state.activeNpc ?? null;
  state.talks = state.talks ?? {};
  state.running = state.running ?? false;
  state.trackStep = state.trackStep ?? 0;
  state.mistakes = state.mistakes ?? 0;
  state.combatStarted = state.combatStarted ?? false;
  state.nukeninSeen = state.nukeninSeen ?? false;
  return state;
}

function turns(
  def: NukeninHuntContext["def"],
  key: "briefingTurns" | "informantTurns" | "nukeninTurns" | "reportTurns",
  fallback: number,
): number {
  return Number(def.data?.[key] ?? fallback);
}

function maxMistakes(def: NukeninHuntContext["def"]): number {
  return Number(def.data?.maxMistakes ?? 4);
}

function stepTimeout(def: NukeninHuntContext["def"]): number {
  return Number(def.data?.stepTimeoutMs ?? 60_000);
}

function scoutTemplate(def: NukeninHuntContext["def"]): string {
  return String(def.data?.scoutTemplate ?? "nukenin_scout");
}

function bossTemplate(def: NukeninHuntContext["def"]): string {
  return String(def.data?.bossTemplate ?? "minor_nukenin");
}

async function findContextByCharId(charId: string): Promise<NukeninHuntContext | null> {
  const c = await getActiveInstanceByType(charId, "NUKENIN_HUNT");
  if (!c) return null;
  return { inst: c.inst, def: c.def, ownerCharId: charId };
}

export async function resolveNukeninHunt(discordId: string, guildId: string): Promise<NukeninHuntContext | null> {
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

export function availableNukeninHuntNpcs(state: NukeninHuntState, channelId: string): { key: string; name: string }[] {
  if (channelId === MANSAO_HOKAGE_CHANNEL_ID) {
    if (state.stage === "BRIEFING") return [{ key: CLERK_KEY, name: "Kaede Mori (ficha nukenin)" }];
    if (state.stage === "RETURN") return [{ key: CLERK_KEY, name: "Kaede Mori (captura)" }];
  }
  if (channelId === BECO_KONOHA_CHANNEL_ID && state.stage === "INFORMANT") {
    return [{ key: INFORMANT_KEY, name: "Informante do Beco" }];
  }
  if (channelId === FLORESTA_CHANNEL_ID && state.stage === "NUKENIN_TALK") {
    return [{ key: NUKENIN_KEY, name: "Nukenin Menor" }];
  }
  return [];
}

export async function nukeninHuntMapHandle(
  interaction: ChatInputCommandInteraction,
  ctx: NukeninHuntContext,
  entities: RenderEntity[],
): Promise<string | null> {
  const channelId = interaction.channelId;
  let state = ensureState(ctx.inst.stateJson);
  entities.push(...nukeninEntities(state, channelId));

  if (channelId === MANSAO_HOKAGE_CHANNEL_ID) {
    if (state.stage === "BRIEFING") return `\nMissao ativa: **${ctx.def.name}** - receba a ficha com \`/interagir npc\`.`;
    if (state.stage === "RETURN") return `\nMissao ativa: **${ctx.def.name}** - entregue a placa apreendida a Kaede com \`/interagir npc\`.`;
    return `\nMissao ativa: **${ctx.def.name}** - siga as pistas fora da Mansao.`;
  }

  if (channelId === BECO_KONOHA_CHANNEL_ID) {
    if (state.stage === "INFORMANT") return `\nMissao ativa: **${ctx.def.name}** - interrogue o informante usando \`/interagir npc\`.`;
    if (state.stage === "BRIEFING") return `\nMissao ativa: **${ctx.def.name}** - primeiro receba a ficha na Mansao do Hokage.`;
    return `\nMissao ativa: **${ctx.def.name}** - o rastro ja saiu do Beco.`;
  }

  if (channelId === FLORESTA_CHANNEL_ID) {
    if (state.stage === "TRACKING") {
      if (state.running) return `\nMissao ativa: **${ctx.def.name}** - o rastreamento ja esta aberto no canal.`;
      state.running = true;
      await setState(ctx.inst.id, state);
      void startTrackingPanel(interaction.channel, ctx.inst.id, interaction.user.id).catch(() => undefined);
      return `\nMissao ativa: **${ctx.def.name}** - siga o rastro e desarme a armadilha no painel.`;
    }
    if (state.stage === "NUKENIN_TALK") {
      if (!state.nukeninSeen) {
        state.nukeninSeen = true;
        await setState(ctx.inst.id, state);
        await speak(
          interaction.channel,
          NUKENIN_KEY,
          "(o time atravessa a armadilha e encontra o desertor)",
          "O time chegou ate seu esconderijo. Intimide-os, mas ainda nao ataque.",
          0,
        );
      }
      return `\nMissao ativa: **${ctx.def.name}** - confronte o nukenin usando \`/interagir npc\`.`;
    }
    if (state.stage === "FIGHT") {
      await retryCombatIfNeeded(interaction, ctx, state);
      return `\nMissao ativa: **${ctx.def.name}** - derrote o nukenin e seus batedores.`;
    }
    if (state.stage === "BRIEFING" || state.stage === "INFORMANT") {
      return `\nMissao ativa: **${ctx.def.name}** - obtenha as pistas antes de entrar na Floresta.`;
    }
    return `\nMissao ativa: **${ctx.def.name}** - volte a Mansao do Hokage para relatar a captura.`;
  }

  return null;
}

function nukeninEntities(state: NukeninHuntState, channelId: string): RenderEntity[] {
  if (channelId === MANSAO_HOKAGE_CHANNEL_ID) {
    return [{ cell: "C3", name: "Kaede Mori", label: "Kae", color: "#3498db", kind: "NPC", imageFile: "npcs/mission-clerk.png" }];
  }
  if (channelId === BECO_KONOHA_CHANNEL_ID && state.stage === "INFORMANT") {
    return [{ cell: "D4", name: "Informante", label: "Inf", color: "#f39c12", kind: "NPC", imageFile: "npcs/merchant.png" }];
  }
  if (channelId === FLORESTA_CHANNEL_ID) {
    const entities: RenderEntity[] = [
      { cell: "B4", label: "\u{1F463}", color: "#95a5a6", kind: "MARKER" },
      { cell: "D6", label: "\u{1FAA4}", color: "#c0392b", kind: "MARKER" },
    ];
    if (state.stage === "NUKENIN_TALK") {
      entities.push({
        cell: "E8",
        name: "Nukenin Menor",
        label: "Nuk",
        color: "#8e44ad",
        kind: "NPC",
        imageFile: "enemies/bandit-leader-forest.png",
      });
    }
    return entities;
  }
  return [];
}

async function speak(channel: TextBasedChannel | null, personaKey: string, message: string, extra: string, fallbackIndex: number): Promise<void> {
  const text = await NpcAiService.say(personaKey, message, extra, fallbackIndex);
  const persona = getPersona(personaKey);
  const sent = await sendAsPersona(channel, {
    key: personaKey,
    name: persona?.displayName ?? "NPC",
    avatarFile: persona?.avatarFile,
    lines: formatPersonaLines(text),
  });
  if (!sent && channel && "send" in channel) await channel.send(text.slice(0, 1900));
}

export async function interactNukeninHunt(interaction: ChatInputCommandInteraction, npcKey: string): Promise<void> {
  const guildId = interaction.guildId ?? "global";
  const ctx = await resolveNukeninHunt(interaction.user.id, guildId);
  if (!ctx) {
    await interaction.reply({ content: "Voce (ou sua party) nao tem essa missao ativa.", ephemeral: true });
    return;
  }
  const state = ensureState(ctx.inst.stateJson);
  const choice = availableNukeninHuntNpcs(state, interaction.channelId).find((npc) => npc.key === npcKey);
  if (!choice) {
    await interaction.reply({ content: "Esse NPC nao esta disponivel nesta etapa.", ephemeral: true });
    return;
  }
  if (state.activeNpc && state.activeNpc !== npcKey) {
    await interaction.reply({ content: "Ja existe uma conversa da missao em andamento.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  state.activeNpc = npcKey;
  await setState(ctx.inst.id, state);
  await runDialogue(interaction.channel, interaction.channelId, guildId, ctx, npcKey, "(o time inicia a conversa)", interaction.user);
  await interaction.editReply(`Voce se aproxima de **${choice.name}**. Continue por mensagens normais no canal.`);
}

export async function continueNukeninHuntMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.guildId) return false;
  const ctx = await resolveNukeninHunt(message.author.id, message.guildId);
  if (!ctx) return false;
  const state = ensureState(ctx.inst.stateJson);
  if (!state.activeNpc) return false;
  if (!availableNukeninHuntNpcs(state, message.channelId).some((npc) => npc.key === state.activeNpc)) return false;
  await runDialogue(message.channel, message.channelId, message.guildId, ctx, state.activeNpc, message.content || "...", message.author);
  return true;
}

async function runDialogue(
  channel: TextBasedChannel | null,
  channelId: string,
  guildId: string,
  ctx: NukeninHuntContext,
  npcKey: string,
  playerMessage: string,
  actor: { id: string; username: string },
): Promise<void> {
  const inst = await getInstance(ctx.inst.id);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "NUKENIN_HUNT") return;
  const state = ensureState(inst.stateJson);
  const turn = (state.talks?.[npcKey] ?? 0) + 1;
  state.talks![npcKey] = turn;

  if (npcKey === CLERK_KEY && state.stage === "BRIEFING") {
    const done = turn >= turns(def, "briefingTurns", 3);
    await speak(
      channel,
      CLERK_KEY,
      playerMessage,
      done
        ? "Ultima fala: entregue a ficha e mande o time ir ao Beco interrogar o informante antes de seguir para a Floresta."
        : "Explique que o nukenin menor usa informantes civis e que a captura deve evitar dano aos moradores.",
      done ? 2 : Math.min(turn - 1, 1),
    );
    if (done) {
      state.stage = "INFORMANT";
      state.activeNpc = null;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "receber_ficha_nukenin");
      await setState(inst.id, state);
      if (channel && "send" in channel) await channel.send("Va ao **Beco de Konoha** e use `/mapa` para encontrar o informante.");
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === INFORMANT_KEY && state.stage === "INFORMANT") {
    const done = turn >= turns(def, "informantTurns", 2);
    await speak(
      channel,
      INFORMANT_KEY,
      playerMessage,
      done
        ? "Ultima fala: revele claramente que o nukenin fugiu pela trilha norte da Floresta e deixou fios com sinos falsos."
        : "Tente se defender, dizendo que so vendeu comida e bandagens sem saber que era um desertor.",
      done ? 1 : 0,
    );
    if (done) {
      state.stage = "TRACKING";
      state.activeNpc = null;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "interrogar_informante");
      await setState(inst.id, state);
      if (channel && "send" in channel) await channel.send("Siga para a **Floresta** e use `/mapa` para rastrear o nukenin.");
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === NUKENIN_KEY && state.stage === "NUKENIN_TALK") {
    const fight = turn >= turns(def, "nukeninTurns", 3);
    await speak(
      channel,
      NUKENIN_KEY,
      playerMessage,
      fight
        ? "Ultima fala: mande os dois batedores atacarem e inicie combate contra o time."
        : "Intimide o time, mencione sua placa riscada e tente parecer mais perigoso do que e.",
      fight ? 2 : Math.min(turn - 1, 1),
    );
    if (fight) {
      state.stage = "FIGHT";
      state.activeNpc = null;
      state.combatStarted = true;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "confrontar_nukenin");
      await setState(inst.id, state);
      await startNukeninCombat(channel, channelId, guildId, actor, inst.id, def);
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === CLERK_KEY && state.stage === "RETURN") {
    const done = turn >= turns(def, "reportTurns", 2);
    await speak(
      channel,
      CLERK_KEY,
      playerMessage,
      done
        ? "Ultima fala: confira a placa apreendida, registre a captura do nukenin e encerre a missao."
        : "Receba o relato sobre informante, trilha, armadilha e combate na Floresta.",
      3 + Math.min(turn - 1, 1),
    );
    if (done) {
      state.stage = "DONE";
      state.activeNpc = null;
      await markObjective(inst.id, "entregar_captura_nukenin");
      await setState(inst.id, state);
      const result = await completeMission(inst.charId, inst.missionId);
      if (result && channel && "send" in channel) {
        await channel.send({ embeds: [buildMissionCompleteEmbed(def.name, result.rewards)] });
      }
      return;
    }
    await setState(inst.id, state);
  }
}

function trackingEmbed(state: NukeninHuntState, def: NukeninHuntContext["def"], result?: string): EmbedBuilder {
  const step = TRACK_STEPS[state.trackStep ?? 0];
  return new EmbedBuilder()
    .setColor(0x27ae60)
    .setTitle("Rastreamento do Nukenin")
    .setDescription([
      `Etapas resolvidas: **${state.trackStep ?? 0}/${TRACK_STEPS.length}**`,
      `Erros: **${state.mistakes ?? 0}/${maxMistakes(def)}**`,
      "",
      result ?? "",
      step ? `**${step.title}:** ${step.clue}` : "O esconderijo foi encontrado.",
      "",
      step ? "Escolha a acao que segue o rastro sem cair na armadilha." : "",
    ].filter(Boolean).join("\n"));
}

function trackingMenu(instanceId: string, state: NukeninHuntState): ActionRowBuilder<StringSelectMenuBuilder> {
  const step = TRACK_STEPS[state.trackStep ?? 0]!;
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`nukenin-hunt:track:${instanceId}:${(state.trackStep ?? 0) + 1}`)
      .setPlaceholder(step.title)
      .addOptions(step.options.map((option) => ({
        label: option.label,
        description: option.description.slice(0, 100),
        value: option.value,
      }))),
  );
}

async function startTrackingPanel(channel: TextBasedChannel | null, instanceId: string, actorDiscordId: string): Promise<void> {
  if (!channel || !("send" in channel)) return;
  const inst = await getInstance(instanceId);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "NUKENIN_HUNT") return;
  let state = ensureState(inst.stateJson);
  const msg = await channel.send({ embeds: [trackingEmbed(state, def)], components: [trackingMenu(instanceId, state)] });

  while ((state.trackStep ?? 0) < TRACK_STEPS.length) {
    const index = state.trackStep ?? 0;
    const step = TRACK_STEPS[index]!;
    try {
      const pick = (await msg.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        time: stepTimeout(def),
        filter: (i: StringSelectMenuInteraction) =>
          i.user.id === actorDiscordId && i.customId === `nukenin-hunt:track:${instanceId}:${index + 1}`,
      })) as StringSelectMenuInteraction;

      let result: string;
      if (pick.values[0] === step.correct) {
        state.trackStep = index + 1;
        result = `**Correto:** ${step.success}`;
        if (step.objectiveId) await markObjective(instanceId, step.objectiveId);
      } else {
        state.mistakes = (state.mistakes ?? 0) + 1;
        result = "**Alerta:** a escolha cairia numa isca, perderia o rastro ou acionaria armadilha.";
      }

      if ((state.mistakes ?? 0) >= maxMistakes(def)) {
        await failNukeninHunt(instanceId, msg, "Erros demais no rastreamento permitiram que o nukenin escapasse da Floresta.");
        return;
      }

      await setState(instanceId, state);
      const done = (state.trackStep ?? 0) >= TRACK_STEPS.length;
      await pick.update({ embeds: [trackingEmbed(state, def, result)], components: done ? [] : [trackingMenu(instanceId, state)] });
      if (done) break;
    } catch {
      state.running = false;
      await setState(instanceId, state);
      await msg.edit({ components: [] }).catch(() => undefined);
      await channel.send("O rastreamento expirou. Use `/mapa` para retomar do ponto atual.");
      return;
    }
  }

  state.stage = "NUKENIN_TALK";
  state.running = false;
  await markObjective(instanceId, "seguir_rastro_floresta");
  await setState(instanceId, state);
  await msg.edit({
    embeds: [
      new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle("Esconderijo localizado")
        .setDescription("O rastro leva a uma clareira protegida por batedores. Use `/mapa` para confrontar o nukenin."),
    ],
    components: [],
  });
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

async function startNukeninCombat(
  channel: TextBasedChannel | null,
  channelId: string,
  guildId: string,
  actor: { id: string; username: string },
  instanceId: string,
  def: NukeninHuntContext["def"],
): Promise<void> {
  if (await getActiveSession(channelId)) return;
  const char = await getOrCreateCharacter(actor.id, guildId, actor.username);
  const { players, attrsById } = await gatherPartyPlayers(channel, guildId, starterFrom(char));
  const session = await startCombat({
    channelId,
    guildId,
    scenarioId: "floresta",
    players,
    npcs: [{ templateId: bossTemplate(def) }, { templateId: scoutTemplate(def) }, { templateId: scoutTemplate(def) }],
    missionInstanceId: instanceId,
  });
  await cacheAttrs(session, attrsById);
  if (channel && "send" in channel) {
    await channel.send(`O nukenin e dois batedores atacam! ${players.length} ninja(s) na luta. Use \`/mapa\`.`);
  }
}

async function retryCombatIfNeeded(
  interaction: ChatInputCommandInteraction,
  ctx: NukeninHuntContext,
  state: NukeninHuntState,
): Promise<void> {
  if (await getActiveSession(interaction.channelId)) return;
  state.combatStarted = true;
  await setState(ctx.inst.id, state);
  await startNukeninCombat(interaction.channel, interaction.channelId, interaction.guildId ?? "global", interaction.user, ctx.inst.id, ctx.def);
}

async function failNukeninHunt(instanceId: string, msg: Message, reason: string): Promise<void> {
  await prisma.missionInstance.update({ where: { id: instanceId }, data: { status: "FAILED" } });
  await msg.edit({
    embeds: [new EmbedBuilder().setColor(0xc0392b).setTitle("Nukenin escapou").setDescription(reason)],
    components: [],
  }).catch(() => undefined);
}

export async function onNukeninHuntCombatWon(interaction: ChatInputCommandInteraction, instanceId: string): Promise<void> {
  const inst = await getInstance(instanceId);
  if (!inst || inst.status !== "ACTIVE") return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "NUKENIN_HUNT") return;
  const state = ensureState(inst.stateJson);
  if (state.stage !== "FIGHT") return;

  state.stage = "RETURN";
  state.combatStarted = false;
  state.activeNpc = null;
  await markObjective(inst.id, "derrotar_nukenin");
  await setState(inst.id, state);
  await interaction.followUp("O nukenin foi derrotado e sua placa riscada foi apreendida. Volte a **Mansao do Hokage** e fale com Kaede.");
}
