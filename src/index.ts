import { Client, GatewayIntentBits, Events, MessageFlags, type GuildMember } from "discord.js";
import { ENV } from "./config/env.js";
import { commandMap } from "./commands/index.js";
import { registerSlashCommands } from "./register-commands.js";
import { log } from "./utils/logger.js";
import { disconnect } from "./db/client.js";
import { startWebServer } from "./server/index.js";
import { dispatchMissionMessage } from "./services/missions/message-dispatcher.js";
import { restoreTrainingExpirations } from "./services/combat/training-dummy.js";
import { startTaxScheduler } from "./services/economy/tax-scheduler.js";
import { formatReceipt } from "./services/economy/weekly-tax.js";
import { syncCharacterVillage } from "./services/economy/village-sync.js";
import { closeFinishedOrders } from "./services/economy/collection-orders.js";
import { ensureVillages } from "./services/economy/village-economy.js";
import { ensureVillageShops } from "./services/economy/shop-service.js";
import { ensureVillageBuildings } from "./services/economy/constructions.js";
import { startVillageSchedulers } from "./services/economy/village-scheduler.js";
import { purgeExpiredSessions } from "./services/economy/ui-session.js";
import { startTravelScheduler, stopTravelScheduler } from "./services/travel/travel-service.js";
import { handleSheetMessage, startSheetScheduler, stopSheetScheduler } from "./services/sheet/sheet-service.js";
import { SHEET_LAUNCH_CHANNEL_ID } from "./data/sheet-creation.js";
import { isAdmin, isAdminMember } from "./utils/permissions.js";
import {
  releaseAppearance,
  startAppearanceCleanupScheduler,
  stopAppearanceCleanupScheduler,
} from "./services/appearance/appearance-service.js";
import { startHpRegenScheduler, stopHpRegenScheduler } from "./services/characters/hp-regen-service.js";
import { startDailyQuestScheduler, stopDailyQuestScheduler } from "./services/daily-quests/daily-quest-service.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, async (c) => {
  log.info(`Bot online como ${c.user.tag}`);

  // Reregistra os slash commands a cada boot: hosts sem shell/exec (ex.:
  // Square Cloud, que so' inicia/para o processo) nunca teriam como rodar
  // `npm run register` manualmente depois de um deploy — sem isso, o
  // Discord fica preso na definicao de comando registrada da ultima vez
  // que alguem rodou o script a mao.
  await registerSlashCommands().catch((err) => log.error("Falha ao registrar slash commands:", err));

  await restoreTrainingExpirations(async (channelId) => {
    const channel = await c.channels.fetch(channelId).catch(() => null);
    if (channel?.isTextBased() && "send" in channel) {
      await channel.send("⏱️ O Boneco de Treino desapareceu após 30 minutos.");
    }
  }).catch((err) => log.error("Falha ao restaurar temporizadores de treino:", err));

  // As cinco vilas em si. Precisa vir antes de qualquer coisa que dependa
  // delas (imposto, lojas, obras) — banco novo (primeiro deploy) nasce sem
  // Village nenhuma, e startTaxScheduler ja abre competencia semanal abaixo.
  await ensureVillages().catch((err) => log.error("Falha ao garantir as vilas:", err));

  // Relogio do imposto semanal. Processa competencia vencida (bot fora do ar
  // num domingo) e arma o proximo corte. A DM do recibo sai daqui porque so'
  // aqui existe cliente do Discord; o calculo em si nao conhece Discord.
  await startTaxScheduler(async (receipt) => {
    const user = await c.users.fetch(receipt.discordId).catch(() => null);
    if (!user) return false;
    const enviado = await user.send(formatReceipt(receipt)).catch(() => null);
    return Boolean(enviado);
  }).catch((err) => log.error("Falha ao iniciar o relógio do imposto semanal:", err));

  // Ordens de coleta vencidas enquanto o bot esteve fora: fecha e devolve a
  // reserva. Idempotente, igual ao fechamento do imposto.
  await closeFinishedOrders().catch((err) =>
    log.error("Falha ao encerrar ordens de coleta vencidas:", err),
  );

  // Lojas das cinco vilas. Idempotente: nao devolve um Ichiraku ativo para
  // LOCKED nem zera estoque num redeploy.
  await ensureVillageShops().catch((err) => log.error("Falha ao garantir as lojas de vila:", err));
  await ensureVillageBuildings().catch((err) =>
    log.error("Falha ao garantir os setores e o Centro:", err),
  );
  await purgeExpiredSessions().catch(() => undefined);
  await startDailyQuestScheduler().catch((err) =>
    log.error("Falha ao iniciar o relógio das missões diárias:", err),
  );

  // Obras vencidas enquanto o bot esteve fora + criacao/retomada do canal do
  // Ichiraku. O anuncio publico sai daqui porque so' aqui existe cliente do
  // Discord; a conclusao em si nao conhece Discord.
  await startVillageSchedulers(c).catch((err) =>
    log.error("Falha ao iniciar os relógios da vila:", err),
  );
  await startTravelScheduler(c).catch((err) =>
    log.error("Falha ao iniciar o relógio de viagens:", err),
  );
  await startSheetScheduler(c).catch((err) =>
    log.error("Falha ao iniciar o relógio das fichas:", err),
  );
  await startAppearanceCleanupScheduler().catch((err) =>
    log.error("Falha ao iniciar a limpeza de aparências:", err),
  );
  startHpRegenScheduler();
});

