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
  MANSAO_HOKAGE_CHANNEL_ID,
  ROTA_COMERCIAL_KONOHA_CHANNEL_ID,
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

interface FalseNinjasVariant {
  id: string;
  villageName: string;
  administrationName: string;
  marketName: string;
  routeName: string;
  administrationChannelId: string;
  marketChannelId: string;
  routeChannelId: string;
  routeScenarioId: string;
  clerk: RegionalNpc;
  witnesses: Array<RegionalNpc & { objectiveId: string; fixedClue: string }>;
  victims: RegionalNpc;
  impostor: RegionalNpc;
}

const KONOHA_VARIANT: FalseNinjasVariant = {
  id: "KONOHA",
  villageName: "Konoha",
  administrationName: "Mansao do Hokage",
  marketName: "Centro Comercial de Konoha",
  routeName: "Rota Comercial de Konoha",
  administrationChannelId: MANSAO_HOKAGE_CHANNEL_ID,
  marketChannelId: CENTRO_COMERCIAL_CHANNEL_ID,
  routeChannelId: ROTA_COMERCIAL_KONOHA_CHANNEL_ID,
  routeScenarioId: "rota_comercial_konoha",
  clerk: {
    key: "false_ninjas_clerk_konoha",
    name: "Kaede Mori (escriva de missoes)",
    persona: "false_ninjas_clerk_konoha",
    imageFile: "npcs/mission-clerk.png",
    cell: "C3",
  },
  witnesses: [
    {
      key: "false_ninjas_renzo",
      name: "Renzo (frutas)",
      persona: "false_ninjas_renzo",
      imageFile: "npcs/market-vendor-renzo.png",
      cell: "B3",
      objectiveId: "ouvir_renzo_falso_ninja",
      fixedClue: "Os falsos ninjas cobraram ryo adiantado para uma suposta taxa de protecao.",
    },
    {
      key: "false_ninjas_aya",
      name: "Aya (tecidos)",
      persona: "false_ninjas_aya",
      imageFile: "npcs/market_vendor_aya.png",
      cell: "D7",
      objectiveId: "ouvir_aya_falso_ninja",
      fixedClue: "A ordem mostrada nao tinha numero de registro e usava um selo da Folha torto.",
    },
    {
      key: "false_ninjas_merchant",
      name: "Daichi (ferragens)",
      persona: "false_ninjas_merchant",
      imageFile: "npcs/merchant.png",
      cell: "E4",
      objectiveId: "ouvir_daichi_falso_ninja",
      fixedClue: "O grupo seguia para a rota comercial e carregava o dinheiro numa caixa marcada.",
    },
  ],
  victims: {
    key: "false_ninjas_victims_konoha",
    name: "Comerciantes lesados",
    persona: "false_ninjas_victims_konoha",
    imageFile: "npcs/market_vendors_pair.png",
    cell: "C5",
  },
  impostor: {
    key: "false_ninjas_captain_konoha",
    name: "Falso Capitao Ninja",
    persona: "false_ninjas_captain_konoha",
    imageFile: "enemies/false-ninja-captain.png",
    cell: "C7",
  },
};

const VARIANTS: Record<string, FalseNinjasVariant> = {
  KONOHA: KONOHA_VARIANT,
};

interface AmbushStep {
  title: string;
  clue: string;
  correct: string;
  options: { value: string; label: string; description: string }[];
}

