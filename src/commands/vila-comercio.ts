import {
  ActionRowBuilder,
  ButtonStyle,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type AnySelectMenuInteraction,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import {
  button,
  buttonRow,
  divider,
  economyContainer,
  factsBlock,
  feedbackBlock,
  itemLabel,
  listBlock,
  noticeBlock,
  ryo,
  selectRow,
  text,
  titleBlock,
  v2Edit,
  v2Public,
  type ContainerChild,
  type TopLevel,
} from "../ui/economy-components-v2.js";
import { emoji, shopEmoji } from "../ui/economy-emojis.js";
import { ECONOMY } from "../config/balance.js";
import { prisma } from "../db/client.js";
import { getItem } from "../data/items.js";
import { describeRecipe } from "../services/economy/crafting.js";
import { MUNICIPAL_SHOPS, getShop, isShopType, type ShopType } from "../data/shops.js";
import { VILLAGE_NAMES, type VillageId } from "../data/villages.js";
import { EconomyError } from "../services/economy/errors.js";
import { estimateMargin } from "../services/economy/shop-pricing.js";
import {
  acceptWholesaleContract,
  contractOffers,
  findShop,
  recipesForShop,
  restockShop,
  restockableItems,
  sealScrollsLeft,
  shopCraft,
  shopHistory,
  shopView,
  villageShopMenu,
  withdrawShopProduct,
  type CraftSource,
} from "../services/economy/shop-service.js";
import { ichirakuPreview, startIchiraku } from "../services/economy/constructions.js";
import { startConstructionScheduler } from "../services/economy/village-scheduler.js";
import { VILLAGE_ANNOUNCE_CHANNELS } from "../data/villages.js";

// Aba `Comércio` do painel /vila (secoes 7.6 e 7.7).
//
// A administracao de loja mora AQUI, e nao em /loja: o gate e' "ser o Kage E
// estar na mansao", o mesmo `podeKage` das outras abas. Nenhum botao deste
// arquivo aparece para jogador comum, e cada handler recheca o gate — um
// customId forjado por quem nao e' Kage nao passa da primeira linha.
//
// Nenhum valor confiavel viaja no customId: so' tipo de loja, id de receita,
// id de contrato e id de item. Quantidade e preco vem do modal e do banco.

export interface ComercioViewer {
  villageId: VillageId;
  charId: string;
  ryo: number;
  podeKage: boolean;
}

// Painel V2: árvore de componentes de topo, sem embeds nem content.
export type ComercioPainel = TopLevel[];

const cid = (...partes: (string | undefined)[]) => ["vila", "com", ...partes.filter(Boolean)].join(":");

function assertKage(viewer: ComercioViewer): void {
  if (!viewer.podeKage) {
    throw new EconomyError(
      `Só o Kage de ${VILLAGE_NAMES[viewer.villageId]}, dentro da mansão, pode administrar as lojas.`,
    );
  }
}

function requireShopType(valor: string | undefined): ShopType {
  if (!isShopType(valor)) throw new EconomyError("Loja desconhecida.");
  return valor;
}

// ---------------- Tela da aba ----------------

export async function renderComercio(
  viewer: ComercioViewer,
  navegacao: ContainerChild[],
  aviso?: string,
): Promise<ComercioPainel> {
  const [menu, preview] = await Promise.all([
    villageShopMenu(viewer.villageId),
    ichirakuPreview(viewer.villageId),
  ]);

  const filhos: ContainerChild[] = [
    titleBlock("shop_MERCADO_GERAL", `Comércio de ${VILLAGE_NAMES[viewer.villageId]}`),
  ];
  if (aviso) filhos.push(feedbackBlock(aviso));

  filhos.push(
    factsBlock([
      { label: "Obras", value: `${preview.vagasUsadas}/${preview.vagasTotais} vagas` },
      {
        label: "População",
        value: `${preview.ativos} ativos (fator ${preview.factor.toFixed(2)})`,
      },
    ]),
    divider(),
    listBlock(
      "Estabelecimentos",
      menu.map((linha) => {
        const canal = linha.discordChannelId ? ` <#${linha.discordChannelId}>` : "";
        return `${shopEmoji(linha.def.type)} **${linha.def.name}** — \`${linha.status}\`${canal}`;
      }),
      "Nenhuma loja configurada.",
    ),
    divider(),
    ...navegacao,
  );

  if (viewer.podeKage) {
    filhos.push(
      selectRow(
        new StringSelectMenuBuilder()
          .setCustomId(cid("pick"))
          .setPlaceholder("Administrar uma loja")
          .addOptions(
            MUNICIPAL_SHOPS.map((def) => ({
              label: def.name.slice(0, 100),
              value: def.type,
              emoji: shopEmoji(def.type),
              description:
                menu.find((linha) => linha.def.type === def.type)?.status.toLowerCase() ?? "",
            })),
          ),
      ),
    );

    // Construir Ichiraku so' aparece enquanto ele estiver bloqueado. Empório,
    // Marcenaria, Fundição e Oficina nunca entram nessa tela: ja existem.
    if (preview.status === "LOCKED") {
      filhos.push(
        buttonRow(
          button({
            id: cid("obra"),
            label: "Construir Ichiraku",
            style: ButtonStyle.Primary,
            emojiKey: "obras",
          }),
        ),
      );
    }
  }

  return [economyContainer("mercado", filhos)];
}

// ---------------- Tela de uma loja ----------------

async function renderLoja(
  viewer: ComercioViewer,
  shopType: ShopType,
  recibo?: string,
): Promise<ComercioPainel> {
  const view = await shopView(viewer.villageId, shopType);
  const def = getShop(shopType)!;
  const [central, contratos, receitas] = await Promise.all([
    prisma.villageStock.findMany({
      where: { villageId: viewer.villageId, qty: { gt: 0 } },
      orderBy: { itemId: "asc" },
      take: 25,
    }),
    contractOffers(viewer.villageId, shopType),
    Promise.resolve(recipesForShop(shopType)),
  ]);

  const estoqueLoja = view.shopId
    ? await prisma.villageShopStock.findMany({
        where: { shopId: view.shopId, qty: { gt: 0 } },
        orderBy: { itemId: "asc" },
        take: 25,
      })
    : [];

  const filhos: ContainerChild[] = [
    titleBlock("producao", `Administração — ${def.name}`, `situação \`${view.status}\``),
  ];
  if (recibo) filhos.push(feedbackBlock(recibo));

  filhos.push(
    factsBlock([
      { label: "Estoque da loja", value: `${view.stockUnits}/${view.capacity}` },
      {
        label: "Orçamento de compra hoje",
        value: `${view.budget?.restante ?? 0}/${view.budget?.total ?? 0} Ryō`,
      },
      { label: "Imposto", value: `${(view.taxRate * 100).toFixed(0)}%` },
    ]),
    divider(),
    listBlock(
      `${emoji("estoque")} Varejo desta loja`,
      estoqueLoja.map((row) =>
        itemLabel(row.itemId, getItem(row.itemId)?.name ?? row.name, row.qty),
      ),
      "Vazio — nada à venda para o jogador.",
    ),
    listBlock(
      `${emoji("vila")} Central disponível`,
      central.map((row) => itemLabel(row.itemId, getItem(row.itemId)?.name ?? row.name, row.qty)),
      "Vazio.",
    ),
  );

  if (receitas.length) {
    // O custo do painel e' CALCULADO pelo catalogo e pelo preco de compra atual;
    // nunca um numero escrito a mao (secao 7.4).
    const linhas = receitas.map((recipe) => {
      const margem = estimateMargin(recipe, view.taxRate);
      const extra = margem
        ? ` — varejo ${margem.varejo}, custo estimado ${margem.custo}, margem ${margem.margem}`
        : "";
      return `${describeRecipe(recipe)}${extra}`;
    });
    if (shopType === "OFICINA_SELOS") {
      const selos = await sealScrollsLeft(viewer.villageId);
      linhas.push(`_Pergaminho de Arsenal: ${selos.feitos}/${selos.limite} nesta competência._`);
    }
    filhos.push(divider(), listBlock(`${emoji("producao")} Produção`, linhas, "—"));
  }

  if (contratos.length) {
    filhos.push(
      divider(),
      listBlock(
        "🤝 Contratos de empreendedor",
        contratos.map(
          (c) =>
            `**${c.lotQty}x ${c.name}** → ${ryo(`${c.valor} Ryō`)} _(em estoque: ${c.emEstoque})_`,
        ),
        "—",
      ),
    );
  }

  // A etapa 08 proíbe botão desabilitado sem explicação: quando `Produzir` ou
  // `Contrato` não existem para esta loja, o motivo vai em texto e o botão some.
  const acoes = [
    button({ id: cid("abastecer", shopType), label: "Abastecer", style: ButtonStyle.Success }),
  ];
  if (receitas.length) {
    acoes.push(button({ id: cid("produzir", shopType), label: "Produzir", style: ButtonStyle.Primary }));
  }
  if (contratos.length) {
    acoes.push(
      button({ id: cid("contrato", shopType), label: "Fechar contrato", style: ButtonStyle.Primary }),
    );
  }
  acoes.push(
    button({ id: cid("retirar", shopType), label: "Retirar produto" }),
    button({ id: cid("hist", shopType), label: "Ver histórico" }),
  );

  filhos.push(divider());
  if (!receitas.length) {
    filhos.push(text(`-# ${def.name} não tem estação de produção: ela só compra, vende e estoca.`));
  }
  if (!contratos.length) {
    filhos.push(text("-# Sem contrato de atacado disponível para esta loja."));
  }
  filhos.push(
    buttonRow(...acoes),
    buttonRow(button({ id: cid("menu"), label: "Voltar ao comércio" })),
  );

  return [economyContainer("estoque", filhos)];
}

// ---------------- Botões ----------------

// Devolve true quando o clique era desta aba. `render` redesenha a aba inteira
// (o /vila passa a propria navegacao).
export async function handleComercioButton(
  interaction: ButtonInteraction,
  viewer: ComercioViewer,
  renderAba: (aviso?: string) => Promise<ComercioPainel>,
): Promise<boolean> {
  const partes = interaction.customId.split(":");
  if (partes[0] !== "vila" || partes[1] !== "com") return false;
  const acao = partes[2] ?? "";
  assertKage(viewer);

  if (acao === "menu") {
    await interaction.deferUpdate();
    await interaction.editReply(v2Edit(await renderAba()));
    return true;
  }

  if (acao === "obra") {
    await interaction.deferUpdate();
    await interaction.editReply(v2Edit(await renderObra(viewer)));
    return true;
  }

  if (acao === "obraOk") {
    await interaction.deferUpdate();
    const r = await startIchiraku(viewer.villageId, interaction.user.id);
    if (r.ok) {
      // Rearma o relogio: sem isto, a primeira obra iniciada depois do boot
      // ficaria sem timer e so' concluiria no proximo boot.
      await startConstructionScheduler(interaction.client).catch(() => undefined);
      await anunciarObra(interaction, viewer.villageId, r.obra.finishesAt, r.custo.ryo);
    }
    await interaction.editReply(
      v2Edit(await renderAba(
        r.ok
          ? `🏗️ Obra do Ichiraku iniciada. Custou **${r.custo.ryo} Ryō** e ` +
            `${r.custo.itens.map((i) => `${i.qty} ${i.name}`).join(", ")}. ` +
            `Conclusão <t:${Math.floor(r.obra.finishesAt.getTime() / 1000)}:R>.`
          : `❌ ${r.error}`,
      )),
    );
    return true;
  }

  const shopType = requireShopType(partes[3]);

  if (acao === "abastecer") {
    await abrirSelectAbastecer(interaction, viewer, shopType);
    return true;
  }
  if (acao === "produzir") {
    await abrirSelectProducao(interaction, viewer, shopType);
    return true;
  }
  if (acao === "retirar") {
    await abrirSelectRetirada(interaction, viewer, shopType);
    return true;
  }
  if (acao === "contrato") {
    await interaction.deferUpdate();
    await interaction.editReply(v2Edit(await renderContratos(viewer, shopType)));
    return true;
  }
  if (acao === "contratoOk") {
    await interaction.deferUpdate();
    const r = await acceptWholesaleContract(viewer.villageId, partes[4] ?? "", interaction.user.id);
    await interaction.editReply(
      v2Edit(await renderLoja(
        viewer,
        shopType,
        r.ok
          ? `🤝 Vendeu **${r.lotQty}x ${r.name}** ao empreendedor por **${r.valor} Ryō**. Cofre: ${r.cofre}.`
          : `❌ ${r.error}`,
      )),
    );
    return true;
  }
  if (acao === "hist") {
    await interaction.deferUpdate();
    await interaction.editReply(v2Edit(await renderHistorico(viewer, shopType)));
    return true;
  }
  // Origem da producao: estoque da loja ou estoque central (secao 7.6, passo 4).
  if (acao === "prodLoja" || acao === "prodCentral") {
    await abrirModalProducao(
      interaction,
      shopType,
      partes[4] ?? "",
      acao === "prodCentral" ? "CENTRAL" : "SHOP",
    );
    return true;
  }

  await interaction.deferUpdate();
  await interaction.editReply(v2Edit(await renderLoja(viewer, shopType)));
  return true;
}

// Aviso publico do inicio da obra (secao 7.7). Vai para o canal de avisos da
// vila, o mesmo lugar da ordem de coleta e do registro de saque da etapa 04.
async function anunciarObra(
  interaction: ButtonInteraction,
  villageId: VillageId,
  conclusao: Date,
  custoRyo: number,
): Promise<void> {
  const canal = await interaction.client.channels
    .fetch(VILLAGE_ANNOUNCE_CHANNELS[villageId])
    .catch(() => null);
  if (!canal?.isTextBased() || !("send" in canal)) return;
  // Anúncio PÚBLICO de auditoria: continua público (a etapa 08 proíbe trocá-lo
  // por painel efêmero), só muda a apresentação. Sem flag Ephemeral.
  await canal
    .send(
      v2Public([
        economyContainer("obras", [
          titleBlock("obras", `Obra iniciada — ${VILLAGE_NAMES[villageId]}`),
          text(`O Ichiraku de ${VILLAGE_NAMES[villageId]} começou a ser construído.`),
          divider(),
          factsBlock([
            { label: "Investimento da vila", value: ryo(`${custoRyo} Ryō`) },
            {
              label: "Conclusão prevista",
              value: `<t:${Math.floor(conclusao.getTime() / 1000)}:f> (<t:${Math.floor(conclusao.getTime() / 1000)}:R>)`,
            },
          ]),
          text("-# Materiais saíram do estoque central."),
        ]),
      ]),
    )
    .catch(() => null);
}

async function renderObra(viewer: ComercioViewer): Promise<ComercioPainel> {
  const preview = await ichirakuPreview(viewer.villageId);
  const faltando = preview.estoque.filter((row) => row.tem < row.precisa);
  const cofreOk = preview.cofreDisponivel >= preview.custo.ryo;
  const vagaOk = preview.vagasUsadas < preview.vagasTotais;

  const ok = (cumpre: boolean) => (cumpre ? emoji("sucesso") : emoji("erro"));
  const bloqueado = !cofreOk || !vagaOk || faltando.length > 0 || preview.status !== "LOCKED";

  return [
    economyContainer(bloqueado ? "aviso" : "obras", [
      titleBlock("shop_ICHIRAKU", "Confirmar construção do Ichiraku?"),
      factsBlock([
        { label: "Custo", value: ryo(`${preview.custo.ryo} Ryō`) },
        {
          label: "Fator congelado",
          value: `${preview.factor.toFixed(2)} (${preview.ativos} ativos)`,
        },
      ]),
      text(
        `**Materiais:** ${preview.custo.itens.map((i) => `${i.qty} ${i.name}`).join(", ")}\n` +
          `**Conclusão:** <t:${Math.floor(preview.conclusaoPrevista.getTime() / 1000)}:f>`,
      ),
      divider(),
      listBlock(
        "Requisitos",
        [
          `${ok(cofreOk)} Cofre disponível: ${preview.cofreDisponivel}/${preview.custo.ryo} Ryō`,
          `${ok(vagaOk)} Vagas de obra: ${preview.vagasUsadas}/${preview.vagasTotais}`,
          ...preview.estoque.map(
            (row) => `${ok(row.tem >= row.precisa)} ${row.name}: ${row.tem}/${row.precisa}`,
          ),
        ],
        "—",
      ),
      divider(),
      buttonRow(
        button({
          id: cid("obraOk"),
          label: "Confirmar obra",
          style: ButtonStyle.Success,
          disabled: bloqueado,
        }),
        button({ id: cid("menu"), label: "Cancelar" }),
      ),
      text("-# O custo e o fator são congelados no instante da confirmação."),
    ]),
  ];
}

async function renderContratos(viewer: ComercioViewer, shopType: ShopType): Promise<ComercioPainel> {
  const ofertas = await contractOffers(viewer.villageId, shopType);

  return [
    economyContainer("cofre", [
      titleBlock("cofre", `Contratos de empreendedor — ${getShop(shopType)?.name ?? shopType}`),
      divider(),
      listBlock(
        null,
        ofertas.map(
          (c) =>
            `**${c.lotQty}x ${c.name}** → ${ryo(`${c.valor} Ryō`)} para o cofre\n` +
            `-# Em estoque: ${c.emEstoque}${c.emEstoque >= c.lotQty ? "" : " • lote incompleto"}`,
        ),
        "Esta loja não tem contrato disponível.",
      ),
      divider(),
      buttonRow(
        ...ofertas
          .slice(0, 4)
          .map((c) =>
            button({
              id: cid("contratoOk", shopType, c.id),
              label: `Vender ${c.lotQty}x ${c.name}`.slice(0, 80),
              style: ButtonStyle.Success,
              disabled: c.emEstoque < c.lotQty,
            }),
          ),
        button({ id: cid("menu"), label: "Voltar" }),
      ),
      text(
        `-# Máximo de ${ECONOMY.wholesaleContractsPerDay} contrato por loja por dia. É a única venda que credita o cofre.`,
      ),
    ]),
  ];
}

async function renderHistorico(viewer: ComercioViewer, shopType: ShopType): Promise<ComercioPainel> {
  const linhas = await shopHistory(viewer.villageId, shopType, 10);
  return [
    economyContainer("mercado", [
      titleBlock("relatorio", `Histórico — ${getShop(shopType)?.name ?? shopType}`),
      divider(),
      listBlock(
        null,
        linhas.map((linha) => {
          const delta = linha.ryoDelta !== 0 ? ` ${linha.ryoDelta > 0 ? "+" : ""}${linha.ryoDelta} Ryō` : "";
          const item = linha.itemId
            ? ` ${itemLabel(linha.itemId, getItem(linha.itemId)?.name ?? linha.itemId, linha.itemQty ?? undefined)}`
            : "";
          const quem = linha.actorDiscordId ? ` — <@${linha.actorDiscordId}>` : "";
          return `\`${linha.type}\`${delta}${item}${quem}\n-# ${linha.reason || "sem motivo"}`;
        }),
        "Sem movimento nesta loja.",
      ),
      divider(),
      buttonRow(button({ id: cid("menu"), label: "Voltar" })),
      text("-# Últimos 10 lançamentos. O livro-caixa é append-only."),
    ]),
  ];
}

// ---------------- Selects ----------------

async function abrirSelectAbastecer(
  interaction: ButtonInteraction,
  viewer: ComercioViewer,
  shopType: ShopType,
): Promise<void> {
  // Mesmo filtro que `restockShop` aplica no serviço: insumo de receita desta
  // loja ou item que ela vende (seção 7.3.1). Sem isso o Kage consegue trancar
  // um item que a loja nunca vai usar nem vender.
  const permitidos = new Set(restockableItems(shopType));
  const central = (
    await prisma.villageStock.findMany({
      where: { villageId: viewer.villageId, qty: { gt: 0 } },
      orderBy: { itemId: "asc" },
    })
  )
    .filter((row) => permitidos.has(row.itemId))
    .slice(0, 25);
  await interaction.deferUpdate();
  if (!central.length) {
    await interaction.editReply(
      v2Edit(await renderLoja(
        viewer,
        shopType,
        "O estoque central não tem nada que esta loja use ou venda.",
      )),
    );
    return;
  }
  const painel = await renderLoja(viewer, shopType);
  painel.push(
    economyContainer("estoque", [
      titleBlock("estoque", "Abastecer a loja"),
      text("Escolha o recurso que sairá do estoque central."),
      selectRow(
        new StringSelectMenuBuilder()
          .setCustomId(cid("abastecerItem", shopType))
          .setPlaceholder("O que enviar do estoque central?")
          .addOptions(central.map((row) => ({
            label: (getItem(row.itemId)?.name ?? row.name).slice(0, 100),
            value: row.itemId,
            description: `No central: ${row.qty}`,
          }))),
      ),
      buttonRow(button({ id: cid("menu"), label: "Voltar" })),
    ]),
  );
  await interaction.editReply(v2Edit(painel));
}

async function abrirSelectRetirada(
  interaction: ButtonInteraction,
  viewer: ComercioViewer,
  shopType: ShopType,
): Promise<void> {
  const shop = await findShop(viewer.villageId, shopType);
  const estoque = shop
    ? await prisma.villageShopStock.findMany({
        where: { shopId: shop.id, qty: { gt: 0 } },
        orderBy: { itemId: "asc" },
        take: 25,
      })
    : [];
  await interaction.deferUpdate();
  if (!estoque.length) {
    await interaction.editReply(v2Edit(await renderLoja(viewer, shopType, "A loja está sem estoque.")));
    return;
  }
  const painel = await renderLoja(viewer, shopType);
  painel.push(
    economyContainer("estoque", [
      titleBlock("estoque", "Retirar produto"),
      text("Escolha o produto que voltará ao estoque central. Será preciso registrar um motivo."),
      selectRow(
        new StringSelectMenuBuilder()
          .setCustomId(cid("retirarItem", shopType))
          .setPlaceholder("O que devolver ao estoque central?")
          .addOptions(estoque.map((row) => ({
            label: (getItem(row.itemId)?.name ?? row.name).slice(0, 100),
            value: row.itemId,
            description: `Na loja: ${row.qty}`,
          }))),
      ),
      buttonRow(button({ id: cid("menu"), label: "Voltar" })),
    ]),
  );
  await interaction.editReply(v2Edit(painel));
}

async function abrirSelectProducao(
  interaction: ButtonInteraction,
  viewer: ComercioViewer,
  shopType: ShopType,
): Promise<void> {
  const receitas = recipesForShop(shopType);
  await interaction.deferUpdate();
  if (!receitas.length) {
    await interaction.editReply(v2Edit(await renderLoja(viewer, shopType, "Esta loja não produz nada.")));
    return;
  }
  const view = await shopView(viewer.villageId, shopType);
  const selos = shopType === "OFICINA_SELOS" ? await sealScrollsLeft(viewer.villageId) : null;

  const painel = await renderLoja(viewer, shopType);
  painel.push(
    economyContainer("obras", [
      titleBlock("producao", "Escolher produção"),
      text("Escolha a receita. Depois você decide de qual estoque vêm os insumos."),
      selectRow(
        new StringSelectMenuBuilder()
          .setCustomId(cid("produzirItem", shopType))
          .setPlaceholder("O que produzir?")
          .addOptions(receitas.slice(0, 25).map((recipe) => {
            const margem = estimateMargin(recipe, view.taxRate);
            const sufixo = selos && recipe.outputItemId === "pergaminho_arsenal"
              ? ` (${selos.feitos}/${selos.limite} nesta semana)` : "";
            return {
              label: `${recipe.name}${sufixo}`.slice(0, 100),
              value: recipe.id,
              description: (margem
                ? `varejo ${margem.varejo} • custo estimado ${margem.custo}`
                : recipe.ingredients.length + " insumo(s)").slice(0, 100),
            };
          })),
      ),
      buttonRow(button({ id: cid("menu"), label: "Voltar" })),
    ]),
  );
  await interaction.editReply(v2Edit(painel));
}

export async function handleComercioSelect(
  interaction: AnySelectMenuInteraction,
  viewer: ComercioViewer,
  renderAba: (aviso?: string) => Promise<ComercioPainel>,
): Promise<boolean> {
  const partes = interaction.customId.split(":");
  if (partes[0] !== "vila" || partes[1] !== "com" || !interaction.isStringSelectMenu()) return false;
  const acao = partes[2] ?? "";
  assertKage(viewer);
  const escolha = interaction.values[0]!;

  if (acao === "pick") {
    await interaction.deferUpdate();
    await interaction.editReply(v2Edit(await renderLoja(viewer, requireShopType(escolha))));
    return true;
  }

  const shopType = requireShopType(partes[3]);

  if (acao === "abastecerItem" || acao === "retirarItem") {
    const nome = getItem(escolha)?.name ?? escolha;
    const modal = new ModalBuilder()
      .setCustomId(cid(acao === "abastecerItem" ? "abastecerQtd" : "retirarQtd", shopType, escolha))
      .setTitle(
        (acao === "abastecerItem" ? `Enviar ${nome}` : `Retirar ${nome}`).slice(0, 45),
      )
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("quantidade")
            .setLabel("Quantidade")
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ),
      );
    // Retirada exige motivo; abastecimento e' transferencia interna.
    if (acao === "retirarItem") {
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("motivo")
            .setLabel(`Motivo (${ECONOMY.withdrawalReasonMin}-${ECONOMY.withdrawalReasonMax} caracteres)`)
            .setStyle(TextInputStyle.Paragraph)
            .setMinLength(ECONOMY.withdrawalReasonMin)
            .setMaxLength(ECONOMY.withdrawalReasonMax)
            .setRequired(true),
        ),
      );
    }
    await interaction.showModal(modal);
    return true;
  }

  if (acao === "produzirItem") {
    await interaction.deferUpdate();
    await interaction.editReply(v2Edit(await renderEscolhaOrigem(viewer, shopType, escolha)));
    return true;
  }

  await interaction.deferUpdate();
  await interaction.editReply(v2Edit(await renderAba()));
  return true;
}

