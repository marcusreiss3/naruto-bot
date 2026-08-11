import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type AnySelectMenuInteraction,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type GuildMember,
  type ModalSubmitInteraction,
  type RepliableInteraction,
} from "discord.js";
import type { Command } from "./types.js";
import { prisma } from "../db/client.js";
import { getItem } from "../data/items.js";
import {
  SHOPS,
  getShop,
  isShopType,
  referenceValue,
  type ShopStatus,
  type ShopType,
} from "../data/shops.js";
import {
  VILLAGE_MARKET_CHANNELS,
  VILLAGE_NAMES,
  villageFromMarketChannel,
  type VillageId,
} from "../data/villages.js";
import { getOrCreateCharacter } from "../services/characters/character-service.js";
import { getInventoryQty } from "../services/characters/inventory.js";
import { formatRyo } from "../services/economy/character-economy.js";
import { EconomyError } from "../services/economy/errors.js";
import { villageFromIchirakuChannel } from "../services/economy/ichiraku-channel.js";
import { ichirakuPreview } from "../services/economy/constructions.js";
import { requireVillage } from "../services/economy/village-access.js";
import {
  acceptableSellQty,
  affordableBuyQty,
  npcBuybackPrice,
} from "../services/economy/shop-pricing.js";
import {
  buyFromShop,
  findShop,
  sellToGeneralMarket,
  sellToShop,
  shopBudgetView,
  shopView,
  villageShopMenu,
  type ShopView,
} from "../services/economy/shop-service.js";
import {
  closeSession,
  createSession,
  purgeExpiredSessions,
  requireSession,
  sessionData,
  sessionShopType,
  updateSession,
  type SessionData,
} from "../services/economy/ui-session.js";

// Painel de compra e venda das lojas de vila (secao 7.5).
//
// Tres regras estruturais, todas checadas de novo a cada clique:
//
//   1. O customId carrega VERSAO, ACAO e o id opaco da sessao — nada mais.
//      Preco, saldo, quantidade e permissao vem do banco na confirmacao. Um
//      customId forjado nao consegue dizer "eu ja paguei" nem "eu sou Kage".
//   2. `/loja` so' abre no centro comercial da vila do jogador ou no canal de
//      RP do Ichiraku dela. Fora disso o painel nem e' montado.
//   3. A administracao da loja NAO fica aqui. Ela e' a aba Comercio de /vila,
//      dentro da mansao — este comando nao tem botao escondido de Kage.

const PREFIXO = "loja:v1";
const cid = (acao: string, sessionId: string) => `${PREFIXO}:${acao}:${sessionId}`;

const STATUS_LABEL: Record<ShopStatus, string> = {
  ACTIVE: "aberto",
  LOCKED: "bloqueado",
  CONSTRUCTING: "em obras",
  AWAITING_CHANNEL: "aguardando canal",
  SUSPENDED: "suspenso",
};

// ---------------- Onde o comando pode abrir ----------------

interface Local {
  villageId: VillageId;
  // Canal de RP do Ichiraku: abre direto naquela loja, mesmo sem centro
  // comercial configurado (secao 7.7).
  lojaDireta: ShopType | null;
}

async function resolverLocal(
  interaction: ChatInputCommandInteraction,
  vilaDoJogador: VillageId,
): Promise<Local> {
  const channelId = interaction.channelId ?? "";

  const porIchiraku = await villageFromIchirakuChannel(channelId);
  if (porIchiraku) {
    if (porIchiraku !== vilaDoJogador) {
      throw new EconomyError(
        `Este é o Ichiraku de ${VILLAGE_NAMES[porIchiraku]}. Você só negocia na sua própria vila.`,
      );
    }
    return { villageId: porIchiraku, lojaDireta: "ICHIRAKU" };
  }

  const porMercado = villageFromMarketChannel(channelId);
  if (!porMercado) {
    throw new EconomyError(
      `Use \`/loja\` no <#${VILLAGE_MARKET_CHANNELS[vilaDoJogador]}> ou no canal do Ichiraku da sua vila.`,
    );
  }
  if (porMercado !== vilaDoJogador) {
    throw new EconomyError(
      `Este é o centro comercial de ${VILLAGE_NAMES[porMercado]}. Você só negocia na sua própria vila.`,
    );
  }
  return { villageId: porMercado, lojaDireta: null };
}

