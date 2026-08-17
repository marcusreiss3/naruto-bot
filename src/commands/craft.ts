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
import { PUPPET_SHELLS, PUPPET_UPGRADES, getPuppetUpgrade, type PuppetShell } from "../data/puppet-upgrades.js";
import { listPuppetWorkshop, startPuppetConstruction, startPuppetUpgradeConstruction } from "../services/puppets/puppet-service.js";
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
    )
    .addSubcommand((s) =>
      s
        .setName("marionete")
        .setDescription("Inicia a construção de uma marionete")
        .addStringOption((o) => o.setName("nome").setDescription("Nome da marionete").setRequired(true).setMaxLength(32))
        .addStringOption((o) =>
          o.setName("carapaca").setDescription("Especialização permanente").setRequired(true)
            .addChoices(
              { name: "Ofensiva — dano", value: "OFFENSE" },
              { name: "Defensiva — vida e escudo", value: "DEFENSE" },
              { name: "Efeito — duração e drenagem", value: "EFFECT" },
            ),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("evolucao")
        .setDescription("Inicia a construção de um mecanismo")
        .addStringOption((o) => o.setName("marionete").setDescription("Marionete que receberá a peça").setAutocomplete(true).setRequired(true))
        .addStringOption((o) => o.setName("mecanismo").setDescription("Mecanismo").setAutocomplete(true).setRequired(true)),
    ),

  // So' receitas pessoais aparecem. Ainda assim, o servico revalida o escopo:
  // autocomplete e' sugestao, nunca autorizacao.
  async autocomplete(interaction: AutocompleteInteraction) {
    const q = interaction.options.getFocused().toLocaleLowerCase("pt-BR");
    const focused = interaction.options.getFocused(true).name;
    if (focused === "marionete") {
      const char = await getOrCreateCharacter(interaction.user.id, interaction.guildId ?? "global", interaction.user.username);
      const state = await listPuppetWorkshop(char.id);
      await interaction.respond((state?.puppets ?? []).filter((p) => p.name.toLocaleLowerCase("pt-BR").includes(q)).slice(0, 25).map((p) => ({ name: `${p.name} • ${p.id.slice(-6)}`, value: p.id })));
      return;
    }
    if (focused === "mecanismo") {
      await interaction.respond(PUPPET_UPGRADES.filter((upgrade) => upgrade.name.toLocaleLowerCase("pt-BR").includes(q)).slice(0, 25).map((upgrade) => ({ name: `Grau ${upgrade.grade} • ${upgrade.name}`, value: upgrade.id })));
      return;
    }
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

    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "listar") {
      const workshop = await listPuppetWorkshop(char.id);
      const ownsWorkshop = workshop?.skillNodes.some((node) => node.nodeId === "kugutsu_oficina_inicial");
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
            ...(ownsWorkshop ? [
              divider(),
              listBlock("Oficina de Marionetes", [
                ...Object.entries(PUPPET_SHELLS).map(([, shell]) => `**${shell.name}** — ${shell.durationHours}h • ${shell.ryo} Ryō`),
                ...PUPPET_UPGRADES.map((upgrade) => `**Grau ${upgrade.grade} • ${upgrade.name}** — ${upgrade.durationHours}h • ${upgrade.ryo} Ryō`),
              ], ""),
              text("-# Use `/craft marionete` para a carapaça e `/craft evolucao` para um mecanismo."),
            ] : []),
          ]),
        ]),
      );
      return;
    }

    if (subcommand === "marionete") {
      const outcome = await startPuppetConstruction(
        char.id,
        interaction.options.getString("nome", true),
        interaction.options.getString("carapaca", true),
      );
      if (!outcome.ok) { await interaction.editReply(`❌ ${outcome.error}`); return; }
      const shell = PUPPET_SHELLS[outcome.shell as PuppetShell];
      await interaction.editReply(v2Edit([economyContainer("estoque", [
        titleBlock("carapaca", "Carapaça em construção", `A oficina termina em ${outcome.durationHours} hora(s)`),
        divider(),
        receiptBlock(`**${outcome.name}** será montada com **${shell.name}**.`),
        text(`-# Materiais e ${shell.ryo} Ryō foram reservados. Recolha a marionete em \`/marionetes\` quando estiver pronta.`),
      ])]));
      return;
    }

    if (subcommand === "evolucao") {
      const outcome = await startPuppetUpgradeConstruction(char.id, interaction.options.getString("marionete", true), interaction.options.getString("mecanismo", true));
      if (!outcome.ok) { await interaction.editReply(`❌ ${outcome.error}`); return; }
      await interaction.editReply(v2Edit([economyContainer("estoque", [
        titleBlock("mecanismo", "Mecanismo em construção", `A oficina termina em ${outcome.upgrade.durationHours} hora(s)`),
        divider(),
        receiptBlock(`**${outcome.upgrade.name}** foi iniciado.`),
        text(`-# Custo: ${outcome.upgrade.ryo} Ryō. Ao concluir, instale a peça em \`/marionetes\`.`),
      ])]));
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