const AMBUSH_STEPS: AmbushStep[] = [
  {
    title: "Proteger os comerciantes",
    clue: "A caixa marcada sera usada como isca. Civis nao podem permanecer na zona de captura.",
    correct: "evacuar",
    options: [
      { value: "evacuar", label: "Retirar os civis", description: "Mantem os comerciantes fora do confronto." },
      { value: "misturar", label: "Misturar-se aos civis", description: "Coloca inocentes no centro da armadilha." },
      { value: "avisar", label: "Gritar o plano", description: "Alerta os falsos ninjas antes da chegada." },
    ],
  },
  {
    title: "Preparar a isca",
    clue: "Os criminosos reconhecem a caixa marcada, mas o dinheiro recuperado nao pode voltar para as maos deles.",
    correct: "substituir",
    options: [
      { value: "substituir", label: "Trocar o conteudo", description: "Mantem a caixa reconhecivel sem arriscar o dinheiro." },
      { value: "dinheiro", label: "Usar o dinheiro real", description: "Pode permitir uma nova fuga com o valor roubado." },
      { value: "destruir", label: "Destruir a caixa", description: "Remove a unica isca que o grupo reconhece." },
    ],
  },
  {
    title: "Fechar a rota de fuga",
    clue: "A rota possui uma bifurcacao e cobertura de arvores. O time precisa cercar sem parecer uma patrulha.",
    correct: "flanquear",
    options: [
      { value: "flanquear", label: "Flanquear a bifurcacao", description: "Fecha as duas saidas quando o grupo se aproximar." },
      { value: "agrupar", label: "Ficar junto da caixa", description: "Deixa as laterais livres para fuga." },
      { value: "perseguir", label: "Esperar e perseguir", description: "Entrega a iniciativa aos criminosos." },
    ],
  },
];

export interface FalseNinjasState {
  stage?:
    | "BRIEFING"
    | "WITNESSES"
    | "ORDER_CHECK"
    | "TO_ROUTE"
    | "AMBUSH"
    | "IMPOSTOR_TALK"
    | "FIGHT"
    | "RETURN_MARKET"
    | "RETURN_ADMIN"
    | "DONE";
  activeNpc?: string | null;
  talks?: Record<string, number>;
  heard?: string[];
  running?: boolean;
  mistakes?: number;
  ambushStep?: number;
  orderVerified?: boolean;
  combatStarted?: boolean;
  impostorSeen?: boolean;
}

export interface FalseNinjasChoice {
  key: string;
  name: string;
}

export interface FalseNinjasContext {
  inst: NonNullable<Awaited<ReturnType<typeof getInstance>>>;
  def: NonNullable<ReturnType<typeof getMission>>;
  ownerCharId: string;
  variant: FalseNinjasVariant;
}

function variantFor(def: NonNullable<ReturnType<typeof getMission>>): FalseNinjasVariant {
  const id = String(def.data?.variantId ?? "KONOHA");
  return VARIANTS[id] ?? KONOHA_VARIANT;
}

function ensureState(raw: string): FalseNinjasState {
  const state = readState<FalseNinjasState>(raw);
  state.stage = state.stage ?? "BRIEFING";
  state.activeNpc = state.activeNpc ?? null;
  state.talks = state.talks ?? {};
  state.heard = state.heard ?? [];
  state.running = state.running ?? false;
  state.mistakes = state.mistakes ?? 0;
  state.ambushStep = state.ambushStep ?? 0;
  state.orderVerified = state.orderVerified ?? false;
  state.combatStarted = state.combatStarted ?? false;
  state.impostorSeen = state.impostorSeen ?? false;
  return state;
}

function turns(
  def: FalseNinjasContext["def"],
  key: "briefingTurns" | "witnessTurns" | "impostorTurns" | "victimTurns" | "reportTurns",
  fallback: number,
): number {
  return Number(def.data?.[key] ?? fallback);
}

function maxMistakes(def: FalseNinjasContext["def"]): number {
  return Number(def.data?.maxMistakes ?? 4);
}

function stepTimeout(def: FalseNinjasContext["def"]): number {
  return Number(def.data?.stepTimeoutMs ?? 60_000);
}

function gruntTemplate(def: FalseNinjasContext["def"]): string {
  return String(def.data?.gruntTemplate ?? "false_ninja_grunt");
}

function captainTemplate(def: FalseNinjasContext["def"]): string {
  return String(def.data?.captainTemplate ?? "false_ninja_captain");
}

async function findContextByCharId(
  charId: string,
  channelId?: string,
): Promise<FalseNinjasContext | null> {
  for (const inst of await getActiveMissions(charId)) {
    const def = getMission(inst.missionId);
    if (!def || def.type !== "FALSE_NINJAS") continue;
    const variant = variantFor(def);
    const channels = [
      variant.administrationChannelId,
      variant.marketChannelId,
      variant.routeChannelId,
    ];
    if (channelId && !channels.includes(channelId)) continue;
    return { inst, def, ownerCharId: charId, variant };
  }
  return null;
}

