import type { ChatInputCommandInteraction, Message, TextBasedChannel } from "discord.js";
import { prisma } from "../../db/client.js";
import { getMission } from "../../data/missions/index.js";
import {
  getActiveBanditInstance,
  getInstance,
  markObjective,
  readState,
  setState,
} from "./mission-service.js";
import { partyMemberIds } from "../party/party-service.js";
import { NpcAiService } from "../npc-ai/npc-ai-service.js";
import { getPersona } from "../npc-ai/personas.js";
import { sendAsPersona, formatPersonaLines } from "../discord/persona-webhook.js";
import type { RenderEntity } from "../maps/renderer.js";

// Estado da missão dos bandidos (etapas). Campos opcionais => valores default.
export interface BanditState {
  stage?: "INVESTIGATE" | "FOREST" | "FIGHT";
  clues?: { merchant: boolean; kid: boolean };
  npcTurns?: Record<string, number>;
  activeNpc?: string | null;
  combatStarted?: boolean;
  dialogue?: number;
}

interface InvestNpc {
  key: string;
  name: string;
  cell: string;
  imageFile: string; // relativo a assets/
  persona: string;
  clue: "merchant" | "kid";
  objective: string;
  reveal: string; // instrução de revelação na última fala
}

export const INVEST_NPCS: InvestNpc[] = [
  {
    key: "mercador",
    name: "Mercador",
    cell: "C3",
    imageFile: "npcs/merchant-konoha.png",
    persona: "merchant_konoha",
    clue: "merchant",
    objective: "pista_mercador",
    reveal:
      "Esta é sua ÚLTIMA fala: revele CLARAMENTE agora que os roubos sempre acontecem na ROTA OFICIAL que os comerciantes fazem pela FLORESTA.",
  },
  {
    key: "crianca",
    name: "Criança",
    cell: "D7",
    imageFile: "npcs/kid-girl.png",
    persona: "kid_witness",
    clue: "kid",
    objective: "pista_crianca",
    reveal:
      "Esta é sua ÚLTIMA fala: revele CLARAMENTE agora que você viu VÁRIOS homens estranhos e assustadores comprando MUITAS CORDAS, e que eles fizeram seus amigos chorar.",
  },
];
const HINT = "Apenas dê uma dica vaga e enrole; NÃO revele o segredo ainda.";

function npcByKey(k: string): InvestNpc | undefined {
  return INVEST_NPCS.find((n) => n.key === k);
}

function ensureState(raw: string): BanditState {
  const s = readState<BanditState>(raw);
  s.stage = s.stage ?? "INVESTIGATE";
  s.clues = s.clues ?? { merchant: false, kid: false };
  s.npcTurns = s.npcTurns ?? {};
  s.activeNpc = s.activeNpc ?? null;
  return s;
}

export interface BanditContext {
  inst: NonNullable<Awaited<ReturnType<typeof getInstance>>>;
  def: NonNullable<ReturnType<typeof getMission>>;
  ownerCharId: string;
}

// Acha a missão de bandidos do usuário (própria ou de um membro da party).
export async function resolveBandit(
  discordId: string,
  guildId: string,
): Promise<BanditContext | null> {
  const own = await prisma.userCharacter.findUnique({
    where: { discordId_guildId: { discordId, guildId } },
    select: { id: true },
  });
  if (own) {
    const c = await getActiveBanditInstance(own.id);
    if (c) return { inst: c.inst, def: c.def, ownerCharId: own.id };
  }
  for (const did of await partyMemberIds(guildId, discordId)) {
    if (did === discordId) continue;
    const uc = await prisma.userCharacter.findUnique({
      where: { discordId_guildId: { discordId: did, guildId } },
      select: { id: true },
    });
    if (!uc) continue;
    const c = await getActiveBanditInstance(uc.id);
    if (c) return { inst: c.inst, def: c.def, ownerCharId: uc.id };
  }
  return null;
}

// Entidades dos NPCs da investigação para o /mapa (com aparências).
export function investigationMapEntities(): RenderEntity[] {
  return INVEST_NPCS.map((n) => ({
    cell: n.cell,
    name: n.name,
    label: n.name.slice(0, 3),
    color: "#d35400",
    kind: "NPC",
    imageFile: n.imageFile,
  }));
}

// NPCs ainda sem pista (para o autocomplete do /interagir).
export function availableNpcs(state: BanditState): InvestNpc[] {
  return INVEST_NPCS.filter((n) => !state.clues?.[n.clue]);
}

