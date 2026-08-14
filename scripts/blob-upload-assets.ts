// Sobe as imagens de public/assets pro Square Cloud Blob e gera o manifesto que
// o site usa pra trocar /assets/... pela URL do CDN.
//
// Por que: as imagens sao 66 dos 70 MB do deploy. No Blob, o deploy cai pra ~4 MB,
// as imagens saem do CDN e o repo do GitHub para de crescer a cada arte nova.
//
//   npm run blob:upload           # sobe o que falta e regrava o manifesto
//   npm run blob:upload -- --force  # sobe tudo de novo (arte trocada com o mesmo nome)
//   npm run blob:upload -- --dry    # so mostra o plano, nao sobe nada
//
// O manifesto (public/asset-manifest.js) VAI pro git; public/assets nao vai mais.
import "../src/config/load-env.js";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, relative, extname, basename, dirname, sep } from "node:path";
import {
  BlobError,
  createObject,
  MAX_CONCURRENT_UPLOADS,
  MIN_FILE_SIZE,
  RATE_LIMIT_CODES,
} from "../src/services/blob/blob-client.js";

const ASSETS_DIR = join(process.cwd(), "public", "assets");
const MANIFEST_PATH = join(process.cwd(), "public", "asset-manifest.js");

// Ficam servidos pelo proprio site, nao vao pro Blob:
//   - .svg: o Blob entrega svg como application/octet-stream, entao o navegador
//     baixa o arquivo em vez de desenhar. Quebraria o sprite dos guias e os
//     icones de cadeado/sair do CSS.
//   - .md: SOURCES.md e' documentacao de credito das artes, nao e' asset.
//   - as pastas/arquivos abaixo: sao referenciados de index.html e style.css,
//     que nao passam por nenhum helper de JS e portanto nao leem o manifesto.
// Junto tudo isso da 0,21 MB — nao vale complicar por causa deles.
const SKIP_EXTENSIONS = new Set([".svg", ".md"]);
const SKIP_PATHS = ["icons/ui/", "icons/header/", "icons/brand/", "guides/", "bg/login.webp"];

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
};

type Entry = {
  /** Caminho como o site pede: "/assets/icons/fogo/bola-de-fogo.png". */
  webPath: string;
  absPath: string;
  prefix: string;
  name: string;
  mimeType: string;
  size: number;
};

function walk(dir: string, out: string[] = []): string[] {
  for (const item of readdirSync(dir)) {
    // _orig/ e' o backup das artes em tamanho original, ja fora do git.
    if (item === "_orig") continue;
    const full = join(dir, item);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/**
 * A API so aceita /^[a-zA-Z0-9_]{3,32}$/ em `name` e `prefix`. Nomes daqui tem
 * hifen, acento e ate 45 caracteres, entao: troca o que nao serve por "_" e,
 * quando estoura 32, corta em 24 e cola 7 hex do caminho completo — o hash
 * mantem o resultado unico e deterministico (rodar de novo da a mesma URL).
 */
function sanitize(raw: string, fullPathForHash: string): string {
  let s = raw
    .normalize("NFD")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

  if (s.length > 32) {
    const hash = createHash("sha1").update(fullPathForHash).digest("hex").slice(0, 7);
    s = `${s.slice(0, 24)}_${hash}`;
  }
  while (s.length < 3) s += "_";
  return s;
}

function collectEntries(): Entry[] {
  const entries: Entry[] = [];
  const taken = new Map<string, string>();

  for (const absPath of walk(ASSETS_DIR)) {
    const rel = relative(ASSETS_DIR, absPath).split(sep).join("/");
    const ext = extname(absPath).toLowerCase();

    if (SKIP_EXTENSIONS.has(ext)) continue;
    if (SKIP_PATHS.some((p) => rel === p || rel.startsWith(p))) continue;

    const mimeType = MIME_BY_EXT[ext];
    if (!mimeType) {
      console.warn(`  ! extensao sem mime conhecido, pulando: ${rel}`);
      continue;
    }

    const size = statSync(absPath).size;
    if (size < MIN_FILE_SIZE) {
      console.warn(`  ! menor que 1 KiB (limite do Blob), fica local: ${rel}`);
      continue;
    }

    const dir = dirname(rel);
    const prefix = sanitize(dir === "." ? "raiz" : dir, dir);
    const name = sanitize(basename(rel, ext), rel);

    const key = `${prefix}/${name}${ext}`;
    const clash = taken.get(key);
    if (clash) throw new Error(`Colisao de nome no Blob: "${rel}" e "${clash}" viram ${key}`);
    taken.set(key, rel);

    entries.push({ webPath: `/assets/${rel}`, absPath, prefix, name, mimeType, size });
  }

  return entries.sort((a, b) => a.webPath.localeCompare(b.webPath));
}

/** Manifesto anterior, pra pular o que ja esta no Blob. */
function readExistingManifest(): Record<string, string> {
  if (!existsSync(MANIFEST_PATH)) return {};
  const source = readFileSync(MANIFEST_PATH, "utf8");
  const match = source.match(/\{[\s\S]*\}/);
  if (!match) return {};
  try {
    return JSON.parse(match[0]) as Record<string, string>;
  } catch {
    return {};
  }
}

function writeManifest(map: Record<string, string>): void {
  const sorted = Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)));
  const body = [
    "// GERADO por scripts/blob-upload-assets.ts — nao edite a mao.",
    "// Mapeia o caminho local do asset para a URL dele no CDN do Square Blob.",
    "// Caminho ausente aqui = servido pelo proprio site (ver SKIP_* no script).",
    `window.__BLOB_ASSETS = ${JSON.stringify(sorted, null, 2)};`,
    "",
  ].join("\n");
  writeFileSync(MANIFEST_PATH, body);
}

