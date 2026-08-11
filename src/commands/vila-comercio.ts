import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type AnySelectMenuInteraction,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
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

export interface ComercioPainel {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[];
}

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
  navegacao: ActionRowBuilder<ButtonBuilder>[],
  aviso?: string,
): Promise<ComercioPainel> {
  const [menu, preview] = await Promise.all([
    villageShopMenu(viewer.villageId),
    ichirakuPreview(viewer.villageId),
  ]);

  const embed = new EmbedBuilder()
    .setColor(0xc9a227)
    .setTitle(`🏪 Comércio — ${VILLAGE_NAMES[viewer.villageId]}`)
    .setDescription(
      menu
        .map((linha) => {
          const canal = linha.discordChannelId ? ` <#${linha.discordChannelId}>` : "";
          return `${linha.def.emoji} **${linha.def.name}** — \`${linha.status}\`${canal}`;
        })
        .join("\n"),
    )
    .setFooter({
      text: `Obras: ${preview.vagasUsadas}/${preview.vagasTotais} • população ${preview.ativos} (fator ${preview.factor.toFixed(2)})`,
    });

  if (aviso) embed.addFields({ name: "Aviso", value: aviso });

  const componentes: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [...navegacao];

  if (viewer.podeKage) {
    componentes.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(cid("pick"))
          .setPlaceholder("Administrar uma loja")
          .addOptions(
            MUNICIPAL_SHOPS.map((def) => ({
              label: def.name.slice(0, 100),
              value: def.type,
              emoji: def.emoji,
              description:
                menu.find((linha) => linha.def.type === def.type)?.status.toLowerCase() ?? "",
            })),
          ),
      ),
    );

    // Construir Ichiraku so' aparece enquanto ele estiver bloqueado. Empório,
    // Marcenaria, Fundição e Oficina nunca entram nessa tela: ja existem.
    if (preview.status === "LOCKED") {
      componentes.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(cid("obra"))
            .setLabel("Construir Ichiraku")
            .setEmoji("🏗️")
            .setStyle(ButtonStyle.Primary),
        ),
      );
    }
  }

  return { embeds: [embed], components: componentes };
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

  const embed = new EmbedBuilder()
    .setColor(0x8b5a2b)
    .setTitle(`⚙️ Administração — ${def.name}`)
    .setDescription(
      `Estoque da loja: **${view.stockUnits}/${view.capacity}** • situação \`${view.status}\`\n` +
        `Orçamento de compra hoje: **${view.budget?.restante ?? 0}/${view.budget?.total ?? 0} Ryō** • imposto ${(view.taxRate * 100).toFixed(0)}%`,
    );

  if (recibo) embed.addFields({ name: "Recibo", value: recibo.slice(0, 1024) });

  const estoqueLoja = view.shopId
    ? await prisma.villageShopStock.findMany({
        where: { shopId: view.shopId, qty: { gt: 0 } },
        orderBy: { itemId: "asc" },
        take: 25,
      })
    : [];
  embed.addFields({
    name: "📦 Estoque da loja",
    value: estoqueLoja.length
      ? estoqueLoja.map((row) => `${getItem(row.itemId)?.name ?? row.name} ×${row.qty}`).join(" • ").slice(0, 1024)
      : "_Vazio._",
  });
  embed.addFields({
    name: "🏛️ Estoque central",
    value: central.length
      ? central.map((row) => `${getItem(row.itemId)?.name ?? row.name} ×${row.qty}`).join(" • ").slice(0, 1024)
      : "_Vazio._",
  });

  if (receitas.length) {
    // O custo do embed e' CALCULADO pelo catalogo e pelo preco de compra atual;
    // nunca um numero escrito a mao (secao 7.4).
    const linhas = receitas.slice(0, 6).map((recipe) => {
      const margem = estimateMargin(recipe, view.taxRate);
      const extra = margem
        ? ` — varejo ${margem.varejo}, custo estimado ${margem.custo}, margem ${margem.margem}`
        : "";
      return `• ${describeRecipe(recipe)}${extra}`;
    });
    if (shopType === "OFICINA_SELOS") {
      const selos = await sealScrollsLeft(viewer.villageId);
      linhas.push(`_Pergaminho de Arsenal: ${selos.feitos}/${selos.limite} nesta competência._`);
    }
    embed.addFields({ name: "🔧 Produção", value: linhas.join("\n").slice(0, 1024) });
  }

  if (contratos.length) {
    embed.addFields({
      name: "🤝 Contratos de empreendedor",
      value: contratos
        .map(
          (c) =>
            `**${c.lotQty}x ${c.name}** → ${c.valor} Ryō _(em estoque: ${c.emEstoque})_`,
        )
        .join("\n")
        .slice(0, 1024),
    });
  }

  const linha1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(cid("abastecer", shopType))
      .setLabel("Abastecer")
      .setEmoji("📥")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(cid("produzir", shopType))
      .setLabel("Produzir")
      .setEmoji("🔧")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(receitas.length === 0),
    new ButtonBuilder()
      .setCustomId(cid("contrato", shopType))
      .setLabel("Contrato empreendedor")
      .setEmoji("🤝")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(contratos.length === 0),
    new ButtonBuilder()
      .setCustomId(cid("retirar", shopType))
      .setLabel("Retirar produto")
      .setEmoji("📤")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(cid("hist", shopType))
      .setLabel("Histórico")
      .setEmoji("📊")
      .setStyle(ButtonStyle.Secondary),
  );
  const linha2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(cid("menu"))
      .setLabel("Voltar ao comércio")
      .setEmoji("↩️")
      .setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [linha1, linha2] };
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
    await interaction.editReply(await renderAba());
    return true;
  }

  if (acao === "obra") {
    await interaction.deferUpdate();
    await interaction.editReply(await renderObra(viewer));
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
      await renderAba(
        r.ok
          ? `🏗️ Obra do Ichiraku iniciada. Custou **${r.custo.ryo} Ryō** e ` +
            `${r.custo.itens.map((i) => `${i.qty} ${i.name}`).join(", ")}. ` +
            `Conclusão <t:${Math.floor(r.obra.finishesAt.getTime() / 1000)}:R>.`
          : `❌ ${r.error}`,
      ),
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
    await interaction.editReply(await renderContratos(viewer, shopType));
    return true;
  }
  if (acao === "contratoOk") {
    await interaction.deferUpdate();
    const r = await acceptWholesaleContract(viewer.villageId, partes[4] ?? "", interaction.user.id);
    await interaction.editReply(
      await renderLoja(
        viewer,
        shopType,
        r.ok
          ? `🤝 Vendeu **${r.lotQty}x ${r.name}** ao empreendedor por **${r.valor} Ryō**. Cofre: ${r.cofre}.`
          : `❌ ${r.error}`,
      ),
    );
    return true;
  }
  if (acao === "hist") {
    await interaction.deferUpdate();
    await interaction.editReply(await renderHistorico(viewer, shopType));
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
  await interaction.editReply(await renderLoja(viewer, shopType));
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
  await canal
    .send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x4f7fc9)
          .setTitle(`🏗️ Obra iniciada — ${VILLAGE_NAMES[villageId]}`)
          .setDescription(
            `O Ichiraku de ${VILLAGE_NAMES[villageId]} começou a ser construído.\n` +
              `Investimento da vila: **${custoRyo} Ryō** e materiais do estoque central.`,
          )
          .addFields({
            name: "Conclusão prevista",
            value: `<t:${Math.floor(conclusao.getTime() / 1000)}:f> (<t:${Math.floor(conclusao.getTime() / 1000)}:R>)`,
          }),
      ],
    })
    .catch(() => null);
}

