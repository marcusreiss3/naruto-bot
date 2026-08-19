import { REST, Routes } from "discord.js";
import { pathToFileURL } from "node:url";
import { ENV } from "./config/env.js";
import { commands } from "./commands/index.js";
import { log } from "./utils/logger.js";

// Extraido pra funcao (em vez de so' um script de CLI) pra poder ser chamado
// tambem no boot do bot (src/index.ts) — hosts sem shell/exec (ex.: Square
// Cloud, que so' inicia/para o processo) nunca teriam como rodar
// `npm run register` manualmente depois de um deploy.
export async function registerSlashCommands(): Promise<number> {
  const body = commands.map((c) => c.data.toJSON());
  const rest = new REST({ version: "10" }).setToken(ENV.DISCORD_TOKEN);

  if (ENV.DISCORD_GUILD_ID) {
    await rest.put(
      Routes.applicationGuildCommands(ENV.DISCORD_CLIENT_ID, ENV.DISCORD_GUILD_ID),
      { body },
    );
    log.info(`Registrados ${body.length} comandos na guild ${ENV.DISCORD_GUILD_ID}.`);
  } else {
    await rest.put(Routes.applicationCommands(ENV.DISCORD_CLIENT_ID), { body });
    log.info(`Registrados ${body.length} comandos globalmente (pode levar ~1h p/ propagar).`);
  }
  return body.length;
}

// So' roda sozinho quando chamado direto (`npm run register`); import a
// partir de index.ts nao deve disparar isso de novo.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  registerSlashCommands().catch((err) => {
    log.error(err);
    process.exit(1);
  });
}
