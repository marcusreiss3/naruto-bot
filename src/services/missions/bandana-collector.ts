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
  CENTRO_COMERCIAL_CHANNEL_ID,
  MANSAO_HOKAGE_CHANNEL_ID,
} from "../../data/scenarios/index.js";
import { getMission } from "../../data/missions/index.js";
import { getOrCreateCharacter } from "../characters/character-service.js";
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

const CLERK_KEY = "bandana_collector_clerk";
const COLLECTOR_KEY = "bandana_collector_boss";
const INVESTIGATION_EMOJI = "<:investigation:1523544296379383949>";
const INVESTIGATION_CHECK_EMOJI = "<:investigation_check:1523545905255547001>";

interface MarketStep {
  title: string;
  clue: string;
  correct: string;
  success: string;
  objectiveId?: string;
  options: { value: string; label: string; description: string }[];
}

const MARKET_STEPS: MarketStep[] = [
  {
    title: "Relatos dos genins",
    clue: "As vitimas dizem que os ladroes atacam quando o mercado fecha e sempre miram a bandana, nao a bolsa.",
    correct: "trofeu",
    success: "O padrao mostra que as bandanas sao trofeus, nao simples metal para revenda.",
    objectiveId: "ouvir_vitimas_bandanas",
    options: [
      { value: "trofeu", label: "Buscar colecionador", description: "Foca em quem compra simbolos e trofeus." },
      { value: "metal", label: "Buscar sucata", description: "Trata as bandanas como metal comum." },
      { value: "ignorar", label: "Ignorar vitimas", description: "Perde o padrao dos ataques." },
    ],
  },
  {
    title: "Barraca de antiguidades",
    clue: "Um vendedor cobre uma caixa preta quando ninjas se aproximam. Ha marcas de arranhao iguais a placas de bandana.",
    correct: "caixa_preta",
    success: "A caixa preta tem marcas de bandanas e panos com o simbolo da Folha.",
    objectiveId: "identificar_vendedor_clandestino",
    options: [
      { value: "caixa_preta", label: "Checar caixa preta", description: "Procura marcas que combinem com as bandanas." },
      { value: "prateleira", label: "Checar prateleira", description: "So ha antiguidades comuns expostas." },
      { value: "acusar", label: "Acusar em publico", description: "Pode assustar o vendedor antes da prova." },
    ],
  },
  {
    title: "Comprador apressado",
    clue: "Um homem encapuzado paga em moedas antigas e segue para um beco estreito, evitando patrulhas.",
    correct: "seguir_discreto",
    success: "O rastro leva ao Beco de Konoha sem alertar os mercenarios.",
    objectiveId: "seguir_rastro_beco_bandanas",
    options: [
      { value: "seguir_discreto", label: "Seguir discretamente", description: "Mantem distancia e preserva o rastro." },
      { value: "correr", label: "Correr atras dele", description: "Alerta os mercenarios no meio do mercado." },
      { value: "prender_vendedor", label: "Prender vendedor", description: "Para a trilha antes de achar o comprador." },
    ],
  },
];

export interface BandanaCollectorState {
  stage?: "BRIEFING" | "MARKET_SEARCH" | "COLLECTOR_TALK" | "FIGHT" | "RETURN" | "DONE";
  activeNpc?: string | null;
  talks?: Record<string, number>;
  running?: boolean;
  marketStep?: number;
  mistakes?: number;
  collectorSeen?: boolean;
  combatStarted?: boolean;
}

export interface BandanaCollectorContext {
  inst: NonNullable<Awaited<ReturnType<typeof getInstance>>>;
  def: NonNullable<ReturnType<typeof getMission>>;
  ownerCharId: string;
}

function ensureState(raw: string): BandanaCollectorState {
  const state = readState<BandanaCollectorState>(raw);
  state.stage = state.stage ?? "BRIEFING";
  state.activeNpc = state.activeNpc ?? null;
  state.talks = state.talks ?? {};
  state.running = state.running ?? false;
  state.marketStep = state.marketStep ?? 0;
  state.mistakes = state.mistakes ?? 0;
  state.collectorSeen = state.collectorSeen ?? false;
  state.combatStarted = state.combatStarted ?? false;
  return state;
}

