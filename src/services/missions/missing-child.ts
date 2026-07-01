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
  FLORESTA_CHANNEL_ID,
  MANSAO_HOKAGE_CHANNEL_ID,
  PRACA_VILA_DA_FOLHA_CHANNEL_ID,
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

interface MissingChildVariant {
  id: string;
  villageName: string;
  administrationName: string;
  marketName: string;
  plazaName: string;
  alleyName: string;
  forestName: string;
  administrationChannelId: string;
  marketChannelId: string;
  plazaChannelId: string;
  alleyChannelId: string;
  forestChannelId: string;
  forestScenarioId: string;
  parent: RegionalNpc;
  vendor: RegionalNpc & { fixedClue: string };
  witness: RegionalNpc & { fixedClue: string };
  child: RegionalNpc;
  kidnapper: RegionalNpc;
}

const KONOHA_VARIANT: MissingChildVariant = {
  id: "KONOHA",
  villageName: "Konoha",
  administrationName: "Mansao do Hokage",
  marketName: "Centro Comercial de Konoha",
  plazaName: "Praca da Vila da Folha",
  alleyName: "Beco de Konoha",
  forestName: "Floresta",
  administrationChannelId: MANSAO_HOKAGE_CHANNEL_ID,
  marketChannelId: CENTRO_COMERCIAL_CHANNEL_ID,
  plazaChannelId: PRACA_VILA_DA_FOLHA_CHANNEL_ID,
  alleyChannelId: BECO_KONOHA_CHANNEL_ID,
  forestChannelId: FLORESTA_CHANNEL_ID,
  forestScenarioId: "floresta",
  parent: {
    key: "missing_child_parent_konoha",
    name: "Akio Himura (pai aflito)",
    persona: "missing_child_parent_konoha",
    imageFile: "npcs/rich-father-konoha.png",
    cell: "C3",
  },
  vendor: {
    key: "missing_child_vendor_konoha",
    name: "Renzo (vendedor)",
    persona: "missing_child_vendor_konoha",
    imageFile: "npcs/market-vendor-renzo.png",
    cell: "D4",
    fixedClue: "A menina estava com um homem de capa escura que prometeu mostrar um presente raro perto da praca.",
  },
  witness: {
    key: "missing_child_witness_konoha",
    name: "Tomi (testemunha)",
    persona: "missing_child_witness_konoha",
    imageFile: "npcs/kid-girl.png",
    cell: "B5",
    fixedClue: "A menina parecia desconfortavel, deixou cair uma fita com cheiro de incenso barato e foi levada para o beco.",
  },
  child: {
    key: "missing_child_ayaka_konoha",
    name: "Ayaka Himura",
    persona: "missing_child_ayaka_konoha",
    imageFile: "npcs/rich-girl-konoha.png",
    cell: "B4",
  },
  kidnapper: {
    key: "missing_child_kidnapper_konoha",
    name: "Lider dos Sequestradores",
    persona: "missing_child_kidnapper_konoha",
    imageFile: "enemies/kidnapper-leader.png",
    cell: "D6",
  },
};

const VARIANTS: Record<string, MissingChildVariant> = {
  KONOHA: KONOHA_VARIANT,
};

interface TrailStep {
  title: string;
  clue: string;
  correct: string;
  options: { value: string; label: string; description: string }[];
}

const TRAIL_STEPS: TrailStep[] = [
  {
    title: "Item caido",
    clue: "Uma fita fina ficou presa perto de uma caixa. Ela tem perfume caro misturado com incenso barato.",
    correct: "keep_ribbon",
    options: [
      { value: "keep_ribbon", label: "Guardar a fita", description: "Preserva o item da menina como prova e rastro." },
      { value: "discard_ribbon", label: "Ignorar a fita", description: "Perde a ligacao com a vitima." },
      { value: "wash_ribbon", label: "Lavar a fita", description: "Apaga o cheiro que pode orientar a busca." },
    ],
  },
  {
    title: "Cheiro estranho",
    clue: "O incenso barato aparece mais forte perto de marcas de dedos na parede do beco.",
    correct: "follow_incense",
    options: [
      { value: "follow_incense", label: "Seguir o incenso", description: "Liga o beco a alguem que tentou mascarar o cheiro." },
      { value: "follow_food", label: "Seguir cheiro de comida", description: "Leva de volta ao mercado cheio de barracas." },
      { value: "spread_chakra", label: "Espalhar chakra", description: "Assusta civis e nao identifica o rastro." },
    ],
  },
  {
    title: "Pegadas",
    clue: "Duas pegadas adultas e uma infantil seguem para uma saida com lama e folhas.",
    correct: "forest_exit",
    options: [
      { value: "forest_exit", label: "Seguir para a floresta", description: "A lama e as folhas apontam para fora da vila." },
      { value: "market_exit", label: "Voltar ao mercado", description: "As pegadas nao retornam para as lojas." },
      { value: "wait_ransom", label: "Esperar resgate", description: "Da tempo para os sequestradores sumirem." },
    ],
  },
];