// Conduz uma fala do NPC (dica ou revelação). Marca pista/etapa quando revela.
async function runNpcDialogue(
  channel: TextBasedChannel | null,
  instId: string,
  npc: InvestNpc,
  playerMessage: string,
): Promise<void> {
  const inst = await getInstance(instId);
  if (!inst) return;
  const def = getMission(inst.missionId);
  const state = ensureState(inst.stateJson);
  const maxTurns = Number(def?.data?.npcMaxTurns ?? 3);

  const turn = (state.npcTurns![npc.key] ?? 0) + 1;
  state.npcTurns![npc.key] = turn;
  const reveal = turn >= maxTurns;

  const text = await NpcAiService.say(
    npc.persona,
    playerMessage,
    reveal ? npc.reveal : HINT,
    reveal ? 2 : Math.min(turn - 1, 1),
  );
  const persona = getPersona(npc.persona);
  await sendAsPersona(channel, {
    key: npc.persona,
    name: persona?.displayName ?? npc.name,
    avatarFile: persona?.avatarFile,
    lines: formatPersonaLines(text),
  });

  if (!reveal) {
    await setState(instId, state);
    return;
  }

  // revelou a pista
  state.clues![npc.clue] = true;
  state.activeNpc = null;
  state.npcTurns![npc.key] = 0;
  await markObjective(instId, npc.objective);

  const got = (state.clues!.merchant ? 1 : 0) + (state.clues!.kid ? 1 : 0);
  let note = `🔍 **Pista ${got}/2 descoberta!**`;
  if (state.clues!.merchant && state.clues!.kid) {
    state.stage = "FOREST";
    note +=
      "\n✅ Vocês juntaram as pistas: são **vários bandidos** atacando na **rota da Floresta**.\nVão até a **Floresta** e usem `/mapa` para enfrentá-los!";
  } else {
    note += `\nFale com ${state.clues!.merchant ? "a **Criança**" : "o **Mercador**"} para a próxima pista (\`/interagir npc\`).`;
  }
  await setState(instId, state);
  if (channel && "send" in channel) await channel.send(note);
}

// Comando /interagir npc: inicia a conversa com um NPC da investigação.
export async function interactNpc(interaction: ChatInputCommandInteraction, npcKey: string): Promise<void> {
  const guildId = interaction.guildId ?? "global";
  const ctx = await resolveBandit(interaction.user.id, guildId);
  if (!ctx) {
    await interaction.reply({ content: "❌ Você (ou sua party) não tem a missão dos bandidos ativa.", ephemeral: true });
    return;
  }
  if (interaction.channelId !== ctx.def.channelId) {
    await interaction.reply({ content: "❌ Use isso no **Centro Comercial de Konoha**.", ephemeral: true });
    return;
  }
  const state = ensureState(ctx.inst.stateJson);
  if (state.stage !== "INVESTIGATE") {
    await interaction.reply({ content: "❌ A fase de investigação já terminou.", ephemeral: true });
    return;
  }
  const npc = npcByKey(npcKey);
  if (!npc) {
    await interaction.reply({ content: "❌ NPC inválido.", ephemeral: true });
    return;
  }
  if (state.clues![npc.clue]) {
    await interaction.reply({ content: `ℹ️ Você já obteve a pista de **${npc.name}**.`, ephemeral: true });
    return;
  }
  if (state.activeNpc && state.activeNpc !== npcKey) {
    const other = npcByKey(state.activeNpc);
    await interaction.reply({
      content: `❌ Já estão conversando com **${other?.name ?? "outro NPC"}**. Terminem essa conversa antes.`,
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  state.activeNpc = npcKey;
  await setState(ctx.inst.id, state);
  await runNpcDialogue(interaction.channel, ctx.inst.id, npc, "(o ninja se aproxima para conversar)");
  await interaction.editReply(`💬 Você se aproxima de **${npc.name}**. Continue a conversa por mensagens normais no canal.`);
}

// Continua a conversa pela mensagem normal no canal. Retorna true se tratou.
export async function continueInvestigationMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.guildId) return false;
  const ctx = await resolveBandit(message.author.id, message.guildId);
  if (!ctx) return false;
  if (message.channelId !== ctx.def.channelId) return false;
  const state = ensureState(ctx.inst.stateJson);
  if (state.stage !== "INVESTIGATE" || !state.activeNpc) return false;
  const npc = npcByKey(state.activeNpc);
  if (!npc) return false;
  await runNpcDialogue(message.channel, ctx.inst.id, npc, message.content || "...");
  return true;
}

// Marca que o jogador chegou ao centro comercial (objetivo ir_centro).
export async function onCommercialMap(instId: string): Promise<void> {
  const inst = await getInstance(instId);
  if (!inst) return;
  const state = ensureState(inst.stateJson);
  await markObjective(instId, "ir_centro");
  await setState(instId, state);
}