function turns(def: BandanaCollectorContext["def"], key: "briefingTurns" | "collectorTurns" | "reportTurns", fallback: number): number {
  return Number(def.data?.[key] ?? fallback);
}

function maxMistakes(def: BandanaCollectorContext["def"]): number {
  return Number(def.data?.maxMistakes ?? 4);
}

function stepTimeout(def: BandanaCollectorContext["def"]): number {
  return Number(def.data?.stepTimeoutMs ?? 60_000);
}

function mercTemplate(def: BandanaCollectorContext["def"]): string {
  return String(def.data?.mercTemplate ?? "bandana_collector_merc");
}

function bossTemplate(def: BandanaCollectorContext["def"]): string {
  return String(def.data?.bossTemplate ?? "bandana_collector_boss");
}

async function findContextByCharId(charId: string): Promise<BandanaCollectorContext | null> {
  const c = await getActiveInstanceByType(charId, "BANDANA_COLLECTOR");
  if (!c) return null;
  return { inst: c.inst, def: c.def, ownerCharId: charId };
}

export async function resolveBandanaCollector(discordId: string, guildId: string): Promise<BandanaCollectorContext | null> {
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

export function availableBandanaCollectorNpcs(state: BandanaCollectorState, channelId: string): { key: string; name: string }[] {
  if (channelId === MANSAO_HOKAGE_CHANNEL_ID) {
    if (state.stage === "BRIEFING") return [{ key: CLERK_KEY, name: "Kaede Mori (bandanas)" }];
    if (state.stage === "RETURN") return [{ key: CLERK_KEY, name: "Kaede Mori (bandanas recuperadas)" }];
  }
  if (channelId === BECO_KONOHA_CHANNEL_ID && state.stage === "COLLECTOR_TALK") {
    return [{ key: COLLECTOR_KEY, name: "Colecionador de Bandanas" }];
  }
  return [];
}

export async function bandanaCollectorMapHandle(
  interaction: ChatInputCommandInteraction,
  ctx: BandanaCollectorContext,
  entities: RenderEntity[],
): Promise<string | null> {
  const channelId = interaction.channelId;
  let state = ensureState(ctx.inst.stateJson);
  entities.push(...bandanaEntities(state, channelId));

  if (channelId === MANSAO_HOKAGE_CHANNEL_ID) {
    if (state.stage === "BRIEFING") return `\nMissao ativa: **${ctx.def.name}** - receba a ordem com \`/interagir npc\`.`;
    if (state.stage === "RETURN") return `\nMissao ativa: **${ctx.def.name}** - entregue as bandanas recuperadas com \`/interagir npc\`.`;
    return `\nMissao ativa: **${ctx.def.name}** - siga as pistas fora da Mansao.`;
  }

  if (channelId === CENTRO_COMERCIAL_CHANNEL_ID) {
    if (state.stage === "MARKET_SEARCH") {
      if (state.running) return `\nMissao ativa: **${ctx.def.name}** - a investigacao do mercado ja esta aberta no canal.`;
      state.running = true;
      await setState(ctx.inst.id, state);
      void startMarketPanel(interaction.channel, ctx.inst.id, interaction.user.id).catch(() => undefined);
      return `\nMissao ativa: **${ctx.def.name}** - investigue vitimas, vendedor clandestino e comprador no painel.`;
    }
    if (state.stage === "BRIEFING") return `\nMissao ativa: **${ctx.def.name}** - primeiro receba a ordem na Mansao do Hokage.`;
    return `\nMissao ativa: **${ctx.def.name}** - o rastro ja saiu do mercado.`;
  }

  if (channelId === BECO_KONOHA_CHANNEL_ID) {
    if (state.stage === "COLLECTOR_TALK") {
      if (!state.collectorSeen) {
        state.collectorSeen = true;
        await setState(ctx.inst.id, state);
        await speak(interaction.channel, COLLECTOR_KEY, "(o time chega ao beco e encontra a caixa preta)", "O time encontrou sua colecao de bandanas roubadas. Provoque-os, mas ainda nao ataque.", 0);
      }
      return `\nMissao ativa: **${ctx.def.name}** - confronte o colecionador usando \`/interagir npc\`.`;
    }
    if (state.stage === "FIGHT") {
      await retryCombatIfNeeded(interaction, ctx, state);
      return `\nMissao ativa: **${ctx.def.name}** - derrote o colecionador e os mercenarios.`;
    }
    return `\nMissao ativa: **${ctx.def.name}** - investigue o mercado antes de procurar no Beco.`;
  }

  return null;
}

function bandanaEntities(state: BandanaCollectorState, channelId: string): RenderEntity[] {
  if (channelId === MANSAO_HOKAGE_CHANNEL_ID) {
    return [{ cell: "C3", name: "Kaede Mori", label: "Kae", color: "#3498db", kind: "NPC", imageFile: "npcs/mission-clerk.png" }];
  }
  if (channelId === CENTRO_COMERCIAL_CHANNEL_ID) {
    return [
      { cell: "B4", label: "Vit", color: "#f39c12", kind: "MARKER" },
      { cell: "D6", label: "Cx", color: "#95a5a6", kind: "MARKER" },
      { cell: "E8", label: "Ras", color: "#8e44ad", kind: "MARKER" },
    ];
  }
  if (channelId === BECO_KONOHA_CHANNEL_ID && state.stage === "COLLECTOR_TALK") {
    return [{ cell: "D5", name: "Colecionador de Bandanas", label: "Col", color: "#c0392b", kind: "NPC", imageFile: "enemies/false-ninja-captain.png" }];
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

export async function interactBandanaCollector(interaction: ChatInputCommandInteraction, npcKey: string): Promise<void> {
  const guildId = interaction.guildId ?? "global";
  const ctx = await resolveBandanaCollector(interaction.user.id, guildId);
  if (!ctx) {
    await interaction.reply({ content: "Voce (ou sua party) nao tem essa missao ativa.", ephemeral: true });
    return;
  }
  const state = ensureState(ctx.inst.stateJson);
  const choice = availableBandanaCollectorNpcs(state, interaction.channelId).find((npc) => npc.key === npcKey);
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

export async function continueBandanaCollectorMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.guildId) return false;
  const ctx = await resolveBandanaCollector(message.author.id, message.guildId);
  if (!ctx) return false;
  const state = ensureState(ctx.inst.stateJson);
  if (!state.activeNpc) return false;
  if (!availableBandanaCollectorNpcs(state, message.channelId).some((npc) => npc.key === state.activeNpc)) return false;
  await runDialogue(message.channel, message.channelId, message.guildId, ctx, state.activeNpc, message.content || "...", message.author);
  return true;
}

async function runDialogue(
  channel: TextBasedChannel | null,
  channelId: string,
  guildId: string,
  ctx: BandanaCollectorContext,
  npcKey: string,
  playerMessage: string,
  actor: { id: string; username: string },
): Promise<void> {
  const inst = await getInstance(ctx.inst.id);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "BANDANA_COLLECTOR") return;
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
        ? "Ultima fala: mande o time ir ao Centro Comercial, ouvir relatos, achar o vendedor clandestino e seguir o comprador."
        : "Explique que bandanas de jovens ninjas foram roubadas e vendidas como trofeus.",
      done ? 2 : Math.min(turn - 1, 1),
    );
    if (done) {
      state.stage = "MARKET_SEARCH";
      state.activeNpc = null;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "receber_ordem_bandanas");
      await setState(inst.id, state);
      if (channel && "send" in channel) await channel.send("Siga para o **Centro Comercial** e use `/mapa` para investigar.");
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === COLLECTOR_KEY && state.stage === "COLLECTOR_TALK") {
    const fight = turn >= turns(def, "collectorTurns", 3);
    await speak(
      channel,
      COLLECTOR_KEY,
      playerMessage,
      fight
        ? "Ultima fala: mande os dois mercenarios atacarem e inicie combate."
        : "Trate as bandanas como trofeus, provoque o time e tente intimidar com sua colecao.",
      fight ? 2 : Math.min(turn - 1, 1),
    );
    if (fight) {
      state.stage = "FIGHT";
      state.activeNpc = null;
      state.combatStarted = true;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "confrontar_colecionador");
      await setState(inst.id, state);
      await startBandanaCombat(channel, channelId, guildId, actor, inst.id, def);
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
        ? "Ultima fala: registre as bandanas recuperadas, confirme a prisao do colecionador e encerre a missao."
        : "Receba o relato sobre as vitimas, vendedor clandestino, caixa preta e mercenarios do Beco.",
      3 + Math.min(turn - 1, 1),
    );
    if (done) {
      state.stage = "DONE";
      state.activeNpc = null;
      await markObjective(inst.id, "devolver_bandanas");
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

function marketEmbed(state: BandanaCollectorState, def: BandanaCollectorContext["def"], result?: string): EmbedBuilder {
  const step = MARKET_STEPS[state.marketStep ?? 0];
  const titleEmoji = step ? INVESTIGATION_EMOJI : INVESTIGATION_CHECK_EMOJI;
  return new EmbedBuilder()
    .setColor(0x8e44ad)
    .setTitle(`${titleEmoji} Investigacao das Bandanas Roubadas`)
    .setDescription([
      `Etapas resolvidas: **${state.marketStep ?? 0}/${MARKET_STEPS.length}**`,
      `Erros: **${state.mistakes ?? 0}/${maxMistakes(def)}**`,
      "",
      result ?? "",
      step ? `**${step.title}:** ${step.clue}` : "O rastro levou ao Beco.",
      "",
      step ? "Escolha a acao que preserva o rastro e nao alerta os criminosos." : "",
    ].filter(Boolean).join("\n"));
}

function marketMenu(instanceId: string, state: BandanaCollectorState): ActionRowBuilder<StringSelectMenuBuilder> {
  const step = MARKET_STEPS[state.marketStep ?? 0]!;
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`bandana-collector:market:${instanceId}:${(state.marketStep ?? 0) + 1}`)
      .setPlaceholder(step.title)
      .addOptions(step.options.map((option) => ({
        label: option.label,
        description: option.description.slice(0, 100),
        value: option.value,
      }))),
  );
}

