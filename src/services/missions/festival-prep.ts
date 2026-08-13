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
import { CENTRO_COMERCIAL_CHANNEL_ID } from "../../data/scenarios/index.js";
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

const ORGANIZER_KEY = "festival_organizer";
const CHEATER_KEY = "festival_cheater";
const STALL_MARKER = "\u{1F3AA}";
const LANTERN_MARKER = "\u{1F3EE}";
const GAME_MARKER = "\u{1F3AF}";

const STALL_STEPS = [
  {
    value: "marcar_chao",
    label: "Marcar o chao",
    description: "Alinhe o espaco antes de levantar a estrutura.",
  },
  {
    value: "erguer_postes",
    label: "Erguer os postes",
    description: "Postes firmes seguram a cobertura.",
  },
  {
    value: "esticar_lona",
    label: "Esticar a lona",
    description: "A lona entra depois da estrutura estar firme.",
  },
  {
    value: "amarrar_pesos",
    label: "Amarrar os pesos",
    description: "Prenda tudo para a barraca nao ceder com o vento.",
  },
];

const LANTERN_PATTERN = ["left", "middle", "right", "middle", "left"] as const;
type LanternButton = (typeof LANTERN_PATTERN)[number];

const LANTERN_LABELS: Record<LanternButton, string> = {
  left: "Esquerda",
  middle: "Centro",
  right: "Direita",
};

export interface FestivalPrepState {
  stage?: "INTRO" | "PREP" | "CHEATER" | "RETURN" | "DONE";
  activeNpc?: string | null;
  talks?: number;
  thanks?: number;
  running?: boolean;
  mistakes?: number;
  stallStep?: number;
  lanternStep?: number;
  cheaterActions?: number;
  cheaterSeen?: boolean;
}

export interface FestivalNpcChoice {
  key: string;
  name: string;
}

interface FestivalPrepContext {
  inst: NonNullable<Awaited<ReturnType<typeof getInstance>>>;
  def: NonNullable<ReturnType<typeof getMission>>;
  ownerCharId: string;
}

function ensureState(raw: string): FestivalPrepState {
  const state = readState<FestivalPrepState>(raw);
  state.stage = state.stage ?? "INTRO";
  state.activeNpc = state.activeNpc ?? null;
  state.talks = state.talks ?? 0;
  state.thanks = state.thanks ?? 0;
  state.running = state.running ?? false;
  state.mistakes = state.mistakes ?? 0;
  state.stallStep = state.stallStep ?? 0;
  state.lanternStep = state.lanternStep ?? 0;
  state.cheaterActions = state.cheaterActions ?? 0;
  state.cheaterSeen = state.cheaterSeen ?? false;
  return state;
}

function briefingTurns(def: FestivalPrepContext["def"]): number {
  return Number(def.data?.briefingTurns ?? 3);
}

function thanksTurns(def: FestivalPrepContext["def"]): number {
  return Number(def.data?.thanksTurns ?? 2);
}

function maxMistakes(def: FestivalPrepContext["def"]): number {
  return Number(def.data?.maxMistakes ?? 5);
}

function stepTimeout(def: FestivalPrepContext["def"]): number {
  return Number(def.data?.stepTimeoutMs ?? 60_000);
}

function cheaterMaxActions(def: FestivalPrepContext["def"]): number {
  return Number(def.data?.cheaterMaxActions ?? 5);
}

async function findContextByCharId(charId: string): Promise<FestivalPrepContext | null> {
  const c = await getActiveInstanceByType(charId, "FESTIVAL_PREP");
  if (!c) return null;
  return { inst: c.inst, def: c.def, ownerCharId: charId };
}

export async function resolveFestivalPrep(discordId: string, guildId: string): Promise<FestivalPrepContext | null> {
  const own = await prisma.userCharacter.findUnique({
    where: { discordId_guildId: { discordId, guildId } },
    select: { id: true },
  });
  return own ? findContextByCharId(own.id) : null;
}