// ---------------- Telas ----------------

interface Painel {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[];
}

function rodape(sessionId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(cid("refresh", sessionId))
      .setLabel("Atualizar")
      .setEmoji("🔄")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(cid("close", sessionId))
      .setLabel("Fechar")
      .setEmoji("✖️")
      .setStyle(ButtonStyle.Secondary),
  );
}

async function renderHome(
  villageId: VillageId,
  sessionId: string,
  charRyo: number,
  recibo?: string,
): Promise<Painel> {
  const [village, menu] = await Promise.all([
    prisma.village.findUniqueOrThrow({ where: { id: villageId } }),
    villageShopMenu(villageId),
  ]);

  const embed = new EmbedBuilder()
    .setColor(0x4f7fc9)
    .setTitle(`🏪 Mercado de ${VILLAGE_NAMES[villageId]}`)
    .setDescription(
      `Imposto atual: **${(village.taxRate * 100).toFixed(0)}%** • Seu saldo: **${formatRyo(charRyo)}**`,
    )
    .addFields({
      name: "Estabelecimentos",
      value: menu
        .map((linha) => `${linha.def.emoji} **${linha.def.name}** — ${STATUS_LABEL[linha.status]}`)
        .join("\n"),
    })
    .setFooter({ text: "Escolha uma loja abaixo. Os preços já incluem o imposto da vila." });

  if (recibo) embed.spliceFields(0, 0, { name: "Recibo", value: recibo });

  // Seis lojas: botao so' comporta cinco por linha, entao a escolha e' select.
  const select = new StringSelectMenuBuilder()
    .setCustomId(cid("pick", sessionId))
    .setPlaceholder("Escolha uma loja")
    .addOptions(
      menu.map((linha) => ({
        label: linha.def.name.slice(0, 100),
        value: linha.def.type,
        emoji: linha.def.emoji,
        description: STATUS_LABEL[linha.status],
      })),
    );

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
      rodape(sessionId),
    ],
  };
}

function precoTexto(view: ShopView, linha: { name: string; price: number; estoque: number }): string {
  const estoque = Number.isFinite(linha.estoque) ? `${linha.estoque} un.` : "sem limite";
  return `**${linha.name}** ${linha.price} Ryō _(${estoque})_`;
}

