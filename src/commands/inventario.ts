import {
  StringSelectMenuBuilder,
  SlashCommandBuilder,
  MessageFlags,
  type AnySelectMenuInteraction,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { Command } from "./types.js";
import {
  ITEM_ACTION_LABELS,
  ITEM_CATEGORY_LABELS,
  getItem,
  type ItemCategory,
} from "../data/items.js";
import { getOrCreateCharacter } from "../services/characters/character-service.js";
import { groupInventory } from "../services/characters/inventory.js";
import { formatRyo } from "../services/economy/character-economy.js";
import { ECONOMY } from "../config/balance.js";
import {
  divider,
  economyContainer,
  factsBlock,
  itemLabel,
  listBlock,
  noticeBlock,
  ryo,
  selectRow,
  text,
  titleBlock,
  v2Payload,
  type ContainerChild,
  type TopLevel,
} from "../ui/economy-components-v2.js";
import { emoji, inventoryCategoryEmoji } from "../ui/economy-emojis.js";

// Painel de mochila em Components V2 (etapa 08).
//
// O mural gigante de antes virou UMA categoria por vez: o select troca a
// categoria exibida e o `customId` carrega apenas a categoria escolhida —
// nenhum dado de saldo, quantidade ou permissao viaja nele. O inventario e'
// relido do banco a cada clique, entao um painel velho nunca mostra estado
// velho nem autoriza nada.

// O roteador de src/index.ts despacha pelo PRIMEIRO segmento do customId, que
// precisa ser o nome do comando — por isso `inventario:`, e nao `inv:`.
const PREFIXO = "inventario:v1";
const cid = (categoria: string) => `${PREFIXO}:cat:${categoria}`;

type Grupo = ReturnType<typeof groupInventory>[number];

function cabecalho(char: {
  ryo: number;
  economy?: { satiety: number } | null;
  equippedItemId?: string | null;
}) {
  const equipada = char.equippedItemId
    ? getItem(char.equippedItemId)?.name ?? char.equippedItemId
    : null;
  return [
    factsBlock([
      { label: "Ryō", value: ryo(formatRyo(char.ryo)) },
      {
        label: "Saciedade",
        value: `${emoji("saciedade")} ${char.economy?.satiety ?? ECONOMY.satietyMax}/${ECONOMY.satietyMax}`,
      },
      {
        label: "Arma equipada",
        value: equipada
          ? itemLabel(char.equippedItemId!, equipada)
          : "nenhuma",
      },
    ]),
  ];
}

// Monta o painel inteiro para a categoria pedida. Puro o bastante para o teste:
// recebe os grupos ja carregados e devolve a arvore de componentes.
export function renderInventario(
  nome: string,
  char: { ryo: number; economy?: { satiety: number } | null; equippedItemId?: string | null },
  grupos: Grupo[],
  categoriaAtiva: ItemCategory | null,
): TopLevel[] {
  const total = grupos.reduce(
    (soma, grupo) => soma + grupo.entries.reduce((sub, entry) => sub + entry.qty, 0),
    0,
  );

  const filhos: ContainerChild[] = [
    titleBlock("mochila", `Inventário de ${nome}`, `${total} item(ns) carregado(s)`),
    ...cabecalho(char),
    divider(),
  ];

  if (!grupos.length) {
    filhos.push(noticeBlock("aviso", "Sua mochila está vazia."));
    return [economyContainer("estoque", filhos)];
  }

  // Sem categoria escolhida, abre na primeira que tem item.
  const ativa = grupos.find((g) => g.category === categoriaAtiva) ?? grupos[0]!;
  filhos.push(
    listBlock(
      `${inventoryCategoryEmoji(ativa.category)} ${ITEM_CATEGORY_LABELS[ativa.category]}`,
      ativa.entries.map((entry) => {
        const item = entry.item;
        const acoes = item?.actions.map((a) => ITEM_ACTION_LABELS[a]).join(" • ");
        return `${itemLabel(entry.itemId, item?.name ?? entry.name, entry.qty)}${acoes ? ` — ${acoes}` : ""}`;
      }),
      "Nada nesta categoria.",
    ),
  );

  // Select só quando há mais de uma categoria: uma linha de navegação inútil
  // ocupa espaço e não ajuda ninguém.
  if (grupos.length > 1) {
    filhos.push(
      divider(),
      selectRow(
        new StringSelectMenuBuilder()
          .setCustomId(cid("pick"))
          .setPlaceholder("Ver outra categoria")
          .addOptions(
            grupos.slice(0, 25).map((grupo) => ({
              label: ITEM_CATEGORY_LABELS[grupo.category].slice(0, 100),
              value: grupo.category,
              description: `${grupo.entries.reduce((s, e) => s + e.qty, 0)} item(ns)`,
              default: grupo.category === ativa.category,
            })),
          ),
      ),
    );
  }

  filhos.push(
    text(
      "-# `/equipar` prepara uma arma • `/arremessar` lança à distância • `/usar` ativa ferramenta • `/dar` entrega a outro jogador",
    ),
  );

  return [economyContainer("estoque", filhos)];
}

async function carregar(discordId: string, guildId: string, username: string) {
  const char = await getOrCreateCharacter(discordId, guildId, username);
  return { char, grupos: groupInventory(char.inventory) };
}

export const inventario: Command = {
  data: new SlashCommandBuilder()
    .setName("inventario")
    .setDescription("Mostra os itens carregados pelo seu personagem"),

  async execute(interaction: ChatInputCommandInteraction) {
    const { char, grupos } = await carregar(
      interaction.user.id,
      interaction.guildId ?? "global",
      interaction.user.username,
    );
    await interaction.reply(
      v2Payload(
        renderInventario(char.displayName?.trim() || char.name, char, grupos, null),
        true,
      ),
    );
  },

  async handleSelect(interaction: AnySelectMenuInteraction) {
    if (!interaction.customId.startsWith(PREFIXO) || !interaction.isStringSelectMenu()) return;
    // Relê do banco: o painel pode estar aberto há horas.
    const { char, grupos } = await carregar(
      interaction.user.id,
      interaction.guildId ?? "global",
      interaction.user.username,
    );
    const escolha = interaction.values[0] as ItemCategory;
    await interaction.update({
      components: renderInventario(char.displayName?.trim() || char.name, char, grupos, escolha),
      flags: MessageFlags.IsComponentsV2,
    });
  },
};