export function availableFestivalPrepNpcs(state: FestivalPrepState, channelId: string): FestivalNpcChoice[] {
  if (channelId !== CENTRO_COMERCIAL_CHANNEL_ID) return [];
  const stage = state.stage ?? "INTRO";
  if (stage === "INTRO") return [{ key: ORGANIZER_KEY, name: "Sayuri Matsu (organizadora)" }];
  if (stage === "CHEATER") return [{ key: CHEATER_KEY, name: "Riku (genin suspeito)" }];
  if (stage === "RETURN") return [{ key: ORGANIZER_KEY, name: "Sayuri Matsu (confirmar festival)" }];
  return [];
}

export async function festivalPrepMapHandle(
  interaction: ChatInputCommandInteraction,
  ctx: FestivalPrepContext,
  entities: RenderEntity[],
): Promise<string | null> {
  if (interaction.channelId !== CENTRO_COMERCIAL_CHANNEL_ID) return null;
  let state = ensureState(ctx.inst.stateJson);
  if (state.stage === "DONE") return null;

  entities.push(...festivalEntities(state));
  if (state.stage === "INTRO") {
    return `\nMissao ativa: **${ctx.def.name}** - fale com Sayuri usando \`/interagir npc\`.`;
  }
  if (state.stage === "PREP") {
    if (state.running) {
      return `\nMissao ativa: **${ctx.def.name}** - a preparacao do festival ja esta em andamento no canal.`;
    }
    state.running = true;
    state.mistakes = 0;
    state.stallStep = 0;
    state.lanternStep = 0;
    await setState(ctx.inst.id, state);
    void startFestivalPrep(interaction.channel, ctx.inst.id, interaction.user.id).catch(() => undefined);
    return `\nMissao ativa: **${ctx.def.name}** - siga o painel de preparacao enviado no canal.`;
  }
  if (state.stage === "CHEATER") {
    if (!state.cheaterSeen) {
      state.cheaterSeen = true;
      await setState(ctx.inst.id, state);
      await speak(
        interaction.channel,
        CHEATER_KEY,
        "(o genin percebe que esta sendo observado perto do jogo de argolas)",
        "Voce esta tentando parecer inocente enquanto usa chakra escondido para trapacear no jogo de argolas.",
        0,
      );
    }
    return `\nMissao ativa: **${ctx.def.name}** - investigue o genin suspeito usando \`/interagir npc\`.`;
  }
  if (state.stage === "RETURN") {
    return `\nMissao ativa: **${ctx.def.name}** - avise Sayuri que o festival esta pronto com \`/interagir npc\`.`;
  }
  return null;
}

function festivalEntities(state: FestivalPrepState): RenderEntity[] {
  const stage = state.stage ?? "INTRO";
  const entities: RenderEntity[] = [
    {
      cell: "C4",
      name: "Sayuri Matsu",
      label: "Say",
      color: "#f39c12",
      kind: "NPC",
      imageFile: "npcs/festival-organizer.png",
    },
    { cell: "B2", label: STALL_MARKER, color: "#e67e22", kind: "MARKER" },
    { cell: "B8", label: LANTERN_MARKER, color: "#f1c40f", kind: "MARKER" },
    { cell: "E6", label: GAME_MARKER, color: "#9b59b6", kind: "MARKER" },
  ];
  if (stage === "CHEATER") {
    entities.push({
      cell: "E6",
      name: "Riku",
      label: "Rik",
      color: "#c0392b",
      kind: "NPC",
      imageFile: "npcs/festival-cheater.png",
    });
  }
  return entities;
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

export async function interactFestivalPrep(interaction: ChatInputCommandInteraction, npcKey: string): Promise<void> {
  const guildId = interaction.guildId ?? "global";
  const ctx = await resolveFestivalPrep(interaction.user.id, guildId);
  if (!ctx) {
    await interaction.reply({ content: "Voce nao tem essa missao ativa.", ephemeral: true });
    return;
  }
  const state = ensureState(ctx.inst.stateJson);
  const choice = availableFestivalPrepNpcs(state, interaction.channelId).find((n) => n.key === npcKey);
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
  await runFestivalDialogue(interaction.channel, ctx, npcKey, "(o ninja se aproxima)");
  await interaction.editReply(`Voce se aproxima de **${choice.name}**. Continue por mensagens normais no canal.`);
}

export async function continueFestivalPrepMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.guildId || message.channelId !== CENTRO_COMERCIAL_CHANNEL_ID) return false;
  const ctx = await resolveFestivalPrep(message.author.id, message.guildId);
  if (!ctx) return false;
  const state = ensureState(ctx.inst.stateJson);
  if (!state.activeNpc) return false;
  if (!availableFestivalPrepNpcs(state, message.channelId).some((n) => n.key === state.activeNpc)) return false;
  await runFestivalDialogue(message.channel, ctx, state.activeNpc, message.content || "...");
  return true;
}

