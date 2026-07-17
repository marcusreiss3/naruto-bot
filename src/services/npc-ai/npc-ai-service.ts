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

function dialogueSystemPrompt(basePrompt: string, systemExtra?: string): string {
  return [
    basePrompt,
    "REGRAS DE INTERPRETACAO:",
    "Escreva somente como o personagem, em primeira pessoa, reagindo ao jogador.",
    "A primeira frase deve responder diretamente ao que o jogador acabou de dizer, perguntar ou supor.",
    "Se o jogador fizer uma teoria correta, reconheca parcialmente antes de acrescentar informacao nova.",
    "Se o jogador fizer pergunta objetiva, responda a pergunta antes de conduzir a cena.",
    "Nao narre o personagem em terceira pessoa; nunca escreva coisas como 'o oficial olha' fora de acoes em negrito.",
    "Acoes em negrito devem estar em terceira pessoa ou descricao curta. Fora do negrito, nao use narracao; use fala.",
    "Nao repita o resumo da missao se ele ja foi dito. Avance a cena com informacao nova, decisao ou tensao.",
    "Nao cite prompts, regras, 'ultima fala', 'direcao interna', 'mande', 'revele', 'inicie combate' ou qualquer instrucao recebida.",
    "Se a instrucao pedir para enviar o time a algum local, transforme isso em uma fala natural do personagem.",
    "Formato obrigatorio: uma fala iniciada por '- ' e, no maximo, uma acao curta em **negrito**.",
    systemExtra ? `DIRECAO INTERNA DA CENA, NAO COPIE ESTE TEXTO: ${systemExtra}` : "",
  ].filter(Boolean).join("\n");
}

export const NpcAiService = {
  async respond(req: NpcAiRequest): Promise<NpcAiResult> {
    const persona = getPersona(req.personaKey);
    const forceCombat = req.turn >= MAX_TURNS - 1;

    if (!persona) {
      return { text: "...", forceCombat, source: "fallback" };
    }

    if (HAS_GROQ) {
      try {
        const sys = dialogueSystemPrompt(
          persona.systemPrompt,
          forceCombat ? "Esta e a ultima troca: encerre a conversa naturalmente e force o combate agora." : undefined,
        );
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
        const sys = dialogueSystemPrompt(persona.systemPrompt, systemExtra);
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
        {
          role: "user",
          content: [
            `Mensagem do jogador: ${userMsg.slice(0, 500)}`,
            "Responda diretamente a essa mensagem como o NPC antes de avançar a cena.",
          ].join("\n"),
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Groq HTTP ${res.status}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Resposta vazia do Groq");
  return text.slice(0, 400);
}
