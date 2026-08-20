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
import { CENTRO_COMERCIAL_CHANNEL_ID } from "../../data/scenarios/index.js";
import { getMission } from "../../data/missions/index.js";
import { pausedMissionNotice, sendMissionNotice } from "../../ui/mission-notice-v2.js";
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

const SAYURI_KEY = "market_fire_sayuri";
const ARSONIST_KEY = "market_arsonist";

interface EmergencyStep {
  id: string;
  title: string;
  clue: string;
  correct: string;
  success: string;
  objectiveId?: string;
  options: { value: string; label: string; description: string }[];
}

const EMERGENCY_STEPS: EmergencyStep[] = [
  {
    id: "civilians",
    title: "Corredor cheio de visitantes",
    clue: "Uma barraca estourou perto da fila de doces. Gente assustada tenta correr para lados opostos.",
    correct: "evacuar",
    success: "Os civis foram retirados por uma rota unica, sem esmagamento ou panico.",
    objectiveId: "evacuar_barracas",
    options: [
      { value: "evacuar", label: "Abrir rota unica", description: "Organiza a saida e separa civis das chamas." },
      { value: "gritar", label: "Gritar evacuacao", description: "Espalha panico e derruba comerciantes." },
      { value: "ignorar", label: "Ir direto ao fogo", description: "Deixa visitantes presos no corredor." },
    ],
  },
  {
    id: "small_fire",
    title: "Fogo baixo em lona e madeira",
    clue: "As chamas ainda estao baixas, mas ha oleo derramado perto da base da barraca.",
    correct: "areia",
    success: "Areia abafa o oleo e impede que a lona acenda de novo.",
    objectiveId: "apagar_focos_incendio",
    options: [
      { value: "areia", label: "Abafar com areia", description: "Corta o oxigenio sem espalhar oleo." },
      { value: "vento", label: "Usar vento forte", description: "Pode espalhar brasas pelo mercado." },
      { value: "agua_oleo", label: "Jogar agua no oleo", description: "Espalha o combustivel pelo chao." },
    ],
  },
  {
    id: "wind",
    title: "Vento levando brasas",
    clue: "Brasas seguem para uma fileira de lanternas e caixas de papel.",
    correct: "isolar",
    success: "As lanternas e caixas foram removidas, criando uma faixa sem combustivel.",
    objectiveId: "apagar_focos_incendio",
    options: [
      { value: "isolar", label: "Criar faixa limpa", description: "Remove combustivel antes que as brasas alcancem as caixas." },
      { value: "perseguir", label: "Perseguir brasas", description: "Gasta tempo demais e deixa novos focos surgirem." },
      { value: "juntar", label: "Empilhar caixas", description: "Cria mais combustivel no caminho do vento." },
    ],
  },
];

export interface MarketFireState {
  stage?: "BRIEFING" | "EMERGENCY" | "SEAL_CHECK" | "ARSONIST_TALK" | "FIGHT" | "RETURN" | "DONE";
  activeNpc?: string | null;
  talks?: Record<string, number>;
  running?: boolean;
  emergencyStep?: number;
  mistakes?: number;
  combatStarted?: boolean;
  arsonistSeen?: boolean;
}

export interface MarketFireContext {
  inst: NonNullable<Awaited<ReturnType<typeof getInstance>>>;
  def: NonNullable<ReturnType<typeof getMission>>;
  ownerCharId: string;
}

function ensureState(raw: string): MarketFireState {
  const state = readState<MarketFireState>(raw);
  state.stage = state.stage ?? "BRIEFING";
  state.activeNpc = state.activeNpc ?? null;
  state.talks = state.talks ?? {};
  state.running = state.running ?? false;
  state.emergencyStep = state.emergencyStep ?? 0;
  state.mistakes = state.mistakes ?? 0;
  state.combatStarted = state.combatStarted ?? false;
  state.arsonistSeen = state.arsonistSeen ?? false;
  return state;
}

function turns(def: MarketFireContext["def"], key: "briefingTurns" | "arsonistTurns" | "thanksTurns", fallback: number): number {
  return Number(def.data?.[key] ?? fallback);
}

function maxMistakes(def: MarketFireContext["def"]): number {
  return Number(def.data?.maxMistakes ?? 4);
}

function stepTimeout(def: MarketFireContext["def"]): number {
  return Number(def.data?.stepTimeoutMs ?? 60_000);
}

function thugTemplate(def: MarketFireContext["def"]): string {
  return String(def.data?.thugTemplate ?? "market_fire_thug");
}

