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

export const interagir: Command = {
  data: new SlashCommandBuilder()
    .setName("interagir")
    .setDescription("Fala com um NPC da missão")
    .addStringOption((o) =>
      o.setName("npc").setDescription("Com quem falar").setRequired(true).setAutocomplete(true),
    ),

  execute(interaction: ChatInputCommandInteraction) {
    const npc = interaction.options.getString("npc", true);
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

    await interaction.respond(
      choices.filter((c) => c.name.toLowerCase().includes(focused)).slice(0, 25),
    );
  },
};