export interface MissingChildState {
  stage?:
    | "BRIEFING"
    | "MARKET"
    | "PLAZA"
    | "ALLEY"
    | "FOREST_TALK"
    | "FIGHT"
    | "RETURN"
    | "DONE";
  activeNpc?: string | null;
  talks?: Record<string, number>;
  running?: boolean;
  mistakes?: number;
  trailStep?: number;
  combatStarted?: boolean;
  childSeen?: boolean;
}

export interface MissingChildChoice {
  key: string;
  name: string;
}

export interface MissingChildContext {
  inst: NonNullable<Awaited<ReturnType<typeof getInstance>>>;
  def: NonNullable<ReturnType<typeof getMission>>;
  ownerCharId: string;
  variant: MissingChildVariant;
}

function variantFor(def: NonNullable<ReturnType<typeof getMission>>): MissingChildVariant {
  return VARIANTS[String(def.data?.variantId ?? "KONOHA")] ?? KONOHA_VARIANT;
}

function ensureState(raw: string): MissingChildState {
  const state = readState<MissingChildState>(raw);
  state.stage = state.stage ?? "BRIEFING";
  state.activeNpc = state.activeNpc ?? null;
  state.talks = state.talks ?? {};
  state.running = state.running ?? false;
  state.mistakes = state.mistakes ?? 0;
  state.trailStep = state.trailStep ?? 0;
  state.combatStarted = state.combatStarted ?? false;
  state.childSeen = state.childSeen ?? false;
  return state;
}

function turns(
  def: MissingChildContext["def"],
  key: "briefingTurns" | "vendorTurns" | "witnessTurns" | "kidnapperTurns" | "returnTurns",
  fallback: number,
): number {
  return Number(def.data?.[key] ?? fallback);
}

function maxMistakes(def: MissingChildContext["def"]): number {
  return Number(def.data?.maxMistakes ?? 4);
}

function stepTimeout(def: MissingChildContext["def"]): number {
  return Number(def.data?.stepTimeoutMs ?? 60_000);
}

function kidnapperTemplate(def: MissingChildContext["def"]): string {
  return String(def.data?.kidnapperTemplate ?? "kidnapper_grunt");
}

function leaderTemplate(def: MissingChildContext["def"]): string {
  return String(def.data?.leaderTemplate ?? "kidnapper_leader");
}

async function findContextByCharId(charId: string, channelId?: string): Promise<MissingChildContext | null> {
  for (const inst of await getActiveMissions(charId)) {
    const def = getMission(inst.missionId);
    if (!def || def.type !== "MISSING_CHILD") continue;
    const variant = variantFor(def);
    const channels = [
      variant.administrationChannelId,
      variant.marketChannelId,
      variant.plazaChannelId,
      variant.alleyChannelId,
      variant.forestChannelId,
    ];
    if (channelId && !channels.includes(channelId)) continue;
    return { inst, def, ownerCharId: charId, variant };
  }
  return null;
}