function bossTemplate(def: MarketFireContext["def"]): string {
  return String(def.data?.bossTemplate ?? "market_arsonist");
}

async function findContextByCharId(charId: string): Promise<MarketFireContext | null> {
  const c = await getActiveInstanceByType(charId, "MARKET_FIRE");
  if (!c) return null;
  return { inst: c.inst, def: c.def, ownerCharId: charId };
}

export async function resolveMarketFire(discordId: string, guildId: string): Promise<MarketFireContext | null> {
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

export function availableMarketFireNpcs(state: MarketFireState, channelId: string): { key: string; name: string }[] {
  if (channelId !== CENTRO_COMERCIAL_CHANNEL_ID) return [];
  if (state.stage === "BRIEFING") return [{ key: SAYURI_KEY, name: "Sayuri Matsu (incendio)" }];
  if (state.stage === "ARSONIST_TALK") return [{ key: ARSONIST_KEY, name: "Homem com fuligem" }];
  if (state.stage === "RETURN") return [{ key: SAYURI_KEY, name: "Sayuri Matsu (relatorio)" }];
  return [];
}

export async function marketFireMapHandle(
  interaction: ChatInputCommandInteraction,
  ctx: MarketFireContext,
  entities: RenderEntity[],
): Promise<string | null> {
  if (interaction.channelId !== CENTRO_COMERCIAL_CHANNEL_ID) return null;
  let state = ensureState(ctx.inst.stateJson);
  entities.push(...marketFireEntities(state));

  if (state.stage === "BRIEFING") {
    return `\nMissao ativa: **${ctx.def.name}** - fale com Sayuri usando \`/interagir npc\`.`;
  }
  if (state.stage === "EMERGENCY") {
    if (state.running) return `\nMissao ativa: **${ctx.def.name}** - a resposta ao incendio ja esta aberta no canal.`;
    state.running = true;
    await setState(ctx.inst.id, state);
    void startEmergencyPanel(interaction.channel, ctx.inst.id, interaction.user.id).catch(() => undefined);
    return `\nMissao ativa: **${ctx.def.name}** - resolva a emergencia das barracas no painel.`;
  }
  if (state.stage === "SEAL_CHECK") {
    if (state.running) return `\nMissao ativa: **${ctx.def.name}** - a analise dos selos ja esta aberta no canal.`;
    state.running = true;
    await setState(ctx.inst.id, state);
    void startSealPanel(interaction.channel, ctx.inst.id, interaction.user.id).catch(() => undefined);
    return `\nMissao ativa: **${ctx.def.name}** - identifique o selo explosivo adulterado.`;
  }
  if (state.stage === "ARSONIST_TALK") {
    if (!state.arsonistSeen) {
      state.arsonistSeen = true;
      await setState(ctx.inst.id, state);
      await speak(
        interaction.channel,
        ARSONIST_KEY,
        "(o time encontra um homem com fuligem nas luvas)",
        "O time encontrou voce perto dos lacres queimados. Negue envolvimento, mas deixe transparecer arrogancia.",
        0,
      );
    }
    return `\nMissao ativa: **${ctx.def.name}** - confronte o homem com fuligem usando \`/interagir npc\`.`;
  }
  if (state.stage === "FIGHT") {
    await retryCombatIfNeeded(interaction, ctx, state);
    return `\nMissao ativa: **${ctx.def.name}** - derrote o incendiario e os comparsas.`;
  }
  if (state.stage === "RETURN") {
    return `\nMissao ativa: **${ctx.def.name}** - entregue o relatorio final a Sayuri com \`/interagir npc\`.`;
  }
  return null;
}

function marketFireEntities(state: MarketFireState): RenderEntity[] {
  const entities: RenderEntity[] = [
    { cell: "C4", name: "Sayuri Matsu", label: "Say", color: "#f39c12", kind: "NPC", imageFile: "npcs/festival-organizer.png" },
    { cell: "B2", label: "\u{1F525}", color: "#e74c3c", kind: "MARKER" },
    { cell: "D5", label: "\u{1F6A7}", color: "#f1c40f", kind: "MARKER" },
    { cell: "E8", label: "\u{1F4DC}", color: "#95a5a6", kind: "MARKER" },
  ];
  if (state.stage === "ARSONIST_TALK") {
    entities.push({
      cell: "E7",
      name: "Homem com fuligem",
      label: "Ful",
      color: "#c0392b",
      kind: "NPC",
      imageFile: "enemies/festival-rogue-ninja.png",
    });
  }
  return entities;
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

export async function interactMarketFire(interaction: ChatInputCommandInteraction, npcKey: string): Promise<void> {
  const guildId = interaction.guildId ?? "global";
  const ctx = await resolveMarketFire(interaction.user.id, guildId);
  if (!ctx) {
    await interaction.reply({ content: "Voce (ou sua party) nao tem essa missao ativa.", ephemeral: true });
    return;
  }
  const state = ensureState(ctx.inst.stateJson);
  const choice = availableMarketFireNpcs(state, interaction.channelId).find((npc) => npc.key === npcKey);
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

export async function continueMarketFireMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.guildId || message.channelId !== CENTRO_COMERCIAL_CHANNEL_ID) return false;
  const ctx = await resolveMarketFire(message.author.id, message.guildId);
  if (!ctx) return false;
  const state = ensureState(ctx.inst.stateJson);
  if (!state.activeNpc) return false;
  if (!availableMarketFireNpcs(state, message.channelId).some((npc) => npc.key === state.activeNpc)) return false;
  await runDialogue(message.channel, message.channelId, message.guildId, ctx, state.activeNpc, message.content || "...", message.author);
  return true;
}

async function runDialogue(
  channel: TextBasedChannel | null,
  channelId: string,
  guildId: string,
  ctx: MarketFireContext,
  npcKey: string,
  playerMessage: string,
  actor: { id: string; username: string },
): Promise<void> {
  const inst = await getInstance(ctx.inst.id);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "MARKET_FIRE") return;
  const state = ensureState(inst.stateJson);
  const turn = (state.talks?.[npcKey] ?? 0) + 1;
  state.talks![npcKey] = turn;

  if (npcKey === SAYURI_KEY && state.stage === "BRIEFING") {
    const done = turn >= turns(def, "briefingTurns", 3);
    await speak(
      channel,
      SAYURI_KEY,
      playerMessage,
      done
        ? "Ultima fala: mande o time usar /mapa para evacuar civis, apagar focos de fogo e preservar selos queimados."
        : "Explique a situacao das barracas com fogo, reforcando que civis e provas precisam ser protegidos.",
      done ? 2 : Math.min(turn - 1, 1),
    );
    if (done) {
      state.stage = "EMERGENCY";
      state.activeNpc = null;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "receber_alerta_incendio");
      await setState(inst.id, state);
      if (channel && "send" in channel) await channel.send("Use `/mapa` para coordenar a resposta ao incendio.");
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === ARSONIST_KEY && state.stage === "ARSONIST_TALK") {
    const fight = turn >= turns(def, "arsonistTurns", 3);
    await speak(
      channel,
      ARSONIST_KEY,
      playerMessage,
      fight
        ? "Ultima fala: admita que plantou os selos para esvaziar o mercado, chame dois comparsas e inicie combate."
        : "Negue envolvimento, provoque o time e tente invalidar as provas dos lacres queimados.",
      fight ? 2 : Math.min(turn - 1, 1),
    );
    if (fight) {
      state.stage = "FIGHT";
      state.activeNpc = null;
      state.combatStarted = true;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "confrontar_incendiario");
      await setState(inst.id, state);
      await startMarketFireCombat(channel, channelId, guildId, actor, inst.id, def);
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === SAYURI_KEY && state.stage === "RETURN") {
    const done = turn >= turns(def, "thanksTurns", 2);
    await speak(
      channel,
      SAYURI_KEY,
      playerMessage,
      done
        ? "Ultima fala: confirme que as barracas foram protegidas, registre os selos apreendidos e encerre a missao."
        : "Receba o relatorio sobre o incendiario, os comparsas e os selos explosivos retirados das barracas.",
      3 + Math.min(turn - 1, 1),
    );
    if (done) {
      state.stage = "DONE";
      state.activeNpc = null;
      await markObjective(inst.id, "entregar_relatorio_incendio");
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

function emergencyEmbed(state: MarketFireState, def: MarketFireContext["def"], result?: string): EmbedBuilder {
  const step = EMERGENCY_STEPS[state.emergencyStep ?? 0];
  return new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle("Resposta ao Incendio nas Barracas")
    .setDescription([
      `Etapas resolvidas: **${state.emergencyStep ?? 0}/${EMERGENCY_STEPS.length}**`,
      `Erros: **${state.mistakes ?? 0}/${maxMistakes(def)}**`,
      "",
      result ?? "",
      step ? `**${step.title}:** ${step.clue}` : "A emergencia imediata foi controlada.",
      "",
      step ? "Escolha a acao que protege civis, barracas e provas." : "",
    ].filter(Boolean).join("\n"));
}

function emergencyMenu(instanceId: string, state: MarketFireState): ActionRowBuilder<StringSelectMenuBuilder> {
  const step = EMERGENCY_STEPS[state.emergencyStep ?? 0]!;
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`market-fire:emergency:${instanceId}:${(state.emergencyStep ?? 0) + 1}`)
      .setPlaceholder(step.title)
      .addOptions(step.options.map((option) => ({
        label: option.label,
        description: option.description.slice(0, 100),
        value: option.value,
      }))),
  );
}

async function startEmergencyPanel(channel: TextBasedChannel | null, instanceId: string, actorDiscordId: string): Promise<void> {
  if (!channel || !("send" in channel)) return;
  const inst = await getInstance(instanceId);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "MARKET_FIRE") return;
  let state = ensureState(inst.stateJson);
  const msg = await channel.send({ embeds: [emergencyEmbed(state, def)], components: [emergencyMenu(instanceId, state)] });

  while ((state.emergencyStep ?? 0) < EMERGENCY_STEPS.length) {
    const index = state.emergencyStep ?? 0;
    const step = EMERGENCY_STEPS[index]!;
    try {
      const pick = (await msg.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        time: stepTimeout(def),
        filter: (i: StringSelectMenuInteraction) =>
          i.user.id === actorDiscordId && i.customId === `market-fire:emergency:${instanceId}:${index + 1}`,
      })) as StringSelectMenuInteraction;

      let result: string;
      if (pick.values[0] === step.correct) {
        state.emergencyStep = index + 1;
        result = `**Correto:** ${step.success}`;
        if (step.objectiveId) await markObjective(instanceId, step.objectiveId);
      } else {
        state.mistakes = (state.mistakes ?? 0) + 1;
        result = "**Alerta:** a escolha espalharia fogo, panico ou destruiria provas.";
      }

      if ((state.mistakes ?? 0) >= maxMistakes(def)) {
        await failMarketFire(instanceId, msg, "Erros demais permitiram que o incendio se espalhasse pelo mercado.");
        return;
      }

      await setState(instanceId, state);
      const done = (state.emergencyStep ?? 0) >= EMERGENCY_STEPS.length;
      await pick.update({ embeds: [emergencyEmbed(state, def, result)], components: done ? [] : [emergencyMenu(instanceId, state)] });
      if (done) break;
    } catch {
      state.running = false;
      await setState(instanceId, state);
      await msg.edit({ components: [] }).catch(() => undefined);
      await sendMissionNotice(channel, pausedMissionNotice("A sessão de resposta ao incêndio expirou."));
      return;
    }
  }

  state.stage = "SEAL_CHECK";
  state.running = false;
  await setState(instanceId, state);
  await msg.edit({
    embeds: [
      new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle("Fogo controlado")
        .setDescription("Os civis estao seguros e os focos foram apagados. Agora analise os lacres das barracas com `/mapa`."),
    ],
    components: [],
  });
}

