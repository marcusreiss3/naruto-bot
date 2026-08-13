import {
  ActionRowBuilder,
  ButtonStyle,
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
import {
  button,
  buttonRow,
  closeRow,
  divider,
  economyContainer,
  factsBlock,
  itemLabel,
  listBlock,
  navigationRow,
  noticeBlock,
  feedbackBlock,
  ryo,
  selectRow,
  text,
  titleBlock,
  v2Edit,
  type ContainerChild,
  type TopLevel,
} from "../ui/economy-components-v2.js";
import { emoji, shopEmoji } from "../ui/economy-emojis.js";
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

// Painel V2: a arvore de componentes de topo. Nao existe mais `embeds` aqui —
// mensagem com IsComponentsV2 nao aceita embed nem content.
type Painel = TopLevel[];

function rodape(sessionId: string) {
  return closeRow(cid("refresh", sessionId), cid("close", sessionId));
}

// Preco por unidade com a situacao do estoque ao lado. Mercado Geral mostra
// `restante/inicial` da caravana; loja municipal mostra o estoque fisico.
function linhaProduto(linha: {
  itemId: string;
  name: string;
  price: number;
  estoque: number;
  inicial?: number;
}): string {
  const rotulo = itemLabel(linha.itemId, linha.name);
  if (linha.estoque <= 0) return `${rotulo} — ~~${linha.price} Ryō~~ • **esgotado**`;
  const quanto =
    linha.inicial === undefined
      ? `${linha.estoque} unidade(s)`
      : `${linha.estoque}/${linha.inicial} restantes`;
  return `${rotulo} — ${ryo(`${linha.price} Ryō`)} • ${quanto}`;
}

// Horário local (America/Sao_Paulo) da próxima virada da caravana.
function horaLocal(quando: Date): string {
  return quando.toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });
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

  const filhos: ContainerChild[] = [
    titleBlock("shop_MERCADO_GERAL", `Mercado de ${VILLAGE_NAMES[villageId]}`, "Centro Comercial"),
  ];
  // Recibo da acao anterior vira faixa no topo e some na proxima navegacao.
  if (recibo) filhos.push(feedbackBlock(recibo));
  filhos.push(
    factsBlock([
      { label: "Imposto", value: `${(village.taxRate * 100).toFixed(0)}%` },
      { label: "Seu saldo", value: ryo(formatRyo(charRyo)) },
    ]),
    divider(),
    // Situacao legivel sem abrir a loja (etapa 08), mas o select continua sendo
    // a navegacao principal. Nao mostra cofre: isto e' painel de jogador.
    listBlock(
      "Estabelecimentos",
      menu.map(
        (linha) =>
          `${shopEmoji(linha.def.type)} **${linha.def.name}** — ${STATUS_LABEL[linha.status]}`,
      ),
      "Nenhuma loja configurada.",
    ),
    divider(),
    selectRow(
      new StringSelectMenuBuilder()
        .setCustomId(cid("pick", sessionId))
        .setPlaceholder("Escolha uma loja")
        .addOptions(
          menu.map((linha) => ({
            label: linha.def.name.slice(0, 100),
            value: linha.def.type,
            emoji: shopEmoji(linha.def.type),
            description: STATUS_LABEL[linha.status],
          })),
        ),
    ),
    rodape(sessionId),
    text("-# Os preços já incluem o imposto da vila."),
  );

  return [economyContainer("mercado", filhos)];
}