async function runFestivalDialogue(
  channel: TextBasedChannel | null,
  ctx: FestivalPrepContext,
  npcKey: string,
  playerMessage: string,
): Promise<void> {
  const inst = await getInstance(ctx.inst.id);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "FESTIVAL_PREP") return;
  const state = ensureState(inst.stateJson);

  if (npcKey === ORGANIZER_KEY && state.stage === "INTRO") {
    state.talks = (state.talks ?? 0) + 1;
    const done = state.talks >= briefingTurns(def);
    await speak(
      channel,
      ORGANIZER_KEY,
      playerMessage,
      done
        ? "Esta e sua ultima fala da explicacao: mande o jogador usar /mapa para montar barracas, pendurar lanternas e depois fiscalizar os jogos."
        : "Explique a correria do festival e apresente uma tarefa por vez, sem iniciar ainda o painel.",
      done ? 2 : Math.min((state.talks ?? 1) - 1, 1),
    );
    if (done) {
      state.stage = "PREP";
      state.activeNpc = null;
      await markObjective(inst.id, "falar_organizadora");
      await setState(inst.id, state);
      await sendMissionNotice(channel, {
        kind: "objetivo",
        title: "Preparação do festival iniciada",
        description: "Barracas, lanternas e fiscalização precisam ser concluídas antes da abertura.",
        items: ["Use `/mapa` para abrir o painel de preparação."],
        itemsTitle: "Próximo passo",
      });
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === CHEATER_KEY && state.stage === "CHEATER") {
    state.cheaterActions = (state.cheaterActions ?? 0) + 1;
    if (stopsCheating(playerMessage)) {
      state.stage = "RETURN";
      state.activeNpc = null;
      await markObjective(inst.id, "impedir_trapaca");
      await setState(inst.id, state);
      await speak(
        channel,
        CHEATER_KEY,
        playerMessage,
        "O jogador percebeu/fiscalizou a trapaça com chakra. Admita, pare de trapacear e recue sem combate.",
        2,
      );
      await sendMissionNotice(channel, {
        kind: "descoberta",
        title: "Trapaça impedida",
        description: "A fiscalização terminou e os jogos estão seguros para o público.",
        items: ["Fale com **Sayuri Matsu** usando `/interagir npc`."],
        itemsTitle: "Encerramento",
      });
      return;
    }

    await speak(
      channel,
      CHEATER_KEY,
      playerMessage,
      "Desconverse, fique defensivo e deixe pistas de que esta usando chakra escondido no jogo de argolas.",
      state.cheaterActions >= 2 ? 1 : 0,
    );
    if ((state.cheaterActions ?? 0) >= cheaterMaxActions(def)) {
      await failFestivalMission(inst.id, channel, "Riku conseguiu trapacear e fugir antes de ser impedido.");
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === ORGANIZER_KEY && state.stage === "RETURN") {
    state.thanks = (state.thanks ?? 0) + 1;
    const done = state.thanks >= thanksTurns(def);
    await speak(
      channel,
      ORGANIZER_KEY,
      playerMessage,
      done
        ? "Esta e sua ultima fala: agradeca e confirme que o festival esta pronto para abrir."
        : "Agradeca pela ajuda e confira os ultimos detalhes do festival.",
      3 + Math.min((state.thanks ?? 1) - 1, 1),
    );
    if (done) {
      state.stage = "DONE";
      state.activeNpc = null;
      await markObjective(inst.id, "confirmar_festival");
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

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function stopsCheating(message: string): boolean {
  const t = normalize(message);
  return /\b(jutsu|chakra|trapac|roub|fraud|selo|mao|maos|fiscal|flagra|parar|pare|honesto|regra|desclass|organizadora|sayuri|confisc|denunci|observo|percebo|investig|argola|premio|truque)\b/.test(t);
}

function buildPrepEmbed(state: FestivalPrepState, title: string, body: string, def: NonNullable<ReturnType<typeof getMission>>): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xf39c12)
    .setTitle(title)
    .setDescription(
      [
        body,
        "",
        `Erros: **${state.mistakes ?? 0}/${maxMistakes(def)}**`,
      ].join("\n"),
    );
}

function buildStallMenu(instanceId: string, state: FestivalPrepState): ActionRowBuilder<StringSelectMenuBuilder> {
  const step = state.stallStep ?? 0;
  const used = new Set(STALL_STEPS.slice(0, step).map((s) => s.value));
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`festival:stall:${instanceId}:${step + 1}`)
      .setPlaceholder(`Barracas - passo ${step + 1}/${STALL_STEPS.length}`)
      .addOptions(
        STALL_STEPS.filter((s) => !used.has(s.value)).map((s) => ({
          label: s.label,
          description: s.description,
          value: s.value,
        })),
      ),
  );
}