function sealEmbed(state: MarketFireState, def: MarketFireContext["def"]): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xf39c12)
    .setTitle("Analise dos Selos Queimados")
    .setDescription([
      "Tres lacres sobreviveram ao incendio:",
      "",
      "- Lacre verde: registro normal de barraca de alimentos.",
      "- Lacre azul: permissao de lanternas, com assinatura de Sayuri.",
      "- Lacre vermelho: tem fuligem por baixo da tinta e linhas de chakra tortas.",
      "",
      "Escolha qual selo foi adulterado.",
      `Erros: **${state.mistakes ?? 0}/${maxMistakes(def)}**`,
    ].join("\n"));
}

function sealMenu(instanceId: string): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`market-fire:seal:${instanceId}`)
      .setPlaceholder("Identificar selo adulterado")
      .addOptions([
        { label: "Lacre verde", description: "Registro comum de barraca de alimentos.", value: "green" },
        { label: "Lacre azul", description: "Permissao de lanternas assinada por Sayuri.", value: "blue" },
        { label: "Lacre vermelho", description: "Fuligem sob a tinta e chakra torto.", value: "red" },
      ]),
  );
}

async function startSealPanel(channel: TextBasedChannel | null, instanceId: string, actorDiscordId: string): Promise<void> {
  if (!channel || !("send" in channel)) return;
  const inst = await getInstance(instanceId);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "MARKET_FIRE") return;
  const state = ensureState(inst.stateJson);
  const msg = await channel.send({ embeds: [sealEmbed(state, def)], components: [sealMenu(instanceId)] });

  while (state.stage === "SEAL_CHECK") {
    try {
      const pick = (await msg.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        time: stepTimeout(def),
        filter: (i: StringSelectMenuInteraction) => i.user.id === actorDiscordId && i.customId === `market-fire:seal:${instanceId}`,
      })) as StringSelectMenuInteraction;

      if (pick.values[0] !== "red") {
        state.mistakes = (state.mistakes ?? 0) + 1;
        if ((state.mistakes ?? 0) >= maxMistakes(def)) {
          await failMarketFire(instanceId, msg, "A investigacao demorou demais e o incendiario escapou durante a confusao.");
          return;
        }
        await setState(instanceId, state);
        await pick.update({ embeds: [sealEmbed(state, def)], components: [sealMenu(instanceId)] });
        continue;
      }

      state.stage = "ARSONIST_TALK";
      state.running = false;
      await markObjective(instanceId, "identificar_selo_explosivo");
      await setState(instanceId, state);
      await pick.update({
        embeds: [
          new EmbedBuilder()
            .setColor(0x2ecc71)
            .setTitle("Selo adulterado identificado")
            .setDescription("O lacre vermelho aponta para um homem com fuligem nas luvas, perto da barraca isolada. Use `/mapa`."),
        ],
        components: [],
      });
      return;
    } catch {
      state.running = false;
      await setState(instanceId, state);
      await msg.edit({ components: [] }).catch(() => undefined);
      await sendMissionNotice(channel, pausedMissionNotice("A sessão de análise dos selos expirou.", "Use /mapa para abrir o painel novamente."));
      return;
    }
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