async function renderObra(viewer: ComercioViewer): Promise<ComercioPainel> {
  const preview = await ichirakuPreview(viewer.villageId);
  const faltando = preview.estoque.filter((row) => row.tem < row.precisa);
  const cofreOk = preview.cofreDisponivel >= preview.custo.ryo;
  const vagaOk = preview.vagasUsadas < preview.vagasTotais;

  const embed = new EmbedBuilder()
    .setColor(0x4f7fc9)
    .setTitle("🏗️ Confirmar construção do Ichiraku?")
    .setDescription(
      `Custo: **${preview.custo.ryo} Ryō**, ` +
        preview.custo.itens.map((i) => `${i.qty} ${i.name}`).join(", ") +
        `\nFator de população congelado: **${preview.factor.toFixed(2)}** (${preview.ativos} ativos)` +
        `\nConclusão: <t:${Math.floor(preview.conclusaoPrevista.getTime() / 1000)}:f>`,
    )
    .addFields(
      {
        name: "Cofre disponível",
        value: `${preview.cofreDisponivel} Ryō ${cofreOk ? "✅" : "❌"}`,
        inline: true,
      },
      {
        name: "Vagas de obra",
        value: `${preview.vagasUsadas}/${preview.vagasTotais} ${vagaOk ? "✅" : "❌"}`,
        inline: true,
      },
      {
        name: "Estoque central",
        value: preview.estoque
          .map((row) => `${row.name}: ${row.tem}/${row.precisa} ${row.tem >= row.precisa ? "✅" : "❌"}`)
          .join("\n"),
      },
    )
    .setFooter({ text: "O custo e o fator são congelados no instante da confirmação." });

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(cid("obraOk"))
          .setLabel("Confirmar obra")
          .setEmoji("✅")
          .setStyle(ButtonStyle.Success)
          .setDisabled(!cofreOk || !vagaOk || faltando.length > 0 || preview.status !== "LOCKED"),
        new ButtonBuilder()
          .setCustomId(cid("menu"))
          .setLabel("Cancelar")
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

async function renderContratos(viewer: ComercioViewer, shopType: ShopType): Promise<ComercioPainel> {
  const ofertas = await contractOffers(viewer.villageId, shopType);
  const embed = new EmbedBuilder()
    .setColor(0x2f7f4f)
    .setTitle(`🤝 Contratos de empreendedor — ${getShop(shopType)?.name ?? shopType}`)
    .setDescription(
      ofertas.length
        ? ofertas
            .map(
              (c) =>
                `**${c.lotQty}x ${c.name}** → **${c.valor} Ryō** para o cofre\n` +
                `Em estoque: ${c.emEstoque}${c.emEstoque >= c.lotQty ? " ✅" : " ❌ lote incompleto"}`,
            )
            .join("\n\n")
        : "_Esta loja não tem contrato disponível._",
    )
    .setFooter({
      text: `Máximo de ${ECONOMY.wholesaleContractsPerDay} contrato por loja por dia. É a única venda que credita o cofre.`,
    });

  const botoes = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...ofertas.slice(0, 4).map((c) =>
      new ButtonBuilder()
        .setCustomId(cid("contratoOk", shopType, c.id))
        .setLabel(`Vender ${c.lotQty}x ${c.name}`.slice(0, 80))
        .setStyle(ButtonStyle.Success)
        .setDisabled(c.emEstoque < c.lotQty),
    ),
    new ButtonBuilder()
      .setCustomId(cid("menu"))
      .setLabel("Voltar")
      .setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [botoes] };
}

