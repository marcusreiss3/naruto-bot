import type { ChatInputCommandInteraction, Message, TextBasedChannel } from "discord.js";
import { ENV, HAS_GROQ } from "../../config/env.js";
import { prisma } from "../../db/client.js";
import { CENTRO_COMERCIAL_CHANNEL_ID } from "../../data/scenarios/index.js";
import { getMission } from "../../data/missions/index.js";
import { sendMissionNotice } from "../../ui/mission-notice-v2.js";
import { log } from "../../utils/logger.js";
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

type VendorKey = "market_vendor_hina" | "market_vendor_aya";
const HINA_KEY: VendorKey = "market_vendor_hina";
const AYA_KEY: VendorKey = "market_vendor_aya";
const PAIR_KEY = "market_vendors";
const PAIR_PERSONA = "market_vendors_pair";

interface VendorDef {
  key: VendorKey;
  name: string;
  cell: string;
  imageFile: string;
  objectiveId: string;
}

const VENDORS: VendorDef[] = [
  {
    key: HINA_KEY,
    name: "Hina",
    cell: "C3",
    imageFile: "npcs/market_vendor_hina.png",
    objectiveId: "ouvir_hina",
  },
  {
    key: AYA_KEY,
    name: "Aya",
    cell: "C7",
    imageFile: "npcs/market_vendor_aya.png",
    objectiveId: "ouvir_aya",
  },
];

export interface MarketMediationState {
  stage?: "GATHER" | "MEDIATE" | "DONE";
  activeNpc?: VendorKey | typeof PAIR_KEY | null;
  turns?: Partial<Record<VendorKey | typeof PAIR_KEY, number>>;
  heard?: Partial<Record<VendorKey, boolean>>;
  mediationActions?: number;
}

export interface MarketMediationChoice {
  key: string;
  name: string;
}

interface MarketMediationContext {
  inst: NonNullable<Awaited<ReturnType<typeof getInstance>>>;
  def: NonNullable<ReturnType<typeof getMission>>;
  ownerCharId: string;
}

function ensureState(raw: string): MarketMediationState {
  const state = readState<MarketMediationState>(raw);
  state.stage = state.stage ?? "GATHER";
  state.activeNpc = state.activeNpc ?? null;
  state.turns = state.turns ?? {};
  state.heard = state.heard ?? {};
  state.mediationActions = state.mediationActions ?? 0;
  return state;
}

function vendorByKey(key: string): VendorDef | undefined {
  return VENDORS.find((v) => v.key === key);
}

function vendorTurns(def: MarketMediationContext["def"]): number {
  return Number(def.data?.vendorTurns ?? 2);
}

function maxMediationActions(def: MarketMediationContext["def"]): number {
  return Number(def.data?.maxMediationActions ?? 5);
}

async function findContextByCharId(charId: string): Promise<MarketMediationContext | null> {
  const c = await getActiveInstanceByType(charId, "MARKET_MEDIATION");
  if (!c) return null;
  return { inst: c.inst, def: c.def, ownerCharId: charId };
}

export async function resolveMarketMediation(discordId: string, guildId: string): Promise<MarketMediationContext | null> {
  const own = await prisma.userCharacter.findUnique({
    where: { discordId_guildId: { discordId, guildId } },
    select: { id: true },
  });
  return own ? findContextByCharId(own.id) : null;
}

export function availableMarketMediationNpcs(
  state: MarketMediationState,
  channelId: string,
): MarketMediationChoice[] {
  if (channelId !== CENTRO_COMERCIAL_CHANNEL_ID) return [];
  if ((state.stage ?? "GATHER") === "MEDIATE") return [{ key: PAIR_KEY, name: "Vendedores do Mercado (mediar)" }];
  if (state.stage === "DONE") return [];
  if (state.activeNpc) {
    if (state.activeNpc === PAIR_KEY) return [{ key: PAIR_KEY, name: "Vendedores do Mercado (mediar)" }];
    const active = vendorByKey(state.activeNpc);
    return active ? [{ key: active.key, name: active.name }] : [];
  }
  return VENDORS.filter((v) => !state.heard?.[v.key]).map((v) => ({ key: v.key, name: v.name }));
}

