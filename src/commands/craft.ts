import {
  ActionRowBuilder,
  ButtonStyle,
  ModalBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type AnySelectMenuInteraction,
  type AutocompleteInteraction,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import type { Command } from "./types.js";
import { getItem } from "../data/items.js";
import { PERSONAL_RECIPES } from "../data/recipes.js";
import { getOrCreateCharacter } from "../services/characters/character-service.js";
import { craftPersonal, describeRecipe } from "../services/economy/crafting.js";
import { PUPPET_SHELLS, type PuppetShell } from "../data/puppet-upgrades.js";
import { listPuppetWorkshop, PUPPET_OWNERSHIP_LIMIT, startPuppetConstruction } from "../services/puppets/puppet-service.js";
import {
  button, buttonRow, divider, economyContainer, factsBlock, itemLabel, listBlock,
  noticeBlock, receiptBlock, ryo, selectRow, text, titleBlock, v2Edit, v2Payload,
  type ContainerChild, type TopLevel,
} from "../ui/economy-components-v2.js";
import { emoji } from "../ui/economy-emojis.js";

const PUPPET_PREFIX = "craft:puppet:v1";
type Workshop = NonNullable<Awaited<ReturnType<typeof listPuppetWorkshop>>>;

function requirements(state: Workshop, shell: PuppetShell): string[] {
  const recipe = PUPPET_SHELLS[shell];
  const inventory = new Map(state.inventory.map((entry) => [entry.itemId, entry.qty]));
  return [
    `${ryo(recipe.ryo)} Ryō — **${state.ryo}/${recipe.ryo}**${state.ryo >= recipe.ryo ? " ✓" : ` • falta **${recipe.ryo - state.ryo}**`}`,
    ...recipe.ingredients.map((ingredient) => {
      const have = inventory.get(ingredient.itemId) ?? 0;
      const missing = Math.max(0, ingredient.qty - have);
      return `${itemLabel(ingredient.itemId, getItem(ingredient.itemId)?.name ?? ingredient.itemId)} — **${have}/${ingredient.qty}**${missing ? ` • falta **${missing}**` : " ✓"}`;
    }),
  ];
}

function puppetCraftPanel(state: Workshop, shell: PuppetShell, feedback?: string): TopLevel[] {
  const recipe = PUPPET_SHELLS[shell];
  const unlocked = state.skillNodes.some((node) => node.nodeId === "kugutsu_oficina_inicial");
  const puppetSlots = state.puppets.length + state.puppetOrders.filter((order) => order.kind === "PUPPET" && ["BUILDING", "READY"].includes(order.status)).length;
  const hasPuppetSlot = puppetSlots < PUPPET_OWNERSHIP_LIMIT;
  const children: ContainerChild[] = [
    titleBlock("marionete", "Oficina de Marionetes", "Escolha uma carapaça, confira a mochila e defina nome e aparência da sua criação."),
    factsBlock([
      { label: `${emoji("ryo")} Ryō`, value: String(state.ryo) },
      { label: `${emoji("carapaca")} Oficina`, value: unlocked ? "liberada" : "bloqueada" },
      { label: `${emoji("marionete")} Slots`, value: `${puppetSlots}/${PUPPET_OWNERSHIP_LIMIT}` },
    ]),
    divider(),
    selectRow(new StringSelectMenuBuilder()
      .setCustomId(`${PUPPET_PREFIX}:carapaca`)
      .setPlaceholder("Escolha a carapaça da marionete")
      .addOptions(Object.entries(PUPPET_SHELLS).map(([id, option]) => ({
        label: option.name,
        value: id,
        description: `${option.durationHours}h • ${option.ryo} Ryō`,
        default: id === shell,
      })))),
    text(`**${emoji("carapaca")} ${recipe.name}**\n${recipe.description}\n-# Construção: ${recipe.durationHours}h • a especialização é permanente.`),
    listBlock("Materiais necessários", requirements(state, shell), "Nenhum material."),
  ];
  if (!unlocked) children.push(noticeBlock("bloqueio", "Compre **Oficina de Marionetes** na árvore de Kugutsu antes de construir."));
  if (!hasPuppetSlot) children.push(noticeBlock("bloqueio", `Você já ocupa os ${PUPPET_OWNERSHIP_LIMIT} slots de marionete. Descarte uma para construir outra.`));
  if (feedback) children.push(noticeBlock("erro", feedback));
  children.push(divider(), buttonRow(button({
    id: `${PUPPET_PREFIX}:nome:${shell}`,
    label: "Dar nome e iniciar construção",
    style: ButtonStyle.Primary,
    emojiKey: "marionete",
    disabled: !unlocked || !hasPuppetSlot,
  })));
  return [economyContainer("estoque", children)];
}

function constructionPanel(name: string, shell: PuppetShell, hasAppearance: boolean): TopLevel[] {
  const recipe = PUPPET_SHELLS[shell];
  return [economyContainer("estoque", [
    titleBlock("marionete", "Carapaça em construção", `${recipe.durationHours} hora(s) de oficina`),
    receiptBlock(`**${name}** será montada com **${recipe.name}**.${hasAppearance ? " A aparência foi registrada para o mapa de combate." : ""}`),
    divider(),
    listBlock("Materiais reservados", [
      ryo(`${recipe.ryo} Ryō`),
      ...recipe.ingredients.map((ingredient) => itemLabel(ingredient.itemId, getItem(ingredient.itemId)?.name ?? ingredient.itemId, ingredient.qty)),
    ], "Nenhum."),
    text(`-# Quando a obra terminar, abra ${emoji("marionete")} **/marionetes** e use **Recolher**.`),
  ])];
}

export const craft: Command = {
  data: new SlashCommandBuilder()
    .setName("craft")
    .setDescription("Fabricação pessoal com os materiais da sua mochila")
    .addSubcommand((s) => s.setName("listar").setDescription("Mostra as receitas que você pode fazer"))
    .addSubcommand((s) => s.setName("criar").setDescription("Fabrica uma receita")
      .addStringOption((o) => o.setName("receita").setDescription("Receita").setAutocomplete(true).setRequired(true))
      .addIntegerOption((o) => o.setName("quantidade").setDescription("Quantas vezes (padrão: 1)").setMinValue(1)))
    .addSubcommand((s) => s.setName("marionete").setDescription("Abre a oficina de marionetes")),

  async autocomplete(interaction: AutocompleteInteraction) {
    const q = interaction.options.getFocused().toLocaleLowerCase("pt-BR");
    await interaction.respond(PERSONAL_RECIPES.filter((recipe) => recipe.name.toLocaleLowerCase("pt-BR").includes(q))
      .slice(0, 25).map((recipe) => ({ name: recipe.name, value: recipe.id })));
  },

  async execute(interaction: ChatInputCommandInteraction) {
    const char = await getOrCreateCharacter(interaction.user.id, interaction.guildId ?? "global", interaction.user.username);
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "marionete") {
      const workshop = await listPuppetWorkshop(char.id);
      if (!workshop) { await interaction.reply({ content: "❌ Personagem não encontrado.", ephemeral: true }); return; }
      await interaction.reply(v2Payload(puppetCraftPanel(workshop, "OFFENSE")));
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    if (subcommand === "listar") {
      const workshop = await listPuppetWorkshop(char.id);
      const ownsWorkshop = workshop?.skillNodes.some((node) => node.nodeId === "kugutsu_oficina_inicial");
      await interaction.editReply(v2Edit([economyContainer("estoque", [
        titleBlock("manutencao", "Fabricação pessoal", "Consome a sua mochila e entrega na hora"), divider(),
        listBlock(null, PERSONAL_RECIPES.map(describeRecipe), "Nenhuma receita disponível."),
        ...(ownsWorkshop ? [divider(), text(`-# Para construir uma marionete, use ${emoji("marionete")} **/craft marionete**.`)] : []),
      ])]));
      return;
    }
    const outcome = await craftPersonal(char.id, interaction.options.getString("receita", true), interaction.options.getInteger("quantidade") ?? 1);
    if (!outcome.ok) { await interaction.editReply(`❌ ${outcome.error}`); return; }
    const { recipe, consumido, produzido } = outcome.result;
    await interaction.editReply(v2Edit([economyContainer("cofre", [
      titleBlock("manutencao", "Fabricação concluída"),
      receiptBlock(`Você fabricou ${itemLabel(recipe.outputItemId, getItem(recipe.outputItemId)?.name ?? recipe.outputItemId, produzido)}.`),
      divider(),
      listBlock("Materiais usados", consumido.map((item) => itemLabel(item.itemId, getItem(item.itemId)?.name ?? item.itemId, item.qty)), "Nenhum."),
    ])]));
  },

  async handleSelect(interaction: AnySelectMenuInteraction) {
    if (!interaction.isStringSelectMenu() || interaction.customId !== `${PUPPET_PREFIX}:carapaca`) return;
    const shell = interaction.values[0] as PuppetShell;
    if (!PUPPET_SHELLS[shell]) return;
    const char = await getOrCreateCharacter(interaction.user.id, interaction.guildId ?? "global", interaction.user.username);
    const workshop = await listPuppetWorkshop(char.id);
    if (workshop) await interaction.update({ components: puppetCraftPanel(workshop, shell), flags: 1 << 15 });
  },

  async handleButton(interaction: ButtonInteraction) {
    const [prefix, group, version, action, shell] = interaction.customId.split(":");
    if (`${prefix}:${group}:${version}` !== PUPPET_PREFIX || action !== "nome" || !shell || !PUPPET_SHELLS[shell as PuppetShell]) return;
    const recipe = PUPPET_SHELLS[shell as PuppetShell];
    await interaction.showModal(new ModalBuilder().setCustomId(`${PUPPET_PREFIX}:confirmar:${shell}`).setTitle(`Nomear ${recipe.name}`.slice(0, 45))
      .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("nome").setLabel("Nome da marionete").setStyle(TextInputStyle.Short).setMinLength(2).setMaxLength(32).setRequired(true),
      ))
      .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("aparencia").setLabel("Aparência (link direto da imagem)").setStyle(TextInputStyle.Short).setPlaceholder("https://.../marionete.png").setMaxLength(2000).setRequired(false),
      )));
  },

  async handleModal(interaction: ModalSubmitInteraction) {
    const [prefix, group, version, action, shell] = interaction.customId.split(":");
    if (`${prefix}:${group}:${version}` !== PUPPET_PREFIX || action !== "confirmar" || !shell || !PUPPET_SHELLS[shell as PuppetShell]) return;
    const char = await getOrCreateCharacter(interaction.user.id, interaction.guildId ?? "global", interaction.user.username);
    const puppetShell = shell as PuppetShell;
    await interaction.deferReply({ ephemeral: true });
    const appearanceUrl = interaction.fields.getTextInputValue("aparencia");
    const outcome = await startPuppetConstruction(char.id, interaction.fields.getTextInputValue("nome"), puppetShell, appearanceUrl);
    if (!outcome.ok) {
      const workshop = await listPuppetWorkshop(char.id);
      await interaction.editReply(v2Edit(puppetCraftPanel(workshop!, puppetShell, outcome.error)));
      return;
    }
    await interaction.editReply(v2Edit(constructionPanel(outcome.name, puppetShell, Boolean(appearanceUrl.trim()))));
  },
};