// Sobe o site da árvore de habilidades no mesmo processo (no-op se nao configurado).
void startWebServer().catch((err) => log.error("Falha ao subir o site:", err));

// Mensagens normais no canal continuam diálogos (criança da missão do gato / líder dos bandidos).
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  try {
    if (message.channelId === SHEET_LAUNCH_CHANNEL_ID) {
      const member = message.member ?? await message.guild?.members.fetch(message.author.id).catch(() => null);
      if (!isAdminMember(member)) await message.delete().catch(() => undefined);
      return;
    }
    if (await handleSheetMessage(message)) return;
    await dispatchMissionMessage(message);
  } catch (err) {
    log.error("Erro ao processar mensagem do diálogo:", err);
  }
});

client.on(Events.GuildMemberRemove, async (member) => {
  try {
    await releaseAppearance(member.id, member.guild.id);
  } catch (error) {
    log.error(`Falha ao liberar aparência de ${member.id} ao sair do servidor:`, error);
  }
});

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

  // botões / modais / selects: customId no formato "<comando>:<ação>"
  if (interaction.isButton() || interaction.isModalSubmit() || interaction.isAnySelectMenu()) {
    const name = interaction.customId.split(":")[0]!;
    const cmd = commandMap.get(name);
    try {
      // Componentes também movimentam economia (aceitar ordem, comprar,
      // doar). Sem esta sincronização, alguém que acabou de trocar de cargo
      // ficava com a vila antiga no personagem até usar outro slash command.
      if (interaction.guildId) {
        await syncCharacterVillage(
          interaction.user.id,
          interaction.guildId,
          interaction.member as GuildMember | null,
        ).catch((err) => log.error("Falha ao sincronizar vila no componente:", err));
      }
      if (interaction.isButton() && cmd?.handleButton) await cmd.handleButton(interaction);
      else if (interaction.isModalSubmit() && cmd?.handleModal) await cmd.handleModal(interaction);
      else if (interaction.isAnySelectMenu() && cmd?.handleSelect) await cmd.handleSelect(interaction);
    } catch (err) {
      log.error(`Erro no componente ${interaction.customId}:`, err);
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;
  if (
    interaction.channelId === SHEET_LAUNCH_CHANNEL_ID &&
    interaction.commandName !== "ficha" &&
    !isAdmin(interaction)
  ) {
    await interaction.reply({
      content: "Neste canal só é permitido usar `/ficha`.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const command = commandMap.get(interaction.commandName);
  if (!command) return;
  // Espelha o cargo de vila no banco antes de executar: e' o unico ponto por
  // onde todo comando passa, e completeMission precisa da vila ja gravada.
  if (interaction.guildId) {
    await syncCharacterVillage(
      interaction.user.id,
      interaction.guildId,
      interaction.member as GuildMember | null,
    ).catch((err) => log.error("Falha ao sincronizar vila:", err));
  }
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
  stopTravelScheduler();
  stopSheetScheduler();
  stopAppearanceCleanupScheduler();
  stopHpRegenScheduler();
  stopDailyQuestScheduler();
  await disconnect();
  client.destroy();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

client.login(ENV.DISCORD_TOKEN);