async function renderShop(
  villageId: VillageId,
  shopType: ShopType,
  sessionId: string,
  charRyo: number,
  recibo?: string,
): Promise<Painel> {
  const view = await shopView(villageId, shopType);
  const def = getShop(shopType)!;

  const embed = new EmbedBuilder()
    .setColor(view.status === "ACTIVE" ? 0xc9a227 : 0x777777)
    .setTitle(`${def.emoji} ${def.name} — ${VILLAGE_NAMES[villageId]}`)
    .setFooter({ text: `Preços atualizados pelo imposto de ${(view.taxRate * 100).toFixed(0)}%.` });

  if (recibo) embed.addFields({ name: "Recibo", value: recibo });

  // Ichiraku bloqueado: o jogador ve o custo e a informacao de que depende do
  // Kage — nao ha botao de construir aqui (isso e' a aba Comercio de /vila).
  if (view.status !== "ACTIVE") {
    const preview = shopType === "ICHIRAKU" ? await ichirakuPreview(villageId) : null;
    embed.setDescription(`_${def.name} está **${STATUS_LABEL[view.status]}**._`);
    if (preview) {
      embed.addFields({
        name: "Para abrir",
        value:
          `${preview.custo.ryo} Ryō e ${preview.custo.itens.map((i) => `${i.qty} ${i.name}`).join(", ")}\n` +
          `Obra de 5 dias, iniciada pelo Kage na mansão. Fator de população: ${preview.factor.toFixed(2)}.`,
      });
      if (preview.emObra) {
        embed.addFields({ name: "Situação", value: "🏗️ A obra já está em andamento." });
      }
    }
    return {
      embeds: [embed],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(cid("home", sessionId))
            .setLabel("Voltar")
            .setEmoji("↩️")
            .setStyle(ButtonStyle.Secondary),
        ),
        rodape(sessionId),
      ],
    };
  }

  const descricao = view.municipal
    ? `Estoque: **${view.stockUnits}/${view.capacity}** • Orçamento de compra hoje: **${view.budget?.restante ?? 0}/${view.budget?.total ?? 0} Ryō**`
    : "_Barracas de fora da vila. Compra e venda com NPC: o cofre não se move._";
  embed.setDescription(`${descricao}\nSeu saldo: **${formatRyo(charRyo)}**`);

  const aVenda = view.produtos.filter((linha) => linha.price > 0);
  // Tres estados diferentes, e confundi-los faz o painel parecer quebrado:
  // loja sem CATALOGO nunca vai vender nada (Marcenaria só compra); loja com
  // catalogo e sem estoque vende quando for abastecida.
  const semCatalogo = view.produtos.length === 0;
  embed.addFields({
    name: "Comprar",
    value: aVenda.length
      ? aVenda
          .map((linha) => precoTexto(view, linha))
          .join(" • ")
          .slice(0, 1024)
      : semCatalogo
        ? "_Esta loja não vende nada: ela só compra matéria-prima da vila._"
        : "_Sem produto em estoque agora. O Kage abastece pela aba Comércio de `/vila`._",
  });

  if (view.municipal) {
    embed.addFields({
      name: "Compramos matéria-prima",
      value: view.ingredientes.length
        ? view.ingredientes
            .map((linha) => `**${linha.name}** ${linha.price} Ryō/un.`)
            .join(" • ")
            .slice(0, 1024)
        : "_Esta loja não compra nada no momento._",
    });
  } else {
    embed.addFields({
      name: "Recompra de emergência",
      value: `Pagamos **30%** do valor de referência por material e comida. Vale menos que vender à loja da vila — é saída de emergência.`,
    });
  }

  const acoes = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(cid("buy", sessionId))
      .setLabel("Comprar")
      .setEmoji("🛒")
      .setStyle(ButtonStyle.Success)
      .setDisabled(aVenda.every((linha) => linha.estoque <= 0)),
    new ButtonBuilder()
      .setCustomId(cid("sell", sessionId))
      .setLabel(view.municipal ? "Vender materiais" : "Vender ao NPC")
      .setEmoji("💰")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(cid("stock", sessionId))
      .setLabel("Estoque")
      .setEmoji("📦")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!view.municipal),
    new ButtonBuilder()
      .setCustomId(cid("home", sessionId))
      .setLabel("Voltar")
      .setEmoji("↩️")
      .setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [acoes, rodape(sessionId)] };
}

// ---------------- Comando ----------------

export const loja: Command = {
  data: new SlashCommandBuilder()
    .setName("loja")
    .setDescription("Abre o mercado da sua vila (só no centro comercial ou no Ichiraku)"),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const vilaDoJogador = requireVillage(interaction.member as GuildMember | null);
      const local = await resolverLocal(interaction, vilaDoJogador);
      const char = await getOrCreateCharacter(
        interaction.user.id,
        interaction.guildId ?? "global",
        interaction.user.username,
      );

      await purgeExpiredSessions();
      const session = await createSession({
        ownerDiscordId: interaction.user.id,
        guildId: interaction.guildId ?? "global",
        channelId: interaction.channelId ?? "",
        villageId: local.villageId,
        charId: char.id,
        shopType: local.lojaDireta,
      });

      const painel = local.lojaDireta
        ? await renderShop(local.villageId, local.lojaDireta, session.id, char.ryo)
        : await renderHome(local.villageId, session.id, char.ryo);
      await interaction.editReply(painel);
    } catch (err) {
      await responderErro(interaction, err);
    }
  },

  async handleButton(interaction: ButtonInteraction) {
    try {
      await roteadorBotao(interaction);
    } catch (err) {
      await responderErro(interaction, err);
    }
  },

  async handleSelect(interaction: AnySelectMenuInteraction) {
    try {
      await roteadorSelect(interaction);
    } catch (err) {
      await responderErro(interaction, err);
    }
  },

  async handleModal(interaction: ModalSubmitInteraction) {
    try {
      await roteadorModal(interaction);
    } catch (err) {
      await responderErro(interaction, err);
    }
  },
};

