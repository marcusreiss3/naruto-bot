import { EmbedBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import type { Command } from "./types.js";
import {
  ITEM_ACTION_LABELS,
  ITEM_CATEGORY_ICONS,
  ITEM_CATEGORY_LABELS,
  getItem,
} from "../data/items.js";
import { getOrCreateCharacter } from "../services/characters/character-service.js";
import { groupInventory } from "../services/characters/inventory.js";
import { formatRyo } from "../services/economy/character-economy.js";
import { ECONOMY } from "../config/balance.js";

export const inventario: Command = {
  data: new SlashCommandBuilder()
    .setName("inventario")
    .setDescription("Mostra os itens carregados pelo seu personagem"),

  async execute(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId ?? "global";
    const char = await getOrCreateCharacter(
      interaction.user.id,
      guildId,
      interaction.user.username,
    );
    const groups = groupInventory(char.inventory);
    const total = groups.reduce(
      (sum, group) => sum + group.entries.reduce((subtotal, entry) => subtotal + entry.qty, 0),
      0,
    );

    // Cabecalho unico: Ryo (divida quando negativo) e saciedade. As duas
    // reescritas de descricao mais abaixo reaproveitam esta linha.
    const cabecalho =
      `💰 **${formatRyo(char.ryo)}**  •  ` +
      `🍙 Saciedade: **${char.economy?.satiety ?? ECONOMY.satietyMax}/${ECONOMY.satietyMax}**`;

    const embed = new EmbedBuilder()
      .setColor(0x8b5a2b)
      .setTitle(`🎒 Inventário de ${char.displayName?.trim() || char.name}`)
      .setDescription(cabecalho)
      .setFooter({
        text: [
          `${total} item(ns) carregado(s)`,
          "/atacar — golpeia corpo a corpo conforme a arma equipada; sem arma, usa Soco.",
          "/equipar — prepara uma arma para combate corpo a corpo.",
          "/arremessar — lança uma arma à distância sem precisar equipá-la.",
          "/usar — ativa uma ferramenta ou item consumível.",
          "/desequipar — guarda a arma equipada sem perder o item.",
          "/dar — entrega um item diretamente a outro jogador.",
          "/largar — deixa um item na sua célula durante o combate.",
        ].join("\n"),
      });

    const equipped = char.equippedItemId ? getItem(char.equippedItemId)?.name ?? char.equippedItemId : null;
    embed.addFields({
      name: "🗡️ Arma equipada",
      value: equipped
        ? `**${equipped}** — apenas uma arma pode ficar equipada por vez.`
        : "Nenhuma arma equipada.",
    });

    if (!groups.length) {
      embed.setDescription(`${cabecalho}\n\nSua mochila está vazia.`);
    } else {
      embed.setDescription(`${cabecalho}\n\nOs itens estão organizados por tipo.`);
      embed.addFields(
        groups.map((group) => ({
          name: `${ITEM_CATEGORY_ICONS[group.category]} ${ITEM_CATEGORY_LABELS[group.category]}`,
          value: group.entries
            .map((entry) => {
              const name = entry.item?.name ?? entry.name;
              const actions = entry.item?.actions
                .map((action) => ITEM_ACTION_LABELS[action])
                .join(" • ");
              return `**${name}** ×${entry.qty}${actions ? ` — ${actions}` : ""}`;
            })
            .join("\n")
            .slice(0, 1024),
        })),
      );
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
