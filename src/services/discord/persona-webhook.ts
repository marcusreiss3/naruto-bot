import fs from "fs";
import path from "path";
import type { ActionRowBuilder, ButtonBuilder, Message, TextBasedChannel, Webhook } from "discord.js";
import { log } from "../../utils/logger.js";

const WEBHOOK_NAME = "RP Personas";
const webhookCache = new Map<string, Webhook>();
const lastPersona = new Map<string, string>(); // webhookId -> persona key

interface PersonaMessage {
  key: string; // chave única da persona (p/ trocar avatar só quando muda)
  name: string; // nome exibido
  avatarFile?: string; // caminho relativo dentro de assets/ (ex: enemies/x.png, npcs/y.png)
  lines: string[]; // linhas a enviar
  // Anexados so' na ultima linha enviada (ex: convite Aceitar/Recusar de um
  // mestre de estilo de luta — ver services/missions/mestre-estilo.ts).
  components?: ActionRowBuilder<ButtonBuilder>[];
}

// Envia mensagens como uma "persona" (estilo Tupperbox) via webhook do canal.
// Retorna false se não der (sem permissão/canal inválido) p/ o chamador fazer
// fallback; senão as Message enviadas (util pra anexar um awaitMessageComponent
// na ultima, quando `components` foi passado).
export async function sendAsPersona(
  channel: TextBasedChannel | null,
  msg: PersonaMessage,
): Promise<Message[] | false> {
  try {
    if (!channel || !("fetchWebhooks" in channel) || typeof channel.fetchWebhooks !== "function") {
      return false;
    }
    let hook = webhookCache.get(channel.id);
    if (!hook) {
      const hooks = await channel.fetchWebhooks();
      hook = hooks.find((h) => h.name === WEBHOOK_NAME && Boolean(h.token)) ?? undefined;
      if (!hook) hook = await channel.createWebhook({ name: WEBHOOK_NAME });
      webhookCache.set(channel.id, hook);
    }

    // ajusta nome/avatar do webhook só quando a persona muda
    if (lastPersona.get(hook.id) !== msg.key) {
      const editData: { name: string; avatar?: Buffer } = { name: msg.name };
      if (msg.avatarFile) {
        const p = path.join(process.cwd(), "assets", msg.avatarFile);
        try {
          editData.avatar = fs.readFileSync(p);
        } catch {
          /* sem avatar local: segue sem */
        }
      }
      await hook.edit(editData);
      lastPersona.set(hook.id, msg.key);
    }

    const sent: Message[] = [];
    for (let i = 0; i < msg.lines.length; i++) {
      const content = msg.lines[i]!.trim();
      if (!content) continue;
      const isLast = i === msg.lines.length - 1;
      sent.push(
        await hook.send({
          content: content.slice(0, 1900),
          username: msg.name,
          components: isLast ? msg.components : undefined,
        }),
      );
    }
    return sent;
  } catch (err) {
    log.warn("[persona-webhook] falhou:", (err as Error).message);
    return false;
  }
}

// Formata o texto da IA em até 2 linhas (fala/ação).
export function formatPersonaLines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 2);
}
