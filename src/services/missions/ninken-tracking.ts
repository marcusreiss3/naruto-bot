import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Message,
  type StringSelectMenuInteraction,
  type TextBasedChannel,
} from "discord.js";
import { prisma } from "../../db/client.js";
import {
  FLORESTA_CHANNEL_ID,
  ROTA_COMERCIAL_KONOHA_CHANNEL_ID,
} from "../../data/scenarios/index.js";
import { getMission } from "../../data/missions/index.js";
import { sendMissionNotice } from "../../ui/mission-notice-v2.js";
import { NpcAiService } from "../npc-ai/npc-ai-service.js";
import { getPersona } from "../npc-ai/personas.js";
import { sendAsPersona, formatPersonaLines } from "../discord/persona-webhook.js";
import {
  buildMissionCompleteEmbed,
  completeMission,
  getActiveInstanceByType,
  getInstance,
  markObjective,
  readState,
  setState,
} from "./mission-service.js";
import type { RenderEntity } from "../maps/renderer.js";

const TRAINER_KEY = "ninken_trainer";
const NINKEN_KEY = "ninken_mugi";
const PAW_MARKER = "\u{1F43E}";
const NOSE_MARKER = "\u{1F443}";

interface ScentRound {
  id: string;
  title: string;
  clue: string;
  correct: string;
  decoys: string[];
}

const ROUTE_SCENTS: ScentRound[] = [
  {
    id: "training_cloth",
    title: "Pano de treino",
    clue: "Daisuke disse que o rastro verdadeiro cheira a pano de treino, pelo limpo e poeira da estrada.",
    correct: "Pelo jovem misturado com pano de treino e poeira seca.",
    decoys: [
      "Cheiro forte de bolinho doce vindo de uma barraca.",
      "Lama molhada espalhada de proposito perto da roda de uma carroca.",
      "Perfume barato derramado no acostamento da rota.",
    ],
  },
  {
    id: "broken_grass",
    title: "Pegadas leves",
    clue: "O cheiro falso esta exagerado. O rastro real deve ser discreto e acompanhar pegadas pequenas.",
    correct: "Odor fraco de pelo e grama quebrada seguindo pegadas pequenas.",
    decoys: [
      "Marca funda demais, com cheiro de carne seca amarrada num galho.",
      "Trilha circular de lama, como se alguem tivesse rodado no mesmo lugar.",
      "Cheiro de sabonete cobrindo totalmente o solo.",
    ],
  },
];

const FOREST_APPROACH = [
  { id: "observe", label: "Observar", style: ButtonStyle.Secondary },
  { id: "crouch", label: "Agachar", style: ButtonStyle.Secondary },
  { id: "cloth", label: "Mostrar pano", style: ButtonStyle.Primary },
  { id: "call", label: "Chamar baixo", style: ButtonStyle.Success },
] as const;

type ApproachId = (typeof FOREST_APPROACH)[number]["id"];

export interface NinkenTrackingState {
  stage?: "INTRO" | "ROUTE_TRAIL" | "TO_FOREST" | "FOREST_TRAIL" | "NINKEN_TALK" | "RETURN" | "DONE";
  activeNpc?: string | null;
  talks?: number;
  thanks?: number;
  running?: boolean;
  mistakes?: number;
  routeStep?: number;
  forestStep?: number;
  ninkenActions?: number;
  ninkenSeen?: boolean;
}

export interface NinkenChoice {
  key: string;
  name: string;
}

interface NinkenTrackingContext {
  inst: NonNullable<Awaited<ReturnType<typeof getInstance>>>;
  def: NonNullable<ReturnType<typeof getMission>>;
  ownerCharId: string;
}

function ensureState(raw: string): NinkenTrackingState {
  const state = readState<NinkenTrackingState>(raw);
  state.stage = state.stage ?? "INTRO";
  state.activeNpc = state.activeNpc ?? null;
  state.talks = state.talks ?? 0;
  state.thanks = state.thanks ?? 0;
  state.running = state.running ?? false;
  state.mistakes = state.mistakes ?? 0;
  state.routeStep = state.routeStep ?? 0;
  state.forestStep = state.forestStep ?? 0;
  state.ninkenActions = state.ninkenActions ?? 0;
  state.ninkenSeen = state.ninkenSeen ?? false;
  return state;
}

