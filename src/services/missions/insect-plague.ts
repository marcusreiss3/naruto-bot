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
  CENTRO_COMERCIAL_CHANNEL_ID,
  FLORESTA_CHANNEL_ID,
  MANSAO_HOKAGE_CHANNEL_ID,
  ROTA_COMERCIAL_KONOHA_CHANNEL_ID,
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
  getActiveMissions,
  getInstance,
  markObjective,
  readState,
  setState,
} from "./mission-service.js";

interface RegionalNpc {
  key: string;
  name: string;
  persona: string;
  imageFile: string;
  cell: string;
}

interface InsectPlagueVariant {
  id: string;
  villageName: string;
  administrationName: string;
  marketName: string;
  routeName: string;
  forestName: string;
  administrationChannelId: string;
  marketChannelId: string;
  routeChannelId: string;
  forestChannelId: string;
  forestScenarioId: string;
  clerk: RegionalNpc;
  stockmaster: RegionalNpc;
  handler: RegionalNpc;
}

const KONOHA_VARIANT: InsectPlagueVariant = {
  id: "KONOHA",
  villageName: "Konoha",
  administrationName: "Mansao do Hokage",
  marketName: "Centro Comercial de Konoha",
  routeName: "Rota Comercial de Konoha",
  forestName: "Floresta",
  administrationChannelId: MANSAO_HOKAGE_CHANNEL_ID,
  marketChannelId: CENTRO_COMERCIAL_CHANNEL_ID,
  routeChannelId: ROTA_COMERCIAL_KONOHA_CHANNEL_ID,
  forestChannelId: FLORESTA_CHANNEL_ID,
  forestScenarioId: "floresta",
  clerk: {
    key: "insect_plague_clerk_konoha",
    name: "Kaede Mori (ordem agricola)",
    persona: "insect_plague_clerk_konoha",
    imageFile: "npcs/mission-clerk.png",
    cell: "C3",
  },
  stockmaster: {
    key: "insect_plague_stockmaster_konoha",
    name: "Mako Akimichi (estoque)",
    persona: "insect_plague_stockmaster_konoha",
    imageFile: "npcs/food-stockmaster.png",
    cell: "D4",
  },
  handler: {
    key: "insect_plague_aburame_konoha",
    name: "Souta Aburame",
    persona: "insect_plague_aburame_konoha",
    imageFile: "enemies/aburame-bug-handler.png",
    cell: "C6",
  },
};

const VARIANTS: Record<string, InsectPlagueVariant> = {
  KONOHA: KONOHA_VARIANT,
};

interface NestStep {
  title: string;
  clue: string;
  objectiveId: string;
  correct: string;
  options: { value: string; label: string; description: string }[];
}

const NEST_STEPS: NestStep[] = [
  {
    title: "Graos roidos",
    clue: "Os sacos foram abertos por dentro. Ha cascas cortadas em circulos pequenos e quase sem farelo no chao.",
    objectiveId: "analisar_graos_roidos",
    correct: "preserve_sample",
    options: [
      { value: "preserve_sample", label: "Preservar amostra", description: "Guarda os graos roidos para comparar com os ninhos." },
      { value: "burn_sample", label: "Queimar amostra", description: "Remove contaminacao, mas apaga a prova." },
      { value: "mix_sample", label: "Misturar sacos", description: "Espalha os sinais pelos estoques limpos." },
    ],
  },
  {
    title: "Ninho de cascas",
    clue: "O ninho nao tem rainha comum. Ele pulsa quando chakra passa perto, como se recebesse comandos curtos.",
    objectiveId: "identificar_chakra_ninhos",
    correct: "sense_pulses",
    options: [
      { value: "sense_pulses", label: "Sentir pulsos", description: "Confirma que os insetos respondem a chakra externo." },
      { value: "crush_nest", label: "Esmagar ninho", description: "Espalha os insetos restantes antes da leitura." },
      { value: "bait_sugar", label: "Usar acucar", description: "Atrai insetos comuns, mas nao revela controle de chakra." },
    ],
  },
  {
    title: "Insetos sentinela",
    clue: "Tres insetos maiores nao comem os graos. Eles observam a rota e voltam sempre para a direcao da floresta.",
    objectiveId: "seguir_sentinelas_floresta",
    correct: "mark_forest",
    options: [
      { value: "mark_forest", label: "Seguir para floresta", description: "Usa os sentinelas para achar o usuario de chakra." },
      { value: "return_market", label: "Voltar ao mercado", description: "Protege o estoque, mas deixa o controlador livre." },
      { value: "scatter_insects", label: "Espantar insetos", description: "Quebra o rastro antes de achar a origem." },
    ],
  },
];

