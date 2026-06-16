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

export const interagir: Command = {
  data: new SlashCommandBuilder()
    .setName("interagir")
    .setDescription("Fala com um NPC da missão (investigação)")
    .addStringOption((o) =>
      o.setName("npc").setDescription("Com quem falar").setRequired(true).setAutocomplete(true),
    ),

  execute(interaction: ChatInputCommandInteraction) {
    const npc = interaction.options.getString("npc", true);
    return interactNpc(interaction, npc);
  },

  async autocomplete(interaction: AutocompleteInteraction) {
    const guildId = interaction.guildId ?? "global";
    const ctx = await resolveBandit(interaction.user.id, guildId);
    if (!ctx) {
      await interaction.respond([]);
      return;
    }
    const state = readState<BanditState>(ctx.inst.stateJson);
    const focused = interaction.options.getFocused().toLowerCase();
    const choices = availableNpcs(state)
      .map((n) => ({ name: n.name, value: n.key }))
      .filter((c) => c.name.toLowerCase().includes(focused))
      .slice(0, 25);
    await interaction.respond(choices);
  },
};