function introTurns(def: NinkenTrackingContext["def"]): number {
  return Number(def.data?.introTurns ?? 3);
}

function thanksTurns(def: NinkenTrackingContext["def"]): number {
  return Number(def.data?.thanksTurns ?? 2);
}

function maxMistakes(def: NinkenTrackingContext["def"]): number {
  return Number(def.data?.maxMistakes ?? 4);
}

function stepTimeout(def: NinkenTrackingContext["def"]): number {
  return Number(def.data?.stepTimeoutMs ?? 60_000);
}

function ninkenMaxActions(def: NinkenTrackingContext["def"]): number {
  return Number(def.data?.ninkenMaxActions ?? 6);
}

async function findContextByCharId(charId: string): Promise<NinkenTrackingContext | null> {
  const c = await getActiveInstanceByType(charId, "NINKEN_TRACKING");
  if (!c) return null;
  return { inst: c.inst, def: c.def, ownerCharId: charId };
}

export async function resolveNinkenTracking(discordId: string, guildId: string): Promise<NinkenTrackingContext | null> {
  const own = await prisma.userCharacter.findUnique({
    where: { discordId_guildId: { discordId, guildId } },
    select: { id: true },
  });
  return own ? findContextByCharId(own.id) : null;
}

export function availableNinkenNpcs(state: NinkenTrackingState, channelId: string): NinkenChoice[] {
  const stage = state.stage ?? "INTRO";
  if (channelId === ROTA_COMERCIAL_KONOHA_CHANNEL_ID && stage === "INTRO") {
    return [{ key: TRAINER_KEY, name: "Daisuke Inuzuka (treinador)" }];
  }
  if (channelId === FLORESTA_CHANNEL_ID && stage === "NINKEN_TALK") {
    return [{ key: NINKEN_KEY, name: "Mugi (ninken jovem)" }];
  }
  if (channelId === ROTA_COMERCIAL_KONOHA_CHANNEL_ID && stage === "RETURN") {
    return [{ key: TRAINER_KEY, name: "Daisuke Inuzuka (entregar Mugi)" }];
  }
  return [];
}

export async function ninkenTrackingMapHandle(
  interaction: ChatInputCommandInteraction,
  ctx: NinkenTrackingContext,
  entities: RenderEntity[],
): Promise<string | null> {
  const channelId = interaction.channelId;
  let state = ensureState(ctx.inst.stateJson);
  const stage = state.stage ?? "INTRO";

  if (channelId === ROTA_COMERCIAL_KONOHA_CHANNEL_ID) {
    if (stage === "INTRO" || stage === "RETURN") {
      entities.push(trainerEntity());
      return stage === "RETURN"
        ? `\nMissao ativa: **${ctx.def.name}** - entregue Mugi para Daisuke com \`/interagir npc\`.`
        : `\nMissao ativa: **${ctx.def.name}** - fale com Daisuke usando \`/interagir npc\`.`;
    }
    if (stage === "ROUTE_TRAIL") {
      entities.push(...routeTrailEntities());
      if (state.running) {
        return `\nMissao ativa: **${ctx.def.name}** - o rastreamento da rota ja esta em andamento no canal.`;
      }
      state.running = true;
      state.mistakes = 0;
      state.routeStep = 0;
      await setState(ctx.inst.id, state);
      void startRouteScentPuzzle(interaction.channel, ctx.inst.id, interaction.user.id).catch(() => undefined);
      return `\nMissao ativa: **${ctx.def.name}** - siga o rastro verdadeiro no painel enviado no canal.`;
    }
    if (stage === "TO_FOREST" || stage === "FOREST_TRAIL" || stage === "NINKEN_TALK") {
      return `\nMissao ativa: **${ctx.def.name}** - siga para a **Floresta** e use \`/mapa\`: <#${FLORESTA_CHANNEL_ID}>.`;
    }
    return null;
  }

  if (channelId !== FLORESTA_CHANNEL_ID) return null;
  if (stage === "INTRO" || stage === "ROUTE_TRAIL") {
    return `\nMissao ativa: **${ctx.def.name}** - investigue a **Rota Comercial de Konoha** primeiro: <#${ROTA_COMERCIAL_KONOHA_CHANNEL_ID}>.`;
  }
  if (stage === "RETURN" || stage === "DONE") {
    return `\nMissao ativa: **${ctx.def.name}** - volte para a **Rota Comercial de Konoha** com Mugi: <#${ROTA_COMERCIAL_KONOHA_CHANNEL_ID}>.`;
  }
  if (stage === "NINKEN_TALK") {
    entities.push(ninkenEntity());
    return `\nMissao ativa: **${ctx.def.name}** - Mugi apareceu. Acalme o ninken usando \`/interagir npc\`.`;
  }

  entities.push(...forestTrailEntities());
  if (state.running) {
    return `\nMissao ativa: **${ctx.def.name}** - a aproximacao na floresta ja esta em andamento no canal.`;
  }
  state.stage = "FOREST_TRAIL";
  state.running = true;
  state.forestStep = 0;
  await setState(ctx.inst.id, state);
  void startForestApproach(interaction.channel, ctx.inst.id, interaction.user.id).catch(() => undefined);
  return `\nMissao ativa: **${ctx.def.name}** - aproxime-se sem assustar Mugi no painel enviado no canal.`;
}