export interface InsectPlagueState {
  stage?: "BRIEFING" | "MARKET" | "ROUTE" | "FOREST_TALK" | "FIGHT" | "RETURN" | "DONE";
  activeNpc?: string | null;
  talks?: Record<string, number>;
  running?: boolean;
  mistakes?: number;
  nestStep?: number;
  combatStarted?: boolean;
  handlerSeen?: boolean;
}

export interface InsectPlagueChoice {
  key: string;
  name: string;
}

export interface InsectPlagueContext {
  inst: NonNullable<Awaited<ReturnType<typeof getInstance>>>;
  def: NonNullable<ReturnType<typeof getMission>>;
  ownerCharId: string;
  variant: InsectPlagueVariant;
}

function variantFor(def: NonNullable<ReturnType<typeof getMission>>): InsectPlagueVariant {
  return VARIANTS[String(def.data?.variantId ?? "KONOHA")] ?? KONOHA_VARIANT;
}

function ensureState(raw: string): InsectPlagueState {
  const state = readState<InsectPlagueState>(raw);
  state.stage = state.stage ?? "BRIEFING";
  state.activeNpc = state.activeNpc ?? null;
  state.talks = state.talks ?? {};
  state.running = state.running ?? false;
  state.mistakes = state.mistakes ?? 0;
  state.nestStep = state.nestStep ?? 0;
  state.combatStarted = state.combatStarted ?? false;
  state.handlerSeen = state.handlerSeen ?? false;
  return state;
}

function turns(
  def: InsectPlagueContext["def"],
  key: "briefingTurns" | "stockTurns" | "handlerTurns" | "returnTurns",
  fallback: number,
): number {
  return Number(def.data?.[key] ?? fallback);
}

function maxMistakes(def: InsectPlagueContext["def"]): number {
  return Number(def.data?.maxMistakes ?? 4);
}

function stepTimeout(def: InsectPlagueContext["def"]): number {
  return Number(def.data?.stepTimeoutMs ?? 60_000);
}

function swarmTemplate(def: InsectPlagueContext["def"]): string {
  return String(def.data?.swarmTemplate ?? "chakra_insect_swarm");
}

function handlerTemplate(def: InsectPlagueContext["def"]): string {
  return String(def.data?.handlerTemplate ?? "aburame_bug_handler");
}

async function findContextByCharId(charId: string, channelId?: string): Promise<InsectPlagueContext | null> {
  for (const inst of await getActiveMissions(charId)) {
    const def = getMission(inst.missionId);
    if (!def || def.type !== "CHAKRA_INSECT_PLAGUE") continue;
    const variant = variantFor(def);
    const channels = [
      variant.administrationChannelId,
      variant.marketChannelId,
      variant.routeChannelId,
      variant.forestChannelId,
    ];
    if (channelId && !channels.includes(channelId)) continue;
    return { inst, def, ownerCharId: charId, variant };
  }
  return null;
}

