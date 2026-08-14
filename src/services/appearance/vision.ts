import { ENV, HAS_GROQ, HAS_GEMINI } from "../../config/env.js";
import { log } from "../../utils/logger.js";
import { downloadImageBuffer } from "./image-download.js";

export interface IdentifiedCharacter {
  key: string; // normalizado p/ dedup (token-sorted)
  name: string; // nome de exibição
  confidence: number; // 0-1
  isOc: boolean; // personagem original (não canônico) -> sem dedup entre usuários
}

// Normaliza nome: minúsculo, sem acento, sem pontuação, tokens ordenados.
// "Uzumaki Naruto" e "Naruto Uzumaki" -> mesma key.
export function normalizeCharacterKey(raw: string): string {
  const cleaned = raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.split(" ").filter(Boolean).sort().join(" ");
}

// Abaixo deste valor o personagem é tratado como OC (evita nome alucinado).
const OC_CONFIDENCE_THRESHOLD = 0.7;
const VISION_API_TIMEOUT_MS = 30_000;
const GROQ_VISION_FALLBACK_MODEL = "qwen/qwen3.6-27b";

const PROMPT = [
  "Você é um identificador RIGOROSO de personagens de anime/mangá/games/quadrinhos.",
  "PRIMEIRO classifique o ESTILO da imagem no campo 'tipo':",
  '- "desenho": anime, mangá, cartoon, ilustração, arte digital, 3D estilizado.',
  '- "real": foto de pessoa real, foto realista, frame de filme/vídeo com gente real, cosplay.',
  "Depois, SE for 'desenho', identifique QUAL personagem conhecido está representado.",
  "A aparência só é válida se parecer uma pessoa humana/humanoide em estilo anime/mangá/ilustração.",
  "Mascotes, animais, criaturas cartunescas e personagens como Po, Angry Birds, Pokémon ou Sonic NÃO são aparências válidas.",
  "Artes de Ordem Paranormal/RPG/OC podem parecer anime, mas NÃO force para um personagem de anime famoso. Se não reconhecer com certeza absoluta, retorne OC.",
  "REGRAS DE CONFIANÇA (siga à risca):",
  "- Só use confidence > 0.8 se reconhecer o personagem E a obra com CERTEZA quase absoluta.",
  "- Personagens de anime se parecem muito entre si (mesmo cabelo, olhos, estilo). NÃO confunda.",
  "- Se houver QUALQUER dúvida entre dois personagens parecidos, use confidence ABAIXO de 0.5.",
  "- NUNCA chute um nome famoso só por semelhança visual genérica.",
  "Responda APENAS com JSON válido neste formato:",
  '{"tipo": "desenho"|"real", "validAppearance": true|false, "character": "<nome>", "obra": "<obra>", "confidence": <0 a 1>}',
  'Se tipo for "real", responda: {"tipo":"real","validAppearance":false,"character":null,"obra":null,"confidence":0}',
  'Se for desenho mas não identificar (OC, fan art, dúvida): {"tipo":"desenho","validAppearance":true,"character":"OC","obra":null,"confidence":<0 a 1>}',
  'Se for desenho mas NÃO parecer humano/humanoide de anime, responda: {"tipo":"desenho","validAppearance":false,"character":"<nome se souber>","obra":"<obra se souber>","confidence":<0 a 1>}',
  'Se não houver personagem/pessoa nenhum: {"tipo":"desenho","validAppearance":false,"character":null,"obra":null,"confidence":0}',
  "Não escreva mais nada além do JSON.",
].join("\n");

interface RawResult {
  character?: string | null;
  obra?: string | null;
  confidence?: number;
  tipo?: string | null;
  validAppearance?: boolean | null;
}

// Resultado da identificação por imagem.
export type Identification =
  | { kind: "CHARACTER"; result: IdentifiedCharacter }
  | { kind: "NOT_DRAWING" } // foto real / pessoa real
  | { kind: "INVALID_APPEARANCE" } // desenho, mas nao parece humano/humanoide de anime
  | { kind: "NO_SUBJECT" } // sem personagem reconhecível
  | { kind: "VISION_OFFLINE" }; // IA de visão indisponível/fora do ar

