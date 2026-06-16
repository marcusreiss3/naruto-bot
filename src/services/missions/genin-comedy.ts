import type { ChatInputCommandInteraction, Message, TextBasedChannel } from "discord.js";
import { ENV, HAS_GROQ } from "../../config/env.js";
import { prisma } from "../../db/client.js";
import { ACADEMIA_GENIN_CHANNEL_ID } from "../../data/scenarios/index.js";
import { getMission } from "../../data/missions/index.js";
import { log } from "../../utils/logger.js";
import { partyMemberIds } from "../party/party-service.js";
import { NpcAiService } from "../npc-ai/npc-ai-service.js";
import { getPersona } from "../npc-ai/personas.js";
import { sendAsPersona, formatPersonaLines } from "../discord/persona-webhook.js";
import {
  completeMission,
  getActiveInstanceByType,
  getInstance,
  markObjective,
  readState,
  setState,
} from "./mission-service.js";
import type { RenderEntity } from "../maps/renderer.js";

type ChildKey = "genin_hana" | "genin_ren" | "genin_mika";

interface GeninChild {
  key: ChildKey;
  name: string;
  cell: string;
  imageFile: string;
  objectiveId: string;
  taste: string;
  clue: string;
  successWords: string[];
}

const CHILDREN: GeninChild[] = [
  {
    key: "genin_hana",
    name: "Hana",
    cell: "C3",
    imageFile: "npcs/genin-hana.png",
    objectiveId: "agradar_hana",
    taste: "comedia fisica, caretas, tombo falso, trapalhada visual e exagero bobo",
    clue: "Hana gosta de caretas e quedas falsas bem dramaticas.",
    successWords: ["careta", "tombo", "queda", "cair", "caio", "escorrego", "tropec", "palhaco", "cambalhota", "trapalh"],
  },
  {
    key: "genin_ren",
    name: "Ren",
    cell: "C7",
    imageFile: "npcs/genin-ren.png",
    objectiveId: "agradar_ren",
    taste: "piadas inteligentes, charadas, trocadilhos, viradas e humor com palavras",
    clue: "Ren gosta de charadas, trocadilhos e piadas ninja espertas.",
    successWords: ["trocadilho", "charada", "piada", "enigma", "palavra", "virada", "pergunta", "resposta", "inteligente"],
  },
  {
    key: "genin_mika",
    name: "Mika",
    cell: "E5",
    imageFile: "npcs/genin-mika.png",
    objectiveId: "agradar_mika",
    taste: "cena heroica exagerada, pose ninja dramatica, narracao epica que vira piada",
    clue: "Mika gosta de pose heroica ninja, drama exagerado e final engracado.",
    successWords: ["heroi", "heroica", "pose", "dramatic", "epic", "ninja", "salvo", "salvar", "jutsu", "coragem", "secreta"],
  },
];

export interface GeninComedyState {
  activeNpc?: ChildKey | null;
  passed?: Partial<Record<ChildKey, boolean>>;
  clues?: Partial<Record<ChildKey, boolean>>;
  attempts?: Partial<Record<ChildKey, number>>;
  totalActions?: number;
}

export interface GeninComedyChoice {
  key: ChildKey;
  name: string;
}

interface GeninComedyContext {
  inst: NonNullable<Awaited<ReturnType<typeof getInstance>>>;
  def: NonNullable<ReturnType<typeof getMission>>;
  ownerCharId: string;
}

function childByKey(key: string): GeninChild | undefined {
  return CHILDREN.find((c) => c.key === key);
}

function ensureState(raw: string): GeninComedyState {
  const state = readState<GeninComedyState>(raw);
  state.activeNpc = state.activeNpc ?? null;
  state.passed = state.passed ?? {};
  state.clues = state.clues ?? {};
  state.attempts = state.attempts ?? {};
  state.totalActions = state.totalActions ?? 0;
  return state;
}

function maxActions(def: GeninComedyContext["def"]): number {
  return Number(def.data?.maxActions ?? 15);
}

function maxChildActions(def: GeninComedyContext["def"]): number {
  return Number(def.data?.maxChildActions ?? 5);
}

async function findContextByCharId(charId: string): Promise<GeninComedyContext | null> {
  const c = await getActiveInstanceByType(charId, "GENIN_COMEDY");
  if (!c) return null;
  return { inst: c.inst, def: c.def, ownerCharId: charId };
}