export async function resolveMissingChild(
  discordId: string,
  guildId: string,
  channelId?: string,
): Promise<MissingChildContext | null> {
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

export function availableMissingChildNpcs(
  state: MissingChildState,
  channelId: string,
  variant: MissingChildVariant,
): MissingChildChoice[] {
  if (channelId === variant.administrationChannelId) {
    if (state.stage === "BRIEFING") return [{ key: variant.parent.key, name: variant.parent.name }];
    if (state.stage === "RETURN") return [{ key: variant.parent.key, name: `${variant.parent.name} (resgate)` }];
  }
  if (channelId === variant.marketChannelId && state.stage === "MARKET") {
    return [{ key: variant.vendor.key, name: variant.vendor.name }];
  }
  if (channelId === variant.plazaChannelId && state.stage === "PLAZA") {
    return [{ key: variant.witness.key, name: variant.witness.name }];
  }
  if (channelId === variant.forestChannelId && state.stage === "FOREST_TALK") {
    return [{ key: variant.kidnapper.key, name: variant.kidnapper.name }];
  }
  return [];
}

export async function missingChildMapHandle(
  interaction: ChatInputCommandInteraction,
  ctx: MissingChildContext,
  entities: RenderEntity[],
): Promise<string | null> {
  const state = ensureState(ctx.inst.stateJson);
  const { variant } = ctx;

  if (interaction.channelId === variant.administrationChannelId) {
    if (state.stage === "BRIEFING" || state.stage === "RETURN") {
      entities.push(npcEntity(variant.parent));
      if (state.stage === "RETURN") entities.push(npcEntity(variant.child));
      return state.stage === "BRIEFING"
        ? `\nMissao ativa: **${ctx.def.name}** - fale com ${variant.parent.name} usando \`/interagir npc\`.`
        : `\nMissao ativa: **${ctx.def.name}** - devolva Ayaka ao pai usando \`/interagir npc\`.`;
    }
    return nextPlaceNote(ctx, state);
  }

  if (interaction.channelId === variant.marketChannelId) {
    if (state.stage === "MARKET") {
      entities.push(npcEntity(variant.vendor));
      return `\nMissao ativa: **${ctx.def.name}** - pergunte aos comerciantes sobre Ayaka com \`/interagir npc\`.`;
    }
    return nextPlaceNote(ctx, state);
  }

  if (interaction.channelId === variant.plazaChannelId) {
    if (state.stage === "PLAZA") {
      entities.push(npcEntity(variant.witness));
      return `\nMissao ativa: **${ctx.def.name}** - fale com a testemunha usando \`/interagir npc\`.`;
    }
    return nextPlaceNote(ctx, state);
  }

  if (interaction.channelId === variant.alleyChannelId) {
    if (state.stage === "ALLEY") {
      entities.push(
        { cell: "C4", label: "\u{1F380}", color: "#e84393", kind: "MARKER", name: "Fita de Ayaka" },
        { cell: "D5", label: "\u{1F463}", color: "#8e44ad", kind: "MARKER", name: "Pegadas" },
      );
      if (!state.running) {
        state.running = true;
        await setState(ctx.inst.id, state);
        void startTrailPuzzle(interaction.channel, ctx.inst.id, interaction.user.id).catch(() => undefined);
      }
      return `\nMissao ativa: **${ctx.def.name}** - investigue as pistas do beco no painel enviado no canal.`;
    }
    return nextPlaceNote(ctx, state);
  }

  if (interaction.channelId !== variant.forestChannelId) return null;
  if (state.stage === "FOREST_TALK") {
    entities.push(npcEntity(variant.child), npcEntity(variant.kidnapper));
    if (!state.childSeen) {
      state.childSeen = true;
      await setState(ctx.inst.id, state);
      await speak(
        interaction.channel,
        variant.kidnapper,
        "(o time encontra Ayaka presa perto das arvores)",
        "Mostre que o plano de resgate falhou e tente negociar dinheiro antes de partir para ameacas.",
        0,
      );
    }
    return `\nMissao ativa: **${ctx.def.name}** - confronte o sequestrador usando \`/interagir npc\`.`;
  }
  if (state.stage === "FIGHT") {
    entities.push(npcEntity(variant.child));
    if (!(await getActiveSession(interaction.channelId))) await startMissingChildCombat(interaction, ctx);
    return `\nMissao ativa: **${ctx.def.name}** - derrote os sequestradores e proteja Ayaka.`;
  }
  return nextPlaceNote(ctx, state);
}

function nextPlaceNote(ctx: MissingChildContext, state: MissingChildState): string | null {
  const v = ctx.variant;
  if (state.stage === "MARKET") return `\nMissao ativa: **${ctx.def.name}** - siga para ${v.marketName}: <#${v.marketChannelId}>.`;
  if (state.stage === "PLAZA") return `\nMissao ativa: **${ctx.def.name}** - siga para ${v.plazaName}: <#${v.plazaChannelId}>.`;
  if (state.stage === "ALLEY") return `\nMissao ativa: **${ctx.def.name}** - siga para ${v.alleyName}: <#${v.alleyChannelId}>.`;
  if (state.stage === "FOREST_TALK" || state.stage === "FIGHT") {
    return `\nMissao ativa: **${ctx.def.name}** - siga para ${v.forestName}: <#${v.forestChannelId}>.`;
  }
  if (state.stage === "RETURN") return `\nMissao ativa: **${ctx.def.name}** - volte para ${v.administrationName}: <#${v.administrationChannelId}>.`;
  return null;
}

function npcEntity(npc: RegionalNpc): RenderEntity {
  return {
    cell: npc.cell,
    name: npc.name,
    label: npc.name.slice(0, 3),
    color: "#c0392b",
    kind: "NPC",
    imageFile: npc.imageFile,
  };
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

export async function interactMissingChild(
  interaction: ChatInputCommandInteraction,
  npcKey: string,
): Promise<void> {
  const guildId = interaction.guildId ?? "global";
  const ctx = await resolveMissingChild(interaction.user.id, guildId, interaction.channelId);
  if (!ctx) {
    await interaction.reply({ content: "Voce (ou sua party) nao tem essa missao ativa.", ephemeral: true });
    return;
  }
  const state = ensureState(ctx.inst.stateJson);
  const choice = availableMissingChildNpcs(state, interaction.channelId, ctx.variant).find((npc) => npc.key === npcKey);
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

export async function continueMissingChildMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.guildId) return false;
  const ctx = await resolveMissingChild(message.author.id, message.guildId, message.channelId);
  if (!ctx) return false;
  const state = ensureState(ctx.inst.stateJson);
  if (!state.activeNpc) return false;
  if (!availableMissingChildNpcs(state, message.channelId, ctx.variant).some((npc) => npc.key === state.activeNpc)) return false;
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
  ctx: MissingChildContext,
  npcKey: string,
  playerMessage: string,
  actor: { id: string; username: string },
): Promise<void> {
  const inst = await getInstance(ctx.inst.id);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "MISSING_CHILD") return;
  const state = ensureState(inst.stateJson);
  const turn = (state.talks?.[npcKey] ?? 0) + 1;
  state.talks![npcKey] = turn;

  if (npcKey === ctx.variant.parent.key && state.stage === "BRIEFING") {
    const done = turn >= turns(def, "briefingTurns", 3);
    await speak(
      channel,
      ctx.variant.parent,
      playerMessage,
      done
        ? `Ultima fala: diga claramente que Ayaka queria ir ao ${ctx.variant.marketName} e mande o time comecar por la.`
        : "Explique que Ayaka Himura, filha de uma familia rica, desapareceu depois de discutir com os pais e que ha suspeita de sequestro.",
      done ? 2 : Math.min(turn - 1, 1),
    );
    if (done) {
      state.stage = "MARKET";
      state.activeNpc = null;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "receber_pedido_familia");
      await setState(inst.id, state);
      if (channel && "send" in channel) await channel.send(`Comece pelo ${ctx.variant.marketName}: <#${ctx.variant.marketChannelId}>.`);
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === ctx.variant.vendor.key && state.stage === "MARKET") {
    const done = turn >= turns(def, "vendorTurns", 2);
    await speak(
      channel,
      ctx.variant.vendor,
      playerMessage,
      done
        ? `Ultima fala: revele claramente este fato fixo: ${ctx.variant.vendor.fixedClue}`
        : "Conte que viu Ayaka no mercado e que alguem desconhecido se aproximou dela, mas guarde o detalhe principal para a proxima fala.",
      done ? 1 : 0,
    );
    if (done) {
      state.stage = "PLAZA";
      state.activeNpc = null;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "ouvir_vendedor_mercado");
      await setState(inst.id, state);
      if (channel && "send" in channel) await channel.send(`A pista leva ate ${ctx.variant.plazaName}: <#${ctx.variant.plazaChannelId}>.`);
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === ctx.variant.witness.key && state.stage === "PLAZA") {
    const done = turn >= turns(def, "witnessTurns", 2);
    await speak(
      channel,
      ctx.variant.witness,
      playerMessage,
      done
        ? `Ultima fala: revele claramente este fato fixo: ${ctx.variant.witness.fixedClue}`
        : "Fale como testemunha nervosa, explicando que viu Ayaka desconfortavel, mas sem entregar tudo ainda.",
      done ? 1 : 0,
    );
    if (done) {
      state.stage = "ALLEY";
      state.activeNpc = null;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "ouvir_testemunha_praca");
      await setState(inst.id, state);
      if (channel && "send" in channel) await channel.send(`Procure pistas no ${ctx.variant.alleyName}: <#${ctx.variant.alleyChannelId}>.`);
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === ctx.variant.kidnapper.key && state.stage === "FOREST_TALK") {
    const fight = turn >= turns(def, "kidnapperTurns", 3);
    await speak(
      channel,
      ctx.variant.kidnapper,
      playerMessage,
      fight
        ? "Ultima fala: ameace fugir com a refem, perceba que foi cercado e inicie combate com seus dois comparsas."
        : "Tente negociar resgate, blefar que Ayaka esta segura e ganhar tempo para seus comparsas se posicionarem.",
      fight ? 2 : Math.min(turn - 1, 1),
    );
    if (fight) {
      state.stage = "FIGHT";
      state.activeNpc = null;
      state.combatStarted = true;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "confrontar_sequestradores");
      await setState(inst.id, state);
      await startMissingChildCombatFromActor(channel, channelId, guildId, actor, inst.id, def, ctx.variant);
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === ctx.variant.parent.key && state.stage === "RETURN") {
    const done = turn >= turns(def, "returnTurns", 2);
    await speak(
      channel,
      ctx.variant.parent,
      playerMessage,
      done
        ? "Ultima fala: agradeca pelo resgate de Ayaka, confirme que a familia vai depor contra os sequestradores e encerre a missao."
        : "Receba Ayaka de volta com alivio, confira se ela esta bem e ouca o relatorio do time.",
      3 + Math.min(turn - 1, 1),
    );
    if (done) {
      state.stage = "DONE";
      state.activeNpc = null;
      await markObjective(inst.id, "devolver_ayaka_familia");
      await setState(inst.id, state);
      const result = await completeMission(inst.charId, inst.missionId);
      if (result && channel && "send" in channel) {
        const items = result.rewards.items?.map((item) => item.name).join(", ");
        await channel.send(
          `Missao concluida: **${def.name}**!\nRecompensas: ${result.rewards.xp} XP, ${result.rewards.ryo} ryo${items ? `, ${items}` : ""}.`,
        );
      }
      return;
    }
    await setState(inst.id, state);
  }
}

