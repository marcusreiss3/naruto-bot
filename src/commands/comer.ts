import {
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { Command } from "./types.js";
import { ECONOMY } from "../config/balance.js";
import { getItem } from "../data/items.js";
import { getOrCreateCharacter } from "../services/characters/character-service.js";
import { eatFood } from "../services/economy/eating.js";

export const comer: Command = {
  data: new SlashCommandBuilder()
    .setName("comer")
    .setDescription("Come um alimento da mochila e recupera saciedade")
    .addStringOption((o) =>
      o.setName("item").setDescription("Alimento").setAutocomplete(true).setRequired(true),
    )
    .addIntegerOption((o) =>
      o.setName("quantidade").setDescription("Quantas unidades (padrão: 1)").setMinValue(1),
    ),

  // Sugere so' o que o personagem tem E que e' comida.
  async autocomplete(interaction: AutocompleteInteraction) {
    const guildId = interaction.guildId ?? "global";
    const char = await getOrCreateCharacter(interaction.user.id, guildId, interaction.user.username);
    const q = interaction.options.getFocused().toLocaleLowerCase("pt-BR");

    await interaction.respond(
      char.inventory
        .filter((owned) => owned.qty > 0)
        .map((owned) => ({ owned, item: getItem(owned.itemId) }))
        .filter(({ item }) => typeof item?.satiety === "number")
        .filter(({ item }) => item!.name.toLocaleLowerCase("pt-BR").includes(q))
        .slice(0, 25)
        .map(({ owned, item }) => ({
          name: `${item!.name} ×${owned.qty} (+${item!.satiety})`.slice(0, 100),
          value: item!.id,
        })),
    );
  },

  async execute(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId ?? "global";
    const char = await getOrCreateCharacter(interaction.user.id, guildId, interaction.user.username);
    const itemId = interaction.options.getString("item", true);
    const quantidade = interaction.options.getInteger("quantidade") ?? 1;

    await interaction.deferReply();
    const outcome = await eatFood(char.id, itemId, quantidade);

    if (!outcome.ok) {
      await interaction.editReply(`❌ ${outcome.error}`);
      return;
    }

    const { itemName, ganho, satiety } = outcome.result;
    await interaction.editReply(
      `🍙 **${char.displayName?.trim() || char.name}** comeu ${quantidade}x **${itemName}**.\n` +
        `Saciedade: **${satiety}/${ECONOMY.satietyMax}** (+${ganho})`,
    );
  },
};