export async function resolveGeninComedy(discordId: string, guildId: string): Promise<GeninComedyContext | null> {
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

export function availableGeninComedyNpcs(state: GeninComedyState, channelId: string): GeninComedyChoice[] {
  if (channelId !== ACADEMIA_GENIN_CHANNEL_ID) return [];
  if (state.activeNpc) {
    const active = childByKey(state.activeNpc);
    return active && !state.passed?.[active.key] ? [{ key: active.key, name: active.name }] : [];
  }
  return CHILDREN
    .filter((c) => !state.passed?.[c.key])
    .map((c) => ({ key: c.key, name: c.name }));
}

export async function geninComedyMapHandle(
  interaction: ChatInputCommandInteraction,
  ctx: GeninComedyContext,
  entities: RenderEntity[],
): Promise<string | null> {
  if (interaction.channelId !== ACADEMIA_GENIN_CHANNEL_ID) return null;
  const state = ensureState(ctx.inst.stateJson);
  await markObjective(ctx.inst.id, "ir_academia");
  await setState(ctx.inst.id, state);
  entities.push(...geninComedyEntities(state));
  const done = CHILDREN.filter((c) => state.passed?.[c.key]).length;
  const left = Math.max(0, maxActions(ctx.def) - (state.totalActions ?? 0));
  return `\nMissao ativa: **${ctx.def.name}** - entretenha as criancas com \`/interagir npc\`. Progresso: **${done}/3**. Acoes restantes: **${left}**.`;
}

function geninComedyEntities(state: GeninComedyState): RenderEntity[] {
  return CHILDREN.map((child) => ({
    cell: child.cell,
    name: child.name,
    label: child.name.slice(0, 3),
    color: state.passed?.[child.key] ? "#2ecc71" : "#f1c40f",
    kind: "NPC",
    imageFile: child.imageFile,
    badge: state.passed?.[child.key] ? "OK" : undefined,
  }));
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function pressureIntent(text: string): boolean {
  const t = normalize(text);
  return /\b(pression|insist|pergunt|question|observo|observar|investig|provoc|cutuc|tento entender|qual seu gosto|do que voce gosta|do que gosta|prefere)\b/.test(t);
}

function fallbackJudge(child: GeninChild, message: string, clueRevealed: boolean): boolean {
  const t = normalize(message);
  if (child.successWords.some((word) => t.includes(normalize(word)))) return true;
  if (clueRevealed && t.includes("engrac") && t.length >= 25) return true;
  return false;
}

async function judgeComedyAction(child: GeninChild, message: string, clueRevealed: boolean): Promise<boolean> {
  if (!HAS_GROQ) return fallbackJudge(child, message, clueRevealed);
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
              "Voce valida uma acao de peca de comedia para uma crianca genin.",
              `Crianca: ${child.name}. Gosto: ${child.taste}.`,
              "Responda somente PASSA ou FALHA.",
              "Passe se a acao claramente tenta agradar esse gosto, mesmo simples.",
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
    log.warn("Groq falhou (genin comedy judge), usando fallback:", (err as Error).message);
  }
  return fallbackJudge(child, message, clueRevealed);
}

async function speak(channel: TextBasedChannel | null, child: GeninChild, extra: string, message: string, fallbackIndex: number): Promise<void> {
  const text = await NpcAiService.say(child.key, message, extra, fallbackIndex);
  const persona = getPersona(child.key);
  const sent = await sendAsPersona(channel, {
    key: child.key,
    name: persona?.displayName ?? child.name,
    avatarFile: persona?.avatarFile,
    lines: formatPersonaLines(text),
  });
  if (!sent && channel && "send" in channel) await channel.send(text.slice(0, 1900));
}

export async function interactGeninComedy(interaction: ChatInputCommandInteraction, npcKey: string): Promise<void> {
  const guildId = interaction.guildId ?? "global";
  const ctx = await resolveGeninComedy(interaction.user.id, guildId);
  if (!ctx) {
    await interaction.reply({ content: "Voce (ou sua party) nao tem essa missao ativa.", ephemeral: true });
    return;
  }
  if (interaction.channelId !== ACADEMIA_GENIN_CHANNEL_ID) {
    await interaction.reply({ content: "Use isso na **Academia Genin**.", ephemeral: true });
    return;
  }
  const state = ensureState(ctx.inst.stateJson);
  const child = childByKey(npcKey);
  if (!child || state.passed?.[child.key]) {
    await interaction.reply({ content: "Essa crianca nao esta disponivel agora.", ephemeral: true });
    return;
  }
  if (state.activeNpc && state.activeNpc !== child.key) {
    const active = childByKey(state.activeNpc);
    await interaction.reply({ content: `Termine a cena com **${active?.name ?? "a crianca atual"}** primeiro.`, ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  state.activeNpc = child.key;
  await setState(ctx.inst.id, state);
  await speak(
    interaction.channel,
    child,
    "O jogador se aproximou para comecar uma cena de comedia. Mostre seu comportamento e de uma pista sutil do seu gosto, sem revelar totalmente.",
    "(o ninja entra no palco improvisado)",
    0,
  );
  await interaction.editReply(`Voce comeca a cena com **${child.name}**. Continue com mensagens normais no canal.`);
}

export async function continueGeninComedyMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.guildId || message.channelId !== ACADEMIA_GENIN_CHANNEL_ID) return false;
  const ctx = await resolveGeninComedy(message.author.id, message.guildId);
  if (!ctx) return false;
  const state = ensureState(ctx.inst.stateJson);
  if (!state.activeNpc) return false;
  const child = childByKey(state.activeNpc);
  if (!child || state.passed?.[child.key]) return false;

  state.totalActions = (state.totalActions ?? 0) + 1;
  state.attempts![child.key] = (state.attempts![child.key] ?? 0) + 1;

  if (pressureIntent(message.content || "")) {
    state.clues![child.key] = true;
    await setState(ctx.inst.id, state);
    await speak(
      message.channel,
      child,
      `O jogador pressionou/insistiu para entender seu gosto. Revele esta pista de forma natural: ${child.clue}`,
      message.content || "...",
      1,
    );
    await maybeFail(message.channel, ctx, state, child);
    return true;
  }

  const passed = await judgeComedyAction(child, message.content || "", Boolean(state.clues?.[child.key]));
  if (passed) {
    state.passed![child.key] = true;
    state.activeNpc = null;
    await markObjective(ctx.inst.id, child.objectiveId);
    await setState(ctx.inst.id, state);
    await speak(
      message.channel,
      child,
      "A acao agradou a crianca. Aprove com entusiasmo e diga que ela gostou da peca.",
      message.content || "...",
      2,
    );
    await maybeComplete(message.channel, ctx, state);
    return true;
  }

  await setState(ctx.inst.id, state);
  await speak(
    message.channel,
    child,
    "A acao ainda nao agradou. Reaja sem crueldade e de uma dica sutil do que voce gostaria.",
    message.content || "...",
    3,
  );
  await maybeFail(message.channel, ctx, state, child);
  return true;
}

async function maybeComplete(channel: TextBasedChannel | null, ctx: GeninComedyContext, state: GeninComedyState): Promise<void> {
  if (!CHILDREN.every((child) => state.passed?.[child.key])) {
    const next = CHILDREN.find((child) => !state.passed?.[child.key]);
    if (next && channel && "send" in channel) await channel.send(`Teste de **${next.name}** ainda falta. Use \`/interagir npc\`.`);
    return;
  }
  const result = await completeMission(ctx.ownerCharId, ctx.def.id);
  if (result && channel && "send" in channel) {
    await channel.send(`Missao concluida: **${ctx.def.name}**!\nRecompensas: ${result.rewards.xp} XP, ${result.rewards.ryo} ryo.`);
  }
}

async function maybeFail(
  channel: TextBasedChannel | null,
  ctx: GeninComedyContext,
  state: GeninComedyState,
  child: GeninChild,
): Promise<void> {
  const overTotal = (state.totalActions ?? 0) >= maxActions(ctx.def);
  const overChild = (state.attempts?.[child.key] ?? 0) >= maxChildActions(ctx.def);
  if (!overTotal && !overChild) return;
  await prisma.missionInstance.update({ where: { id: ctx.inst.id }, data: { status: "FAILED" } });
  if (channel && "send" in channel) {
    await channel.send(
      `Missao reprovada: as criancas perderam o interesse na peca. Peca a um admin para reatribuir \`${ctx.def.id}\` se quiser tentar de novo.`,
    );
  }
}
