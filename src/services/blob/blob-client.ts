// Cliente do Square Cloud Blob (armazenamento de objetos + CDN).
//
// Escrito a mao em vez de usar @squarecloud/blob de proposito: sao ~60 linhas,
// e o SDK viraria mais uma dependencia de producao pra manter — o mesmo motivo
// que fez o dotenv sair em favor de src/config/load-env.ts.
//
// Regras da API que ditam o formato dos nomes (validadas no servidor, erro 400):
//   - `name` e `prefix` casam /^[a-zA-Z0-9_]{3,32}$/ — sem hifen, sem ponto,
//     sem barra. So da pra ter UM nivel de "pasta" (o prefix).
//   - arquivo entre 1 KiB e 100 MB no upload direto.
//   - no maximo 4 uploads simultaneos por conta; passar disso responde
//     TOO_MANY_CONCURRENT_UPLOADS.
//   - sem `security_hash`, a URL publica e deterministica:
//     https://public-blob.squarecloud.dev/<conta>/<prefix>/<name>.<ext>
//     e subir de novo com os mesmos parametros sobrescreve o objeto.
import "../../config/load-env.js";

const BASE_URL = "https://blob.squarecloud.app/v1/";

/**
 * A API aceita 4 uploads simultaneos, mas o limitador de ritmo abaixo ja serializa
 * tudo — subir em paralelo so criaria rajada sem ganhar vazao. Fica 1.
 */
export const MAX_CONCURRENT_UPLOADS = 1;
export const MIN_FILE_SIZE = 1024;
export const MAX_FILE_SIZE = 100 * 1024 * 1024;

const NAME_PATTERN = /^[a-zA-Z0-9_]{3,32}$/;

/**
 * Codigos que a API devolve com HTTP 429. Nao adianta repetir na hora: estourar
 * o limite rende 30 MINUTOS de penalidade, entao quem chama deve abortar o lote.
 */
export const RATE_LIMIT_CODES = new Set(["RATE_LIMIT", "RATE_LIMITED"]);

// Ritmo global de saida. O limite e' por PLANO, por janela de 60s:
// STANDARD-4 120, STANDARD-6 180, STANDARD-8 240, PRO-12+ 300. Os 300 que
// aparecem soltos na doc sao o teto da plataforma, nao o de todo mundo.
//
// 1000 ms = 60/min, metade do tier mais apertado. Conservador de proposito:
// errar pra baixo custa minutos, errar pra cima custa 30 MINUTOS de penalidade.
// Da pra afrouxar por env sem mexer no codigo (o bot rodando DENTRO da Square
// tem limite proprio, mais folgado que o de fora).
//
// O limitador e' por modulo, nao por chamada, pra que uploads em paralelo
// dividam a mesma cota: ignorar isso foi o que rendeu 561 erros 429 na
// primeira carga dos assets, e o comportamento observado e' de token bucket
// (a requisicao seguinte, 250 ms depois, ja vinha sem token).
const MIN_REQUEST_INTERVAL_MS = Number(process.env.SQUARECLOUD_MIN_REQUEST_INTERVAL_MS ?? "1000");
let nextRequestAt = 0;

async function takeRateLimitSlot(): Promise<void> {
  const now = Date.now();
  const slot = Math.max(now, nextRequestAt);
  nextRequestAt = slot + MIN_REQUEST_INTERVAL_MS;
  if (slot > now) await new Promise((resolve) => setTimeout(resolve, slot - now));
}

export type CreateObjectOptions = {
  /** Conteudo do arquivo. */
  file: Buffer;
  /** Nome sem extensao. Precisa casar NAME_PATTERN. */
  name: string;
  /** "Pasta" logica. Precisa casar NAME_PATTERN. */
  prefix?: string;
  /** Ex.: "image/png". A extensao da URL final sai daqui. */
  mimeType: string;
  /** Dias ate a exclusao automatica pelo Blob (1 a 365). */
  expire?: number;
};

