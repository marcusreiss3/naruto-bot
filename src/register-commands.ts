import { REST, Routes } from "discord.js";
import { ENV } from "./config/env.js";
import { commands } from "./commands/index.js";
import { log } from "./utils/logger.js";

async function main(): Promise<void> {
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
}

main().catch((err) => {
  log.error(err);
  process.exit(1);
});