// `acoes: false` desenha o mesmo cartão sem a linha de botões — as telas de
// escolha (comprar/vender) trocam as ações pelo select, como antes.
async function renderShop(
  villageId: VillageId,
  shopType: ShopType,
  sessionId: string,
  charRyo: number,
  recibo?: string,
  opts: { acoes?: boolean } = {},
): Promise<Painel> {
  const view = await shopView(villageId, shopType);
  const def = getShop(shopType)!;
  const titulo = titleBlock(
    `shop_${shopType}`,
    `${def.name} — ${VILLAGE_NAMES[villageId]}`,
    view.municipal ? undefined : "Caravana externa • preços de emergência",
  );

  // Loja fechada (hoje só o Ichiraku). O jogador vê o custo e que depende do
  // Kage; não há botão de construir aqui — isso é a aba Comércio de /vila.
  if (view.status !== "ACTIVE") {
    const preview = shopType === "ICHIRAKU" ? await ichirakuPreview(villageId) : null;
    const filhos: ContainerChild[] = [
      titulo,
      noticeBlock("bloqueio", `${def.name} está **${STATUS_LABEL[view.status]}**.`),
    ];
    if (preview) {
      filhos.push(
        divider(),
        listBlock(
          "Para abrir",
          [
            `${ryo(`${preview.custo.ryo} Ryō`)} e ${preview.custo.itens
              .map((i) => itemLabel(i.itemId, i.name, i.qty))
              .join(", ")}`,
            `${emoji("obras")} Obra de 5 dias, iniciada pelo Kage na mansão • fator de população ${preview.factor.toFixed(2)}`,
          ],
          "—",
        ),
      );
      if (preview.emObra) filhos.push(noticeBlock("aviso", "A obra já está em andamento."));
    }
    filhos.push(divider(), navigationRow([{ id: cid("home", sessionId), label: "Voltar" }]), rodape(sessionId));
    return [economyContainer("aviso", filhos)];
  }

  // Item esgotado continua listado (o jogador precisa saber que veio e acabou),
  // mas nao pode ser escolhido — quem filtra o select e' `abrirSelectCompra`.
  const comPreco = view.produtos.filter((linha) => linha.price > 0);
  const emEstoque = comPreco.filter((linha) => linha.estoque > 0);

  const filhos: ContainerChild[] = [titulo];
  if (recibo) filhos.push(feedbackBlock(recibo));

  filhos.push(
    view.municipal
      ? factsBlock([
          { label: "Estoque", value: `${view.stockUnits}/${view.capacity}` },
          {
            label: "Orçamento de compra hoje",
            value: `${view.budget?.restante ?? 0}/${view.budget?.total ?? 0} Ryō`,
          },
          { label: "Seu saldo", value: ryo(formatRyo(charRyo)) },
        ])
      : factsBlock([
          { label: "Seu saldo", value: ryo(formatRyo(charRyo)) },
          {
            label: "Próxima caravana",
            value: view.proximaCaravana ? horaLocal(view.proximaCaravana) : "—",
          },
        ]),
    divider(),
  );

  // Sem catálogo vendável, aviso cinza no lugar da lista — e só o botão
  // `Comprar` desabilita, nunca a loja inteira (etapa 08).
  filhos.push(
    comPreco.length
      ? listBlock(
          view.municipal ? "À venda agora" : "Ofertas de hoje",
          comPreco.map(linhaProduto),
          "—",
        )
      : noticeBlock("aviso", "Sem estoque para venda."),
  );

  filhos.push(divider());
  if (view.municipal) {
    filhos.push(
      listBlock(
        "Compramos hoje",
        view.ingredientes.map(
          (linha) =>
            `${itemLabel(linha.itemId, linha.name)} — ${ryo(`${linha.price} Ryō`)}/un. ` +
            `• cota ${linha.remainingQty}/${linha.initialQty}`,
        ),
        "A seleção de matéria-prima de hoje já foi preenchida.",
      ),
      text("-# Seleção e cotas são compartilhadas pela vila e mudam diariamente; o Ryō pago sai do cofre da vila."),
    );
  } else {
    filhos.push(
      text(
        `${emoji("caravana")} **Recompra de emergência** — pagamos **30%** do valor de referência. ` +
          "Vale menos que vender à loja da vila.",
      ),
      text("-# Seleção diária limitada e compartilhada pela vila."),
    );
  }

  if (opts.acoes !== false) {
    filhos.push(
      divider(),
      buttonRow(
        button({
          id: cid("buy", sessionId),
          label: "Comprar",
          style: ButtonStyle.Success,
          // Ativo quando existe pelo menos um item vendável com quantidade
          // positiva; desativado só quando não há nada (seção 7.3.1).
          disabled: emEstoque.length === 0,
        }),
        button({
          id: cid("sell", sessionId),
          label: view.municipal ? "Vender materiais" : "Vender ao NPC",
          style: ButtonStyle.Primary,
        }),
        button({ id: cid("stock", sessionId), label: "Ver estoque", disabled: !view.municipal }),
        button({ id: cid("home", sessionId), label: "Voltar" }),
      ),
      rodape(sessionId),
    );
  }

  filhos.push(text(`-# Preços atualizados pelo imposto de ${(view.taxRate * 100).toFixed(0)}%.`));
  return [economyContainer(view.municipal ? "estoque" : "mercado", filhos)];
}

