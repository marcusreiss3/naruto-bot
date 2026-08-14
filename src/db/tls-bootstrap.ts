// O Postgres da Square exige mTLS: o cliente precisa apresentar certificado,
// nao so confiar no do servidor. O Prisma so aceita identidade de cliente via
// PKCS12 em disco (sslidentity=<path>), nao aceita PEM cru nem bytes embutidos
// na connection string. Pra nao depender de arquivo commitado nem de caminho
// fixo (que muda entre Windows local e o container Linux da Square), guardamos
// o .pfx e o cert em base64 nas env vars e escrevemos em disco a cada boot,
// sempre no mesmo lugar (os.tmpdir(), existe nos dois SOs).
//
// DATABASE_URL na env fica SEM sslidentity/sslcert/sslpassword (so
// host/user/senha/db/sslmode=require); esses tres parametros sao anexados
// aqui, depois de escrever os arquivos. Sem PG_SSL_IDENTITY_B64 configurada,
// nao mexe em nada — serve pra Postgres sem mTLS (dev local antigo, outro provedor).
// Carrega o .env ANTES de ler PG_SSL_*: quem importa este modulo pode ser um
// script que nunca tocou em config/env.ts (prisma/seed.ts, por exemplo). Sem
// isto o bootstrap le variavel vazia e a conexao cai sem mTLS. No bot so'
// funcionava por acaso da ordem de imports de src/index.ts.
import "../config/load-env.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function writeTlsFiles(): { identityPath: string; certPath: string } {
  const dir = join(tmpdir(), "naruto-bot-pg-tls");
  mkdirSync(dir, { recursive: true });
  const identityPath = join(dir, "pg-identity.pfx");
  const certPath = join(dir, "pg-cert.pem");
  writeFileSync(identityPath, Buffer.from(process.env.PG_SSL_IDENTITY_B64!, "base64"));
  writeFileSync(certPath, Buffer.from(process.env.PG_SSL_CERT_B64!, "base64"));
  return { identityPath, certPath };
}

function bootstrap(): void {
  if (!process.env.PG_SSL_IDENTITY_B64 || !process.env.DATABASE_URL) return;

  const { identityPath, certPath } = writeTlsFiles();
  const password = process.env.PG_SSL_IDENTITY_PASSWORD ?? "";
  const sep = process.env.DATABASE_URL.includes("?") ? "&" : "?";
  process.env.DATABASE_URL =
    process.env.DATABASE_URL +
    sep +
    `sslidentity=${encodeURIComponent(identityPath)}` +
    `&sslpassword=${encodeURIComponent(password)}` +
    `&sslcert=${encodeURIComponent(certPath)}`;
}

bootstrap();
