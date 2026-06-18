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

export const interagir: Command = {
  data: new SlashCommandBuilder()
    .setName("interagir")
    .setDescription("Fala com um NPC da missão")
    .addStringOption((o) =>
      o.setName("npc").setDescription("Com quem falar").setRequired(true).setAutocomplete(true),
    ),

  execute(interaction: ChatInputCommandInteraction) {
    const npc = interaction.options.getString("npc", true);
    if (npc === "academy_instructor_yori_wasps") return interactWaspNests(interaction, npc);
    if (npc === "academy_instructor_yori") return interactDummySubstitution(interaction, npc);
    if (npc === "market_vendor_renzo" || npc === "market_vendor_aya" || npc === "market_vendors") return interactMarketMediation(interaction, npc);
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

    await interaction.respond(
      choices.filter((c) => c.name.toLowerCase().includes(focused)).slice(0, 25),
    );
  },
};
