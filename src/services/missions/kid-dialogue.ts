import type { Message, TextBasedChannel } from "discord.js";
import { sendAsPersona, formatPersonaLines } from "../discord/persona-webhook.js";
import { getPersona } from "../npc-ai/personas.js";
import { NpcAiService } from "../npc-ai/npc-ai-service.js";

const TIMEOUT_MS = 2 * 60 * 1000; // criança espera 2 min pela resposta
const PERSONA_KEY = "kid_tora";

interface KidState {
  timer: NodeJS.Timeout;
}
const active = new Map<string, KidState>();
const key = (channelId: string, userId: string) => `${channelId}:${userId}`;

function clear(channelId: string, userId: string): void {
  const s = active.get(key(channelId, userId));
  if (s) {
    clearTimeout(s.timer);
    active.delete(key(channelId, userId));
  }
}

async function kidLine(playerMessage: string, turn: number): Promise<string[]> {
  const r = await NpcAiService.respond({ personaKey: PERSONA_KEY, playerMessage, turn });
  return formatPersonaLines(r.text);
}

async function speak(channel: TextBasedChannel | null, lines: string[]): Promise<void> {
  const p = getPersona(PERSONA_KEY);
  await sendAsPersona(channel, {
    key: PERSONA_KEY,
    name: p?.displayName ?? "Dono do Tora",
    avatarFile: p?.avatarFile,
    lines,
  });
}

// Inicia o diálogo: a criança agradece. Espera 1 resposta do jogador (2 min).
export async function startKidDialogue(
  channel: TextBasedChannel | null,
  channelId: string,
  userId: string,
  playerName: string,
): Promise<void> {
  const lines = await kidLine(`O ninja ${playerName} acabou de te devolver o gato Tora.`, 0);
  await speak(channel, lines);
  clear(channelId, userId);
  const timer = setTimeout(() => active.delete(key(channelId, userId)), TIMEOUT_MS);
  active.set(key(channelId, userId), { timer });
}

// Trata a resposta do jogador: a criança responde uma vez e encerra. Retorna true se tratou.
export async function handleKidMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.guildId) return false;
  const k = key(message.channelId, message.author.id);
  if (!active.has(k)) return false;
  clear(message.channelId, message.author.id);
  const lines = await kidLine(message.content || "...", 1);
  await speak(message.channel, lines);
  return true;
}