async function responderErro(interaction: RepliableInteraction, err: unknown): Promise<void> {
  const msg = err instanceof EconomyError ? `❌ ${err.message}` : "❌ Não consegui completar isso.";
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ content: msg, embeds: [], components: [] }).catch(() => null);
  } else {
    await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => null);
  }
  if (!(err instanceof EconomyError)) throw err;
}

// Contexto revalidado a cada clique: sessao viva, dono certo, personagem e
// vila relidos do banco. Nada disso vem do customId.
async function contexto(interaction: RepliableInteraction, sessionId: string) {
  const session = await requireSession(sessionId, interaction.user.id);
  const char = await prisma.userCharacter.findUnique({ where: { id: session.charId } });
  if (!char) throw new EconomyError("Não achei seu personagem. Abra `/loja` de novo.");
  return { session, char, villageId: session.villageId as VillageId };
}

// ---------------- Botões ----------------

async function roteadorBotao(interaction: ButtonInteraction): Promise<void> {
  const [, , acao, sessionId] = interaction.customId.split(":");
  if (!acao || !sessionId) return;

  if (acao === "close") {
    await closeSession(sessionId).catch(() => null);
    await interaction.update({ content: "Painel fechado.", embeds: [], components: [] });
    return;
  }

  const { session, char, villageId } = await contexto(interaction, sessionId);
  await interaction.deferUpdate();
  const shopType = sessionShopType(session);

  if (acao === "home") {
    await updateSession(sessionId, { shopType: null, screen: "HOME", data: {} });
    await interaction.editReply(await renderHome(villageId, sessionId, char.ryo));
    return;
  }

  if (acao === "refresh") {
    await updateSession(sessionId, { data: {} });
    await interaction.editReply(
      shopType
        ? await renderShop(villageId, shopType, sessionId, char.ryo)
        : await renderHome(villageId, sessionId, char.ryo),
    );
    return;
  }

  if (!shopType) {
    await interaction.editReply(await renderHome(villageId, sessionId, char.ryo));
    return;
  }

  if (acao === "buy") return abrirSelectCompra(interaction, villageId, shopType, sessionId, char.ryo);
  if (acao === "sell") return abrirSelectVenda(interaction, villageId, shopType, sessionId, char);
  if (acao === "stock") return mostrarEstoque(interaction, villageId, shopType, sessionId, char.ryo);
  if (acao === "confirm") return confirmarMaximo(interaction, sessionId);
  if (acao === "cancel") {
    await updateSession(sessionId, { data: {} });
    await interaction.editReply(await renderShop(villageId, shopType, sessionId, char.ryo));
    return;
  }

  await interaction.editReply(await renderShop(villageId, shopType, sessionId, char.ryo));
}

async function abrirSelectCompra(
  interaction: ButtonInteraction,
  villageId: VillageId,
  shopType: ShopType,
  sessionId: string,
  charRyo: number,
): Promise<void> {
  const view = await shopView(villageId, shopType);
  const opcoes = view.produtos
    .filter((linha) => linha.price > 0 && linha.estoque > 0)
    .slice(0, 25)
    .map((linha) => ({
      label: `${linha.name} — ${linha.price} Ryō`.slice(0, 100),
      value: linha.itemId,
      description: Number.isFinite(linha.estoque)
        ? `${linha.estoque} em estoque`
        : "estoque do NPC",
    }));

  if (!opcoes.length) {
    await interaction.editReply(
      await renderShop(villageId, shopType, sessionId, charRyo, "Não há nada à venda agora."),
    );
    return;
  }

  const painel = await renderShop(villageId, shopType, sessionId, charRyo);
  await interaction.editReply({
    embeds: painel.embeds,
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(cid("buyitem", sessionId))
          .setPlaceholder("O que você quer comprar?")
          .addOptions(opcoes),
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(cid("cancel", sessionId))
          .setLabel("Voltar")
          .setEmoji("↩️")
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
  });
}