export async function marketMediationMapHandle(
  interaction: ChatInputCommandInteraction,
  ctx: MarketMediationContext,
  entities: RenderEntity[],
): Promise<string | null> {
  if (interaction.channelId !== CENTRO_COMERCIAL_CHANNEL_ID) return null;
  const state = ensureState(ctx.inst.stateJson);
  if (state.stage === "DONE") return null;

  await markObjective(ctx.inst.id, "chegar_mercado");
  entities.push(...marketEntities(state));
  await setState(ctx.inst.id, state);

  if (state.stage === "MEDIATE") {
    return `\nMissao ativa: **${ctx.def.name}** - os dois lados foram ouvidos. Use \`/interagir npc\` para mediar a briga. Qualquer agressao falha a missao.`;
  }
  const heard = VENDORS.filter((v) => state.heard?.[v.key]).length;
  return `\nMissao ativa: **${ctx.def.name}** - ouca os vendedores com \`/interagir npc\`. Depoimentos: **${heard}/2**. Qualquer agressao falha a missao.`;
}

function marketEntities(state: MarketMediationState): RenderEntity[] {
  return VENDORS.map((vendor) => ({
    cell: vendor.cell,
    name: vendor.name,
    label: vendor.name.slice(0, 3),
    color: state.heard?.[vendor.key] ? "#2ecc71" : "#e74c3c",
    kind: "NPC",
    imageFile: vendor.imageFile,
    badge: state.heard?.[vendor.key] ? "OK" : "!",
  }));
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

export async function interactMarketMediation(interaction: ChatInputCommandInteraction, npcKey: string): Promise<void> {
  const guildId = interaction.guildId ?? "global";
  const ctx = await resolveMarketMediation(interaction.user.id, guildId);
  if (!ctx) {
    await interaction.reply({ content: "Voce nao tem essa missao ativa.", ephemeral: true });
    return;
  }
  const state = ensureState(ctx.inst.stateJson);
  const choice = availableMarketMediationNpcs(state, interaction.channelId).find((n) => n.key === npcKey);
  if (!choice) {
    await interaction.reply({ content: "Esse NPC nao esta disponivel para essa missao aqui.", ephemeral: true });
    return;
  }
  if (state.activeNpc && state.activeNpc !== npcKey) {
    await interaction.reply({ content: "Termine a conversa atual antes de falar com outro vendedor.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  state.activeNpc = npcKey as MarketMediationState["activeNpc"];
  await setState(ctx.inst.id, state);
  await runMarketDialogue(interaction.channel, ctx, npcKey, "(o ninja se aproxima para conter a discussao)");
  await interaction.editReply(`Voce se aproxima de **${choice.name}**. Continue por mensagens normais no canal.`);
}

export async function continueMarketMediationMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.guildId || message.channelId !== CENTRO_COMERCIAL_CHANNEL_ID) return false;
  const ctx = await resolveMarketMediation(message.author.id, message.guildId);
  if (!ctx) return false;
  const state = ensureState(ctx.inst.stateJson);
  if (!state.activeNpc) return false;
  if (!availableMarketMediationNpcs(state, message.channelId).some((n) => n.key === state.activeNpc)) return false;
  await runMarketDialogue(message.channel, ctx, state.activeNpc, message.content || "...");
  return true;
}

async function runMarketDialogue(
  channel: TextBasedChannel | null,
  ctx: MarketMediationContext,
  npcKey: string,
  playerMessage: string,
): Promise<void> {
  const inst = await getInstance(ctx.inst.id);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "MARKET_MEDIATION") return;
  const state = ensureState(inst.stateJson);

  if (isAggressive(playerMessage)) {
    await failMarketMission(inst.id, channel, "A mediacao virou agressao. Os vendedores chamaram a guarda do mercado.");
    return;
  }

  const vendor = vendorByKey(npcKey);
  if (vendor && state.stage === "GATHER") {
    const turn = (state.turns![vendor.key] ?? 0) + 1;
    state.turns![vendor.key] = turn;
    const done = turn >= vendorTurns(def);
    await speak(
      channel,
      vendor.key,
      playerMessage,
      done
        ? "Esta e sua ultima fala deste depoimento: entregue sua pista principal e aceite esperar a mediacao."
        : "Explique sua acusacao com irritacao, mas responda ao jogador sem partir para agressao.",
      Math.min(turn - 1, 2),
    );
    if (done) {
      state.heard![vendor.key] = true;
      state.activeNpc = null;
      await markObjective(inst.id, vendor.objectiveId);
      if (VENDORS.every((v) => state.heard?.[v.key])) {
        state.stage = "MEDIATE";
        if (channel && "send" in channel) {
          await sendMissionNotice(channel, {
            kind: "descoberta",
            title: "Os dois lados foram ouvidos",
            description: "Os argumentos dos vendedores já podem ser comparados antes da mediação.",
            items: ["Use `/interagir npc` para reunir os envolvidos e mediar a disputa."],
            itemsTitle: "Próximo passo",
          });
        }
      }
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === PAIR_KEY && state.stage === "MEDIATE") {
    state.mediationActions = (state.mediationActions ?? 0) + 1;
    const passed = await judgeMediation(playerMessage);
    if (passed) {
      state.stage = "DONE";
      state.activeNpc = null;
      await markObjective(inst.id, "resolver_conversa");
      await setState(inst.id, state);
      await speak(
        channel,
        PAIR_PERSONA,
        playerMessage,
        "A proposta do jogador e pacifica e razoavel. Revele que a bolsa estava atras de uma caixa e encerre com acordo entre Hina e Aya.",
        2,
      );
      const result = await completeMission(inst.charId, inst.missionId);
      if (result && channel && "send" in channel) {
        await channel.send({ embeds: [buildMissionCompleteEmbed(def.name, result.rewards)] });
      }
      return;
    }

    await speak(
      channel,
      PAIR_PERSONA,
      playerMessage,
      "A tentativa ainda nao resolveu. Os vendedores continuam discutindo, mas de uma pista de que checar caixas, ouvir ambos e pedir desculpas ajudaria.",
      Math.min(state.mediationActions ?? 1, 1),
    );
    if ((state.mediationActions ?? 0) >= maxMediationActions(def)) {
      await failMarketMission(inst.id, channel, "A discussao se arrastou e os vendedores se recusaram a continuar ouvindo.");
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

function isAggressive(message: string): boolean {
  const t = normalize(message);
  return /\b(bato|bater|soco|socar|chute|chutar|agarr|imobiliz|derrub|empurr|ameac|matar|machuc|quebro|quebrar|ataco|atacar|jutsu|kunai|shuriken|arma|espanco|surra|forca|forcar|prendo|prender|algema|tortur|intimid)\b/.test(t);
}

function fallbackMediation(message: string): boolean {
  const t = normalize(message);
  const calm = /\b(calma|acalmar|conversa|dialog|ouvir|escutar|sem acusar|sem briga|paz|medi)\b/.test(t);
  const facts = /\b(prova|pista|caixa|balcao|retalho|tecido|menino|cliente|testemunha|procur|verificar|checar|revisar|bolsa)\b/.test(t);
  const repair = /\b(desculp|acordo|devolver|compens|dividir|resolver|achou|encontr|atras)\b/.test(t);
  return (calm && facts) || (facts && repair);
}

async function judgeMediation(message: string): Promise<boolean> {
  if (!HAS_GROQ) return fallbackMediation(message);
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ENV.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: ENV.GROQ_MODEL,
        max_tokens: 8,
        temperature: 0,
        messages: [
          {
            role: "system",
            content: [
              "Voce valida uma acao de mediacao entre dois vendedores em um RPG de Naruto.",
              "Responda somente PASSA ou FALHA.",
              "PASSA se a acao for pacifica, ouvir os dois lados, buscar pistas/provas, propor desculpas/acordo ou checar onde a bolsa sumiu.",
              "FALHA se nao resolver a conversa, for vaga demais, acusar sem prova ou sugerir coerção.",
            ].join(" "),
          },
          { role: "user", content: message.slice(0, 500) },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Groq HTTP ${res.status}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const verdict = data.choices?.[0]?.message?.content?.toUpperCase() ?? "";
    if (verdict.includes("PASSA")) return true;
    if (verdict.includes("FALHA")) return false;
  } catch (err) {
    log.warn("Groq falhou (market mediation judge), usando fallback:", (err as Error).message);
  }
  return fallbackMediation(message);
}

async function failMarketMission(
  instanceId: string,
  channel: TextBasedChannel | null,
  reason: string,
): Promise<void> {
  await prisma.missionInstance.update({ where: { id: instanceId }, data: { status: "FAILED" } });
  if (channel && "send" in channel) {
    await channel.send(`Missao falhou: ${reason} Peca a um admin para reatribuir se quiser tentar de novo.`);
  }
}