export async function resolveFalseNinjas(
  discordId: string,
  guildId: string,
  channelId?: string,
): Promise<FalseNinjasContext | null> {
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

export function availableFalseNinjasNpcs(
  state: FalseNinjasState,
  channelId: string,
  variant: FalseNinjasVariant,
): FalseNinjasChoice[] {
  if (channelId === variant.administrationChannelId) {
    if (state.stage === "BRIEFING") return [{ key: variant.clerk.key, name: variant.clerk.name }];
    if (state.stage === "RETURN_ADMIN") return [{ key: variant.clerk.key, name: `${variant.clerk.name} (relatorio)` }];
  }
  if (channelId === variant.marketChannelId) {
    if (state.stage === "WITNESSES") {
      if (state.activeNpc) {
        const active = variant.witnesses.find((npc) => npc.key === state.activeNpc);
        return active ? [{ key: active.key, name: active.name }] : [];
      }
      return variant.witnesses
        .filter((npc) => !(state.heard ?? []).includes(npc.key))
        .map((npc) => ({ key: npc.key, name: npc.name }));
    }
    if (state.stage === "RETURN_MARKET") return [{ key: variant.victims.key, name: variant.victims.name }];
  }
  if (channelId === variant.routeChannelId && state.stage === "IMPOSTOR_TALK") {
    return [{ key: variant.impostor.key, name: variant.impostor.name }];
  }
  return [];
}

export async function falseNinjasMapHandle(
  interaction: ChatInputCommandInteraction,
  ctx: FalseNinjasContext,
  entities: RenderEntity[],
): Promise<string | null> {
  const state = ensureState(ctx.inst.stateJson);
  const { variant } = ctx;

  if (interaction.channelId === variant.administrationChannelId) {
    if (state.stage === "BRIEFING" || state.stage === "RETURN_ADMIN") {
      entities.push(npcEntity(variant.clerk));
      return state.stage === "BRIEFING"
        ? `\nMissao ativa: **${ctx.def.name}** - fale com ${variant.clerk.name} usando \`/interagir npc\`.`
        : `\nMissao ativa: **${ctx.def.name}** - entregue o relatorio final usando \`/interagir npc\`.`;
    }
    return null;
  }

  if (interaction.channelId === variant.marketChannelId) {
    if (state.stage === "WITNESSES") {
      entities.push(...variant.witnesses.map(npcEntity));
      return `\nMissao ativa: **${ctx.def.name}** - recolha os tres depoimentos com \`/interagir npc\`. Depoimentos: **${state.heard?.length ?? 0}/3**.`;
    }
    if (state.stage === "ORDER_CHECK") {
      entities.push(...variant.witnesses.map(npcEntity));
      if (!state.running) {
        state.running = true;
        await setState(ctx.inst.id, state);
        void startOrderCheck(interaction.channel, ctx.inst.id, interaction.user.id).catch(() => undefined);
      }
      return `\nMissao ativa: **${ctx.def.name}** - identifique a ordem falsa no painel enviado no canal.`;
    }
    if (state.stage === "RETURN_MARKET") {
      entities.push(npcEntity(variant.victims));
      return `\nMissao ativa: **${ctx.def.name}** - devolva o dinheiro aos comerciantes usando \`/interagir npc\`.`;
    }
    if (["TO_ROUTE", "AMBUSH", "IMPOSTOR_TALK", "FIGHT"].includes(state.stage ?? "")) {
      return `\nMissao ativa: **${ctx.def.name}** - siga para ${variant.routeName}: <#${variant.routeChannelId}>.`;
    }
    return null;
  }

  if (interaction.channelId !== variant.routeChannelId) return null;

  if (state.stage === "TO_ROUTE") {
    state.stage = "AMBUSH";
    state.running = false;
    await markObjective(ctx.inst.id, "chegar_rota_falsos_ninjas");
    await setState(ctx.inst.id, state);
  }

  if (state.stage === "AMBUSH") {
    if (!state.running) {
      state.running = true;
      await setState(ctx.inst.id, state);
      void startAmbushSetup(interaction.channel, ctx.inst.id, interaction.user.id).catch(() => undefined);
    }
    return `\nMissao ativa: **${ctx.def.name}** - prepare a emboscada no painel enviado no canal.`;
  }
  if (state.stage === "IMPOSTOR_TALK") {
    entities.push(npcEntity(variant.impostor));
    if (!state.impostorSeen) {
      state.impostorSeen = true;
      await setState(ctx.inst.id, state);
      await speak(
        interaction.channel,
        variant.impostor,
        "(o grupo de falsos ninjas encontra a caixa marcada na rota)",
        "Voce acredita que veio buscar outra cobranca. Tente impor autoridade usando uma ordem falsa.",
        0,
      );
    }
    return `\nMissao ativa: **${ctx.def.name}** - confronte o falso capitao usando \`/interagir npc\`.`;
  }
  if (state.stage === "FIGHT") {
    if (!(await getActiveSession(interaction.channelId))) {
      await startFalseNinjaCombat(interaction, ctx);
    }
    return `\nMissao ativa: **${ctx.def.name}** - derrote os dois falsos ninjas e o capitao.`;
  }
  if (state.stage === "RETURN_MARKET") {
    return `\nMissao ativa: **${ctx.def.name}** - volte para ${variant.marketName}: <#${variant.marketChannelId}>.`;
  }
  if (state.stage === "RETURN_ADMIN") {
    return `\nMissao ativa: **${ctx.def.name}** - volte para ${variant.administrationName}: <#${variant.administrationChannelId}>.`;
  }
  return null;
}

function npcEntity(npc: RegionalNpc): RenderEntity {
  return {
    cell: npc.cell,
    name: npc.name,
    label: npc.name.slice(0, 3),
    color: "#d35400",
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

export async function interactFalseNinjas(
  interaction: ChatInputCommandInteraction,
  npcKey: string,
): Promise<void> {
  const guildId = interaction.guildId ?? "global";
  const ctx = await resolveFalseNinjas(interaction.user.id, guildId, interaction.channelId);
  if (!ctx) {
    await interaction.reply({ content: "Voce (ou sua party) nao tem essa missao ativa.", ephemeral: true });
    return;
  }
  const state = ensureState(ctx.inst.stateJson);
  const choice = availableFalseNinjasNpcs(state, interaction.channelId, ctx.variant).find((npc) => npc.key === npcKey);
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

export async function continueFalseNinjasMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.guildId) return false;
  const ctx = await resolveFalseNinjas(message.author.id, message.guildId, message.channelId);
  if (!ctx) return false;
  const state = ensureState(ctx.inst.stateJson);
  if (!state.activeNpc) return false;
  if (!availableFalseNinjasNpcs(state, message.channelId, ctx.variant).some((npc) => npc.key === state.activeNpc)) return false;
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
  ctx: FalseNinjasContext,
  npcKey: string,
  playerMessage: string,
  actor: { id: string; username: string },
): Promise<void> {
  const inst = await getInstance(ctx.inst.id);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "FALSE_NINJAS") return;
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
        ? `Ultima fala: mande o time ao ${ctx.variant.marketName} para colher tres depoimentos e examinar a ordem apresentada pelos criminosos.`
        : "Explique que criminosos com bandanas falsas estao cobrando protecao e manchando o nome da vila.",
      done ? 2 : Math.min(turn - 1, 1),
    );
    if (done) {
      state.stage = "WITNESSES";
      state.activeNpc = null;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "receber_ordem_investigacao");
      await setState(inst.id, state);
      if (channel && "send" in channel) {
        await channel.send(`Va para ${ctx.variant.marketName} e use \`/mapa\`: <#${ctx.variant.marketChannelId}>.`);
      }
      return;
    }
    await setState(inst.id, state);
    return;
  }

  const witness = ctx.variant.witnesses.find((npc) => npc.key === npcKey);
  if (witness && state.stage === "WITNESSES") {
    const done = turn >= turns(def, "witnessTurns", 2);
    await speak(
      channel,
      witness,
      playerMessage,
      done
        ? `Ultima fala: revele claramente este fato fixo e nao o altere: ${witness.fixedClue}`
        : "Conte como os falsos ninjas intimidaram os comerciantes, mas guarde o detalhe principal para a proxima fala.",
      done ? 1 : 0,
    );
    if (done) {
      state.heard = [...new Set([...(state.heard ?? []), npcKey])];
      state.activeNpc = null;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, witness.objectiveId);
      if (state.heard.length === ctx.variant.witnesses.length) {
        state.stage = "ORDER_CHECK";
        if (channel && "send" in channel) {
          await channel.send("Os tres depoimentos foram reunidos. Use `/mapa` para identificar qual ordem e falsa.");
        }
      }
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === ctx.variant.impostor.key && state.stage === "IMPOSTOR_TALK") {
    const fight = turn >= turns(def, "impostorTurns", 3);
    await speak(
      channel,
      ctx.variant.impostor,
      playerMessage,
      fight
        ? "Ultima fala: perceba a emboscada, admita que o grupo cobra comerciantes usando o nome da vila e inicie combate."
        : "Exija a caixa e tente sustentar que sua ordem de cobranca e oficial, apesar de nao ter registro valido.",
      fight ? 2 : Math.min(turn - 1, 1),
    );
    if (fight) {
      state.stage = "FIGHT";
      state.activeNpc = null;
      state.combatStarted = true;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "confrontar_falsos_ninjas");
      await setState(inst.id, state);
      await startFalseNinjaCombatFromActor(channel, channelId, guildId, actor, inst.id, def, ctx.variant);
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === ctx.variant.victims.key && state.stage === "RETURN_MARKET") {
    const done = turn >= turns(def, "victimTurns", 2);
    await speak(
      channel,
      ctx.variant.victims,
      playerMessage,
      done
        ? "Ultima fala: confirme que todo o dinheiro roubado foi devolvido e agradeca ao time."
        : "Reconheca a caixa recuperada e confira os valores de cada comerciante.",
      done ? 1 : 0,
    );
    if (done) {
      state.stage = "RETURN_ADMIN";
      state.activeNpc = null;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "devolver_ryo_comerciantes");
      await setState(inst.id, state);
      if (channel && "send" in channel) {
        await channel.send(`Dinheiro devolvido. Volte para ${ctx.variant.administrationName}: <#${ctx.variant.administrationChannelId}>.`);
      }
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === ctx.variant.clerk.key && state.stage === "RETURN_ADMIN") {
    const done = turn >= turns(def, "reportTurns", 2);
    await speak(
      channel,
      ctx.variant.clerk,
      playerMessage,
      done
        ? "Ultima fala: registre a captura dos falsos ninjas, confirme que o dinheiro voltou aos comerciantes e encerre a missao."
        : "Receba o relatorio sobre as bandanas falsas, a ordem fraudulenta e a emboscada na rota.",
      3 + Math.min(turn - 1, 1),
    );
    if (done) {
      state.stage = "DONE";
      state.activeNpc = null;
      await markObjective(inst.id, "entregar_relatorio_falsos_ninjas");
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

function orderEmbed(state: FalseNinjasState, def: FalseNinjasContext["def"]): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle("Qual ordem e oficial?")
    .setDescription(
      [
        "**Regras de uma ordem verdadeira da vila:**",
        "- Possui numero no registro de missoes.",
        "- Usa selo oficial com sulco de chakra.",
        "- Nunca cobra taxa de protecao antecipada de civis.",
        "",
        "Escolha o documento autentico. Os outros dois foram produzidos pelos falsos ninjas.",
        `Erros: **${state.mistakes ?? 0}/${maxMistakes(def)}**`,
      ].join("\n"),
    );
}

function orderMenu(instanceId: string): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`false-ninjas:order:${instanceId}`)
      .setPlaceholder("Examinar as tres ordens")
      .addOptions([
        {
          label: "Ordem A - Patrulha registrada",
          description: "Registro C-184, selo com chakra e pagamento oficial apos o servico.",
          value: "official",
        },
        {
          label: "Ordem B - Taxa de protecao",
          description: "Sem registro, selo torto e cobranca antecipada dos comerciantes.",
          value: "fake_fee",
        },
        {
          label: "Ordem C - Inspecao emergencial",
          description: "Numero repetido, tinta comum e autorizacao para recolher ryo em especie.",
          value: "fake_inspection",
        },
      ]),
  );
}