async function startMarketPanel(channel: TextBasedChannel | null, instanceId: string, actorDiscordId: string): Promise<void> {
  if (!channel || !("send" in channel)) return;
  const inst = await getInstance(instanceId);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "BANDANA_COLLECTOR") return;
  let state = ensureState(inst.stateJson);
  const msg = await channel.send({ embeds: [marketEmbed(state, def)], components: [marketMenu(instanceId, state)] });

  while ((state.marketStep ?? 0) < MARKET_STEPS.length) {
    const index = state.marketStep ?? 0;
    const step = MARKET_STEPS[index]!;
    try {
      const pick = (await msg.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        time: stepTimeout(def),
        filter: (i: StringSelectMenuInteraction) =>
          i.user.id === actorDiscordId && i.customId === `bandana-collector:market:${instanceId}:${index + 1}`,
      })) as StringSelectMenuInteraction;

      let result: string;
      if (pick.values[0] === step.correct) {
        state.marketStep = index + 1;
        result = `${INVESTIGATION_CHECK_EMOJI} **Pista confirmada:** ${step.success}`;
        if (step.objectiveId) await markObjective(instanceId, step.objectiveId);
      } else {
        state.mistakes = (state.mistakes ?? 0) + 1;
        result = "**Alerta:** a escolha perderia o rastro, assustaria o vendedor ou deixaria as vitimas sem voz.";
      }

      if ((state.mistakes ?? 0) >= maxMistakes(def)) {
        await failBandanaCollector(instanceId, msg, "Erros demais alertaram o vendedor clandestino e o colecionador sumiu com as bandanas.");
        return;
      }

      await setState(instanceId, state);
      const done = (state.marketStep ?? 0) >= MARKET_STEPS.length;
      await pick.update({ embeds: [marketEmbed(state, def, result)], components: done ? [] : [marketMenu(instanceId, state)] });
      if (done) break;
    } catch {
      state.running = false;
      await setState(instanceId, state);
      await msg.edit({ components: [] }).catch(() => undefined);
      await channel.send("A investigacao do mercado expirou. Use `/mapa` para retomar do ponto atual.");
      return;
    }
  }

  await speak(channel, "bandana_black_market_vendor", "(o vendedor clandestino e pressionado com as provas)", "Revele que o comprador leva as bandanas para o Beco dentro de uma caixa preta.", 1);
  state.stage = "COLLECTOR_TALK";
  state.running = false;
  await setState(instanceId, state);
  await msg.edit({
    embeds: [
      new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle("Rastro encontrado")
        .setDescription("O vendedor confessou: o comprador leva as bandanas para o Beco numa caixa preta. Va ao Beco de Konoha e use `/mapa`."),
    ],
    components: [],
  });
}

