import { ENV, HAS_GROQ } from "../../config/env.js";
import { log } from "../../utils/logger.js";
import { getPersona } from "./personas.js";

export interface NpcAiRequest {
  personaKey: string;
  playerMessage: string;
  turn: number; // numero da troca (0-based)
}

export interface NpcAiResult {
  text: string;
  forceCombat: boolean; // sinaliza que o combate deve comecar
  source: "groq" | "fallback";
}

const MAX_TURNS = 3;

export const NpcAiService = {
  async respond(req: NpcAiRequest): Promise<NpcAiResult> {
    const persona = getPersona(req.personaKey);
    const forceCombat = req.turn >= MAX_TURNS - 1;

    if (!persona) {
      return { text: "...", forceCombat, source: "fallback" };
    }

    if (HAS_GROQ) {
      try {
        const sys = forceCombat
          ? `${persona.systemPrompt}\nEsta e a ultima troca: encerre a conversa e force o combate agora.`
          : persona.systemPrompt;
        const text = await callGroq(sys, req.playerMessage);
        return { text, forceCombat, source: "groq" };
      } catch (err) {
        log.warn("Groq falhou, usando fallback:", (err as Error).message);
      }
    }

    // fallback roteirizado local
    const line =
      persona.fallbackLines[Math.min(req.turn, persona.fallbackLines.length - 1)] ??
      persona.fallbackLines[persona.fallbackLines.length - 1]!;
    return { text: line, forceCombat, source: "fallback" };
  },

  // Fala genérica de uma persona com instrução extra opcional (ex: revelar pista).
  // Retorna o texto e se veio da IA ou do fallback.
  async say(
    personaKey: string,
    playerMessage: string,
    systemExtra?: string,
    fallbackIndex = 0,
  ): Promise<string> {
    const persona = getPersona(personaKey);
    if (!persona) return "...";
    if (HAS_GROQ) {
      try {
        const sys = systemExtra ? `${persona.systemPrompt}\n${systemExtra}` : persona.systemPrompt;
        return await callGroq(sys, playerMessage);
      } catch (err) {
        log.warn("Groq falhou (say), usando fallback:", (err as Error).message);
      }
    }
    return (
      persona.fallbackLines[Math.min(fallbackIndex, persona.fallbackLines.length - 1)] ??
      persona.fallbackLines[persona.fallbackLines.length - 1] ??
      "..."
    );
  },
};

async function callGroq(sys: string, userMsg: string): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ENV.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: ENV.GROQ_MODEL,
      max_tokens: 120,
      temperature: 0.8,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: userMsg.slice(0, 500) },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Groq HTTP ${res.status}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Resposta vazia do Groq");
  return text.slice(0, 400);
}