export type CreateObjectResponse = {
  id: string;
  name: string;
  size: number;
  url: string;
  prefix?: string;
};

export type ListedObject = {
  id: string;
  size: number;
  created_at: string;
  expires_at?: string;
};

export class BlobError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(`[${code}] ${message}`);
    this.name = "BlobError";
  }
}

export function hasBlob(): boolean {
  return Boolean(process.env.SQUARECLOUD_API_KEY);
}

function apiKey(): string {
  const key = process.env.SQUARECLOUD_API_KEY;
  if (!key) throw new BlobError("MISSING_API_KEY", "SQUARECLOUD_API_KEY nao configurada.");
  return key;
}

async function request<T>(
  path: string,
  init: { method?: string; params?: Record<string, string | undefined>; body?: FormData | string },
): Promise<T> {
  const url = new URL(path, BASE_URL);
  for (const [key, value] of Object.entries(init.params ?? {})) {
    if (value !== undefined) url.searchParams.set(key, value);
  }

  await takeRateLimitSlot();
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: { Authorization: apiKey() },
    body: init.body,
  });

  const data = (await res.json()) as
    | { status: "success"; response: T }
    | { status: "error"; code?: string; message?: string };

  if (data.status === "error") {
    throw new BlobError(data.code ?? "UNKNOWN_ERROR", data.message ?? `HTTP ${res.status}`);
  }
  return data.response;
}

/** Sobe (ou sobrescreve) um objeto. Requer plano pago na Square. */
export async function createObject(options: CreateObjectOptions): Promise<CreateObjectResponse> {
  if (!NAME_PATTERN.test(options.name)) {
    throw new BlobError("INVALID_OBJECT_NAME", `Nome invalido: "${options.name}"`);
  }
  if (options.prefix && !NAME_PATTERN.test(options.prefix)) {
    throw new BlobError("INVALID_OBJECT_PREFIX", `Prefix invalido: "${options.prefix}"`);
  }
  if (options.file.byteLength < MIN_FILE_SIZE) {
    throw new BlobError("FILE_TOO_SMALL", `${options.name}: ${options.file.byteLength} B < 1 KiB`);
  }
  if (options.file.byteLength > MAX_FILE_SIZE) {
    throw new BlobError("FILE_TOO_LARGE", `${options.name}: ${options.file.byteLength} B > 100 MB`);
  }

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(options.file)], { type: options.mimeType }));

  return request<CreateObjectResponse>("objects", {
    method: "POST",
    params: {
      name: options.name,
      prefix: options.prefix,
      expire: options.expire === undefined ? undefined : String(options.expire),
    },
    body: form,
  });
}

/**
 * Lista objetos, paginado. Enquanto vier `continuationToken`, devolva ele pra
 * pegar a proxima pagina. A listagem e' cacheada ~30 min do lado da Square,
 * entao objeto recem-criado pode demorar pra aparecer aqui.
 */
export async function listObjects(
  continuationToken?: string,
): Promise<{ objects: ListedObject[]; continuationToken?: string }> {
  return request("objects", { params: { continuationToken } });
}

export type BlobStats = {
  usage: { objects: number; storage: number };
  plan: { included: number };
  billing: {
    extraStorage: number;
    storagePrice: number;
    objectsPrice: number;
    totalEstimate: number;
  };
};

/**
 * Uso e cobranca da conta. Diferente de listObjects(), `usage.objects` vem da
 * contabilidade e nao do cache de 30 min da listagem — e' a fonte confiavel pra
 * saber quantos objetos existem de verdade.
 */
export async function stats(): Promise<BlobStats> {
  return request<BlobStats>("stats", {});
}

/** Apaga um objeto pelo id (`conta/prefix/nome.ext`). Um por requisicao. */
export async function deleteObject(id: string): Promise<void> {
  await request("objects", { method: "DELETE", body: JSON.stringify({ object: id }) });
}