async function abrirSelectVenda(
  interaction: ButtonInteraction,
  villageId: VillageId,
  shopType: ShopType,
  sessionId: string,
  char: { id: string; ryo: number },
): Promise<void> {
  const view = await shopView(villageId, shopType);
  const inventario = await prisma.inventoryItem.findMany({
    where: { charId: char.id, qty: { gt: 0 } },
    orderBy: { itemId: "asc" },
  });

  const opcoes: { label: string; value: string; description: string }[] = [];
  for (const linha of inventario) {
    const item = getItem(linha.itemId);
    if (!item || item.rare) continue;
    const preco = view.municipal
      ? view.ingredientes.find((row) => row.itemId === linha.itemId)?.price
      : npcBuybackPrice(referenceValue(linha.itemId) ?? 0);
    if (!preco || preco <= 0) continue;
    opcoes.push({
      label: `${item.name} — ${preco} Ryō/un.`.slice(0, 100),
      value: linha.itemId,
      description: `Você tem ${linha.qty}`,
    });
    if (opcoes.length >= 25) break;
  }

  if (!opcoes.length) {
    await interaction.editReply(
      await renderShop(
        villageId,
        shopType,
        sessionId,
        char.ryo,
        view.municipal
          ? "Você não tem nada que esta loja compre."
          : "Você não tem nada que o Mercado Geral recompre.",
      ),
    );
    return;
  }

  const painel = await renderShop(villageId, shopType, sessionId, char.ryo);
  await interaction.editReply({
    embeds: painel.embeds,
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(cid("sellitem", sessionId))
          .setPlaceholder("O que você quer vender?")
          .addOptions(opcoes),
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(cid("cancel", sessionId))
          .setLabel("Voltar")
          .setEmoji("↩️")
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
  });
}

async function mostrarEstoque(
  interaction: ButtonInteraction,
  villageId: VillageId,
  shopType: ShopType,
  sessionId: string,
  charRyo: number,
): Promise<void> {
  const shop = await findShop(villageId, shopType);
  const linhas = shop
    ? await prisma.villageShopStock.findMany({
        where: { shopId: shop.id, qty: { gt: 0 } },
        orderBy: { itemId: "asc" },
        take: 40,
      })
    : [];

  const painel = await renderShop(villageId, shopType, sessionId, charRyo);
  painel.embeds[0]?.addFields({
    name: "📦 Estoque da loja",
    value: linhas.length
      ? linhas
          .map((row) => `• ${getItem(row.itemId)?.name ?? row.name} ×${row.qty}`)
          .join("\n")
          .slice(0, 1024)
      : "_Vazio._",
  });
  await interaction.editReply(painel);
}

// ---------------- Selects ----------------

async function roteadorSelect(interaction: AnySelectMenuInteraction): Promise<void> {
  const [, , acao, sessionId] = interaction.customId.split(":");
  if (!acao || !sessionId || !interaction.isStringSelectMenu()) return;

  const { session, char, villageId } = await contexto(interaction, sessionId);
  const escolha = interaction.values[0]!;

  if (acao === "pick") {
    if (!isShopType(escolha)) throw new EconomyError("Loja desconhecida.");
    await interaction.deferUpdate();
    await updateSession(sessionId, { shopType: escolha, screen: "SHOP", data: {} });
    await interaction.editReply(await renderShop(villageId, escolha, sessionId, char.ryo));
    return;
  }

  const shopType = sessionShopType(session);
  if (!shopType) throw new EconomyError("Escolha uma loja primeiro.");

  if (acao === "buyitem" || acao === "sellitem") {
    const item = getItem(escolha);
    if (!item) throw new EconomyError("Item desconhecido.");
    // A escolha fica na sessao; o modal so' carrega o id dela.
    await updateSession(sessionId, {
      screen: acao === "buyitem" ? "BUY_QTY" : "SELL_QTY",
      data: { itemId: escolha },
    });
    const maximo = await maximoPermitido(
      acao === "buyitem" ? "BUY" : "SELL",
      villageId,
      shopType,
      char,
      escolha,
    );
    await interaction.showModal(
      new ModalBuilder()
        .setCustomId(cid(acao === "buyitem" ? "buyqty" : "sellqty", sessionId))
        .setTitle(`${acao === "buyitem" ? "Comprar" : "Vender"} ${item.name}`.slice(0, 45))
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("quantidade")
              .setLabel(`Quantidade (máximo agora: ${maximo})`)
              .setPlaceholder("Somente número inteiro positivo")
              .setStyle(TextInputStyle.Short)
              .setRequired(true),
          ),
        ),
    );
    return;
  }

  await interaction.deferUpdate();
}

