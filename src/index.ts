import { Client, GatewayIntentBits, Events, MessageFlags } from "discord.js";
import { ENV } from "./config/env.js";
import { commandMap } from "./commands/index.js";
import { log } from "./utils/logger.js";
import { disconnect } from "./db/client.js";
import { startWebServer } from "./server/index.js";
import { runBanditMessage } from "./services/missions/mission-runtime.js";
import { handleKidMessage } from "./services/missions/kid-dialogue.js";
import { continueInvestigationMessage } from "./services/missions/investigation.js";
import { continueEscortMessage } from "./services/missions/escort.js";
import { continueCleanVillageMessage } from "./services/missions/clean-village.js";
import { continuePurseTheftMessage } from "./services/missions/purse-thief.js";
import { continueGeninComedyMessage } from "./services/missions/genin-comedy.js";
import { continueDangoRushMessage } from "./services/missions/dango-rush.js";
import { continueMedicinalHerbsMessage } from "./services/missions/medicinal-herbs.js";
import { continueFestivalPrepMessage } from "./services/missions/festival-prep.js";
import { continueNinkenTrackingMessage } from "./services/missions/ninken-tracking.js";
import { continueMarketMediationMessage } from "./services/missions/market-mediation.js";
import { continueDummySubstitutionMessage } from "./services/missions/dummy-substitution.js";

import { continueWaspNestsMessage } from "./services/missions/wasp-nests.js";
import { continueIchirakuDeliveryMessage } from "./services/missions/ichiraku-delivery.js";
import { continueCleanWaterMessage } from "./services/missions/clean-water.js";
import { continueNightPatrolMessage } from "./services/missions/night-patrol.js";
import { continueCloneInvestigationMessage } from "./services/missions/clone-investigation.js";
import { continueUrgentDeliveriesMessage } from "./services/missions/urgent-deliveries.js";
import { continueFestivalSecurityMessage } from "./services/missions/festival-security.js";
import { continueFalseNinjasMessage } from "./services/missions/false-ninjas.js";
import { continueSupplyDepotMessage } from "./services/missions/supply-depot-defense.js";
import { continueMissingChildMessage } from "./services/missions/missing-child.js";
import { continueInsectPlagueMessage } from "./services/missions/insect-plague.js";
import { continueInterceptedCodeMessage } from "./services/missions/intercepted-code.js";
import { continueCaveRescueMessage } from "./services/missions/cave-rescue.js";
import { continueItinerantFestivalMessage } from "./services/missions/itinerant-festival.js";
import { continueRouteTrapsMessage } from "./services/missions/route-traps.js";
import { continueHospitalTheftMessage } from "./services/missions/hospital-theft.js";
import { continueDamagedBridgeMessage } from "./services/missions/damaged-bridge.js";
import { continueFloodRescueMessage } from "./services/missions/flood-rescue.js";
import { continueDistrictNightPatrolMessage } from "./services/missions/district-night-patrol.js";
import { continueMarketFireMessage } from "./services/missions/market-fire.js";
import { continueNukeninHuntMessage } from "./services/missions/nukenin-hunt.js";
import { continueRiverSmugglingMessage } from "./services/missions/river-smuggling.js";
import { continueDesertAmbushMessage } from "./services/missions/desert-ambush.js";
import { continueBandanaCollectorMessage } from "./services/missions/bandana-collector.js";
import { continueYukiHeirMessage } from "./services/missions/yuki-heir.js";
import { continueCorpsePulseMessage } from "./services/missions/corpse-pulse.js";
import { continueEliteMaskMessage } from "./services/missions/elite-mask.js";
import { continueForbiddenBellMessage } from "./services/missions/forbidden-bell.js";
import { restoreTrainingExpirations } from "./services/combat/training-dummy.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, async (c) => {
  log.info(`Bot online como ${c.user.tag}`);
  await restoreTrainingExpirations(async (channelId) => {
    const channel = await c.channels.fetch(channelId).catch(() => null);
    if (channel?.isTextBased() && "send" in channel) {
      await channel.send("⏱️ O Boneco de Treino desapareceu após 30 minutos.");
    }
  }).catch((err) => log.error("Falha ao restaurar temporizadores de treino:", err));
});

// Sobe o site da árvore de habilidades no mesmo processo (no-op se nao configurado).
void startWebServer().catch((err) => log.error("Falha ao subir o site:", err));

// Mensagens normais no canal continuam diálogos (criança da missão do gato / líder dos bandidos).
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  try {
    if (await handleKidMessage(message)) return;
    if (await continueCleanVillageMessage(message)) return;
    if (await continuePurseTheftMessage(message)) return;
    if (await continueGeninComedyMessage(message)) return;
    if (await continueDangoRushMessage(message)) return;
    if (await continueMedicinalHerbsMessage(message)) return;
    if (await continueFestivalPrepMessage(message)) return;
    if (await continueNinkenTrackingMessage(message)) return;
    if (await continueMarketMediationMessage(message)) return;
    if (await continueWaspNestsMessage(message)) return;
    if (await continueIchirakuDeliveryMessage(message)) return;
    if (await continueCleanWaterMessage(message)) return;
    if (await continueNightPatrolMessage(message)) return;
    if (await continueCloneInvestigationMessage(message)) return;
    if (await continueUrgentDeliveriesMessage(message)) return;
    if (await continueFestivalSecurityMessage(message)) return;
    if (await continueDistrictNightPatrolMessage(message)) return;
    if (await continueFalseNinjasMessage(message)) return;
    if (await continueSupplyDepotMessage(message)) return;
    if (await continueMissingChildMessage(message)) return;
    if (await continueInsectPlagueMessage(message)) return;
    if (await continueInterceptedCodeMessage(message)) return;
    if (await continueCaveRescueMessage(message)) return;
    if (await continueItinerantFestivalMessage(message)) return;
    if (await continueRouteTrapsMessage(message)) return;
    if (await continueHospitalTheftMessage(message)) return;
    if (await continueDamagedBridgeMessage(message)) return;
    if (await continueFloodRescueMessage(message)) return;
    if (await continueMarketFireMessage(message)) return;
    if (await continueNukeninHuntMessage(message)) return;
    if (await continueRiverSmugglingMessage(message)) return;
    if (await continueDesertAmbushMessage(message)) return;
    if (await continueBandanaCollectorMessage(message)) return;
    if (await continueYukiHeirMessage(message)) return;
    if (await continueCorpsePulseMessage(message)) return;
    if (await continueEliteMaskMessage(message)) return;
    if (await continueForbiddenBellMessage(message)) return;
    if (await continueDummySubstitutionMessage(message)) return;
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
