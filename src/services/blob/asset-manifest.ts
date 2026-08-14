// Resolve assets publicados no Square Blob para fluxos do bot que tambem rodam
// fora do site (ex.: anexos/cards do Discord). O manifesto e' versionado, mas
// os arquivos grandes de public/assets nao vao para o deploy.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

let cached: Record<string, string> | null = null;

function manifest(): Record<string, string> {
  if (cached) return cached;
  const file = path.join(process.cwd(), "public", "asset-manifest.js");
  if (!existsSync(file)) return {};
  try {
    const source = readFileSync(file, "utf8");
    const json = source.match(/window\.__BLOB_ASSETS\s*=\s*(\{[\s\S]*\})\s*;?\s*$/)?.[1];
    cached = json ? JSON.parse(json) as Record<string, string> : {};
  } catch {
    cached = {};
  }
  return cached;
}

/** URL publica no CDN para um caminho `/assets/...`, se ele foi publicado. */
export function blobAssetUrl(webPath: string): string | null {
  return manifest()[webPath] ?? null;
}
