import {
  EmbedBuilder,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { Command } from "./types.js";
import { getItem } from "../data/items.js";
import { PERSONAL_RECIPES } from "../data/recipes.js";
import { getOrCreateCharacter } from "../services/characters/character-service.js";
import { craftPersonal, describeRecipe } from "../services/economy/crafting.js";

export const craft: Command = {
  data: new SlashCommandBuilder()
    .setName("craft")
    .setDescription("Fabricação pessoal com os materiais da sua mochila")
    .addSubcommand((s) => s.setName("listar").setDescription("Mostra as receitas que você pode fazer"))
    .addSubcommand((s) =>
      s
        .setName("criar")
        .setDescription("Fabrica uma receita")
        .addStringOption((o) =>
          o.setName("receita").setDescription("Receita").setAutocomplete(true).setRequired(true),
        )
        .addIntegerOption((o) =>
          o.setName("quantidade").setDescription("Quantas vezes (padrão: 1)").setMinValue(1),
        ),
    ),

  // So' receitas pessoais aparecem. Ainda assim, o servico revalida o escopo:
  // autocomplete e' sugestao, nunca autorizacao.
  async autocomplete(interaction: AutocompleteInteraction) {
    const q = interaction.options.getFocused().toLocaleLowerCase("pt-BR");
    await interaction.respond(
      PERSONAL_RECIPES.filter((recipe) => recipe.name.toLocaleLowerCase("pt-BR").includes(q))
        .slice(0, 25)
        .map((recipe) => ({ name: recipe.name, value: recipe.id })),
    );
  },

  async execute(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId ?? "global";
    const char = await getOrCreateCharacter(interaction.user.id, guildId, interaction.user.username);
    await interaction.deferReply({ ephemeral: true });

    if (interaction.options.getSubcommand() === "listar") {
      const embed = new EmbedBuilder()
        .setColor(0x8b5a2b)
        .setTitle("🛠️ Fabricação pessoal")
        .setDescription(PERSONAL_RECIPES.map(describeRecipe).join("\n"))
        .setFooter({
          text: "Aço, pólvora, tinta, armas avançadas e comida preparada saem das estruturas da vila, não daqui.",
        });
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const recipeId = interaction.options.getString("receita", true);
    const vezes = interaction.options.getInteger("quantidade") ?? 1;
    const outcome = await craftPersonal(char.id, recipeId, vezes);

    if (!outcome.ok) {
      await interaction.editReply(`❌ ${outcome.error}`);
      return;
    }

    const { recipe, consumido, produzido } = outcome.result;
    const saida = getItem(recipe.outputItemId)?.name ?? recipe.outputItemId;
    const gasto = consumido
      .map((item) => `• ${getItem(item.itemId)?.name ?? item.itemId} ×${item.qty}`)
      .join("\n");

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x8b5a2b)
          .setTitle(`🛠️ ${saida} ×${produzido}`)
          .addFields({ name: "Materiais usados", value: gasto }),
      ],
    });
  },
};