async function startOrderCheck(
  channel: TextBasedChannel | null,
  instanceId: string,
  actorDiscordId: string,
): Promise<void> {
  if (!channel || !("send" in channel)) return;
  const inst = await getInstance(instanceId);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "FALSE_NINJAS") return;
  let state = ensureState(inst.stateJson);
  const variant = variantFor(def);
  const msg = await channel.send({ embeds: [orderEmbed(state, def)], components: [orderMenu(instanceId)] });

  while (state.stage === "ORDER_CHECK") {
    try {
      const pick = (await msg.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        time: stepTimeout(def),
        filter: (i: StringSelectMenuInteraction) =>
          i.user.id === actorDiscordId && i.customId === `false-ninjas:order:${instanceId}`,
      })) as StringSelectMenuInteraction;

      if (pick.values[0] !== "official") {
        state.mistakes = (state.mistakes ?? 0) + 1;
        if ((state.mistakes ?? 0) >= maxMistakes(def)) {
          await failFalseNinjas(instanceId, msg, "A ordem fraudulenta foi validada por engano e os criminosos desapareceram com outra cobranca.");
          return;
        }
        await setState(instanceId, state);
        await pick.update({ embeds: [orderEmbed(state, def)], components: [orderMenu(instanceId)] });
        continue;
      }

      state.stage = "TO_ROUTE";
      state.running = false;
      state.orderVerified = true;
      await markObjective(instanceId, "identificar_ordem_falsa");
      await setState(instanceId, state);
      await pick.update({
        embeds: [
          new EmbedBuilder()
            .setColor(0x2ecc71)
            .setTitle("Fraude confirmada")
            .setDescription(
              `A Ordem A e autentica. As outras duas comprovam a fraude. O grupo seguira para ${variant.routeName}: <#${variant.routeChannelId}>.`,
            ),
        ],
        components: [],
      });
      return;
    } catch {
      state.running = false;
      await setState(instanceId, state);
      await msg.edit({ components: [] }).catch(() => undefined);
      await channel.send("A analise expirou. Use `/mapa` para abrir os documentos novamente.");
      return;
    }
  }
}