async function renderHistorico(viewer: ComercioViewer, shopType: ShopType): Promise<ComercioPainel> {
  const linhas = await shopHistory(viewer.villageId, shopType, 10);
  const embed = new EmbedBuilder()
    .setColor(0x6a5acd)
    .setTitle(`📊 Histórico — ${getShop(shopType)?.name ?? shopType}`)
    .setDescription(
      linhas.length
        ? linhas
            .map((linha) => {
              const ryo = linha.ryoDelta !== 0 ? ` ${linha.ryoDelta > 0 ? "+" : ""}${linha.ryoDelta} Ryō` : "";
              const item = linha.itemId
                ? ` ${getItem(linha.itemId)?.name ?? linha.itemId} ×${linha.itemQty}`
                : "";
              const quem = linha.actorDiscordId ? ` — <@${linha.actorDiscordId}>` : "";
              return `• \`${linha.type}\`${ryo}${item}${quem}\n  ${linha.reason || "_sem motivo_"}`;
            })
            .join("\n")
            .slice(0, 3900)
        : "_Sem movimento nesta loja._",
    )
    .setFooter({ text: "Últimos 10 lançamentos. O livro-caixa é append-only." });

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(cid("menu"))
          .setLabel("Voltar")
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

// ---------------- Selects ----------------

async function abrirSelectAbastecer(
  interaction: ButtonInteraction,
  viewer: ComercioViewer,
  shopType: ShopType,
): Promise<void> {
  const central = await prisma.villageStock.findMany({
    where: { villageId: viewer.villageId, qty: { gt: 0 } },
    orderBy: { itemId: "asc" },
    take: 25,
  });
  await interaction.deferUpdate();
  if (!central.length) {
    await interaction.editReply(await renderLoja(viewer, shopType, "O estoque central está vazio."));
    return;
  }
  const painel = await renderLoja(viewer, shopType);
  painel.components = [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(cid("abastecerItem", shopType))
        .setPlaceholder("O que enviar do estoque central?")
        .addOptions(
          central.map((row) => ({
            label: (getItem(row.itemId)?.name ?? row.name).slice(0, 100),
            value: row.itemId,
            description: `No central: ${row.qty}`,
          })),
        ),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(cid("menu")).setLabel("Voltar").setStyle(ButtonStyle.Secondary),
    ),
  ];
  await interaction.editReply(painel);
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
    await interaction.editReply(await renderLoja(viewer, shopType, "A loja está sem estoque."));
    return;
  }
  const painel = await renderLoja(viewer, shopType);
  painel.components = [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(cid("retirarItem", shopType))
        .setPlaceholder("O que devolver ao estoque central?")
        .addOptions(
          estoque.map((row) => ({
            label: (getItem(row.itemId)?.name ?? row.name).slice(0, 100),
            value: row.itemId,
            description: `Na loja: ${row.qty}`,
          })),
        ),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(cid("menu")).setLabel("Voltar").setStyle(ButtonStyle.Secondary),
    ),
  ];
  await interaction.editReply(painel);
}