function starterFrom(char: Awaited<ReturnType<typeof getOrCreateCharacter>>): StarterChar {
  return {
    charId: char.id,
    name: char.name,
    hpCurrent: char.hpCurrent,
    hpMax: char.hpMax,
    chakra: char.resources?.chakra ?? 100,
    energia: char.resources?.energia ?? 100,
    jutsuIds: char.jutsus.map((j: { jutsuId: string }) => j.jutsuId),
    attrs: {
      ninjutsu: char.attributes?.ninjutsu ?? 1,
      iryo: char.attributes?.iryo ?? 1,
      taijutsu: char.attributes?.taijutsu ?? 1,
      genjutsu: char.attributes?.genjutsu ?? 1,
      kenjutsu: char.attributes?.kenjutsu ?? 1,
    },
  };
}

async function startBandanaCombat(
  channel: TextBasedChannel | null,
  channelId: string,
  guildId: string,
  actor: { id: string; username: string },
  instanceId: string,
  def: BandanaCollectorContext["def"],
): Promise<void> {
  if (await getActiveSession(channelId)) return;
  const char = await getOrCreateCharacter(actor.id, guildId, actor.username);
  const { players, attrsById } = await gatherPartyPlayers(channel, guildId, starterFrom(char));
  const session = await startCombat({
    channelId,
    guildId,
    scenarioId: "beco_konoha",
    players,
    npcs: [{ templateId: bossTemplate(def) }, { templateId: mercTemplate(def) }, { templateId: mercTemplate(def) }],
    missionInstanceId: instanceId,
  });
  await cacheAttrs(session, attrsById);
  if (channel && "send" in channel) {
    await channel.send(`O colecionador e dois mercenarios atacam! ${players.length} ninja(s) na luta. Use \`/mapa\`.`);
  }
}

