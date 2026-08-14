#!/usr/bin/env node
// Wrapper pro Prisma CLI (db push, migrate) receber a mesma DATABASE_URL com
// certificado de cliente que o app monta em runtime via src/db/tls-bootstrap.ts.
// O CLI do Prisma nao importa nosso codigo TS, entao repete aqui a mesma logica:
// decodifica PG_SSL_IDENTITY_B64/PG_SSL_CERT_B64 (base64 do .pfx/.pem), escreve
// em os.tmpdir() e anexa sslidentity/sslpassword/sslcert na DATABASE_URL.
// Sem PG_SSL_IDENTITY_B64 configurada, so' repassa a DATABASE_URL como esta.
//
// Uso: node scripts/with-pg-tls.mjs prisma db push --skip-generate
//
// ZERO dependencia de pacote: este script e' a primeira coisa que roda no
// start:prod, antes de qualquer garantia sobre node_modules. Ja quebrou o
// deploy importando "dotenv/config", entao o .env e' lido na mao aqui.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

// Parser minimo de .env: KEY=VALUE por linha, ignora comentario e linha vazia,
// tira aspas em volta do valor. Variavel que ja existe no ambiente vence o
// arquivo (painel da Square tem prioridade sobre .env commitado).
function loadDotEnv() {
  let raw;
  try {
    raw = readFileSync(join(process.cwd(), ".env"), "utf8");
  } catch {
    return; // sem .env: as vars vem do ambiente
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv();

function resolveDatabaseUrl() {
  if (!process.env.PG_SSL_IDENTITY_B64 || !process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const dir = join(tmpdir(), "naruto-bot-pg-tls");
  mkdirSync(dir, { recursive: true });
  const identityPath = join(dir, "pg-identity.pfx");
  const certPath = join(dir, "pg-cert.pem");
  writeFileSync(identityPath, Buffer.from(process.env.PG_SSL_IDENTITY_B64, "base64"));
  writeFileSync(certPath, Buffer.from(process.env.PG_SSL_CERT_B64, "base64"));
  const password = process.env.PG_SSL_IDENTITY_PASSWORD ?? "";
  const sep = process.env.DATABASE_URL.includes("?") ? "&" : "?";
  return (
    process.env.DATABASE_URL +
    sep +
    `sslidentity=${encodeURIComponent(identityPath)}` +
    `&sslpassword=${encodeURIComponent(password)}` +
    `&sslcert=${encodeURIComponent(certPath)}`
  );
}

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error("uso: node scripts/with-pg-tls.mjs <comando> [args...]");
  process.exit(1);
}

const res = spawnSync(cmd, args, {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, DATABASE_URL: resolveDatabaseUrl() },
});
process.exit(res.status ?? 1);