// ---------------- Modais ----------------

// Aceita SOMENTE inteiro decimal positivo. Rejeita zero, negativo, decimal,
// texto, notacao cientifica, `+5`, espaco no meio e afins.
export function quantidadeValida(bruto: string): number | null {
  const texto = bruto.trim();
  if (!/^\d+$/.test(texto)) return null;
  const n = Number(texto);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

async function roteadorModal(interaction: ModalSubmitInteraction): Promise<void> {
  const [, , acao, sessionId] = interaction.customId.split(":");
  if (!acao || !sessionId) return;

  const { session, char, villageId } = await contexto(interaction, sessionId);
  const shopType = sessionShopType(session);
  const dados = sessionData(session);
  await interaction.deferUpdate();

  if (!shopType || !dados.itemId) {
    await interaction.editReply(await renderHome(villageId, sessionId, char.ryo));
    return;
  }

  const qtd = quantidadeValida(interaction.fields.getTextInputValue("quantidade"));
  if (qtd === null) {
    await interaction.editReply(
      await renderShop(
        villageId,
        shopType,
        sessionId,
        char.ryo,
        "❌ Quantidade inválida. Use só número inteiro positivo (1, 2, 3…).",
      ),
    );
    return;
  }

  const tipo = acao === "buyqty" ? "BUY" : "SELL";
  const maximo = await maximoPermitido(tipo, villageId, shopType, char, dados.itemId);

  if (maximo <= 0) {
    await interaction.editReply(
      await renderShop(villageId, shopType, sessionId, char.ryo, motivoZero(tipo)),
    );
    return;
  }

  // Acima do maximo NAO e' ajustado em silencio: o painel mostra o teto e pede
  // confirmacao explicita (secao 7.5).
  if (qtd > maximo) {
    await updateSession(sessionId, {
      screen: tipo === "BUY" ? "BUY_CONFIRM" : "SELL_CONFIRM",
      data: { ...dados, qty: maximo },
    });
    await interaction.editReply(
      await renderConfirmacao(villageId, shopType, sessionId, char.ryo, tipo, dados.itemId, qtd, maximo),
    );
    return;
  }

  await executar(interaction, sessionId, tipo, { ...dados, qty: qtd });
}

function motivoZero(tipo: "BUY" | "SELL"): string {
  return tipo === "BUY"
    ? "❌ Não dá para comprar nada agora: confira estoque e seu saldo."
    : "❌ A loja não consegue comprar agora: confira o orçamento do dia, o espaço e o cofre.";
}

async function renderConfirmacao(
  villageId: VillageId,
  shopType: ShopType,
  sessionId: string,
  charRyo: number,
  tipo: "BUY" | "SELL",
  itemId: string,
  pedido: number,
  maximo: number,
): Promise<Painel> {
  const nome = getItem(itemId)?.name ?? itemId;
  const painel = await renderShop(villageId, shopType, sessionId, charRyo);
  painel.embeds[0]?.addFields({
    name: "⚠️ Ajuste necessário",
    value:
      `Você pediu **${pedido}x ${nome}**, mas agora só dá para ${tipo === "BUY" ? "comprar" : "vender"} **${maximo}**.\n` +
      "Nada foi movimentado ainda.",
  });
  painel.components = [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(cid("confirm", sessionId))
        .setLabel(`Confirmar ${maximo}`)
        .setEmoji("✅")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(cid("cancel", sessionId))
        .setLabel("Cancelar")
        .setStyle(ButtonStyle.Secondary),
    ),
    rodape(sessionId),
  ];
  return painel;
}