function trainerEntity(): RenderEntity {
  return {
    cell: "C4",
    name: "Daisuke Inuzuka",
    label: "Dai",
    color: "#8e44ad",
    kind: "NPC",
    imageFile: "npcs/ninken-trainer-daisuke.png",
  };
}

function ninkenEntity(): RenderEntity {
  return {
    cell: "D7",
    name: "Mugi",
    label: "Mug",
    color: "#f1c40f",
    kind: "NPC",
    imageFile: "npcs/ninken-mugi.png",
  };
}

function routeTrailEntities(): RenderEntity[] {
  return [
    { cell: "B3", label: NOSE_MARKER, color: "#95a5a6", kind: "MARKER" },
    { cell: "C6", label: PAW_MARKER, color: "#f1c40f", kind: "MARKER" },
    { cell: "E8", label: NOSE_MARKER, color: "#95a5a6", kind: "MARKER" },
  ];
}

function forestTrailEntities(): RenderEntity[] {
  return [
    { cell: "B4", label: PAW_MARKER, color: "#f1c40f", kind: "MARKER" },
    { cell: "C8", label: NOSE_MARKER, color: "#95a5a6", kind: "MARKER" },
    { cell: "E6", label: PAW_MARKER, color: "#f1c40f", kind: "MARKER" },
  ];
}

async function speak(
  channel: TextBasedChannel | null,
  personaKey: string,
  message: string,
  extra: string,
  fallbackIndex: number,
): Promise<void> {
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

export async function interactNinkenTracking(interaction: ChatInputCommandInteraction, npcKey: string): Promise<void> {
  const guildId = interaction.guildId ?? "global";
  const ctx = await resolveNinkenTracking(interaction.user.id, guildId);
  if (!ctx) {
    await interaction.reply({ content: "Voce nao tem essa missao ativa.", ephemeral: true });
    return;
  }
  const state = ensureState(ctx.inst.stateJson);
  const choice = availableNinkenNpcs(state, interaction.channelId).find((n) => n.key === npcKey);
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
  await runNinkenDialogue(interaction.channel, ctx, npcKey, "(o ninja se aproxima)");
  await interaction.editReply(`Voce se aproxima de **${choice.name}**. Continue por mensagens normais no canal.`);
}

export async function continueNinkenTrackingMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.guildId) return false;
  const ctx = await resolveNinkenTracking(message.author.id, message.guildId);
  if (!ctx) return false;
  const state = ensureState(ctx.inst.stateJson);
  if (!state.activeNpc) return false;
  if (!availableNinkenNpcs(state, message.channelId).some((n) => n.key === state.activeNpc)) return false;
  await runNinkenDialogue(message.channel, ctx, state.activeNpc, message.content || "...");
  return true;
}