async function renderEscolhaOrigem(
  viewer: ComercioViewer,
  shopType: ShopType,
  recipeId: string,
): Promise<ComercioPainel> {
  const recipe = recipesForShop(shopType).find((row) => row.id === recipeId);
  if (!recipe) throw new EconomyError("Esta receita não pertence a esta loja.");
  const view = await shopView(viewer.villageId, shopType);
  const margem = estimateMargin(recipe, view.taxRate);

  const filhos: ContainerChild[] = [
    titleBlock("producao", `Produzir ${recipe.name}`),
    text(describeRecipe(recipe)),
    text("-# O produto pronto entra sempre no estoque da loja."),
  ];
  if (margem) {
    filhos.push(divider(), factsBlock([
      { label: "Varejo atual", value: ryo(`${margem.varejo} Ryō`) },
      { label: "Custo estimado", value: ryo(`${margem.custo} Ryō`) },
      { label: "Margem", value: ryo(`${margem.margem} Ryō`) },
    ]));
    if (margem.semPreco.length) {
      filhos.push(noticeBlock("aviso", `Custo real maior: sem preço de compra para ${margem.semPreco.map((id) => getItem(id)?.name ?? id).join(", ")}.`));
    }
  }
  if (recipe.outputItemId === "pergaminho_arsenal") {
    const selos = await sealScrollsLeft(viewer.villageId);
    filhos.push(noticeBlock("aviso", `Pergaminho de Arsenal: ${selos.feitos}/${selos.limite} nesta competência; reseta domingo às 22:00.`));
  }
  filhos.push(divider(), buttonRow(
    button({ id: cid("prodLoja", shopType, recipeId), label: "Usar estoque da loja", style: ButtonStyle.Primary, emojiKey: "shop_MERCADO_GERAL" }),
    button({ id: cid("prodCentral", shopType, recipeId), label: "Usar estoque central", emojiKey: "estoque" }),
    button({ id: cid("menu"), label: "Cancelar" }),
  ));
  return [economyContainer("obras", filhos)];
}