async function confirmarMaximo(interaction: ButtonInteraction, sessionId: string): Promise<void> {
  const session = await requireSession(sessionId, interaction.user.id);
  const dados = sessionData(session);
  const tipo = session.screen === "BUY_CONFIRM" ? "BUY" : "SELL";
  if (!dados.itemId || !dados.qty) {
    throw new EconomyError("Nada pendente de confirmação. Abra a loja de novo.");
  }
  await executar(interaction, sessionId, tipo, dados);
}

// ---------------- Execução ----------------

async function executar(
  interaction: ButtonInteraction | ModalSubmitInteraction,
  sessionId: string,
  tipo: "BUY" | "SELL",
  dados: SessionData,
): Promise<void> {
  const session = await requireSession(sessionId, interaction.user.id);
  const villageId = session.villageId as VillageId;
  const shopType = sessionShopType(session);
  if (!shopType || !dados.itemId || !dados.qty) {
    throw new EconomyError("Nada pendente. Abra a loja de novo.");
  }

  const resultado =
    tipo === "BUY"
      ? await buyFromShop(
          session.charId,
          villageId,
          shopType,
          dados.itemId,
          dados.qty,
          interaction.user.id,
        )
      : shopType === "MERCADO_GERAL"
        ? await sellToGeneralMarket(session.charId, dados.itemId, dados.qty)
        : await sellToShop(
            session.charId,
            villageId,
            shopType,
            dados.itemId,
            dados.qty,
            interaction.user.id,
          );

  await updateSession(sessionId, { screen: "SHOP", data: {} });
  const char = await prisma.userCharacter.findUniqueOrThrow({ where: { id: session.charId } });

  const recibo = resultado.ok
    ? tipo === "BUY"
      ? `✅ Comprou **${resultado.qty}x ${resultado.name}** por **${resultado.total} Ryō** (${resultado.precoUnitario}/un.). Saldo: ${formatRyo(resultado.saldo)}.`
      : `✅ Vendeu **${resultado.qty}x ${resultado.name}** por **${resultado.total} Ryō** (${resultado.precoUnitario}/un.). Saldo: ${formatRyo(resultado.saldo)}.`
    : `❌ ${resultado.error}`;

  if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
  await interaction.editReply(await renderShop(villageId, shopType, sessionId, char.ryo, recibo));
}

// ---------------- Limites ----------------

// Maximo que a operacao comporta AGORA. E' so' para a mensagem e o botao de
// confirmacao: a trava de verdade continua sendo o UPDATE condicional dentro
// da transacao do shop-service.
async function maximoPermitido(
  tipo: "BUY" | "SELL",
  villageId: VillageId,
  shopType: ShopType,
  char: { id: string; ryo: number },
  itemId: string,
): Promise<number> {
  const view = await shopView(villageId, shopType);

  if (tipo === "BUY") {
    const linha = view.produtos.find((row) => row.itemId === itemId);
    if (!linha || linha.price <= 0) return 0;
    const estoque = Number.isFinite(linha.estoque) ? linha.estoque : Number.MAX_SAFE_INTEGER;
    return affordableBuyQty(Number.MAX_SAFE_INTEGER, estoque, char.ryo, linha.price);
  }

  const inventario = await getInventoryQty(prisma, char.id, itemId);

  if (!view.municipal) {
    const preco = npcBuybackPrice(referenceValue(itemId) ?? 0);
    return preco > 0 ? inventario : 0;
  }

  const linha = view.ingredientes.find((row) => row.itemId === itemId);
  if (!linha || linha.price <= 0) return 0;

  const [village, shop] = await Promise.all([
    prisma.village.findUniqueOrThrow({ where: { id: villageId } }),
    findShop(villageId, shopType),
  ]);
  if (!shop) return 0;
  const orcamento = await shopBudgetView(villageId, shop.id);

  return acceptableSellQty(
    Number.MAX_SAFE_INTEGER,
    inventario,
    Math.max(0, shop.capacity - shop.stockUnits),
    orcamento.restante,
    Math.max(0, village.treasuryRyo - village.reservedRyo),
    linha.price,
  );
}

// Exportado só para o teste de aceite conseguir varrer os prefixos usados.
export const LOJA_CUSTOM_ID_PREFIX = PREFIXO;
export const LOJA_SHOP_ORDER = SHOPS.map((shop) => shop.type);