async function runNinkenDialogue(
  channel: TextBasedChannel | null,
  ctx: NinkenTrackingContext,
  npcKey: string,
  playerMessage: string,
): Promise<void> {
  const inst = await getInstance(ctx.inst.id);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "NINKEN_TRACKING") return;
  const state = ensureState(inst.stateJson);

  if (npcKey === TRAINER_KEY && state.stage === "INTRO") {
    state.talks = (state.talks ?? 0) + 1;
    const done = state.talks >= introTurns(def);
    await speak(
      channel,
      TRAINER_KEY,
      playerMessage,
      done
        ? "Esta e sua ultima fala: entregue o pano de treino, explique os cheiros falsos e mande usar /mapa para rastrear a rota."
        : "Explique a fuga de Mugi e ensine aos poucos como diferenciar o rastro verdadeiro dos cheiros falsos.",
      done ? 2 : Math.min((state.talks ?? 1) - 1, 1),
    );
    if (done) {
      state.stage = "ROUTE_TRAIL";
      state.activeNpc = null;
      await markObjective(inst.id, "falar_treinador");
      await setState(inst.id, state);
      await sendMissionNotice(channel, {
        kind: "investigacao",
        title: "Rastreamento liberado",
        description: "Separe o cheiro verdadeiro de Mugi dos rastros falsos espalhados pela rota.",
        items: ["Use `/mapa` neste canal para iniciar o rastreamento."],
        itemsTitle: "Próximo passo",
      });
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === NINKEN_KEY && state.stage === "NINKEN_TALK") {
    state.ninkenActions = (state.ninkenActions ?? 0) + 1;
    if (calmsNinken(playerMessage)) {
      state.stage = "RETURN";
      state.activeNpc = null;
      await markObjective(inst.id, "acalmar_ninken");
      await setState(inst.id, state);
      await speak(
        channel,
        NINKEN_KEY,
        playerMessage,
        "O jogador agiu com calma, usou o cheiro do treino ou chamou pelo nome. Aceite voltar sem combate.",
        2,
      );
      if (channel && "send" in channel) {
        await sendMissionNotice(channel, {
          kind: "descoberta",
          title: "Mugi foi encontrado",
          description: "O ninken aceitou acompanhar a equipe de volta ao treinador.",
          items: [`**Rota Comercial de Konoha** — <#${ROTA_COMERCIAL_KONOHA_CHANNEL_ID}>`],
          itemsTitle: "Destino de retorno",
        });
      }
      return;
    }

    await speak(
      channel,
      NINKEN_KEY,
      playerMessage,
      "Ainda nao se acalme totalmente. Mostre que esta brincando de despistar, mas de pistas de que reconhece o pano de treino e o proprio nome.",
      state.ninkenActions >= 2 ? 1 : 0,
    );
    if ((state.ninkenActions ?? 0) >= ninkenMaxActions(def)) {
      await failNinkenMission(inst.id, channel, "Mugi se assustou com a demora e fugiu mais fundo na floresta.");
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === TRAINER_KEY && state.stage === "RETURN") {
    state.thanks = (state.thanks ?? 0) + 1;
    const done = state.thanks >= thanksTurns(def);
    await speak(
      channel,
      TRAINER_KEY,
      playerMessage,
      done
        ? "Esta e sua ultima fala: agradeca por trazer Mugi e encerre elogiando a paciencia do time."
        : "Receba Mugi de volta, confira se ele esta bem e agradeca ao jogador.",
      3 + Math.min((state.thanks ?? 1) - 1, 1),
    );
    if (done) {
      state.stage = "DONE";
      state.activeNpc = null;
      await markObjective(inst.id, "entregar_ninken");
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

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function calmsNinken(message: string): boolean {
  const t = normalize(message);
  return /\b(mugi|calm|devagar|baixo|agacho|ajoelho|pano|cheiro|treino|coleira|petisco|carinho|mao aberta|sem ameacar|nao vou te machucar|voltar|daisuke|faro|rastro verdadeiro)\b/.test(t);
}

function buildScentEmbed(
  state: NinkenTrackingState,
  def: NonNullable<ReturnType<typeof getMission>>,
): EmbedBuilder {
  const round = ROUTE_SCENTS[state.routeStep ?? 0];
  return new EmbedBuilder()
    .setColor(0x8e44ad)
    .setTitle("Rastreamento Ninken - Rota Comercial")
    .setDescription(
      [
        `Rastros certos: **${state.routeStep ?? 0}/${ROUTE_SCENTS.length}**`,
        `Erros: **${state.mistakes ?? 0}/${maxMistakes(def)}**`,
        "",
        round ? `**${round.title}:** ${round.clue}` : "Voce separou o rastro verdadeiro dos cheiros falsos.",
        "",
        "Escolha o cheiro que combina com o pano de treino de Mugi.",
      ].join("\n"),
    );
}

function buildScentMenu(instanceId: string, state: NinkenTrackingState): ActionRowBuilder<StringSelectMenuBuilder> {
  const index = state.routeStep ?? 0;
  const round = ROUTE_SCENTS[index]!;
  const options = [round.correct, ...round.decoys]
    .map((description, i) => ({ description, value: i === 0 ? round.id : `${round.id}:fake:${i}` }))
    .sort((a, b) => a.description.localeCompare(b.description));
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`ninken:scent:${instanceId}:${index + 1}`)
      .setPlaceholder(`Rastro ${index + 1}/${ROUTE_SCENTS.length}`)
      .addOptions(
        options.map((o, i) => ({
          label: `Cheiro ${i + 1}`,
          description: o.description.slice(0, 100),
          value: o.value,
        })),
      ),
  );
}

async function startRouteScentPuzzle(
  channel: TextBasedChannel | null,
  instanceId: string,
  actorDiscordId: string,
): Promise<void> {
  if (!channel || !("send" in channel)) return;
  const inst = await getInstance(instanceId);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "NINKEN_TRACKING") return;

  let state = ensureState(inst.stateJson);
  const msg = await channel.send({ embeds: [buildScentEmbed(state, def)], components: [buildScentMenu(instanceId, state)] });
  while ((state.routeStep ?? 0) < ROUTE_SCENTS.length) {
    const step = (state.routeStep ?? 0) + 1;
    const expected = ROUTE_SCENTS[state.routeStep ?? 0]!;
    try {
      const pick = (await msg.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        time: stepTimeout(def),
        filter: (i: StringSelectMenuInteraction) =>
          i.user.id === actorDiscordId && i.customId === `ninken:scent:${instanceId}:${step}`,
      })) as StringSelectMenuInteraction;

      if (pick.values[0] === expected.id) state.routeStep = step;
      else state.mistakes = (state.mistakes ?? 0) + 1;

      if ((state.mistakes ?? 0) >= maxMistakes(def)) {
        await failNinkenPuzzle(instanceId, msg, "Cheiros falsos demais confundiram o time. O rastro de Mugi se perdeu.");
        return;
      }

      await setState(instanceId, state);
      const done = (state.routeStep ?? 0) >= ROUTE_SCENTS.length;
      await pick.update({
        embeds: [buildScentEmbed(state, def)],
        components: done ? [] : [buildScentMenu(instanceId, state)],
      });
      if (done) break;
    } catch {
      await failNinkenPuzzle(instanceId, msg, "Tempo esgotado. O vento apagou os cheiros da rota.");
      return;
    }
  }

  state.stage = "TO_FOREST";
  state.running = false;
  await markObjective(instanceId, "rastrear_rota");
  await setState(instanceId, state);
  await msg.edit({
    embeds: [
      new EmbedBuilder()
        .setColor(0x27ae60)
        .setTitle("Rastro encontrado")
        .setDescription(`O cheiro verdadeiro de Mugi sai da rota e entra na **Floresta**: <#${FLORESTA_CHANNEL_ID}>.`),
    ],
    components: [],
  });
}