async function abrirModalProducao(
  interaction: ButtonInteraction,
  shopType: ShopType,
  recipeId: string,
  origem: CraftSource,
): Promise<void> {
  const recipe = recipesForShop(shopType).find((row) => row.id === recipeId);
  if (!recipe) throw new EconomyError("Esta receita não pertence a esta loja.");
  const temAlternativa = recipe.ingredients.some((ing) => ing.anyOf?.length);

  const modal = new ModalBuilder()
    .setCustomId(cid("prodQtd", shopType, recipeId, origem))
    .setTitle(`Produzir ${recipe.name}`.slice(0, 45))
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("quantidade")
          .setLabel("Quantas vezes?")
          .setStyle(TextInputStyle.Short)
          .setRequired(true),
      ),
    );

  // Lámen aceita carne OU peixe: o Kage escolhe, e sem escolha o serviço pega a
  // primeira alternativa que o estoque comporta.
  if (temAlternativa) {
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("preferido")
          .setLabel("Preferência (opcional)")
          .setPlaceholder("carne_crua ou peixe_cru")
          .setStyle(TextInputStyle.Short)
          .setRequired(false),
      ),
    );
  }
  await interaction.showModal(modal);
}

// ---------------- Modais ----------------

function inteiroPositivo(bruto: string): number | null {
  const texto = bruto.trim();
  if (!/^\d+$/.test(texto)) return null;
  const n = Number(texto);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export async function handleComercioModal(
  interaction: ModalSubmitInteraction,
  viewer: ComercioViewer,
): Promise<boolean> {
  const partes = interaction.customId.split(":");
  if (partes[0] !== "vila" || partes[1] !== "com") return false;
  const acao = partes[2] ?? "";
  assertKage(viewer);
  const shopType = requireShopType(partes[3]);
  const alvo = partes[4] ?? "";

  await interaction.deferUpdate();
  const qtd = inteiroPositivo(interaction.fields.getTextInputValue("quantidade"));
  if (qtd === null) {
    await interaction.editReply(
      v2Edit(await renderLoja(viewer, shopType, "❌ Quantidade inválida. Use só número inteiro positivo.")),
    );
    return true;
  }

  if (acao === "abastecerQtd") {
    const r = await restockShop(viewer.villageId, shopType, alvo, qtd, interaction.user.id);
    await interaction.editReply(
      v2Edit(await renderLoja(
        viewer,
        shopType,
        r.ok
          ? `📥 Enviou **${r.qty}x ${r.name}**. Central: ${r.central} • loja: ${r.loja}.`
          : `❌ ${r.error}`,
      )),
    );
    return true;
  }

  if (acao === "retirarQtd") {
    const motivo = interaction.fields.getTextInputValue("motivo");
    const r = await withdrawShopProduct(
      viewer.villageId,
      shopType,
      alvo,
      qtd,
      motivo,
      interaction.user.id,
    );
    await interaction.editReply(
      v2Edit(await renderLoja(
        viewer,
        shopType,
        r.ok
          ? `📤 Devolveu **${r.qty}x ${r.name}** ao estoque central. Loja: ${r.loja} • central: ${r.central}.`
          : `❌ ${r.error}`,
      )),
    );
    return true;
  }

  if (acao === "prodQtd") {
    const origem: CraftSource = partes[5] === "CENTRAL" ? "CENTRAL" : "SHOP";
    let preferido: string | undefined;
    try {
      preferido = interaction.fields.getTextInputValue("preferido").trim() || undefined;
    } catch {
      preferido = undefined;
    }
    const r = await shopCraft({
      villageId: viewer.villageId,
      shopType,
      recipeId: alvo,
      vezes: qtd,
      origem,
      actorDiscordId: interaction.user.id,
      preferido,
    });
    await interaction.editReply(
      v2Edit(await renderLoja(
        viewer,
        shopType,
        r.ok
          ? `🔧 Produziu **${r.produzido}x ${r.recipe.name}** usando o estoque ${origem === "CENTRAL" ? "central" : "da loja"}.\n` +
            `Consumiu: ${r.consumido.map((i) => `${i.qty}x ${getItem(i.itemId)?.name ?? i.itemId}`).join(", ")}.` +
            (r.restanteNaSemana !== null ? `\nRestam ${r.restanteNaSemana} nesta competência.` : "")
          : `❌ ${r.error}`,
      )),
    );
    return true;
  }

  await interaction.editReply(v2Edit(await renderLoja(viewer, shopType)));
  return true;
}