function trailEmbed(state: MissingChildState, def: MissingChildContext["def"], result?: string): EmbedBuilder {
  const step = TRAIL_STEPS[state.trailStep ?? 0];
  return new EmbedBuilder()
    .setColor(0x8e44ad)
    .setTitle("Investigar o Beco")
    .setDescription(
      [
        `Pistas analisadas: **${state.trailStep ?? 0}/${TRAIL_STEPS.length}**`,
        `Erros: **${state.mistakes ?? 0}/${maxMistakes(def)}**`,
        "",
        result ?? "",
        step ? `**${step.title}:** ${step.clue}` : "O rastro foi fechado.",
      ].filter(Boolean).join("\n"),
    );
}

function trailMenu(instanceId: string, state: MissingChildState): ActionRowBuilder<StringSelectMenuBuilder> {
  const step = TRAIL_STEPS[state.trailStep ?? 0]!;
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`missing-child:trail:${instanceId}:${(state.trailStep ?? 0) + 1}`)
      .setPlaceholder(step.title)
      .addOptions(step.options.map((option) => ({
        label: option.label,
        description: option.description,
        value: option.value,
      }))),
  );
}

async function startTrailPuzzle(
  channel: TextBasedChannel | null,
  instanceId: string,
  actorDiscordId: string,
): Promise<void> {
  if (!channel || !("send" in channel)) return;
  const inst = await getInstance(instanceId);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "MISSING_CHILD") return;
  let state = ensureState(inst.stateJson);
  const variant = variantFor(def);
  const msg = await channel.send({ embeds: [trailEmbed(state, def)], components: [trailMenu(instanceId, state)] });

  while ((state.trailStep ?? 0) < TRAIL_STEPS.length) {
    const index = state.trailStep ?? 0;
    const step = TRAIL_STEPS[index]!;
    try {
      const pick = (await msg.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        time: stepTimeout(def),
        filter: (i: StringSelectMenuInteraction) =>
          i.user.id === actorDiscordId && i.customId === `missing-child:trail:${instanceId}:${index + 1}`,
      })) as StringSelectMenuInteraction;

      let result: string;
      if (pick.values[0] === step.correct) {
        state.trailStep = index + 1;
        result = "**Pista preservada.**";
      } else {
        state.mistakes = (state.mistakes ?? 0) + 1;
        result = "**Essa analise enfraquece o rastro e da tempo aos sequestradores.**";
      }

      if ((state.mistakes ?? 0) >= maxMistakes(def)) {
        await failMissingChild(instanceId, msg, "O rastro foi contaminado e os sequestradores escaparam da regiao.");
        return;
      }

      await setState(instanceId, state);
      const done = (state.trailStep ?? 0) >= TRAIL_STEPS.length;
      await pick.update({
        embeds: [trailEmbed(state, def, result)],
        components: done ? [] : [trailMenu(instanceId, state)],
      });
      if (done) break;
    } catch {
      state.running = false;
      await setState(instanceId, state);
      await msg.edit({ components: [] }).catch(() => undefined);
      await channel.send("A investigacao esfriou. Use `/mapa` para retomar as pistas do beco.");
      return;
    }
  }

  state.stage = "FOREST_TALK";
  state.running = false;
  state.trailStep = 0;
  await markObjective(instanceId, "seguir_rastro_beco");
  await setState(instanceId, state);
  await msg.edit({
    embeds: [
      new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle("Rastro encontrado")
        .setDescription(`A fita, o incenso e as pegadas levam para ${variant.forestName}: <#${variant.forestChannelId}>.`),
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

async function startMissingChildCombatFromActor(
  channel: TextBasedChannel | null,
  channelId: string,
  guildId: string,
  actor: { id: string; username: string },
  instanceId: string,
  def: MissingChildContext["def"],
  variant: MissingChildVariant,
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
      { templateId: leaderTemplate(def) },
      { templateId: kidnapperTemplate(def) },
      { templateId: kidnapperTemplate(def) },
    ],
    missionInstanceId: instanceId,
  });
  await cacheAttrs(session, attrsById);
  if (channel && "send" in channel) {
    await channel.send(
      `Os sequestradores avancam para abrir fuga! ${players.length} ninja(s) entram no combate. Use \`/mapa\`.`,
    );
  }
}