/** Roda `worker` sobre os itens com no maximo `limit` em voo (limite da API: 4). */
async function mapWithLimit<T>(items: T[], limit: number, worker: (item: T, index: number) => Promise<void>) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

async function main() {
  const force = process.argv.includes("--force");
  const dryRun = process.argv.includes("--dry");

  const entries = collectEntries();
  const manifest = readExistingManifest();
  const pending = force ? entries : entries.filter((e) => !manifest[e.webPath]);
  const totalMb = pending.reduce((sum, e) => sum + e.size, 0) / 1024 / 1024;

  console.log(`${entries.length} assets elegiveis, ${pending.length} a subir (${totalMb.toFixed(1)} MB).`);
  if (dryRun) {
    for (const e of pending.slice(0, 20)) console.log(`  ${e.webPath}  ->  ${e.prefix}/${e.name}`);
    if (pending.length > 20) console.log(`  ... e mais ${pending.length - 20}`);
    return;
  }
  if (!pending.length) {
    writeManifest(manifest);
    console.log("Nada a fazer. Manifesto regravado.");
    return;
  }

  let done = 0;
  const failures: string[] = [];
  // Estourar 300 req/min rende 30 minutos de penalidade: continuar tentando so
  // renova o castigo. No primeiro 429 o lote inteiro para; o manifesto ja tem o
  // que subiu, entao rodar de novo depois retoma exatamente de onde parou.
  let rateLimited = false;

  await mapWithLimit(pending, MAX_CONCURRENT_UPLOADS, async (entry) => {
    if (rateLimited) return;
    try {
      const res = await createObject({
        file: readFileSync(entry.absPath),
        name: entry.name,
        prefix: entry.prefix,
        mimeType: entry.mimeType,
      });
      manifest[entry.webPath] = res.url;
    } catch (err) {
      if (err instanceof BlobError && RATE_LIMIT_CODES.has(err.code)) {
        rateLimited = true;
        return;
      }
      failures.push(`${entry.webPath}: ${(err as Error).message}`);
    }
    done++;
    if (done % 25 === 0 || done === pending.length) {
      console.log(`  ${done}/${pending.length}`);
    }
  });

  // Grava mesmo com falha parcial: o que subiu ja fica registrado e a proxima
  // rodada retoma so o que faltou.
  writeManifest(manifest);

  console.log(`\nManifesto: ${Object.keys(manifest).length} entradas em public/asset-manifest.js`);
  if (rateLimited) {
    const faltam = pending.length - done;
    console.error(
      `\nLimite de requisicoes da API estourado — lote interrompido com ${faltam} restando.\n` +
        "A Square aplica 30 minutos de penalidade. Espere e rode 'npm run blob:upload' de novo:\n" +
        "ele retoma pelo que ainda nao esta no manifesto.",
    );
    process.exitCode = 1;
  }
  if (failures.length) {
    console.error(`\n${failures.length} falha(s):`);
    for (const f of failures) console.error(`  ${f}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