async function abrirSelectProducao(
  interaction: ButtonInteraction,
  viewer: ComercioViewer,
  shopType: ShopType,
): Promise<void> {
  const receitas = recipesForShop(shopType);
  await interaction.deferUpdate();
  if (!receitas.length) {
    await interaction.editReply(await renderLoja(viewer, shopType, "Esta loja não produz nada."));
    return;
  }
  const view = await shopView(viewer.villageId, shopType);
  const selos = shopType === "OFICINA_SELOS" ? await sealScrollsLeft(viewer.villageId) : null;

  const painel = await renderLoja(viewer, shopType);
  painel.components = [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(cid("produzirItem", shopType))
        .setPlaceholder("O que produzir?")
        .addOptions(
          receitas.slice(0, 25).map((recipe) => {
            const margem = estimateMargin(recipe, view.taxRate);
            const sufixo =
              selos && recipe.outputItemId === "pergaminho_arsenal"
                ? ` (${selos.feitos}/${selos.limite} nesta semana)`
                : "";
            return {
              label: `${recipe.name}${sufixo}`.slice(0, 100),
              value: recipe.id,
              description: (margem
                ? `varejo ${margem.varejo} • custo estimado ${margem.custo}`
                : recipe.ingredients.length + " insumo(s)"
              ).slice(0, 100),
            };
          }),
        ),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(cid("menu")).setLabel("Voltar").setStyle(ButtonStyle.Secondary),
    ),
  ];
  await interaction.editReply(painel);
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
    await interaction.editReply(await renderLoja(viewer, requireShopType(escolha)));
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
    await interaction.editReply(await renderEscolhaOrigem(viewer, shopType, escolha));
    return true;
  }

  await interaction.deferUpdate();
  await interaction.editReply(await renderAba());
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

  const embed = new EmbedBuilder()
    .setColor(0x8b5a2b)
    .setTitle(`🔧 Produzir ${recipe.name}`)
    .setDescription(describeRecipe(recipe))
    .setFooter({ text: "De onde saem os insumos? O produto pronto entra sempre no estoque da loja." });

  if (margem) {
    embed.addFields({
      name: "Estimativa",
      value:
        `Varejo atual: **${margem.varejo} Ryō** • custo estimado dos insumos: **${margem.custo} Ryō** • margem **${margem.margem}**` +
        (margem.semPreco.length
          ? `\n_Sem preço de compra: ${margem.semPreco.map((id) => getItem(id)?.name ?? id).join(", ")} — o custo real é maior._`
          : ""),
    });
  }
  if (recipe.outputItemId === "pergaminho_arsenal") {
    const selos = await sealScrollsLeft(viewer.villageId);
    embed.addFields({
      name: "Escassez semanal",
      value: `Pergaminho de Arsenal: **${selos.feitos}/${selos.limite}** nesta competência. O contador reseta no corte de domingo 22:00.`,
    });
  }

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(cid("prodLoja", shopType, recipeId))
          .setLabel("Usar estoque da loja")
          .setEmoji("🏪")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(cid("prodCentral", shopType, recipeId))
          .setLabel("Usar estoque central")
          .setEmoji("🏛️")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(cid("menu"))
          .setLabel("Cancelar")
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
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
      await renderLoja(viewer, shopType, "❌ Quantidade inválida. Use só número inteiro positivo."),
    );
    return true;
  }

  if (acao === "abastecerQtd") {
    const r = await restockShop(viewer.villageId, shopType, alvo, qtd, interaction.user.id);
    await interaction.editReply(
      await renderLoja(
        viewer,
        shopType,
        r.ok
          ? `📥 Enviou **${r.qty}x ${r.name}**. Central: ${r.central} • loja: ${r.loja}.`
          : `❌ ${r.error}`,
      ),
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
      await renderLoja(
        viewer,
        shopType,
        r.ok
          ? `📤 Devolveu **${r.qty}x ${r.name}** ao estoque central. Loja: ${r.loja} • central: ${r.central}.`
          : `❌ ${r.error}`,
      ),
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
      await renderLoja(
        viewer,
        shopType,
        r.ok
          ? `🔧 Produziu **${r.produzido}x ${r.recipe.name}** usando o estoque ${origem === "CENTRAL" ? "central" : "da loja"}.\n` +
            `Consumiu: ${r.consumido.map((i) => `${i.qty}x ${getItem(i.itemId)?.name ?? i.itemId}`).join(", ")}.` +
            (r.restanteNaSemana !== null ? `\nRestam ${r.restanteNaSemana} nesta competência.` : "")
          : `❌ ${r.error}`,
      ),
    );
    return true;
  }

  await interaction.editReply(await renderLoja(viewer, shopType));
  return true;
}