// Cartão da loja seguido de um select que substitui as ações. Usado pelas telas
// de comprar e vender: a etapa 08 pede uma frase dizendo o que o modal fará.
async function painelComSelect(
  base: Painel,
  aviso: string,
  select: StringSelectMenuBuilder,
  sessionId: string,
): Promise<Painel> {
  return [
    ...base,
    economyContainer("mercado", [
      text(aviso),
      selectRow(select),
      navigationRow([{ id: cid("cancel", sessionId), label: "Voltar" }]),
    ]),
  ];
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
      // Primeira aplicação da flag V2: o defer criou a mensagem efêmera e é o
      // editReply que a converte em Components V2, com a árvore inteira.
      await aplicar(interaction, painel);
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

// Aplica a árvore V2 numa resposta já deferida. Todo `editReply` do painel
// passa por aqui: a flag V2 é irremovível, então uma edição sem ela quebraria
// a mensagem inteira.
async function aplicar(interaction: RepliableInteraction, painel: Painel): Promise<void> {
  await interaction.editReply(v2Edit(painel));
}

async function responderErro(interaction: RepliableInteraction, err: unknown): Promise<void> {
  const msg = err instanceof EconomyError ? err.message : "Não consegui completar isso.";
  if (interaction.deferred || interaction.replied) {
    // A mensagem já é V2: `content` seria rejeitado pelo Discord. O erro vira
    // um cartão vermelho mínimo — curto, como pede a etapa 08.
    await interaction
      .editReply(v2Edit([economyContainer("erro", [noticeBlock("erro", msg)])]))
      .catch(() => null);
  } else {
    // Resposta nova, ainda não é V2: texto efêmero curto continua sendo o certo.
    await interaction
      .reply({ content: `❌ ${msg}`, flags: MessageFlags.Ephemeral })
      .catch(() => null);
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
    // A mensagem já é V2: `content` seria recusado. Fecha com um cartão mínimo.
    await interaction.update(
      v2Edit([economyContainer("aviso", [text("Painel fechado.")])]),
    );
    return;
  }

  const { session, char, villageId } = await contexto(interaction, sessionId);
  await interaction.deferUpdate();
  const shopType = sessionShopType(session);

  if (acao === "home") {
    await updateSession(sessionId, { shopType: null, screen: "HOME", data: {} });
    await aplicar(interaction, await renderHome(villageId, sessionId, char.ryo));
    return;
  }

  if (acao === "refresh") {
    await updateSession(sessionId, { data: {} });
    await aplicar(
      interaction,
      shopType
        ? await renderShop(villageId, shopType, sessionId, char.ryo)
        : await renderHome(villageId, sessionId, char.ryo),
    );
    return;
  }

  if (!shopType) {
    await aplicar(interaction, await renderHome(villageId, sessionId, char.ryo));
    return;
  }

  if (acao === "buy") return abrirSelectCompra(interaction, villageId, shopType, sessionId, char.ryo);
  if (acao === "sell") return abrirSelectVenda(interaction, villageId, shopType, sessionId, char);
  if (acao === "stock") return mostrarEstoque(interaction, villageId, shopType, sessionId, char.ryo);
  if (acao === "confirm") return confirmarMaximo(interaction, sessionId);
  if (acao === "cancel") {
    await updateSession(sessionId, { data: {} });
    await aplicar(interaction, await renderShop(villageId, shopType, sessionId, char.ryo));
    return;
  }

  await aplicar(interaction, await renderShop(villageId, shopType, sessionId, char.ryo));
}

async function abrirSelectCompra(
  interaction: ButtonInteraction,
  villageId: VillageId,
  shopType: ShopType,
  sessionId: string,
  charRyo: number,
): Promise<void> {
  const view = await shopView(villageId, shopType);
  // Esgotado não entra no select: a seção 7.2.1 exige que item zerado não
  // possa ser escolhido, não só que apareça riscado no embed.
  const opcoes = view.produtos
    .filter((linha) => linha.price > 0 && linha.estoque > 0)
    .slice(0, 25)
    .map((linha) => ({
      label: `${linha.name} — ${linha.price} Ryō`.slice(0, 100),
      value: linha.itemId,
      description:
        linha.inicial === undefined
          ? `${linha.estoque} em estoque`
          : `${linha.estoque}/${linha.inicial} na caravana`,
    }));

  if (!opcoes.length) {
    await aplicar(interaction, await renderShop(villageId, shopType, sessionId, charRyo, "Não há nada à venda agora."));
    return;
  }

  const base = await renderShop(villageId, shopType, sessionId, charRyo, undefined, {
    acoes: false,
  });
  await aplicar(
    interaction,
    await painelComSelect(
      base,
      "Escolha o item: o próximo passo abre um campo de **quantidade**, já com o máximo que você consegue levar agora.",
      new StringSelectMenuBuilder()
        .setCustomId(cid("buyitem", sessionId))
        .setPlaceholder("O que você quer comprar?")
        .addOptions(opcoes),
      sessionId,
    ),
  );
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
    const compraMunicipal = view.ingredientes.find((row) => row.itemId === linha.itemId);
    if (view.municipal && (!compraMunicipal || compraMunicipal.remainingQty <= 0)) continue;
    const preco = view.municipal
      ? compraMunicipal?.price
      : npcBuybackPrice(referenceValue(linha.itemId) ?? 0);
    if (!preco || preco <= 0) continue;
    opcoes.push({
      label: `${item.name} — ${preco} Ryō/un.`.slice(0, 100),
      value: linha.itemId,
      description: view.municipal
        ? `Você tem ${linha.qty} • loja compra até ${compraMunicipal?.remainingQty ?? 0}`
        : `Você tem ${linha.qty}`,
    });
    if (opcoes.length >= 25) break;
  }

  if (!opcoes.length) {
    await aplicar(interaction, await renderShop( villageId, shopType, sessionId, char.ryo, view.municipal ? "Você não tem nada que esta loja compre." : "Você não tem nada que o Mercado Geral recompre.", ));
    return;
  }

  const base = await renderShop(villageId, shopType, sessionId, char.ryo, undefined, {
    acoes: false,
  });
  await aplicar(
    interaction,
    await painelComSelect(
      base,
      "Escolha o material: o próximo passo abre um campo de **quantidade**, já com o máximo que a loja consegue comprar agora.",
      new StringSelectMenuBuilder()
        .setCustomId(cid("sellitem", sessionId))
        .setPlaceholder("O que você quer vender?")
        .addOptions(opcoes),
      sessionId,
    ),
  );
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

  const base = await renderShop(villageId, shopType, sessionId, charRyo);
  await aplicar(interaction, [
    ...base,
    economyContainer("estoque", [
      titleBlock("estoque", "Estoque da loja"),
      listBlock(
        null,
        linhas.map((row) => itemLabel(row.itemId, getItem(row.itemId)?.name ?? row.name, row.qty)),
        "Vazio.",
      ),
    ]),
  ]);
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
    await aplicar(interaction, await renderShop(villageId, escolha, sessionId, char.ryo));
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
    await aplicar(interaction, await renderHome(villageId, sessionId, char.ryo));
    return;
  }

  const qtd = quantidadeValida(interaction.fields.getTextInputValue("quantidade"));
  if (qtd === null) {
    await aplicar(interaction, await renderShop( villageId, shopType, sessionId, char.ryo, "❌ Quantidade inválida. Use só número inteiro positivo (1, 2, 3…).", ));
    return;
  }

  const tipo = acao === "buyqty" ? "BUY" : "SELL";
  const maximo = await maximoPermitido(tipo, villageId, shopType, char, dados.itemId);

  if (maximo <= 0) {
    await aplicar(interaction, await renderShop(villageId, shopType, sessionId, char.ryo, motivoZero(tipo)));
    return;
  }

  // Acima do maximo NAO e' ajustado em silencio: o painel mostra o teto e pede
  // confirmacao explicita (secao 7.5).
  if (qtd > maximo) {
    await updateSession(sessionId, {
      screen: tipo === "BUY" ? "BUY_CONFIRM" : "SELL_CONFIRM",
      data: { ...dados, qty: maximo },
    });
    await aplicar(
      interaction,
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
  const verbo = tipo === "BUY" ? "comprar" : "vender";
  // Cartão da loja sem ações + cartão de confirmação: o impacto aparece antes
  // do clique, e o botão primário já traz o número que será executado.
  const base = await renderShop(villageId, shopType, sessionId, charRyo, undefined, {
    acoes: false,
  });
  return [
    ...base,
    economyContainer("aviso", [
      titleBlock("aviso", "Ajuste necessário"),
      text(
        `Você pediu ${itemLabel(itemId, nome, pedido)}, mas agora só dá para ${verbo} **${maximo}**.`,
      ),
      noticeBlock("aviso", "Nada foi movimentado ainda."),
      divider(),
      buttonRow(
        button({
          id: cid("confirm", sessionId),
          label: `Confirmar ${maximo}`,
          style: ButtonStyle.Success,
        }),
        button({ id: cid("cancel", sessionId), label: "Cancelar" }),
      ),
      rodape(sessionId),
    ]),
  ];
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
  await aplicar(interaction, await renderShop(villageId, shopType, sessionId, char.ryo, recibo));
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
    // Serve para o Mercado Geral e para a loja municipal sem diferença: desde a
    // 7.2.1 os dois têm quantidade finita, a caravana do dia ou o estoque real.
    const linha = view.produtos.find((row) => row.itemId === itemId);
    if (!linha || linha.price <= 0) return 0;
    return affordableBuyQty(Number.MAX_SAFE_INTEGER, linha.estoque, char.ryo, linha.price);
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

  return Math.min(
    linha.remainingQty,
    acceptableSellQty(
    Number.MAX_SAFE_INTEGER,
    inventario,
    Math.max(0, shop.capacity - shop.stockUnits),
    orcamento.restante,
    Math.max(0, village.treasuryRyo - village.reservedRyo),
    linha.price,
    ),
  );
}

// Exportado só para o teste de aceite conseguir varrer os prefixos usados.
export const LOJA_CUSTOM_ID_PREFIX = PREFIXO;
export const LOJA_SHOP_ORDER = SHOPS.map((shop) => shop.type);