// Mapeia o JSON cru do modelo para uma Identification.
function toIdentification(parsed: RawResult): Identification {
  if ((parsed.tipo ?? "").toLowerCase() === "real") return { kind: "NOT_DRAWING" };
  if (!parsed.character && !parsed.obra && parsed.confidence === 0) return { kind: "NO_SUBJECT" };
  if (parsed.validAppearance === false) return { kind: "INVALID_APPEARANCE" };
  if (isDisallowedNonHuman(parsed)) return { kind: "INVALID_APPEARANCE" };
  const built = buildResult(parsed);
  if (!built) return { kind: "NO_SUBJECT" };
  return { kind: "CHARACTER", result: built };
}

function isDisallowedNonHuman(parsed: RawResult): boolean {
  const character = normalizeCharacterKey(parsed.character ?? "");
  const work = normalizeCharacterKey(parsed.obra ?? "");
  if (!character && !work) return false;

  const blockedWorks = ["angry birds", "digimon", "kung fu panda", "pokemon", "sonic"];
  if (blockedWorks.some((blocked) => work.includes(blocked))) return true;

  const blockedCharacters = ["panda", "pikachu", "po", "red", "sonic"];
  return blockedCharacters.some(
    (blocked) => character === blocked || character.startsWith(`${blocked} `) || character.endsWith(` ${blocked}`),
  );
}

function canonicalWorkKey(work: string): string {
  const key = normalizeCharacterKey(work);
  if (!key) return "";

  const franchiseAliases: { canonical: string; aliases: string[] }[] = [
    {
      canonical: "naruto",
      aliases: ["boruto generations naruto next", "boruto naruto next generations", "naruto"],
    },
  ];

  const match = franchiseAliases.find((group) => group.aliases.includes(key));
  return match?.canonical ?? key;
}

// Constrói um IdentifiedCharacter a partir de nome/obra/confiança crus.
export function makeIdentified(
  character: string | null | undefined,
  obra: string | null | undefined,
  confidence: number,
): IdentifiedCharacter | null {
  return buildResult({ character, obra, confidence });
}

// Converte o JSON cru do modelo num IdentifiedCharacter normalizado.
function buildResult(parsed: RawResult): IdentifiedCharacter | null {
  if (isDisallowedNonHuman(parsed)) return null;
  const charName = parsed.character?.trim();
  if (!charName) return null;

  const baseKey = normalizeCharacterKey(charName);
  if (!baseKey) return null;

  const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0;
  // confiança baixa => trata como OC em vez de afirmar um nome alucinado.
  const isOc = baseKey === "oc" || confidence < OC_CONFIDENCE_THRESHOLD;

  const obra = parsed.obra?.trim();
  // nome de exibição inclui a obra; key inclui a obra p/ não colidir homônimos.
  const name = obra && !isOc ? `${charName} (${obra})` : charName;
  const key = obra && !isOc ? `${baseKey}|${canonicalWorkKey(obra)}` : baseKey;

  return { key, name, confidence, isOc };
}

function safeParse(content: string, provider: string): RawResult | null {
  try {
    return JSON.parse(content) as RawResult;
  } catch {
    log.warn(`${provider} retornou JSON inválido:`, content.slice(0, 200));
    return null;
  }
}

function logId(provider: string, id: Identification): void {
  if (id.kind === "CHARACTER") {
    log.info(`[visão] ${provider} -> ${id.result.name} (conf ${id.result.confidence}, oc=${id.result.isOc})`);
  } else {
    log.info(`[visão] ${provider} -> ${id.kind}`);
  }
}

// Identifica o personagem numa imagem. Prefere Gemini; cai para Groq se Gemini estiver sem cota/fora do ar.
export async function identifyCharacter(imageUrl: string): Promise<Identification> {
  if (HAS_GEMINI) {
    const r = await callGemini(imageUrl);
    if (r) {
      logId("Gemini", r);
      return r;
    }
    log.warn("[visão] Gemini não retornou resultado; tentando Groq...");
  }

  if (HAS_GROQ) {
    const models = [...new Set([ENV.GROQ_VISION_MODEL, GROQ_VISION_FALLBACK_MODEL])];
    for (const model of models) {
      const g = await callGroq(imageUrl, model);
      if (g) {
        logId(HAS_GEMINI ? "Groq(fallback)" : "Groq", g);
        return g;
      }
    }
  }

  log.warn("IA de visão indisponível: Gemini/Groq não configurados ou sem resposta.");
  return { kind: "VISION_OFFLINE" };
}

// ---------------- Gemini ----------------