export async function resolveInsectPlague(
  discordId: string,
  guildId: string,
  channelId?: string,
): Promise<InsectPlagueContext | null> {
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

export function availableInsectPlagueNpcs(
  state: InsectPlagueState,
  channelId: string,
  variant: InsectPlagueVariant,
): InsectPlagueChoice[] {
  if (channelId === variant.administrationChannelId && state.stage === "BRIEFING") {
    return [{ key: variant.clerk.key, name: variant.clerk.name }];
  }
  if (channelId === variant.marketChannelId) {
    if (state.stage === "MARKET") return [{ key: variant.stockmaster.key, name: variant.stockmaster.name }];
    if (state.stage === "RETURN") return [{ key: variant.stockmaster.key, name: `${variant.stockmaster.name} (relatorio)` }];
  }
  if (channelId === variant.forestChannelId && state.stage === "FOREST_TALK") {
    return [{ key: variant.handler.key, name: variant.handler.name }];
  }
  return [];
}

export async function insectPlagueMapHandle(
  interaction: ChatInputCommandInteraction,
  ctx: InsectPlagueContext,
  entities: RenderEntity[],
): Promise<string | null> {
  const state = ensureState(ctx.inst.stateJson);
  const { variant } = ctx;

  if (interaction.channelId === variant.administrationChannelId) {
    if (state.stage === "BRIEFING") {
      entities.push(npcEntity(variant.clerk));
      return `\nMissao ativa: **${ctx.def.name}** - receba o briefing com \`/interagir npc\`.`;
    }
    return nextPlaceNote(ctx, state);
  }

  if (interaction.channelId === variant.marketChannelId) {
    if (state.stage === "MARKET" || state.stage === "RETURN") {
      entities.push(npcEntity(variant.stockmaster), stockEntity());
      return state.stage === "MARKET"
        ? `\nMissao ativa: **${ctx.def.name}** - examine o estoque destruido com \`/interagir npc\`.`
        : `\nMissao ativa: **${ctx.def.name}** - confirme que os estoques estao seguros com \`/interagir npc\`.`;
    }
    return nextPlaceNote(ctx, state);
  }

  if (interaction.channelId === variant.routeChannelId) {
    if (state.stage === "ROUTE") {
      entities.push(...nestEntities(state));
      if (!state.running) {
        state.running = true;
        await setState(ctx.inst.id, state);
        void startNestInvestigation(interaction.channel, ctx.inst.id, interaction.user.id).catch(() => undefined);
      }
      return `\nMissao ativa: **${ctx.def.name}** - investigue os ninhos e rastros no painel enviado no canal.`;
    }
    return nextPlaceNote(ctx, state);
  }

  if (interaction.channelId !== variant.forestChannelId) return null;
  if (state.stage === "FOREST_TALK") {
    entities.push(npcEntity(variant.handler));
    if (!state.handlerSeen) {
      state.handlerSeen = true;
      await setState(ctx.inst.id, state);
      await speak(
        interaction.channel,
        variant.handler,
        "(o time encontra insetos sentinela rodeando um jovem Aburame)",
        "Demonstre que voce perdeu o controle da colonia e tente afastar o time antes que descubram sua culpa.",
        0,
      );
    }
    return `\nMissao ativa: **${ctx.def.name}** - confronte ${variant.handler.name} usando \`/interagir npc\`.`;
  }
  if (state.stage === "FIGHT") {
    if (!(await getActiveSession(interaction.channelId))) await startInsectCombat(interaction, ctx);
    return `\nMissao ativa: **${ctx.def.name}** - derrote o invocador Aburame e os enxames de insetos.`;
  }
  return nextPlaceNote(ctx, state);
}

function nextPlaceNote(ctx: InsectPlagueContext, state: InsectPlagueState): string | null {
  const v = ctx.variant;
  if (state.stage === "MARKET") return `\nMissao ativa: **${ctx.def.name}** - siga para ${v.marketName}: <#${v.marketChannelId}>.`;
  if (state.stage === "ROUTE") return `\nMissao ativa: **${ctx.def.name}** - investigue os ninhos na ${v.routeName}: <#${v.routeChannelId}>.`;
  if (state.stage === "FOREST_TALK" || state.stage === "FIGHT") {
    return `\nMissao ativa: **${ctx.def.name}** - siga para ${v.forestName}: <#${v.forestChannelId}>.`;
  }
  if (state.stage === "RETURN") return `\nMissao ativa: **${ctx.def.name}** - volte ao ${v.marketName}: <#${v.marketChannelId}>.`;
  return null;
}

function npcEntity(npc: RegionalNpc): RenderEntity {
  return {
    cell: npc.cell,
    name: npc.name,
    label: npc.name.slice(0, 3),
    color: "#27ae60",
    kind: "NPC",
    imageFile: npc.imageFile,
  };
}

function stockEntity(): RenderEntity {
  return { cell: "B4", label: "\u{1F33E}", color: "#f1c40f", kind: "MARKER", name: "Sacos de graos roidos" };
}

function nestEntities(state: InsectPlagueState): RenderEntity[] {
  const done = state.nestStep ?? 0;
  return [
    { cell: "B2", label: "\u{1FAB2}", name: "Graos roidos" },
    { cell: "D3", label: "\u{1FAB2}", name: "Ninho de cascas" },
    { cell: "E6", label: "\u{1FAB2}", name: "Insetos sentinela" },
  ].map((entry, index) => ({
    cell: entry.cell,
    label: entry.label,
    name: entry.name,
    color: done > index ? "#2ecc71" : "#8e44ad",
    kind: "MARKER",
    badge: done > index ? "OK" : "!",
  }));
}

async function speak(
  channel: TextBasedChannel | null,
  npc: RegionalNpc,
  message: string,
  extra: string,
  fallbackIndex: number,
): Promise<void> {
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

export async function interactInsectPlague(
  interaction: ChatInputCommandInteraction,
  npcKey: string,
): Promise<void> {
  const guildId = interaction.guildId ?? "global";
  const ctx = await resolveInsectPlague(interaction.user.id, guildId, interaction.channelId);
  if (!ctx) {
    await interaction.reply({ content: "Voce (ou sua party) nao tem essa missao ativa.", ephemeral: true });
    return;
  }
  const state = ensureState(ctx.inst.stateJson);
  const choice = availableInsectPlagueNpcs(state, interaction.channelId, ctx.variant).find((npc) => npc.key === npcKey);
  if (!choice) {
    await interaction.reply({ content: "Esse NPC nao esta disponivel nesta etapa.", ephemeral: true });
    return;
  }
  if (state.activeNpc && state.activeNpc !== npcKey) {
    await interaction.reply({ content: "Termine a conversa atual antes de falar com outro NPC.", ephemeral: true });
    return;
  }
  await interaction.deferReply({ ephemeral: true });
  state.activeNpc = npcKey;
  await setState(ctx.inst.id, state);
  await runDialogue(
    interaction.channel,
    interaction.channelId,
    interaction.guildId ?? "global",
    ctx,
    npcKey,
    "(o time inicia a conversa)",
    interaction.user,
  );
  await interaction.editReply(`Voce se aproxima de **${choice.name}**. Continue por mensagens normais no canal.`);
}

export async function continueInsectPlagueMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.guildId) return false;
  const ctx = await resolveInsectPlague(message.author.id, message.guildId, message.channelId);
  if (!ctx) return false;
  const state = ensureState(ctx.inst.stateJson);
  if (!state.activeNpc) return false;
  if (!availableInsectPlagueNpcs(state, message.channelId, ctx.variant).some((npc) => npc.key === state.activeNpc)) return false;
  await runDialogue(
    message.channel,
    message.channelId,
    message.guildId,
    ctx,
    state.activeNpc,
    message.content || "...",
    message.author,
  );
  return true;
}