function ambushEmbed(state: FalseNinjasState, def: FalseNinjasContext["def"], result?: string): EmbedBuilder {
  const step = AMBUSH_STEPS[state.ambushStep ?? 0];
  return new EmbedBuilder()
    .setColor(0x8e44ad)
    .setTitle("Preparar Emboscada na Rota")
    .setDescription(
      [
        `Preparativos: **${state.ambushStep ?? 0}/${AMBUSH_STEPS.length}**`,
        `Erros: **${state.mistakes ?? 0}/${maxMistakes(def)}**`,
        "",
        result ?? "",
        step ? `**${step.title}:** ${step.clue}` : "A armadilha esta pronta.",
      ].filter(Boolean).join("\n"),
    );
}

function ambushMenu(instanceId: string, state: FalseNinjasState): ActionRowBuilder<StringSelectMenuBuilder> {
  const step = AMBUSH_STEPS[state.ambushStep ?? 0]!;
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`false-ninjas:ambush:${instanceId}:${(state.ambushStep ?? 0) + 1}`)
      .setPlaceholder(step.title)
      .addOptions(step.options.map((option) => ({
        label: option.label,
        description: option.description,
        value: option.value,
      }))),
  );
}

async function startAmbushSetup(
  channel: TextBasedChannel | null,
  instanceId: string,
  actorDiscordId: string,
): Promise<void> {
  if (!channel || !("send" in channel)) return;
  const inst = await getInstance(instanceId);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "FALSE_NINJAS") return;
  let state = ensureState(inst.stateJson);
  const msg = await channel.send({ embeds: [ambushEmbed(state, def)], components: [ambushMenu(instanceId, state)] });

  while ((state.ambushStep ?? 0) < AMBUSH_STEPS.length) {
    const index = state.ambushStep ?? 0;
    const step = AMBUSH_STEPS[index]!;
    try {
      const pick = (await msg.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        time: stepTimeout(def),
        filter: (i: StringSelectMenuInteraction) =>
          i.user.id === actorDiscordId &&
          i.customId === `false-ninjas:ambush:${instanceId}:${index + 1}`,
      })) as StringSelectMenuInteraction;

      let result: string;
      if (pick.values[0] === step.correct) {
        state.ambushStep = index + 1;
        result = "**Preparativo correto.**";
      } else {
        state.mistakes = (state.mistakes ?? 0) + 1;
        result = "**Essa escolha colocaria civis, provas ou a rota de fuga em risco.**";
      }

      if ((state.mistakes ?? 0) >= maxMistakes(def)) {
        await failFalseNinjas(instanceId, msg, "A emboscada foi exposta e os falsos ninjas fugiram antes da captura.");
        return;
      }

      await setState(instanceId, state);
      const done = (state.ambushStep ?? 0) >= AMBUSH_STEPS.length;
      await pick.update({
        embeds: [ambushEmbed(state, def, result)],
        components: done ? [] : [ambushMenu(instanceId, state)],
      });
      if (done) break;
    } catch {
      state.running = false;
      await setState(instanceId, state);
      await msg.edit({ components: [] }).catch(() => undefined);
      await channel.send("A preparacao expirou. Use `/mapa` para retomar a emboscada.");
      return;
    }
  }

  state.stage = "IMPOSTOR_TALK";
  state.running = false;
  await markObjective(instanceId, "preparar_emboscada_falsos_ninjas");
  await setState(instanceId, state);
  await msg.edit({
    embeds: [
      new EmbedBuilder()
        .setColor(0xe67e22)
        .setTitle("Armadilha pronta")
        .setDescription("A caixa marcada esta posicionada e as saidas foram fechadas. Use `/mapa` para receber o grupo."),
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

async function startFalseNinjaCombatFromActor(
  channel: TextBasedChannel | null,
  channelId: string,
  guildId: string,
  actor: { id: string; username: string },
  instanceId: string,
  def: FalseNinjasContext["def"],
  variant: FalseNinjasVariant,
): Promise<void> {
  if (await getActiveSession(channelId)) return;
  const char = await getOrCreateCharacter(actor.id, guildId, actor.username);
  const { players, attrsById } = await gatherPartyPlayers(channel, guildId, starterFrom(char));
  const session = await startCombat({
    channelId,
    guildId,
    scenarioId: variant.routeScenarioId,
    players,
    npcs: [
      { templateId: captainTemplate(def) },
      { templateId: gruntTemplate(def) },
      { templateId: gruntTemplate(def) },
    ],
    missionInstanceId: instanceId,
  });
  await cacheAttrs(session, attrsById);
  if (channel && "send" in channel) {
    await channel.send(
      `Os falsos ninjas largam o disfarce! Um capitao e dois comparsas contra ${players.length} ninja(s). Use \`/mapa\`.`,
    );
  }
}

async function startFalseNinjaCombat(
  interaction: ChatInputCommandInteraction,
  ctx: FalseNinjasContext,
): Promise<void> {
  await startFalseNinjaCombatFromActor(
    interaction.channel,
    interaction.channelId,
    interaction.guildId ?? "global",
    interaction.user,
    ctx.inst.id,
    ctx.def,
    ctx.variant,
  );
}

async function failFalseNinjas(instanceId: string, msg: Message, reason: string): Promise<void> {
  await prisma.missionInstance.update({ where: { id: instanceId }, data: { status: "FAILED" } });
  await msg.edit({
    embeds: [new EmbedBuilder().setColor(0xc0392b).setTitle("Operacao fracassada").setDescription(reason)],
    components: [],
  }).catch(() => undefined);
}

export async function onFalseNinjasCombatWon(
  interaction: ChatInputCommandInteraction,
  instanceId: string,
): Promise<void> {
  const inst = await getInstance(instanceId);
  if (!inst || inst.status !== "ACTIVE") return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "FALSE_NINJAS") return;
  const state = ensureState(inst.stateJson);
  const variant = variantFor(def);
  state.stage = "RETURN_MARKET";
  state.combatStarted = false;
  state.activeNpc = null;
  await markObjective(inst.id, "derrotar_falsos_ninjas");
  await setState(inst.id, state);
  await interaction.followUp(
    `O dinheiro roubado e as bandanas falsas foram recuperados. Volte para ${variant.marketName}: <#${variant.marketChannelId}>.`,
  );
}

export function falseNinjasVariantIds(): string[] {
  return Object.keys(VARIANTS);
}
