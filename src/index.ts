import { Client, GatewayIntentBits, Events, MessageFlags } from "discord.js";
import { ENV } from "./config/env.js";
import { commandMap } from "./commands/index.js";
import { log } from "./utils/logger.js";
import { disconnect } from "./db/client.js";
import { runBanditMessage } from "./services/missions/mission-runtime.js";
import { handleKidMessage } from "./services/missions/kid-dialogue.js";
import { continueInvestigationMessage } from "./services/missions/investigation.js";
import { continueEscortMessage } from "./services/missions/escort.js";
import { continueCleanVillageMessage } from "./services/missions/clean-village.js";
import { continuePurseTheftMessage } from "./services/missions/purse-thief.js";
import { continueGeninComedyMessage } from "./services/missions/genin-comedy.js";
import { continueDangoRushMessage } from "./services/missions/dango-rush.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, (c) => {
  log.info(`Bot online como ${c.user.tag}`);
});

// Mensagens normais no canal continuam diálogos (criança da missão do gato / líder dos bandidos).
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  try {
    if (await handleKidMessage(message)) return;
    if (await continueCleanVillageMessage(message)) return;
    if (await continuePurseTheftMessage(message)) return;
    if (await continueGeninComedyMessage(message)) return;
    if (await continueDangoRushMessage(message)) return;
    if (await continueInvestigationMessage(message)) return;
    if (await continueEscortMessage(message)) return;
    await runBanditMessage(message);
  } catch (err) {
    log.error("Erro ao processar mensagem do diálogo:", err);
  }
});

// Nota: a liberação de aparência de quem saiu do servidor é feita de forma
// lazy — quando alguém tenta reivindicar o mesmo personagem, o bot verifica
// via members.fetch se o dono atual ainda está no servidor (não exige o
// intent privilegiado GuildMembers).

client.on(Events.InteractionCreate, async (interaction) => {
  // autocomplete
  if (interaction.isAutocomplete()) {
    const command = commandMap.get(interaction.commandName);
    if (command?.autocomplete) {
      try {
        await command.autocomplete(interaction);
      } catch (err) {
        log.error(`Erro no autocomplete ${interaction.commandName}:`, err);
        try {
          await interaction.respond([]);
        } catch {
          /* ignora */
        }
      }
    }
    return;
  }

  // botões / modais: customId no formato "<comando>:<ação>"
  if (interaction.isButton() || interaction.isModalSubmit()) {
    const name = interaction.customId.split(":")[0]!;
    const cmd = commandMap.get(name);
    try {
      if (interaction.isButton() && cmd?.handleButton) await cmd.handleButton(interaction);
      else if (interaction.isModalSubmit() && cmd?.handleModal) await cmd.handleModal(interaction);
    } catch (err) {
      log.error(`Erro no componente ${interaction.customId}:`, err);
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;
  const command = commandMap.get(interaction.commandName);
  if (!command) return;
  try {
    await command.execute(interaction);
  } catch (err) {
    log.error(`Erro no comando ${interaction.commandName}:`, err);
    const msg = "❌ Ocorreu um erro ao executar o comando.";
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(msg);
      } else {
        await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
      }
    } catch {
      /* ignora */
    }
  }
});

async function shutdown(): Promise<void> {
  log.info("Encerrando...");
  await disconnect();
  client.destroy();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

client.login(ENV.DISCORD_TOKEN);