async function startMarketFireCombat(
  channel: TextBasedChannel | null,
  channelId: string,
  guildId: string,
  actor: { id: string; username: string },
  instanceId: string,
  def: MarketFireContext["def"],
): Promise<void> {
  if (await getActiveSession(channelId)) return;
  const char = await getOrCreateCharacter(actor.id, guildId, actor.username);
  const { players, attrsById } = await gatherPartyPlayers(channel, guildId, starterFrom(char));
  const session = await startCombat({
    channelId,
    guildId,
    scenarioId: "centro_comercial",
    players,
    npcs: [{ templateId: bossTemplate(def) }, { templateId: thugTemplate(def) }, { templateId: thugTemplate(def) }],
    missionInstanceId: instanceId,
  });
  await cacheAttrs(session, attrsById);
  if (channel && "send" in channel) {
    await channel.send(`O incendiario e dois comparsas atacam! ${players.length} ninja(s) na luta. Use \`/mapa\`.`);
  }
}

async function retryCombatIfNeeded(
  interaction: ChatInputCommandInteraction,
  ctx: MarketFireContext,
  state: MarketFireState,
): Promise<void> {
  if (await getActiveSession(interaction.channelId)) return;
  state.combatStarted = true;
  await setState(ctx.inst.id, state);
  await startMarketFireCombat(interaction.channel, interaction.channelId, interaction.guildId ?? "global", interaction.user, ctx.inst.id, ctx.def);
}

async function failMarketFire(instanceId: string, msg: Message, reason: string): Promise<void> {
  await prisma.missionInstance.update({ where: { id: instanceId }, data: { status: "FAILED" } });
  await msg.edit({
    embeds: [new EmbedBuilder().setColor(0xc0392b).setTitle("Incendio fora de controle").setDescription(reason)],
    components: [],
  }).catch(() => undefined);
}

export async function onMarketFireCombatWon(interaction: ChatInputCommandInteraction, instanceId: string): Promise<void> {
  const inst = await getInstance(instanceId);
  if (!inst || inst.status !== "ACTIVE") return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "MARKET_FIRE") return;
  const state = ensureState(inst.stateJson);
  if (state.stage !== "FIGHT") return;

  state.stage = "RETURN";
  state.combatStarted = false;
  state.activeNpc = null;
  await markObjective(inst.id, "derrotar_incendiario");
  await setState(inst.id, state);
  await interaction.followUp("O incendiario foi derrotado e os selos restantes foram recolhidos. Fale com **Sayuri Matsu** usando `/interagir npc`.");
}
