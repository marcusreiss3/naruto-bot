import {
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { Command } from "./types.js";
import { getItem, ITEMS, type ItemAction } from "../data/items.js";
import { getOrCreateCharacter } from "../services/characters/character-service.js";
import {
  consumeInventoryItem,
  equipInventoryItem,
  prepareExplosiveKunai,
  transferInventoryItem,
  dropInventoryItem,
  unequipInventoryItem,
  restoreSpentScroll,
  hasInventoryItem,
} from "../services/characters/inventory.js";
import {
  displayName,
  getActiveSession,
  numberSameNames,
} from "../services/combat/combat-engine.js";
import { executeKnownAbility } from "./combate.js";
import { prisma } from "../db/client.js";

function resolveItem(input: string) {
  const normalized = input.trim().toLocaleLowerCase("pt-BR");
  return ITEMS.find(
    (item) =>
      item.id === input ||
      item.name.toLocaleLowerCase("pt-BR") === normalized ||
      item.name.toLocaleLowerCase("pt-BR").includes(normalized),
  );
}

async function character(interaction: ChatInputCommandInteraction | AutocompleteInteraction) {
  return getOrCreateCharacter(
    interaction.user.id,
    interaction.guildId ?? "global",
    interaction.user.username,
  );
}

async function autocompleteOwnedItems(
  interaction: AutocompleteInteraction,
  action: ItemAction,
): Promise<void> {
  const char = await character(interaction);
  const focused = interaction.options.getFocused().toLocaleLowerCase("pt-BR");
  const choices = char.inventory
    .filter((owned) => owned.qty > 0)
    .map((owned) => ({ owned, item: getItem(owned.itemId) }))
    .filter(({ item }) => item?.actions.includes(action))
    .filter(({ item }) =>
      `${item!.name} ${item!.id}`.toLocaleLowerCase("pt-BR").includes(focused),
    )
    .slice(0, 25)
    .map(({ owned, item }) => ({
      name: `${item!.name} ×${owned.qty}`.slice(0, 100),
      value: item!.id,
    }));
  await interaction.respond(choices);
}

async function autocompleteAllOwnedItems(interaction: AutocompleteInteraction): Promise<void> {
  const char = await character(interaction);
  const focused = interaction.options.getFocused().toLocaleLowerCase("pt-BR");
  await interaction.respond(
    char.inventory
      .filter((owned) => owned.qty > 0)
      .map((owned) => ({ owned, item: getItem(owned.itemId) }))
      .filter(({ owned, item }) =>
        `${item?.name ?? owned.name} ${owned.itemId}`.toLocaleLowerCase("pt-BR").includes(focused),
      )
      .slice(0, 25)
      .map(({ owned, item }) => ({
        name: `${item?.name ?? owned.name} ×${owned.qty}`.slice(0, 100),
        value: owned.itemId,
      })),
  );
}

export const darItem: Command = {
  data: new SlashCommandBuilder()
    .setName("dar")
    .setDescription("Entrega um item da sua mochila para outro jogador")
    .addStringOption((option) =>
      option.setName("item").setDescription("Item entregue").setRequired(true).setAutocomplete(true),
    )
    .addUserOption((option) =>
      option.setName("jogador").setDescription("Quem receberá o item").setRequired(true),
    )
    .addIntegerOption((option) =>
      option.setName("quantidade").setDescription("Quantidade entregue").setMinValue(1).setRequired(false),
    ),
  async execute(interaction) {
    const source = await character(interaction);
    const receiver = interaction.options.getUser("jogador", true);
    if (receiver.bot) {
      await interaction.reply({ content: "❌ Bots não possuem mochila de personagem.", ephemeral: true });
      return;
    }
    const target = await getOrCreateCharacter(
      receiver.id,
      interaction.guildId ?? "global",
      receiver.username,
    );
    const itemId = interaction.options.getString("item", true);
    const amount = interaction.options.getInteger("quantidade") ?? 1;
    const result = await transferInventoryItem(source.id, target.id, itemId, amount);
    await interaction.reply({
      content: result.ok
        ? `🎁 Você entregou **${amount}x ${result.name}** para **${target.displayName?.trim() || target.name}**.`
        : `❌ ${result.error}`,
    });
  },
  autocomplete: autocompleteAllOwnedItems,
};

export const largarItem: Command = {
  data: new SlashCommandBuilder()
    .setName("largar")
    .setDescription("Larga um item na sua célula durante o combate")
    .addStringOption((option) =>
      option.setName("item").setDescription("Item largado").setRequired(true).setAutocomplete(true),
    )
    .addIntegerOption((option) =>
      option.setName("quantidade").setDescription("Quantidade largada").setMinValue(1).setRequired(false),
    ),
  async execute(interaction) {
    const char = await character(interaction);
    const session = await getActiveSession(interaction.channelId);
    if (!session) {
      await interaction.reply({ content: "❌ Você só pode largar itens dentro de um combate.", ephemeral: true });
      return;
    }
    const participant = session.participants.find((entry) => entry.charId === char.id && entry.hpCurrent > 0);
    if (!participant) {
      await interaction.reply({ content: "❌ Seu personagem não está neste combate.", ephemeral: true });
      return;
    }
    const itemId = interaction.options.getString("item", true);
    const amount = interaction.options.getInteger("quantidade") ?? 1;
    const result = await dropInventoryItem(char.id, session.id, participant.cell, itemId, amount);
    await interaction.reply({
      content: result.ok
        ? `📦 **${amount}x ${result.name}** foi largado em **${participant.cell}**.`
        : `❌ ${result.error}`,
    });
  },
  autocomplete: autocompleteAllOwnedItems,
};

async function autocompleteTarget(interaction: AutocompleteInteraction): Promise<void> {
  const session = await getActiveSession(interaction.channelId);
  if (!session) {
    await interaction.respond([]);
    return;
  }
  const focused = interaction.options.getFocused().toLocaleLowerCase("pt-BR");
  const nums = numberSameNames(session.participants);
  const choices = session.participants
    .filter((participant) => participant.hpCurrent > 0)
    .map((participant) => ({
      name: displayName(participant.name, nums.get(participant.id)).slice(0, 100),
      value: participant.id,
    }))
    .filter((choice) => choice.name.toLocaleLowerCase("pt-BR").includes(focused))
    .slice(0, 25);
  await interaction.respond(choices);
}

async function hasOwnedItem(charId: string, itemId: string): Promise<boolean> {
  return hasInventoryItem(prisma, charId, itemId);
}

export const equipar: Command = {
  data: new SlashCommandBuilder()
    .setName("equipar")
    .setDescription("Equipa uma arma para combate corpo a corpo")
    .addStringOption((option) =>
      option
        .setName("item")
        .setDescription("Arma do inventário")
        .setRequired(true)
        .setAutocomplete(true),
    ),
  async execute(interaction) {
    const char = await character(interaction);
    const item = resolveItem(interaction.options.getString("item", true));
    if (!item) {
      await interaction.reply({ content: "❌ Item desconhecido.", ephemeral: true });
      return;
    }
    const previous = char.equippedItemId ? getItem(char.equippedItemId)?.name : null;
    if (item.id === "lamina_chakra") {
      const learned = await prisma.characterSkillNode.findUnique({
        where: { charId_nodeId: { charId: char.id, nodeId: "buki_lamina_chakra" } },
      });
      if (!learned) {
        await interaction.reply({
          content: "❌ Aprenda **Lâmina de Chakra** na árvore de Bukijutsu antes de equipá-la.",
          ephemeral: true,
        });
        return;
      }
    }
    const result = await equipInventoryItem(char.id, item.id);
    if (!result.ok) {
      await interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
      return;
    }
    const replaced = previous && previous !== result.name ? ` **${previous}** foi guardada.` : "";
    await interaction.reply({
      content: `✅ **${result.name}** equipada.${replaced} Equipar não consome o item.`,
      ephemeral: true,
    });
  },
  autocomplete(interaction) {
    return autocompleteOwnedItems(interaction, "EQUIP");
  },
};

export const desequipar: Command = {
  data: new SlashCommandBuilder()
    .setName("desequipar")
    .setDescription("Guarda a arma equipada sem consumir o item"),
  async execute(interaction) {
    const char = await character(interaction);
    const result = await unequipInventoryItem(char.id);
    await interaction.reply({
      content: result.ok ? `✅ **${result.name}** guardada no inventário.` : `❌ ${result.error}`,
      ephemeral: true,
    });
  },
};

export const restaurarPergaminho: Command = {
  data: new SlashCommandBuilder()
    .setName("restaurar-pergaminho")
    .setDescription("Restaura um pergaminho de Bukijutsu gasto por metade do valor em ryō")
    .addStringOption((option) => option.setName("pergaminho").setDescription("Pergaminho gasto").setRequired(true).setAutocomplete(true)),
  async execute(interaction) {
    const char = await character(interaction);
    const result = await restoreSpentScroll(char.id, interaction.options.getString("pergaminho", true));
    await interaction.reply({ content: result.ok ? `✅ **${result.name}** restaurado por **${result.cost} ryō**.` : `❌ ${result.error}`, ephemeral: true });
  },
  autocomplete: autocompleteAllOwnedItems,
};

export const atacar: Command = {
  data: new SlashCommandBuilder()
    .setName("atacar")
    .setDescription("Ataca corpo a corpo de acordo com a arma equipada")
    .addStringOption((option) =>
      option
        .setName("alvo")
        .setDescription("Alvo do ataque")
        .setRequired(true)
        .setAutocomplete(true),
    ),
  async execute(interaction) {
    const char = await character(interaction);
    let abilityId = "item_soco_basico";
    if (char.equippedItemId === "kunai") {
      abilityId = "item_kunai_perfurar";
    } else if (char.equippedItemId === "lamina_chakra") {
      abilityId = "item_lamina_chakra_cortar";
    } else if (char.equippedItemId === "katana") {
      abilityId = "item_katana_cortar";
    } else if (char.equippedItemId) {
      const equippedName = getItem(char.equippedItemId)?.name ?? char.equippedItemId;
      await interaction.reply({
        content: `❌ **${equippedName}** não possui um ataque corpo a corpo básico.`,
        ephemeral: true,
      });
      return;
    }
    await executeKnownAbility(
      interaction,
      abilityId,
      interaction.options.getString("alvo", true),
      { allowUnlearned: true },
    );
  },
  autocomplete: autocompleteTarget,
};

export const arremessar: Command = {
  data: new SlashCommandBuilder()
    .setName("arremessar")
    .setDescription("Arremessa uma arma do inventário e consome uma unidade")
    .addStringOption((option) =>
      option.setName("item").setDescription("Arma de arremesso").setRequired(true).setAutocomplete(true),
    )
    .addStringOption((option) =>
      option
        .setName("alvo")
        .setDescription("Alvo ou célula do mapa")
        .setRequired(true)
        .setAutocomplete(true),
    ),
  async execute(interaction) {
    const char = await character(interaction);
    const item = resolveItem(interaction.options.getString("item", true));
    if (!item?.throwAbilityId || !item.actions.includes("THROW")) {
      await interaction.reply({ content: "❌ Este item não pode ser arremessado.", ephemeral: true });
      return;
    }
    if (!(await hasOwnedItem(char.id, item.id))) {
      await interaction.reply({ content: `❌ Você não possui ${item.name}.`, ephemeral: true });
      return;
    }
    if (item.id === "fios_aco_ninja") {
      const learned = await prisma.characterSkillNode.findUnique({
        where: { charId_nodeId: { charId: char.id, nodeId: "buki_manipulacao_fios" } },
      });
      if (!learned) {
        await interaction.reply({
          content: "❌ Aprenda **Técnica de Manipulação de Fios** na árvore de Bukijutsu antes de usar os fios.",
          ephemeral: true,
        });
        return;
      }
    }
    const rawTarget = interaction.options.getString("alvo", true);
    await executeKnownAbility(interaction, item.throwAbilityId, rawTarget, {
      allowUnlearned: true,
      afterAccepted: async () => {
        const consumed = await consumeInventoryItem(char.id, item.id);
        return consumed.ok ? { ok: true } : consumed;
      },
    });
  },
  async autocomplete(interaction) {
    if (interaction.options.getFocused(true).name === "alvo") {
      await autocompleteTarget(interaction);
      return;
    }
    await autocompleteOwnedItems(interaction, "THROW");
  },
};

export const usarItem: Command = {
  data: new SlashCommandBuilder()
    .setName("usar")
    .setDescription("Usa uma arma equipada, ferramenta ninja ou item consumível")
    .addStringOption((option) =>
      option.setName("item").setDescription("Item do inventário").setRequired(true).setAutocomplete(true),
    )
    .addStringOption((option) =>
      option
        .setName("alvo")
        .setDescription("Alvo ou célula, quando necessário")
        .setRequired(false)
        .setAutocomplete(true),
    ),
  async execute(interaction) {
    const char = await character(interaction);
    const item = resolveItem(interaction.options.getString("item", true));
    if (!item?.basicAbilityId || !item.actions.includes("USE")) {
      await interaction.reply({ content: "❌ Este item não possui uma ação básica de uso.", ephemeral: true });
      return;
    }

    if (item.id === "papel_bomba") {
      if (await getActiveSession(interaction.channelId)) {
        await interaction.reply({
          content: "❌ Prepare a Kunai Explosiva fora de combate.",
          ephemeral: true,
        });
        return;
      }
      const result = await prepareExplosiveKunai(char.id);
      await interaction.reply({
        content: result.ok
          ? `💥 Uma Kunai e um Papel Bomba foram combinados. Agora você possui **${result.total} Kunai(s) Explosiva(s)**.`
          : `❌ ${result.error}`,
        ephemeral: true,
      });
      return;
    }

    if (!(await hasOwnedItem(char.id, item.id))) {
      await interaction.reply({ content: `❌ Você não possui ${item.name}.`, ephemeral: true });
      return;
    }
    if (item.id === "kunai" && char.equippedItemId !== "kunai") {
      await interaction.reply({
        content: "❌ Equipe a Kunai com `/equipar` antes de usá-la corpo a corpo.",
        ephemeral: true,
      });
      return;
    }
    const consumes = item.id !== "kunai";
    await executeKnownAbility(
      interaction,
      item.basicAbilityId,
      interaction.options.getString("alvo") ?? null,
      {
        allowUnlearned: true,
        afterAccepted: consumes
          ? async () => {
              const consumed = await consumeInventoryItem(char.id, item.id);
              return consumed.ok ? { ok: true } : consumed;
            }
          : undefined,
      },
    );
  },
  async autocomplete(interaction) {
    if (interaction.options.getFocused(true).name === "alvo") {
      await autocompleteTarget(interaction);
      return;
    }
    await autocompleteOwnedItems(interaction, "USE");
  },
};