// Retorna null SÓ em falha de rede/HTTP/parse (p/ acionar fallback).
async function callGemini(imageUrl: string): Promise<Identification | null> {
  // Gemini não busca URLs: baixa a imagem e envia em base64 inline.
  const downloaded = await downloadImageBuffer(imageUrl, "Gemini");
  if (!downloaded) return null;
  const mime = downloaded.mime;
  const base64 = downloaded.buffer.toString("base64");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${ENV.GEMINI_MODEL}:generateContent?key=${ENV.GEMINI_API_KEY}`;

  let res: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VISION_API_TIMEOUT_MS);
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: PROMPT }, { inline_data: { mime_type: mime, data: base64 } }],
          },
        ],
        generationConfig: { temperature: 0, responseMimeType: "application/json" },
      }),
    });
  } catch (err) {
    log.warn("Gemini vision falhou (rede):", (err as Error).message);
    return null;
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    log.warn(`Gemini vision HTTP ${res.status}: ${await res.text().catch(() => "")}`);
    return null;
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!content) {
    log.warn("[visão] Gemini resposta sem texto:", JSON.stringify(data).slice(0, 300));
    return null;
  }

  const parsed = safeParse(content, "Gemini");
  return parsed ? toIdentification(parsed) : null;
}

// ---------------- Groq (fallback) ----------------

async function callGroq(imageUrl: string, model: string): Promise<Identification | null> {
  let res: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VISION_API_TIMEOUT_MS);
  try {
    res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ENV.GROQ_API_KEY}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        max_tokens: 150,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
      }),
    });
  } catch (err) {
    log.warn("Groq vision falhou (rede):", (err as Error).message);
    return null;
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    log.warn(`Groq vision HTTP ${res.status} (${model}): ${await res.text().catch(() => "")}`);
    return null;
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) return null;

  const parsed = safeParse(content, "Groq vision");
  return parsed ? toIdentification(parsed) : null;
}

// ---------------- Padronização de nome digitado ----------------

// Extrai "Nome (Obra)" de um texto livre, sem LLM.
function parseTyped(text: string): { character: string; obra: string | null } {
  const m = /^(.+?)\s*\((.+)\)\s*$/.exec(text.trim());
  if (m) return { character: m[1]!.trim(), obra: m[2]!.trim() };
  return { character: text.trim(), obra: null };
}

const STD_PROMPT = (typed: string) =>
  [
    `O usuário digitou o nome de um personagem de anime/mangá/game: "${typed}".`,
    "Padronize para o nome canônico completo e a obra de origem.",
    "Responda APENAS JSON:",
    '{"character": "<nome canônico completo>", "obra": "<obra>"}',
    'Ex: "Luffy" -> {"character":"Monkey D. Luffy","obra":"One Piece"}.',
    'Se claramente for um personagem original/OC ou não identificável, retorne {"character":"OC","obra":null}.',
    "Nada além do JSON.",
  ].join("\n");

// Padroniza um nome digitado pelo usuário (confiança máxima — o usuário afirmou).
// Usa LLM p/ canonizar; cai para parse manual "Nome (Obra)" se a IA falhar.
export async function standardizeTypedName(typed: string): Promise<IdentifiedCharacter | null> {
  const clean = typed.trim();
  if (!clean) return null;

  const raw = await llmText(STD_PROMPT(clean));
  if (raw) {
    const parsed = safeParse(raw, "Padronização");
    if (parsed?.character) {
      // usuário afirmou -> confiança alta (não vira OC por threshold, exceto "OC" literal)
      return makeIdentified(parsed.character, parsed.obra ?? null, 1);
    }
  }

  // fallback sem LLM
  const p = parseTyped(clean);
  return makeIdentified(p.character, p.obra, 1);
}

// Chamada de texto genérica (sem imagem). Prefere Gemini, cai p/ Groq. JSON cru.
async function llmText(prompt: string): Promise<string | null> {
  if (HAS_GEMINI) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${ENV.GEMINI_MODEL}:generateContent?key=${ENV.GEMINI_API_KEY}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, responseMimeType: "application/json" },
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        const txt = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (txt) return txt;
      } else {
        log.warn(`[padronização] Gemini HTTP ${res.status}`);
      }
    } catch (err) {
      log.warn("[padronização] Gemini falhou:", (err as Error).message);
    }
  }
  if (HAS_GROQ) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ENV.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: ENV.GROQ_MODEL,
          max_tokens: 100,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const txt = data.choices?.[0]?.message?.content?.trim();
        if (txt) return txt;
      } else {
        log.warn(`[padronização] Groq HTTP ${res.status}`);
      }
    } catch (err) {
      log.warn("[padronização] Groq falhou:", (err as Error).message);
    }
  }
  return null;
}