async function runDialogue(
  channel: TextBasedChannel | null,
  channelId: string,
  guildId: string,
  ctx: InsectPlagueContext,
  npcKey: string,
  playerMessage: string,
  actor: { id: string; username: string },
): Promise<void> {
  const inst = await getInstance(ctx.inst.id);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "CHAKRA_INSECT_PLAGUE") return;
  const state = ensureState(inst.stateJson);
  const turn = (state.talks?.[npcKey] ?? 0) + 1;
  state.talks![npcKey] = turn;

  if (npcKey === ctx.variant.clerk.key && state.stage === "BRIEFING") {
    const done = turn >= turns(def, "briefingTurns", 3);
    await speak(
      channel,
      ctx.variant.clerk,
      playerMessage,
      done
        ? `Ultima fala: mande o time ao ${ctx.variant.marketName} para falar com Mako e examinar os estoques destruidos.`
        : "Explique que plantacoes e reservas de comida estao sendo destruidas por insetos que somem ao menor sinal de patrulha.",
      done ? 2 : Math.min(turn - 1, 1),
    );
    if (done) {
      state.stage = "MARKET";
      state.activeNpc = null;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "receber_ordem_praga");
      await setState(inst.id, state);
      if (channel && "send" in channel) await channel.send(`Va ao ${ctx.variant.marketName}: <#${ctx.variant.marketChannelId}>.`);
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === ctx.variant.stockmaster.key && state.stage === "MARKET") {
    const done = turn >= turns(def, "stockTurns", 2);
    await speak(
      channel,
      ctx.variant.stockmaster,
      playerMessage,
      done
        ? `Ultima fala: diga claramente que os insetos vieram pela ${ctx.variant.routeName}, roeram os graos por dentro e reagiram a chakra como uma colonia treinada.`
        : "Mostre os sacos de graos destruidos e explique que o estoque esta em risco se o foco da praga nao for encontrado.",
      done ? 1 : 0,
    );
    if (done) {
      state.stage = "ROUTE";
      state.activeNpc = null;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "examinar_estoque");
      await setState(inst.id, state);
      if (channel && "send" in channel) await channel.send(`Investigue os ninhos na ${ctx.variant.routeName}: <#${ctx.variant.routeChannelId}>.`);
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === ctx.variant.handler.key && state.stage === "FOREST_TALK") {
    const fight = turn >= turns(def, "handlerTurns", 3);
    await speak(
      channel,
      ctx.variant.handler,
      playerMessage,
      fight
        ? "Ultima fala: admita que usou a colonia para destruir comida, diga que nao deixara levarem seus insetos e inicie combate."
        : "Tente esconder que controla os insetos, fique defensivo quando falarem dos pulsos de chakra e mencione orgulho ferido do cla Aburame.",
      fight ? 2 : Math.min(turn - 1, 1),
    );
    if (fight) {
      state.stage = "FIGHT";
      state.activeNpc = null;
      state.combatStarted = true;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "confrontar_aburame");
      await setState(inst.id, state);
      await startInsectCombatFromActor(channel, channelId, guildId, actor, inst.id, def, ctx.variant);
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === ctx.variant.stockmaster.key && state.stage === "RETURN") {
    const done = turn >= turns(def, "returnTurns", 2);
    await speak(
      channel,
      ctx.variant.stockmaster,
      playerMessage,
      done
        ? "Ultima fala: confirme que os ninhos foram neutralizados, agradeca ao time e encerre a missao."
        : "Receba o relatorio, confira as amostras dos ninhos e separe os sacos contaminados dos estoques limpos.",
      2 + Math.min(turn - 1, 1),
    );
    if (done) {
      state.stage = "DONE";
      state.activeNpc = null;
      await markObjective(inst.id, "confirmar_estoques_seguros");
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

function nestEmbed(state: InsectPlagueState, def: InsectPlagueContext["def"], result?: string): EmbedBuilder {
  const step = NEST_STEPS[state.nestStep ?? 0];
  return new EmbedBuilder()
    .setColor(0x27ae60)
    .setTitle("Investigar Ninhos de Chakra")
    .setDescription(
      [
        `Pistas analisadas: **${state.nestStep ?? 0}/${NEST_STEPS.length}**`,
        `Erros: **${state.mistakes ?? 0}/${maxMistakes(def)}**`,
        "",
        result ?? "",
        step ? `**${step.title}:** ${step.clue}` : "O padrao da colonia foi identificado.",
      ].filter(Boolean).join("\n"),
    );
}

function nestMenu(instanceId: string, state: InsectPlagueState): ActionRowBuilder<StringSelectMenuBuilder> {
  const step = NEST_STEPS[state.nestStep ?? 0]!;
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`insect-plague:nest:${instanceId}:${(state.nestStep ?? 0) + 1}`)
      .setPlaceholder(step.title)
      .addOptions(step.options.map((option) => ({
        label: option.label,
        description: option.description,
        value: option.value,
      }))),
  );
}