async function startMissingChildCombat(
  interaction: ChatInputCommandInteraction,
  ctx: MissingChildContext,
): Promise<void> {
  await startMissingChildCombatFromActor(
    interaction.channel,
    interaction.channelId,
    interaction.guildId ?? "global",
    interaction.user,
    ctx.inst.id,
    ctx.def,
    ctx.variant,
  );
}

async function failMissingChild(instanceId: string, msg: Message, reason: string): Promise<void> {
  await prisma.missionInstance.update({ where: { id: instanceId }, data: { status: "FAILED" } });
  await msg.edit({
    embeds: [new EmbedBuilder().setColor(0xc0392b).setTitle("Rastro perdido").setDescription(reason)],
    components: [],
  }).catch(() => undefined);
}

export async function onMissingChildCombatWon(
  interaction: ChatInputCommandInteraction,
  instanceId: string,
): Promise<void> {
  const inst = await getInstance(instanceId);
  if (!inst || inst.status !== "ACTIVE") return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "MISSING_CHILD") return;
  const state = ensureState(inst.stateJson);
  const variant = variantFor(def);
  state.stage = "RETURN";
  state.combatStarted = false;
  state.activeNpc = null;
  await markObjective(inst.id, "derrotar_sequestradores");
  await setState(inst.id, state);
  await interaction.followUp(
    `Ayaka foi resgatada. Volte para ${variant.administrationName} e fale com ${variant.parent.name}: <#${variant.administrationChannelId}>.`,
  );
}

export function missingChildVariantIds(): string[] {
  return Object.keys(VARIANTS);
}
