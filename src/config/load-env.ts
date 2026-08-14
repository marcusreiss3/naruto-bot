// Carrega o .env sem depender de pacote nenhum.
//
// Antes isto era `import "dotenv/config"`, que derrubou o deploy na Square com
// ERR_MODULE_NOT_FOUND mesmo com dotenv em dependencies. Ler variavel de
// ambiente e' a primeira coisa que o processo faz: nao pode depender de
// node_modules estar intacto. O parser cobre o formato que o projeto usa —
// KEY=VALUE por linha, com aspas opcionais.
//
// Mesma logica de scripts/with-pg-tls.mjs, duplicada de proposito: aquele
// arquivo roda antes do build e nao pode importar TS.
import { readFileSync } from "node:fs";
import { join } from "node:path";

function loadDotEnv(): void {
  let raw: string;
  try {
    raw = readFileSync(join(process.cwd(), ".env"), "utf8");
  } catch {
    return; // sem .env: as vars vem do ambiente (painel da Square, CI, ...)
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

    // Variavel ja definida no ambiente vence o arquivo: painel da Square e
    // export manual tem prioridade sobre .env.
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv();