async function startNestInvestigation(
  channel: TextBasedChannel | null,
  instanceId: string,
  actorDiscordId: string,
): Promise<void> {
  if (!channel || !("send" in channel)) return;
  const inst = await getInstance(instanceId);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "CHAKRA_INSECT_PLAGUE") return;
  let state = ensureState(inst.stateJson);
  const variant = variantFor(def);
  const msg = await channel.send({ embeds: [nestEmbed(state, def)], components: [nestMenu(instanceId, state)] });

  while ((state.nestStep ?? 0) < NEST_STEPS.length) {
    const index = state.nestStep ?? 0;
    const step = NEST_STEPS[index]!;
    try {
      const pick = (await msg.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        time: stepTimeout(def),
        filter: (i: StringSelectMenuInteraction) =>
          i.user.id === actorDiscordId && i.customId === `insect-plague:nest:${instanceId}:${index + 1}`,
      })) as StringSelectMenuInteraction;

      let result: string;
      if (pick.values[0] === step.correct) {
        state.nestStep = index + 1;
        await markObjective(instanceId, step.objectiveId);
        result = "**Pista correta.**";
      } else {
        state.mistakes = (state.mistakes ?? 0) + 1;
        result = "**Essa escolha espalha ou enfraquece a pista da colonia.**";
      }

      if ((state.mistakes ?? 0) >= maxMistakes(def)) {
        await failInsectPlague(instanceId, msg, "A colonia se dispersou antes que o usuario de chakra fosse identificado.");
        return;
      }

      await setState(instanceId, state);
      const done = (state.nestStep ?? 0) >= NEST_STEPS.length;
      await pick.update({
        embeds: [nestEmbed(state, def, result)],
        components: done ? [] : [nestMenu(instanceId, state)],
      });
      if (done) break;
    } catch {
      state.running = false;
      await setState(instanceId, state);
      await msg.edit({ components: [] }).catch(() => undefined);
      await channel.send("A trilha de insetos esfriou. Use `/mapa` para retomar a investigacao dos ninhos.");
      return;
    }
  }

  state.stage = "FOREST_TALK";
  state.running = false;
  state.nestStep = 0;
  await setState(instanceId, state);
  await msg.edit({
    embeds: [
      new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle("Colonia rastreada")
        .setDescription(`Os pulsos de chakra e os insetos sentinela levam ate ${variant.forestName}: <#${variant.forestChannelId}>.`),
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
    attrs: attrsFromRow(char.attributes ?? {}),
  };
}

async function startInsectCombatFromActor(
  channel: TextBasedChannel | null,
  channelId: string,
  guildId: string,
  actor: { id: string; username: string },
  instanceId: string,
  def: InsectPlagueContext["def"],
  variant: InsectPlagueVariant,
): Promise<void> {
  if (await getActiveSession(channelId)) return;
  const char = await getOrCreateCharacter(actor.id, guildId, actor.username);
  const { players, attrsById } = await gatherPartyPlayers(channel, guildId, starterFrom(char));
  const session = await startCombat({
    channelId,
    guildId,
    scenarioId: variant.forestScenarioId,
    players,
    npcs: [
      { templateId: handlerTemplate(def) },
      { templateId: swarmTemplate(def) },
      { templateId: swarmTemplate(def) },
    ],
    missionInstanceId: instanceId,
  });
  await cacheAttrs(session, attrsById);
  if (channel && "send" in channel) {
    await channel.send(
      `Souta chama a colonia e dois enxames cercam o time. ${players.length} ninja(s) entram no combate. Use \`/mapa\`.`,
    );
  }
}

async function startInsectCombat(
  interaction: ChatInputCommandInteraction,
  ctx: InsectPlagueContext,
): Promise<void> {
  await startInsectCombatFromActor(
    interaction.channel,
    interaction.channelId,
    interaction.guildId ?? "global",
    interaction.user,
    ctx.inst.id,
    ctx.def,
    ctx.variant,
  );
}

async function failInsectPlague(instanceId: string, msg: Message, reason: string): Promise<void> {
  await prisma.missionInstance.update({ where: { id: instanceId }, data: { status: "FAILED" } });
  await msg.edit({
    embeds: [new EmbedBuilder().setColor(0xc0392b).setTitle("Praga dispersa").setDescription(reason)],
    components: [],
  }).catch(() => undefined);
}

export async function onInsectPlagueCombatWon(
  interaction: ChatInputCommandInteraction,
  instanceId: string,
): Promise<void> {
  const inst = await getInstance(instanceId);
  if (!inst || inst.status !== "ACTIVE") return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "CHAKRA_INSECT_PLAGUE") return;
  const state = ensureState(inst.stateJson);
  const variant = variantFor(def);
  state.stage = "RETURN";
  state.combatStarted = false;
  state.activeNpc = null;
  await markObjective(inst.id, "derrotar_invocador_aburame");
  await setState(inst.id, state);
  await interaction.followUp(
    `A colonia foi contida e Souta nao controla mais os enxames. Volte ao ${variant.marketName}: <#${variant.marketChannelId}>.`,
  );
}

export function insectPlagueVariantIds(): string[] {
  return Object.keys(VARIANTS);
}
