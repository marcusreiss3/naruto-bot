import type { Message } from "discord.js";
import type { MissionDef } from "../../data/types.js";
import { handleKidMessage } from "./kid-dialogue.js";
import { continueInvestigationMessage } from "./investigation.js";
import { continueEscortMessage } from "./escort.js";
import { continueCleanVillageMessage } from "./clean-village.js";
import { continuePurseTheftMessage } from "./purse-thief.js";
import { continueGeninComedyMessage } from "./genin-comedy.js";
import { continueDangoRushMessage } from "./dango-rush.js";
import { continueMedicinalHerbsMessage } from "./medicinal-herbs.js";
import { continueFestivalPrepMessage } from "./festival-prep.js";
import { continueNinkenTrackingMessage } from "./ninken-tracking.js";
import { continueMarketMediationMessage } from "./market-mediation.js";
import { continueDummySubstitutionMessage } from "./dummy-substitution.js";
import { continueWaspNestsMessage } from "./wasp-nests.js";
import { continueIchirakuDeliveryMessage } from "./ichiraku-delivery.js";
import { continueCleanWaterMessage } from "./clean-water.js";
import { continueNightPatrolMessage } from "./night-patrol.js";
import { continueCloneInvestigationMessage } from "./clone-investigation.js";
import { continueUrgentDeliveriesMessage } from "./urgent-deliveries.js";
import { continueFestivalSecurityMessage } from "./festival-security.js";
import { continueDistrictNightPatrolMessage } from "./district-night-patrol.js";
import { continueFalseNinjasMessage } from "./false-ninjas.js";
import { continueSupplyDepotMessage } from "./supply-depot-defense.js";
import { continueMissingChildMessage } from "./missing-child.js";
import { continueInsectPlagueMessage } from "./insect-plague.js";
import { continueInterceptedCodeMessage } from "./intercepted-code.js";
import { continueCaveRescueMessage } from "./cave-rescue.js";
import { continueItinerantFestivalMessage } from "./itinerant-festival.js";
import { continueRouteTrapsMessage } from "./route-traps.js";
import { continueHospitalTheftMessage } from "./hospital-theft.js";
import { continueDamagedBridgeMessage } from "./damaged-bridge.js";
import { continueFloodRescueMessage } from "./flood-rescue.js";
import { continueMarketFireMessage } from "./market-fire.js";
import { continueNukeninHuntMessage } from "./nukenin-hunt.js";
import { continueRiverSmugglingMessage } from "./river-smuggling.js";
import { continueDesertAmbushMessage } from "./desert-ambush.js";
import { continueBandanaCollectorMessage } from "./bandana-collector.js";
import { continueYukiHeirMessage } from "./yuki-heir.js";
import { continueCorpsePulseMessage } from "./corpse-pulse.js";
import { continueEliteMaskMessage } from "./elite-mask.js";
import { continueForbiddenBellMessage } from "./forbidden-bell.js";
import { continueMestreEstiloMessage } from "./mestre-estilo.js";
import { runBanditMessage } from "./mission-runtime.js";
import { getActiveMissionTypesForDiscord } from "./mission-service.js";
import { PERFORMANCE_LIMITS, warnIfSlow } from "../../utils/performance.js";

type MessageHandler = (message: Message) => Promise<boolean>;

// A ordem é preservada para os raros casos em que uma missão ocupa mais de
// um fluxo de conversa. A diferença é que só os fluxos da missão ativa são
// chamados; uma mensagem normal faz uma consulta leve, em vez de dezenas.
const HANDLERS: ReadonlyArray<readonly [MissionDef["type"], MessageHandler]> = [
  ["FETCH_CAT", handleKidMessage], ["CLEAN_VILLAGE", continueCleanVillageMessage],
  ["PURSE_THIEF", continuePurseTheftMessage], ["GENIN_COMEDY", continueGeninComedyMessage],
  ["DANGO_RUSH", continueDangoRushMessage], ["MEDICINAL_HERBS", continueMedicinalHerbsMessage],
  ["FESTIVAL_PREP", continueFestivalPrepMessage], ["NINKEN_TRACKING", continueNinkenTrackingMessage],
  ["MARKET_MEDIATION", continueMarketMediationMessage], ["WASP_NESTS", continueWaspNestsMessage],
  ["ICHIRAKU_DELIVERY", continueIchirakuDeliveryMessage], ["CLEAN_WATER", continueCleanWaterMessage],
  ["NIGHT_PATROL", continueNightPatrolMessage], ["CLONE_INVESTIGATION", continueCloneInvestigationMessage],
  ["URGENT_DELIVERIES", continueUrgentDeliveriesMessage], ["FESTIVAL_SECURITY", continueFestivalSecurityMessage],
  ["DISTRICT_NIGHT_PATROL", continueDistrictNightPatrolMessage], ["FALSE_NINJAS", continueFalseNinjasMessage],
  ["SUPPLY_DEPOT_DEFENSE", continueSupplyDepotMessage], ["MISSING_CHILD", continueMissingChildMessage],
  ["CHAKRA_INSECT_PLAGUE", continueInsectPlagueMessage], ["INTERCEPTED_CODE", continueInterceptedCodeMessage],
  ["CAVE_RESCUE", continueCaveRescueMessage], ["ITINERANT_FESTIVAL_GUARD", continueItinerantFestivalMessage],
  ["ROUTE_TRAPS", continueRouteTrapsMessage], ["HOSPITAL_THEFT", continueHospitalTheftMessage],
  ["DAMAGED_BRIDGE", continueDamagedBridgeMessage], ["FLOOD_RESCUE", continueFloodRescueMessage],
  ["MARKET_FIRE", continueMarketFireMessage], ["NUKENIN_HUNT", continueNukeninHuntMessage],
  ["RIVER_SMUGGLING", continueRiverSmugglingMessage], ["DESERT_AMBUSH", continueDesertAmbushMessage],
  ["BANDANA_COLLECTOR", continueBandanaCollectorMessage], ["YUKI_HEIR", continueYukiHeirMessage],
  ["CORPSE_PULSE", continueCorpsePulseMessage], ["ELITE_MASK", continueEliteMaskMessage],
  ["FORBIDDEN_BELL", continueForbiddenBellMessage], ["DUMMY_SUBSTITUTION", continueDummySubstitutionMessage],
  ["MESTRE_ESTILO", continueMestreEstiloMessage],
  ["BANDIT_FIGHT", continueInvestigationMessage], ["ESCORT", continueEscortMessage],
  ["BANDIT_FIGHT", async (message) => {
    await runBanditMessage(message);
    return true;
  }],
];

export async function dispatchMissionMessage(message: Message): Promise<boolean> {
  if (!message.guildId) return false;
  const activeTypes = await getActiveMissionTypesForDiscord(message.author.id, message.guildId);
  for (const [type, handler] of HANDLERS) {
    if (!activeTypes.has(type)) continue;
    const startedAt = performance.now();
    const handled = await handler(message);
    warnIfSlow(`handler.${type}`, startedAt, PERFORMANCE_LIMITS.handlerMs, {
      channel: message.channelId,
    });
    if (handled) return true;
  }
  return false;
}