async function retryCombatIfNeeded(
  interaction: ChatInputCommandInteraction,
  ctx: BandanaCollectorContext,
  state: BandanaCollectorState,
): Promise<void> {
  if (await getActiveSession(interaction.channelId)) return;
  state.combatStarted = true;
  await setState(ctx.inst.id, state);
  await startBandanaCombat(interaction.channel, interaction.channelId, interaction.guildId ?? "global", interaction.user, ctx.inst.id, ctx.def);
}

async function failBandanaCollector(instanceId: string, msg: Message, reason: string): Promise<void> {
  await prisma.missionInstance.update({ where: { id: instanceId }, data: { status: "FAILED" } });
  await msg.edit({
    embeds: [new EmbedBuilder().setColor(0xc0392b).setTitle("Rastro perdido").setDescription(reason)],
    components: [],
  }).catch(() => undefined);
}

export async function onBandanaCollectorCombatWon(interaction: ChatInputCommandInteraction, instanceId: string): Promise<void> {
  const inst = await getInstance(instanceId);
  if (!inst || inst.status !== "ACTIVE") return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "BANDANA_COLLECTOR") return;
  const state = ensureState(inst.stateJson);
  if (state.stage !== "FIGHT") return;

  state.stage = "RETURN";
  state.combatStarted = false;
  state.activeNpc = null;
  await markObjective(inst.id, "derrotar_colecionador");
  await setState(inst.id, state);
  await interaction.followUp("O colecionador foi derrotado e a caixa preta com bandanas foi recuperada. Volte a **Mansao do Hokage** e fale com Kaede.");
}