function buildLanternButtons(instanceId: string, step: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`festival:lantern:${instanceId}:${step}:left`)
      .setLabel("Esquerda")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`festival:lantern:${instanceId}:${step}:middle`)
      .setLabel("Centro")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`festival:lantern:${instanceId}:${step}:right`)
      .setLabel("Direita")
      .setStyle(ButtonStyle.Secondary),
  );
}

async function startFestivalPrep(
  channel: TextBasedChannel | null,
  instanceId: string,
  actorDiscordId: string,
): Promise<void> {
  if (!channel || !("send" in channel)) return;
  const inst = await getInstance(instanceId);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "FESTIVAL_PREP") return;

  let state = ensureState(inst.stateJson);
  let msg = await channel.send({
    embeds: [
      buildPrepEmbed(
        state,
        "Festival da Vila - Montar Barracas",
        "Escolha a ordem correta de montagem. Uma barraca torta derruba a fila inteira.",
        def,
      ),
    ],
    components: [buildStallMenu(instanceId, state)],
  });

  while ((state.stallStep ?? 0) < STALL_STEPS.length) {
    const step = state.stallStep ?? 0;
    const expected = STALL_STEPS[step]!;
    try {
      const pick = (await msg.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        time: stepTimeout(def),
        filter: (i: StringSelectMenuInteraction) =>
          i.user.id === actorDiscordId && i.customId === `festival:stall:${instanceId}:${step + 1}`,
      })) as StringSelectMenuInteraction;

      if (pick.values[0] === expected.value) {
        state.stallStep = step + 1;
      } else {
        state.mistakes = (state.mistakes ?? 0) + 1;
      }
      if ((state.mistakes ?? 0) >= maxMistakes(def)) {
        await failFestivalPrep(instanceId, msg, "Erros demais na montagem. As barracas ficaram instaveis.");
        return;
      }

      await setState(instanceId, state);
      const done = (state.stallStep ?? 0) >= STALL_STEPS.length;
      await pick.update({
        embeds: [
          buildPrepEmbed(
            state,
            "Festival da Vila - Montar Barracas",
            done
              ? "Barracas montadas e firmes."
              : `Passo correto. Proximo: escolha o passo ${Number(state.stallStep) + 1}.`,
            def,
          ),
        ],
        components: done ? [] : [buildStallMenu(instanceId, state)],
      });
      if (done) break;
    } catch {
      await failFestivalPrep(instanceId, msg, "Tempo esgotado. A equipe perdeu a janela de montagem das barracas.");
      return;
    }
  }

  await markObjective(instanceId, "montar_barracas");
  await msg.edit({
    embeds: [
      buildPrepEmbed(
        state,
        "Festival da Vila - Pendurar Lanternas",
        `Reproduza a sequencia de lanternas: **${LANTERN_PATTERN.map((p) => LANTERN_LABELS[p]).join(" -> ")}**.`,
        def,
      ),
    ],
    components: [buildLanternButtons(instanceId, 1)],
  });

  while ((state.lanternStep ?? 0) < LANTERN_PATTERN.length) {
    const step = (state.lanternStep ?? 0) + 1;
    const expected = LANTERN_PATTERN[step - 1]!;
    try {
      const btn = (await msg.awaitMessageComponent({
        componentType: ComponentType.Button,
        time: stepTimeout(def),
        filter: (i: ButtonInteraction) =>
          i.user.id === actorDiscordId && i.customId.startsWith(`festival:lantern:${instanceId}:${step}:`),
      })) as ButtonInteraction;
      const value = btn.customId.split(":").at(-1) as LanternButton;

      if (value === expected) {
        state.lanternStep = step;
      } else {
        state.mistakes = (state.mistakes ?? 0) + 1;
        state.lanternStep = 0;
      }
      if ((state.mistakes ?? 0) >= maxMistakes(def)) {
        await failFestivalPrep(instanceId, msg, "Erros demais nas lanternas. A decoracao ficou fora de ritmo.");
        return;
      }

      await setState(instanceId, state);
      const done = (state.lanternStep ?? 0) >= LANTERN_PATTERN.length;
      const nextStep = (state.lanternStep ?? 0) + 1;
      await btn.update({
        embeds: [
          buildPrepEmbed(
            state,
            "Festival da Vila - Pendurar Lanternas",
            done
              ? "Lanternas penduradas na sequencia correta."
              : value === expected
                ? `Certo. Continue com a posicao **${nextStep}/${LANTERN_PATTERN.length}**.`
                : "A sequencia embaralhou. Recomece o padrao desde a primeira lanterna.",
            def,
          ),
        ],
        components: done ? [] : [buildLanternButtons(instanceId, nextStep)],
      });
      if (done) break;
    } catch {
      await failFestivalPrep(instanceId, msg, "Tempo esgotado. As lanternas ficaram pela metade.");
      return;
    }
  }

  await markObjective(instanceId, "pendurar_lanternas");
  state.stage = "CHEATER";
  state.running = false;
  await setState(instanceId, state);
  await msg.edit({
    embeds: [
      new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle("Festival da Vila - Fiscalizacao dos Jogos")
        .setDescription(
          "As barracas estao prontas, mas alguem perto do jogo de argolas parece mover os premios sem tocar neles.\n\nUse `/mapa` e investigue o suspeito.",
        ),
    ],
    components: [],
  });
}

async function failFestivalPrep(instanceId: string, msg: Message, reason: string): Promise<void> {
  await prisma.missionInstance.update({ where: { id: instanceId }, data: { status: "FAILED" } });
  await msg.edit({
    embeds: [new EmbedBuilder().setColor(0xc0392b).setTitle("Preparacao atrasada").setDescription(reason)],
    components: [],
  }).catch(() => undefined);
}

async function failFestivalMission(
  instanceId: string,
  channel: TextBasedChannel | null,
  reason: string,
): Promise<void> {
  await prisma.missionInstance.update({ where: { id: instanceId }, data: { status: "FAILED" } });
  if (channel && "send" in channel) {
    await channel.send(`Missao falhou: ${reason} Peca a um admin para reatribuir se quiser tentar de novo.`);
  }
}