function buildApproachEmbed(
  state: NinkenTrackingState,
  def: NonNullable<ReturnType<typeof getMission>>,
  body: string,
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle("Aproximacao Silenciosa - Floresta")
    .setDescription(
      [
        body,
        "",
        `Passos calmos: **${state.forestStep ?? 0}/${FOREST_APPROACH.length}**`,
        `Erros: **${state.mistakes ?? 0}/${maxMistakes(def)}**`,
      ].join("\n"),
    );
}

function buildApproachButtons(instanceId: string, step: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    FOREST_APPROACH.map((a) =>
      new ButtonBuilder()
        .setCustomId(`ninken:approach:${instanceId}:${step}:${a.id}`)
        .setLabel(a.label)
        .setStyle(a.style),
    ),
  );
}

async function startForestApproach(
  channel: TextBasedChannel | null,
  instanceId: string,
  actorDiscordId: string,
): Promise<void> {
  if (!channel || !("send" in channel)) return;
  const inst = await getInstance(instanceId);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "NINKEN_TRACKING") return;

  let state = ensureState(inst.stateJson);
  const msg = await channel.send({
    embeds: [buildApproachEmbed(state, def, "Mugi esta escondido no mato. Aproxime-se como um treinador: sem correr, sem agarrar.")],
    components: [buildApproachButtons(instanceId, 1)],
  });

  while ((state.forestStep ?? 0) < FOREST_APPROACH.length) {
    const step = (state.forestStep ?? 0) + 1;
    const expected = FOREST_APPROACH[step - 1]!.id;
    try {
      const btn = (await msg.awaitMessageComponent({
        componentType: ComponentType.Button,
        time: stepTimeout(def),
        filter: (i: ButtonInteraction) =>
          i.user.id === actorDiscordId && i.customId.startsWith(`ninken:approach:${instanceId}:${step}:`),
      })) as ButtonInteraction;
      const value = btn.customId.split(":").at(-1) as ApproachId;

      if (value === expected) state.forestStep = step;
      else state.mistakes = (state.mistakes ?? 0) + 1;

      if ((state.mistakes ?? 0) >= maxMistakes(def)) {
        await failNinkenPuzzle(instanceId, msg, "Movimentos bruscos demais assustaram Mugi.");
        return;
      }

      await setState(instanceId, state);
      const done = (state.forestStep ?? 0) >= FOREST_APPROACH.length;
      const nextStep = (state.forestStep ?? 0) + 1;
      await btn.update({
        embeds: [
          buildApproachEmbed(
            state,
            def,
            done
              ? "Mugi saiu do mato, ainda desconfiado, mas sem fugir."
              : value === expected
                ? `Certo. Continue com cuidado: passo **${nextStep}/${FOREST_APPROACH.length}**.`
                : "Mugi recuou um pouco. Tente uma aproximacao mais calma.",
          ),
        ],
        components: done ? [] : [buildApproachButtons(instanceId, nextStep)],
      });
      if (done) break;
    } catch {
      await failNinkenPuzzle(instanceId, msg, "Tempo esgotado. Mugi cansou da brincadeira e sumiu entre as arvores.");
      return;
    }
  }

  state.stage = "NINKEN_TALK";
  state.running = false;
  await markObjective(instanceId, "rastrear_floresta");
  await setState(instanceId, state);
  await msg.edit({
    embeds: [
      new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle("Mugi encontrado")
        .setDescription("O ninken jovem apareceu. Agora acalme Mugi com `/interagir npc` antes de leva-lo de volta."),
    ],
    components: [],
  });
}

async function failNinkenPuzzle(instanceId: string, msg: Message, reason: string): Promise<void> {
  await prisma.missionInstance.update({ where: { id: instanceId }, data: { status: "FAILED" } });
  await msg.edit({
    embeds: [new EmbedBuilder().setColor(0xc0392b).setTitle("Rastreamento perdido").setDescription(reason)],
    components: [],
  }).catch(() => undefined);
}

async function failNinkenMission(
  instanceId: string,
  channel: TextBasedChannel | null,
  reason: string,
): Promise<void> {
  await prisma.missionInstance.update({ where: { id: instanceId }, data: { status: "FAILED" } });
  if (channel && "send" in channel) {
    await channel.send(`Missao falhou: ${reason} Peca a um admin para reatribuir se quiser tentar de novo.`);
  }
}
