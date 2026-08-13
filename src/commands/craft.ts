import {
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { Command } from "./types.js";
import { getItem } from "../data/items.js";
import { PERSONAL_RECIPES } from "../data/recipes.js";
import { getOrCreateCharacter } from "../services/characters/character-service.js";
import { craftPersonal, describeRecipe } from "../services/economy/crafting.js";
import {
  divider,
  economyContainer,
  itemLabel,
  listBlock,
  receiptBlock,
  text,
  titleBlock,
  v2Edit,
} from "../ui/economy-components-v2.js";

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
      await interaction.editReply(
        v2Edit([
          economyContainer("estoque", [
            titleBlock("manutencao", "Fabricação pessoal", "Consome a sua mochila e entrega na hora"),
            divider(),
            listBlock(null, PERSONAL_RECIPES.map(describeRecipe), "Nenhuma receita disponível."),
            divider(),
            text(
              "-# Aço, pólvora, tinta, armas avançadas e comida preparada saem das estruturas da vila, não daqui.",
            ),
          ]),
        ]),
      );
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

    await interaction.editReply(
      v2Edit([
        economyContainer("cofre", [
          titleBlock("manutencao", "Fabricação concluída"),
          receiptBlock(`Você fabricou ${itemLabel(recipe.outputItemId, saida, produzido)}.`),
          divider(),
          listBlock(
            "Materiais usados",
            consumido.map((item) =>
              itemLabel(item.itemId, getItem(item.itemId)?.name ?? item.itemId, item.qty),
            ),
            "Nenhum.",
          ),
        ]),
      ]),
    );
  },
};
