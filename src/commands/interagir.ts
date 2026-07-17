import {
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { Command } from "./types.js";
import { readState } from "../services/missions/mission-service.js";
import {
  interactNpc,
  resolveBandit,
  availableNpcs,
  type BanditState,
} from "../services/missions/investigation.js";
import {
  interactEscort,
  resolveEscort,
  availableEscortNpcs,
  type EscortState,
} from "../services/missions/escort.js";
import {
  interactPurseTheft,
  resolvePurseTheft,
  availablePurseNpcs,
  type PurseTheftState,
} from "../services/missions/purse-thief.js";
import {
  interactGeninComedy,
  resolveGeninComedy,
  availableGeninComedyNpcs,
  type GeninComedyState,
} from "../services/missions/genin-comedy.js";
import {
  interactDangoRush,
  resolveDangoRush,
  availableDangoRushNpcs,
  type DangoRushState,
} from "../services/missions/dango-rush.js";
import {
  interactMedicinalHerbs,
  resolveMedicinalHerbs,
  availableMedicinalHerbsNpcs,
  type MedicinalHerbsState,
} from "../services/missions/medicinal-herbs.js";
import {
  interactFestivalPrep,
  resolveFestivalPrep,
  availableFestivalPrepNpcs,
  type FestivalPrepState,
} from "../services/missions/festival-prep.js";
import {
  interactNinkenTracking,
  resolveNinkenTracking,
  availableNinkenNpcs,
  type NinkenTrackingState,
} from "../services/missions/ninken-tracking.js";
import {
  interactMarketMediation,
  resolveMarketMediation,
  availableMarketMediationNpcs,
  type MarketMediationState,
} from "../services/missions/market-mediation.js";
import {
  interactDummySubstitution,
  resolveDummySubstitution,
  availableDummySubstitutionNpcs,
  type DummySubstitutionState,
} from "../services/missions/dummy-substitution.js";
import {
  interactWaspNests,
  resolveWaspNests,
  availableWaspNestsNpcs,
  type WaspNestsState,
} from "../services/missions/wasp-nests.js";
import {
  interactIchirakuDelivery,
  resolveIchirakuDelivery,
  availableIchirakuDeliveryNpcs,
  type IchirakuDeliveryState,
} from "../services/missions/ichiraku-delivery.js";
import {
  interactCleanWater,
  resolveCleanWater,
  availableCleanWaterNpcs,
  type CleanWaterState,
} from "../services/missions/clean-water.js";
import {
  interactNightPatrol,
  resolveNightPatrol,
  availableNightPatrolNpcs,
  type NightPatrolState,
} from "../services/missions/night-patrol.js";
import {
  interactCloneInvestigation,
  resolveCloneInvestigation,
  availableCloneInvestigationNpcs,
  type CloneInvestigationState,
} from "../services/missions/clone-investigation.js";
import {
  interactUrgentDeliveries,
  resolveUrgentDeliveries,
  availableUrgentDeliveriesNpcs,
  type UrgentDeliveriesState,
} from "../services/missions/urgent-deliveries.js";
import {
  interactFestivalSecurity,
  resolveFestivalSecurity,
  availableFestivalSecurityNpcs,
  type FestivalSecurityState,
} from "../services/missions/festival-security.js";
import {
  interactFalseNinjas,
  resolveFalseNinjas,
  availableFalseNinjasNpcs,
  type FalseNinjasState,
} from "../services/missions/false-ninjas.js";
import {
  interactSupplyDepot,
  resolveSupplyDepot,
  availableSupplyDepotNpcs,
  type SupplyDepotState,
} from "../services/missions/supply-depot-defense.js";
import {
  interactMissingChild,
  resolveMissingChild,
  availableMissingChildNpcs,
  type MissingChildState,
} from "../services/missions/missing-child.js";
import {
  interactInsectPlague,
  resolveInsectPlague,
  availableInsectPlagueNpcs,
  type InsectPlagueState,
} from "../services/missions/insect-plague.js";
import {
  interactInterceptedCode,
  resolveInterceptedCode,
  availableInterceptedCodeNpcs,
  type InterceptedCodeState,
} from "../services/missions/intercepted-code.js";
import {
  interactCaveRescue,
  resolveCaveRescue,
  availableCaveRescueNpcs,
  type CaveRescueState,
} from "../services/missions/cave-rescue.js";
import {
  interactItinerantFestival,
  resolveItinerantFestival,
  availableItinerantFestivalNpcs,
  type ItinerantFestivalState,
} from "../services/missions/itinerant-festival.js";
import {
  interactRouteTraps,
  resolveRouteTraps,
  availableRouteTrapsNpcs,
  type RouteTrapsState,
} from "../services/missions/route-traps.js";
import {
  interactHospitalTheft,
  resolveHospitalTheft,
  availableHospitalTheftNpcs,
  type HospitalTheftState,
} from "../services/missions/hospital-theft.js";
import {
  interactDamagedBridge,
  resolveDamagedBridge,
  availableDamagedBridgeNpcs,
  type DamagedBridgeState,
} from "../services/missions/damaged-bridge.js";
import {
  interactFloodRescue,
  resolveFloodRescue,
  availableFloodRescueNpcs,
  type FloodRescueState,
} from "../services/missions/flood-rescue.js";
import {
  interactDistrictNightPatrol,
  resolveDistrictNightPatrol,
  availableDistrictNightPatrolNpcs,
  type DistrictNightPatrolState,
} from "../services/missions/district-night-patrol.js";
import {
  interactMarketFire,
  resolveMarketFire,
  availableMarketFireNpcs,
  type MarketFireState,
} from "../services/missions/market-fire.js";
import {
  interactNukeninHunt,
  resolveNukeninHunt,
  availableNukeninHuntNpcs,
  type NukeninHuntState,
} from "../services/missions/nukenin-hunt.js";
import {
  interactRiverSmuggling,
  resolveRiverSmuggling,
  availableRiverSmugglingNpcs,
  type RiverSmugglingState,
} from "../services/missions/river-smuggling.js";
import {
  interactDesertAmbush,
  resolveDesertAmbush,
  availableDesertAmbushNpcs,
  type DesertAmbushState,
} from "../services/missions/desert-ambush.js";
import {
  interactBandanaCollector,
  resolveBandanaCollector,
  availableBandanaCollectorNpcs,
  type BandanaCollectorState,
} from "../services/missions/bandana-collector.js";
import {
  interactYukiHeir,
  resolveYukiHeir,
  availableYukiHeirNpcs,
  type YukiHeirState,
} from "../services/missions/yuki-heir.js";
import {
  interactCorpsePulse,
  resolveCorpsePulse,
  availableCorpsePulseNpcs,
  type CorpsePulseState,
} from "../services/missions/corpse-pulse.js";
import {
  interactEliteMask,
  resolveEliteMask,
  availableEliteMaskNpcs,
  type EliteMaskState,
} from "../services/missions/elite-mask.js";
import {
  interactForbiddenBell,
  resolveForbiddenBell,
  availableForbiddenBellNpcs,
  type ForbiddenBellState,
} from "../services/missions/forbidden-bell.js";

export const interagir: Command = {
  data: new SlashCommandBuilder()
    .setName("interagir")
    .setDescription("Fala com um NPC da missão")
    .addStringOption((o) =>
      o.setName("npc").setDescription("Com quem falar").setRequired(true).setAutocomplete(true),
    ),

  execute(interaction: ChatInputCommandInteraction) {
    const npc = interaction.options.getString("npc", true);
    if (npc.startsWith("forbidden_bell_")) return interactForbiddenBell(interaction, npc);
    if (npc.startsWith("elite_mask_")) return interactEliteMask(interaction, npc);
    if (npc.startsWith("corpse_")) return interactCorpsePulse(interaction, npc);
    if (npc.startsWith("yuki_")) return interactYukiHeir(interaction, npc);
    if (npc.startsWith("flood_rescue_")) return interactFloodRescue(interaction, npc);
    if (npc.startsWith("damaged_bridge_")) return interactDamagedBridge(interaction, npc);
    if (npc.startsWith("hospital_theft_")) return interactHospitalTheft(interaction, npc);
    if (npc.startsWith("route_traps_")) return interactRouteTraps(interaction, npc);
    if (npc.startsWith("itinerant_festival_")) return interactItinerantFestival(interaction, npc);
    if (npc.startsWith("cave_rescue_")) return interactCaveRescue(interaction, npc);
    if (npc.startsWith("intercepted_code_")) return interactInterceptedCode(interaction, npc);
    if (npc.startsWith("insect_plague_")) return interactInsectPlague(interaction, npc);
    if (npc.startsWith("missing_child_")) return interactMissingChild(interaction, npc);
    if (npc === "market_fire_sayuri" || npc === "market_arsonist") return interactMarketFire(interaction, npc);
    if (npc === "nukenin_clerk_konoha" || npc === "nukenin_informant" || npc === "minor_nukenin") {
      return interactNukeninHunt(interaction, npc);
    }
    if (npc === "river_smuggling_clerk" || npc === "river_boatman") return interactRiverSmuggling(interaction, npc);
    if (npc === "desert_caravan_master" || npc === "desert_raider_captain") {
      return interactDesertAmbush(interaction, npc);
    }
    if (npc === "bandana_collector_clerk" || npc === "bandana_collector_boss") {
      return interactBandanaCollector(interaction, npc);
    }
    if (npc.startsWith("supply_depot_")) return interactSupplyDepot(interaction, npc);
    if (npc.startsWith("false_ninjas_")) return interactFalseNinjas(interaction, npc);
    if (npc === "festival_security_sayuri" || npc === "festival_fake_vendor" || npc === "festival_rogue_ninja") {
      return interactFestivalSecurity(interaction, npc);
    }
    if (npc === "district_patrol_scout") return interactDistrictNightPatrol(interaction, npc);
    if (npc === "courier_emi" || npc.startsWith("delivery_")) return interactUrgentDeliveries(interaction, npc);
    if (npc === "academy_instructor_yori_clone" || npc.startsWith("clone_kenta_")) {
      return interactCloneInvestigation(interaction, npc);
    }
    if (npc === "academy_instructor_yori_wasps") return interactWaspNests(interaction, npc);
    if (npc === "ninja_medico_haru_water") return interactCleanWater(interaction, npc);
    if (npc === "ayame_ichiraku") return interactIchirakuDelivery(interaction, npc);
    if (npc === "alley_troublemaker") return interactNightPatrol(interaction, npc);
    if (npc === "academy_instructor_yori") return interactDummySubstitution(interaction, npc);
    if (npc === "market_vendor_hina" || npc === "market_vendor_aya" || npc === "market_vendors") return interactMarketMediation(interaction, npc);
    if (npc === "ninken_trainer" || npc === "ninken_mugi") return interactNinkenTracking(interaction, npc);
    if (npc === "festival_organizer" || npc === "festival_cheater") return interactFestivalPrep(interaction, npc);
    if (npc === "ninja_medico_haru") return interactMedicinalHerbs(interaction, npc);
    if (npc === "comerciante_bolinhos") return interactDangoRush(interaction, npc);
    if (npc.startsWith("genin_")) return interactGeninComedy(interaction, npc);
    if (npc === "velinha" || npc === "ladrao_bolsas") return interactPurseTheft(interaction, npc);
    // escolta: o comerciante; bandidos: mercador / criança
    if (npc === "comerciante") return interactEscort(interaction);
    return interactNpc(interaction, npc);
  },

  async autocomplete(interaction: AutocompleteInteraction) {
    const guildId = interaction.guildId ?? "global";
    const focused = interaction.options.getFocused().toLowerCase();
    const choices: { name: string; value: string }[] = [];

    const bandit = await resolveBandit(interaction.user.id, guildId);
    if (bandit) {
      const state = readState<BanditState>(bandit.inst.stateJson);
      choices.push(...availableNpcs(state).map((n) => ({ name: n.name, value: n.key })));
    }

    const escort = await resolveEscort(interaction.user.id, guildId);
    if (escort) {
      const state = readState<EscortState>(escort.inst.stateJson);
      choices.push(...availableEscortNpcs(state));
    }

    const purse = await resolvePurseTheft(interaction.user.id, guildId);
    if (purse) {
      const state = readState<PurseTheftState>(purse.inst.stateJson);
      choices.push(...availablePurseNpcs(state, interaction.channelId).map((n) => ({ name: n.name, value: n.key })));
    }

    const genin = await resolveGeninComedy(interaction.user.id, guildId);
    if (genin) {
      const state = readState<GeninComedyState>(genin.inst.stateJson);
      choices.push(...availableGeninComedyNpcs(state, interaction.channelId).map((n) => ({ name: n.name, value: n.key })));
    }

    const dango = await resolveDangoRush(interaction.user.id, guildId);
    if (dango) {
      const state = readState<DangoRushState>(dango.inst.stateJson);
      choices.push(...availableDangoRushNpcs(state, interaction.channelId).map((n) => ({ name: n.name, value: n.key })));
    }

    const herbs = await resolveMedicinalHerbs(interaction.user.id, guildId);
    if (herbs) {
      const state = readState<MedicinalHerbsState>(herbs.inst.stateJson);
      choices.push(...availableMedicinalHerbsNpcs(state, interaction.channelId).map((n) => ({ name: n.name, value: n.key })));
    }

    const festival = await resolveFestivalPrep(interaction.user.id, guildId);
    if (festival) {
      const state = readState<FestivalPrepState>(festival.inst.stateJson);
      choices.push(...availableFestivalPrepNpcs(state, interaction.channelId).map((n) => ({ name: n.name, value: n.key })));
    }

    const ninken = await resolveNinkenTracking(interaction.user.id, guildId);
    if (ninken) {
      const state = readState<NinkenTrackingState>(ninken.inst.stateJson);
      choices.push(...availableNinkenNpcs(state, interaction.channelId).map((n) => ({ name: n.name, value: n.key })));
    }

    const market = await resolveMarketMediation(interaction.user.id, guildId);
    if (market) {
      const state = readState<MarketMediationState>(market.inst.stateJson);
      choices.push(...availableMarketMediationNpcs(state, interaction.channelId).map((n) => ({ name: n.name, value: n.key })));
    }

    const dummy = await resolveDummySubstitution(interaction.user.id, guildId);
    if (dummy) {
      const state = readState<DummySubstitutionState>(dummy.inst.stateJson);
      choices.push(...availableDummySubstitutionNpcs(state, interaction.channelId).map((n) => ({ name: n.name, value: n.key })));
    }

    const wasps = await resolveWaspNests(interaction.user.id, guildId);
    if (wasps) {
      const state = readState<WaspNestsState>(wasps.inst.stateJson);
      choices.push(...availableWaspNestsNpcs(state, interaction.channelId).map((n) => ({ name: n.name, value: n.key })));
    }

    const ichiraku = await resolveIchirakuDelivery(interaction.user.id, guildId);
    if (ichiraku) {
      const state = readState<IchirakuDeliveryState>(ichiraku.inst.stateJson);
      choices.push(...availableIchirakuDeliveryNpcs(state, interaction.channelId).map((n) => ({ name: n.name, value: n.key })));
    }

    const water = await resolveCleanWater(interaction.user.id, guildId);
    if (water) {
      const state = readState<CleanWaterState>(water.inst.stateJson);
      choices.push(...availableCleanWaterNpcs(state, interaction.channelId).map((n) => ({ name: n.name, value: n.key })));
    }

    const patrol = await resolveNightPatrol(interaction.user.id, guildId);
    if (patrol) {
      const state = readState<NightPatrolState>(patrol.inst.stateJson);
      choices.push(...availableNightPatrolNpcs(state, interaction.channelId).map((n) => ({ name: n.name, value: n.key })));
    }

    const clone = await resolveCloneInvestigation(interaction.user.id, guildId);
    if (clone) {
      const state = readState<CloneInvestigationState>(clone.inst.stateJson);
      choices.push(...availableCloneInvestigationNpcs(state, interaction.channelId).map((n) => ({ name: n.name, value: n.key })));
    }

    const deliveries = await resolveUrgentDeliveries(interaction.user.id, guildId);
    if (deliveries) {
      const state = readState<UrgentDeliveriesState>(deliveries.inst.stateJson);
      choices.push(...availableUrgentDeliveriesNpcs(state, interaction.channelId).map((n) => ({ name: n.name, value: n.key })));
    }

    const festivalSecurity = await resolveFestivalSecurity(interaction.user.id, guildId);
    if (festivalSecurity) {
      const state = readState<FestivalSecurityState>(festivalSecurity.inst.stateJson);
      choices.push(...availableFestivalSecurityNpcs(state, interaction.channelId).map((n) => ({ name: n.name, value: n.key })));
    }

    const districtNightPatrol = await resolveDistrictNightPatrol(interaction.user.id, guildId);
    if (districtNightPatrol) {
      const state = readState<DistrictNightPatrolState>(districtNightPatrol.inst.stateJson);
      choices.push(...availableDistrictNightPatrolNpcs(state, interaction.channelId).map((n) => ({ name: n.name, value: n.key })));
    }

    const falseNinjas = await resolveFalseNinjas(interaction.user.id, guildId, interaction.channelId);
    if (falseNinjas) {
      const state = readState<FalseNinjasState>(falseNinjas.inst.stateJson);
      choices.push(
        ...availableFalseNinjasNpcs(state, interaction.channelId, falseNinjas.variant)
          .map((n) => ({ name: n.name, value: n.key })),
      );
    }

    const supplyDepot = await resolveSupplyDepot(interaction.user.id, guildId, interaction.channelId);
    if (supplyDepot) {
      const state = readState<SupplyDepotState>(supplyDepot.inst.stateJson);
      choices.push(
        ...availableSupplyDepotNpcs(state, interaction.channelId, supplyDepot.variant)
          .map((n) => ({ name: n.name, value: n.key })),
      );
    }

    const missingChild = await resolveMissingChild(interaction.user.id, guildId, interaction.channelId);
    if (missingChild) {
      const state = readState<MissingChildState>(missingChild.inst.stateJson);
      choices.push(
        ...availableMissingChildNpcs(state, interaction.channelId, missingChild.variant)
          .map((n) => ({ name: n.name, value: n.key })),
      );
    }

    const insectPlague = await resolveInsectPlague(interaction.user.id, guildId, interaction.channelId);
    if (insectPlague) {
      const state = readState<InsectPlagueState>(insectPlague.inst.stateJson);
      choices.push(
        ...availableInsectPlagueNpcs(state, interaction.channelId, insectPlague.variant)
          .map((n) => ({ name: n.name, value: n.key })),
      );
    }

    const interceptedCode = await resolveInterceptedCode(interaction.user.id, guildId, interaction.channelId);
    if (interceptedCode) {
      const state = readState<InterceptedCodeState>(interceptedCode.inst.stateJson);
      choices.push(
        ...availableInterceptedCodeNpcs(state, interaction.channelId, interceptedCode.variant)
          .map((n) => ({ name: n.name, value: n.key })),
      );
    }

    const caveRescue = await resolveCaveRescue(interaction.user.id, guildId, interaction.channelId);
    if (caveRescue) {
      const state = readState<CaveRescueState>(caveRescue.inst.stateJson);
      choices.push(
        ...availableCaveRescueNpcs(state, interaction.channelId, caveRescue.variant)
          .map((n) => ({ name: n.name, value: n.key })),
      );
    }

    const itinerantFestival = await resolveItinerantFestival(interaction.user.id, guildId, interaction.channelId);
    if (itinerantFestival) {
      const state = readState<ItinerantFestivalState>(itinerantFestival.inst.stateJson);
      choices.push(
        ...availableItinerantFestivalNpcs(state, interaction.channelId, itinerantFestival.variant)
          .map((n) => ({ name: n.name, value: n.key })),
      );
    }

    const routeTraps = await resolveRouteTraps(interaction.user.id, guildId, interaction.channelId);
    if (routeTraps) {
      const state = readState<RouteTrapsState>(routeTraps.inst.stateJson);
      choices.push(
        ...availableRouteTrapsNpcs(state, interaction.channelId, routeTraps.variant)
          .map((n) => ({ name: n.name, value: n.key })),
      );
    }

    const hospitalTheft = await resolveHospitalTheft(interaction.user.id, guildId, interaction.channelId);
    if (hospitalTheft) {
      const state = readState<HospitalTheftState>(hospitalTheft.inst.stateJson);
      choices.push(
        ...availableHospitalTheftNpcs(state, interaction.channelId, hospitalTheft.variant)
          .map((n) => ({ name: n.name, value: n.key })),
      );
    }

    const damagedBridge = await resolveDamagedBridge(interaction.user.id, guildId, interaction.channelId);
    if (damagedBridge) {
      const state = readState<DamagedBridgeState>(damagedBridge.inst.stateJson);
      choices.push(
        ...availableDamagedBridgeNpcs(state, interaction.channelId, damagedBridge.variant)
          .map((n) => ({ name: n.name, value: n.key })),
      );
    }

    const floodRescue = await resolveFloodRescue(interaction.user.id, guildId, interaction.channelId);
    if (floodRescue) {
      const state = readState<FloodRescueState>(floodRescue.inst.stateJson);
      choices.push(
        ...availableFloodRescueNpcs(state, interaction.channelId, floodRescue.variant)
          .map((n) => ({ name: n.name, value: n.key })),
      );
    }

    const marketFire = await resolveMarketFire(interaction.user.id, guildId);
    if (marketFire) {
      const state = readState<MarketFireState>(marketFire.inst.stateJson);
      choices.push(...availableMarketFireNpcs(state, interaction.channelId).map((n) => ({ name: n.name, value: n.key })));
    }

    const nukeninHunt = await resolveNukeninHunt(interaction.user.id, guildId);
    if (nukeninHunt) {
      const state = readState<NukeninHuntState>(nukeninHunt.inst.stateJson);
      choices.push(...availableNukeninHuntNpcs(state, interaction.channelId).map((n) => ({ name: n.name, value: n.key })));
    }

    const riverSmuggling = await resolveRiverSmuggling(interaction.user.id, guildId);
    if (riverSmuggling) {
      const state = readState<RiverSmugglingState>(riverSmuggling.inst.stateJson);
      choices.push(...availableRiverSmugglingNpcs(state, interaction.channelId).map((n) => ({ name: n.name, value: n.key })));
    }

    const desertAmbush = await resolveDesertAmbush(interaction.user.id, guildId);
    if (desertAmbush) {
      const state = readState<DesertAmbushState>(desertAmbush.inst.stateJson);
      choices.push(...availableDesertAmbushNpcs(state, interaction.channelId).map((n) => ({ name: n.name, value: n.key })));
    }

    const bandanaCollector = await resolveBandanaCollector(interaction.user.id, guildId);
    if (bandanaCollector) {
      const state = readState<BandanaCollectorState>(bandanaCollector.inst.stateJson);
      choices.push(...availableBandanaCollectorNpcs(state, interaction.channelId).map((n) => ({ name: n.name, value: n.key })));
    }

    const yukiHeir = await resolveYukiHeir(interaction.user.id, guildId, interaction.channelId);
    if (yukiHeir) {
      const state = readState<YukiHeirState>(yukiHeir.inst.stateJson);
      choices.push(...availableYukiHeirNpcs(state, interaction.channelId).map((n) => ({ name: n.name, value: n.key })));
    }

    const corpsePulse = await resolveCorpsePulse(interaction.user.id, guildId, interaction.channelId);
    if (corpsePulse) {
      const state = readState<CorpsePulseState>(corpsePulse.inst.stateJson);
      choices.push(...availableCorpsePulseNpcs(state, interaction.channelId).map((n) => ({ name: n.name, value: n.key })));
    }

    const eliteMask = await resolveEliteMask(interaction.user.id, guildId, interaction.channelId);
    if (eliteMask) {
      const state = readState<EliteMaskState>(eliteMask.inst.stateJson);
      choices.push(...availableEliteMaskNpcs(state, interaction.channelId).map((n) => ({ name: n.name, value: n.key })));
    }

    const forbiddenBell = await resolveForbiddenBell(interaction.user.id, guildId, interaction.channelId);
    if (forbiddenBell) {
      const state = readState<ForbiddenBellState>(forbiddenBell.inst.stateJson);
      choices.push(...availableForbiddenBellNpcs(state, interaction.channelId).map((n) => ({ name: n.name, value: n.key })));
    }

    await interaction.respond(
      choices.filter((c) => c.name.toLowerCase().includes(focused)).slice(0, 25),
    );
  },
};
