import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ModalBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
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
  divider,
  economyContainer,
  factsBlock,
  feedbackBlock,
  itemLabel,
  listBlock,
  noticeBlock,
  primaryActionSection,
  ryo,
  selectRow,
  text,
  titleBlock,
  v2Edit,
  v2Payload,
  type ContainerChild,
  type TopLevel,
} from "../ui/economy-components-v2.js";
import { emoji, type EmojiKey } from "../ui/economy-emojis.js";
import type { Command } from "./types.js";
import { ECONOMY } from "../config/balance.js";
import { getItem } from "../data/items.js";
import { VILLAGE_ANNOUNCE_CHANNELS, VILLAGE_NAMES, type VillageId } from "../data/villages.js";
import { VILLAGE_MANSIONS } from "../services/village-service.js";
import { prisma } from "../db/client.js";
import { getOrCreateCharacter } from "../services/characters/character-service.js";
import { formatRyo } from "../services/economy/character-economy.js";
import { EconomyError } from "../services/economy/errors.js";
import { activePopulation } from "../services/economy/population.js";
import {
  isMansionChannel,
  requireVillage,
  resolveKage,
} from "../services/economy/village-access.js";
import {
  donateItem,
  donateRyo,
  kageDeposit,
  kageWithdraw,
  treasuryView,
  withdrawStockToCharacter,
} from "../services/economy/treasury.js";
import {
  acceptOrder,
  closeFinishedOrders,
  closeOrder,
  createOrder,
  declineOrder,
  inviteToOrder,
  remainingBudget,
} from "../services/economy/collection-orders.js";
import { weekKeyFor } from "../services/economy/week.js";
import {
  handleComercioButton,
  handleComercioModal,
  handleComercioSelect,
  renderComercio,
} from "./vila-comercio.js";
import { handleObrasButton, handleObrasSelect, renderObras } from "./vila-obras.js";
import { CENTER } from "../data/sectors.js";
import {
  activeConstructions,
  buildingName,
  capacityView,
} from "../services/economy/constructions.js";
import { pendingMaintenance } from "../services/economy/maintenance.js";

// Painel efemero da vila. Uma unica interface para jogador comum e Kage: o que
// muda e' o conjunto de abas. Jogador comum NUNCA ve cofre, saque, retirada,
// imposto nem controle de Kage — o gate esta em `podeKage`, checado tanto na
// montagem do embed quanto no handler de cada botao.

// Painel V2: árvore de componentes de topo, sem embeds nem content.
export type Painel = TopLevel[];

// Quantos itens do estoque central aparecem antes do resumo "…e mais N".
const ESTOQUE_VISIVEL = 12;

interface Viewer {
  villageId: VillageId;
  charId: string;
  charName: string;
  ryo: number;
  isKage: boolean;
  inMansion: boolean;
  podeKage: boolean;
}

async function loadViewer(interaction: RepliableInteraction): Promise<Viewer> {
  const guildId = interaction.guildId ?? "global";
  const villageId = requireVillage(interaction.member as GuildMember | null);
  const char = await getOrCreateCharacter(interaction.user.id, guildId, interaction.user.username);
  const isKage = await resolveKage(villageId, interaction.user.id);
  const inMansion = isMansionChannel(villageId, interaction.channelId ?? "");
  return {
    villageId,
    charId: char.id,
    charName: char.displayName?.trim() || char.name,
    ryo: char.ryo,
    isKage,
    inMansion,
    // Kage so' opera dentro da mansao da propria vila (aceite da etapa 04).
    podeKage: isKage && inMansion,
  };
}

// ---------------- Abas ----------------

type Aba = "geral" | "cofre" | "estoque" | "impostos" | "relatorios" | "obras" | "comercio";

const ABAS_KAGE: { id: Aba; label: string; emojiKey: EmojiKey }[] = [
  { id: "geral", label: "Visão Geral", emojiKey: "vila" },
  { id: "cofre", label: "Cofre", emojiKey: "cofre" },
  { id: "estoque", label: "Estoque", emojiKey: "estoque" },
  { id: "impostos", label: "Impostos", emojiKey: "impostos" },
  { id: "relatorios", label: "Relatórios", emojiKey: "relatorio" },
  { id: "obras", label: "Obras", emojiKey: "obras" },
  { id: "comercio", label: "Comércio", emojiKey: "shop_MERCADO_GERAL" },
];

function abasFor(viewer: Viewer): { id: Aba; label: string; emojiKey: EmojiKey }[] {
  if (!viewer.podeKage) {
    return [
      { id: "geral", label: "Visão Geral", emojiKey: "vila" },
      { id: "estoque", label: "Estoque", emojiKey: "estoque" },
      { id: "relatorios", label: "Meus recibos", emojiKey: "impostos" },
    ];
  }
  return ABAS_KAGE;
}

// Navegacao entre abas. Continua em ActionRow (a etapa 08 pede acao secundaria
// abaixo do cartao) e mantem os mesmos `vila:aba:*` de antes.
export function navRow(viewer: Viewer, atual: Aba): ContainerChild[] {
  const abas = abasFor(viewer);
  const rows: ContainerChild[] = [];
  for (let i = 0; i < abas.length; i += 5) {
    rows.push(
      buttonRow(
        ...abas.slice(i, i + 5).map((aba) =>
          button({
            id: `vila:aba:${aba.id}`,
            label: aba.label,
            emojiKey: aba.emojiKey,
            style: aba.id === atual ? ButtonStyle.Primary : ButtonStyle.Secondary,
            disabled: aba.id === atual,
          }),
        ),
      ),
    );
  }
  return rows;
}

// ---------------- Montagem de cada aba ----------------

async function renderGeral(viewer: Viewer): Promise<Painel> {
  const village = await prisma.village.findUniqueOrThrow({ where: { id: viewer.villageId } });
  const pop = await activePopulation(viewer.villageId);

  // Obras e alertas de reforma sao publicos: o estado da vila e' do jogador
  // tambem. O que fica so' para o Kage e' o cofre (secao 8).
  const [capacidade, fila, reformas] = await Promise.all([
    capacityView(viewer.villageId),
    activeConstructions(viewer.villageId),
    pendingMaintenance(viewer.villageId),
  ]);

  const filhos: ContainerChild[] = [
    titleBlock("vila", village.name, `${viewer.charName} • ${formatRyo(viewer.ryo)}`),
    factsBlock([
      {
        label: "Kage",
        value: village.kageDiscordId ? `<@${village.kageDiscordId}>` : "administração da staff",
      },
      { label: "Imposto de mercado", value: `${(village.taxRate * 100).toFixed(0)}%` },
      {
        label: "Ninjas ativos",
        value:
          `${emoji("populacao")} ${pop.ativos} (fator ${pop.factor.toFixed(2)})` +
          (pop.override ? " • fixado pela staff" : ""),
      },
    ]),
    divider(),
    listBlock(
      `${emoji("obras")} Obras (${capacidade.usadas}/${capacidade.total} vagas)`,
      fila.map(
        (obra) =>
          `${buildingName(obra.buildingType, obra.buildingKey)}` +
          (obra.targetLevel ? ` → nível ${obra.targetLevel}` : "") +
          ` — <t:${Math.floor(obra.finishesAt.getTime() / 1000)}:R>`,
      ),
      `Nenhuma obra em andamento. ${CENTER.name} nível ${capacidade.centerLevel}.`,
    ),
  ];

  // Reforma pendente é estado da vila, não detalhe de gestão: aparece para
  // todo mundo, com texto explícito além da cor.
  if (reformas.length) {
    const atrasadas = reformas.filter((r) => r.status === "OVERDUE");
    filhos.push(
      listBlock(
        atrasadas.length
          ? `${emoji("aviso")} Reformas atrasadas`
          : `${emoji("manutencao")} Reformas a pagar`,
        reformas.map(
          (r) =>
            `**${r.name}** — ${ryo(`${r.ryoDue} Ryō`)}` +
            (r.status === "OVERDUE"
              ? " • **suspenso até pagar**"
              : ` • vence <t:${Math.floor(r.dueAt.getTime() / 1000)}:R>`),
        ),
        "—",
      ),
    );
  } else {
    filhos.push(text(`${emoji("manutencao")} **Reforma pendente:** nenhuma`));
  }

  // Cofre SÓ para o Kage na mansão. É o gate da seção 8: jogador comum nunca vê
  // saldo, reserva nem saque.
  if (viewer.podeKage) {
    const cofre = await treasuryView(viewer.villageId);
    filhos.push(
      divider(),
      factsBlock([
        { label: "Cofre", value: ryo(`${cofre.treasuryRyo} Ryō`) },
        { label: "Disponível", value: `${cofre.available} Ryō` },
        { label: "Reservado", value: `${cofre.reservedRyo} Ryō` },
      ]),
    );
  }

  filhos.push(
    divider(),
    ...navRow(viewer, "geral"),
    buttonRow(
      button({
        id: "vila:doar:menu",
        label: "Doar recursos",
        style: ButtonStyle.Success,
        emojiKey: "estoque",
      }),
    ),
  );

  return [economyContainer("vila", filhos)];
}

async function renderEstoque(viewer: Viewer): Promise<Painel> {
  const stock = await prisma.villageStock.findMany({
    where: { villageId: viewer.villageId, qty: { gt: 0 } },
    orderBy: { qty: "desc" },
  });

  // Mostra os mais relevantes e resume o resto: a etapa 08 proíbe mural gigante.
  const destaque = stock.slice(0, ESTOQUE_VISIVEL);
  const resto = stock.length - destaque.length;

  const filhos: ContainerChild[] = [
    titleBlock("estoque", `Estoque central — ${VILLAGE_NAMES[viewer.villageId]}`),
    factsBlock([
      { label: "Tipos de item", value: `${stock.length}` },
      { label: "Unidades", value: `${stock.reduce((s, r) => s + r.qty, 0)}` },
    ]),
    divider(),
    listBlock(
      null,
      destaque.map((row) => itemLabel(row.itemId, getItem(row.itemId)?.name ?? row.name, row.qty)),
      "O estoque central está vazio.",
    ),
  ];
  if (resto > 0) filhos.push(text(`-# …e mais ${resto} tipo(s) de item com quantidade menor.`));

  filhos.push(divider(), ...navRow(viewer, "estoque"));

  if (viewer.podeKage) {
    const ordens = await prisma.collectionOrder.count({
      where: { villageId: viewer.villageId, status: "ACTIVE" },
    });
    filhos.push(
      buttonRow(
        button({
          id: "vila:ordens:listar",
          label: `Criar ordem de coleta (${ordens} ativa(s))`,
          style: ButtonStyle.Primary,
          emojiKey: "ordem",
        }),
        button({ id: "vila:estoque:retirar", label: "Retirar para ninja" }),
      ),
    );
  }
  return [economyContainer("estoque", filhos)];
}

async function renderCofre(viewer: Viewer): Promise<Painel> {
  const cofre = await treasuryView(viewer.villageId);

  const filhos: ContainerChild[] = [
    titleBlock("cofre", `Cofre de ${VILLAGE_NAMES[viewer.villageId]}`, `Competência ${cofre.weekKey}`),
    factsBlock([
      { label: "Disponível", value: ryo(`${cofre.available} Ryō`) },
      { label: "Reservado", value: `${cofre.reservedRyo} Ryō` },
      { label: "Saldo total", value: `${cofre.treasuryRyo} Ryō` },
    ]),
    cofre.withdrawalsLocked
      ? noticeBlock("bloqueio", "Saque bloqueado pela staff.")
      : text(
          `**Limite de saque esta semana:** ${cofre.withdrawnThisWeek}/${cofre.allowance + cofre.withdrawnThisWeek} Ryō ` +
            `-# (${ECONOMY.kageWeeklyWithdrawalRate * 100}% do disponível por semana, teto de ${ECONOMY.kageWithdrawalCap} por saque)`,
        ),
    divider(),
    // Ação principal ao lado do texto que a explica — o "botão dentro do card".
    primaryActionSection(
      "Deposite Ryō pessoal para financiar a vila.",
      button({ id: "vila:cofre:depositar", label: "Depositar", style: ButtonStyle.Success }),
    ),
    primaryActionSection(
      "Saques exigem motivo e ficam públicos no livro-caixa.",
      button({
        id: "vila:cofre:sacar",
        label: "Sacar",
        style: ButtonStyle.Danger,
        disabled: cofre.withdrawalsLocked || cofre.allowance <= 0,
      }),
    ),
  ];

  if (!cofre.withdrawalsLocked && cofre.allowance <= 0) {
    filhos.push(noticeBlock("aviso", "Sem margem de saque nesta competência."));
  }

  filhos.push(
    divider(),
    ...navRow(viewer, "cofre"),
    text(`-# Seu saldo pessoal: ${ryo(formatRyo(viewer.ryo))}`),
  );

  return [economyContainer("cofre", filhos)];
}

async function renderImpostos(viewer: Viewer) {
  const weekKey = weekKeyFor(new Date());
  const periodo = await prisma.villageTaxPeriod.findUnique({
    where: { villageId_weekKey: { villageId: viewer.villageId, weekKey } },
  });
  const village = await prisma.village.findUniqueOrThrow({ where: { id: viewer.villageId } });
  const arrecadado = await prisma.villageLedger.aggregate({
    where: { villageId: viewer.villageId, type: "WEEKLY_ACTIVITY_TAX" },
    _sum: { ryoDelta: true },
  });

  return [
    economyContainer("vila", [
      titleBlock("impostos", `Impostos — ${VILLAGE_NAMES[viewer.villageId]}`),
      factsBlock([
        { label: "Taxa atual", value: `${(village.taxRate * 100).toFixed(0)}%` },
        {
          label: `Congelada (${weekKey})`,
          value: periodo ? `${(periodo.taxRateFrozen * 100).toFixed(0)}%` : "sem competência aberta",
        },
        { label: "Arrecadado (total)", value: ryo(`${arrecadado._sum.ryoDelta ?? 0} Ryō`) },
      ]),
      divider(),
      text(
        "Mudar a taxa afeta o preço de mercado na hora, mas o imposto pessoal só na competência seguinte.",
      ),
      noticeBlock("aviso", "A taxa é definida pela staff em `/admin-vila`."),
      divider(),
      ...navRow(viewer, "impostos"),
    ]),
  ];
}

async function renderRelatorios(viewer: Viewer) {
  // Jogador comum ve so' os recibos dele; o Kage ve o movimento da vila.
  if (!viewer.podeKage) {
    const recibos = await prisma.weeklyTaxCharge.findMany({
      where: { charId: viewer.charId },
      orderBy: { chargedAt: "desc" },
      take: 10,
    });
    return [
      economyContainer("vila", [
        titleBlock("impostos", "Seus recibos de imposto", "Últimas 10 competências"),
        divider(),
        listBlock(
          null,
          recibos.map(
            (r) =>
              `**${r.weekKey}** — ${ryo(`${r.taxRyo} Ryō`)} (${(r.taxRate * 100).toFixed(0)}% de ${r.taxableBase}) • saldo ${r.balanceBefore} → ${r.balanceAfter}`,
          ),
          "Você ainda não teve cobrança de imposto.",
        ),
        divider(),
        ...navRow(viewer, "relatorios"),
      ]),
    ];
  }

  const lancamentos = await prisma.villageLedger.findMany({
    where: { villageId: viewer.villageId },
    orderBy: { createdAt: "desc" },
    take: 15,
  });
  return [
    economyContainer("vila", [
      titleBlock(
        "relatorio",
        `Livro-caixa — ${VILLAGE_NAMES[viewer.villageId]}`,
        `${lancamentos.length} lançamento(s) mais recentes`,
      ),
      divider(),
      listBlock(
        null,
        lancamentos.map((l) => {
          const valor = l.ryoDelta !== 0 ? ` ${l.ryoDelta > 0 ? "+" : ""}${l.ryoDelta} Ryō` : "";
          const item = l.itemId
            ? ` ${itemLabel(l.itemId, getItem(l.itemId)?.name ?? l.itemId, l.itemQty ?? 0)}`
            : "";
          return `\`${l.type}\`${valor}${item} — ${l.reason || "sem motivo"}`;
        }),
        "Sem movimento no livro-caixa.",
      ),
      divider(),
      ...navRow(viewer, "relatorios"),
      text("-# O livro é append-only: correção é lançamento novo, nunca edição."),
    ]),
  ];
}

async function renderAba(viewer: Viewer, aba: Aba): Promise<Painel> {
  // Aba de Kage pedida por quem nao e' Kage cai na visao geral.
  const permitidas = new Set(abasFor(viewer).map((a) => a.id));
  const alvo = permitidas.has(aba) ? aba : "geral";

  switch (alvo) {
    case "cofre":
      return renderCofre(viewer);
    case "estoque":
      return renderEstoque(viewer);
    case "impostos":
      return renderImpostos(viewer);
    case "relatorios":
      return renderRelatorios(viewer);
    case "obras":
      // Aba Obras da secao 6: Centro, vagas, fila, produção e reforma. Mora em
      // vila-obras.ts com a mesma navegacao e o mesmo gate das outras abas.
      return renderObras(viewer, navRow(viewer, "obras"));
    case "comercio":
      // A aba Comércio e' a administracao de loja da secao 7.6. Ela mora num
      // modulo proprio (vila-comercio.ts) mas usa a mesma navegacao e o mesmo
      // gate `podeKage` das demais abas.
      return renderComercio(viewer, navRow(viewer, "comercio"));
    default:
      return renderGeral(viewer);
  }
}

// ---------------- Comando ----------------

export const vila: Command = {
  data: new SlashCommandBuilder()
    .setName("vila")
    .setDescription("Painel da sua vila: estoque, doação e administração"),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const viewer = await loadViewer(interaction);
      await closeFinishedOrders();
      const painel = await renderAba(viewer, "geral");

      // Kage fora da mansão: lê tudo, administra nada. O aviso vira um cartão
      // próprio porque V2 não tem rodapé de embed para sobrescrever.
      if (viewer.isKage && !viewer.inMansion) {
        painel.push(
          economyContainer("aviso", [
            noticeBlock(
              "aviso",
              `Você é o Kage. Para administrar, use \`/vila\` em <#${VILLAGE_MANSIONS[viewer.villageId]}>.`,
            ),
          ]),
        );
      }
      // Primeira aplicação da flag V2: o defer abriu a mensagem efêmera e é
      // este editReply que a converte, com a árvore inteira de uma vez.
      await interaction.editReply(v2Edit(painel));
    } catch (err) {
      await responderErro(interaction, err);
    }
  },

  async handleButton(interaction: ButtonInteraction) {
    try {
      await roteador(interaction);
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

  async handleSelect(interaction: AnySelectMenuInteraction) {
    try {
      await roteadorSelect(interaction);
    } catch (err) {
      await responderErro(interaction, err);
    }
  },
};

async function responderErro(interaction: RepliableInteraction, err: unknown): Promise<void> {
  const msg = err instanceof EconomyError ? `❌ ${err.message}` : "❌ Não consegui completar isso.";
  const painel = [economyContainer("erro", [noticeBlock("erro", msg.replace(/^❌\s*/u, ""))])];
  if (interaction.deferred || interaction.replied) await interaction.editReply(v2Edit(painel));
  else await interaction.reply(v2Payload(painel));
  if (!(err instanceof EconomyError)) throw err;
}

// ---------------- Botões ----------------

async function roteador(interaction: ButtonInteraction): Promise<void> {
  const [, grupo, acao, extra] = interaction.customId.split(":");

  // Aceitar/recusar ordem vem do canal de avisos ou da DM: nao exige mansao.
  if (grupo === "ordem" && (acao === "aceitar" || acao === "recusar")) {
    await responderOrdem(interaction, acao, extra ?? "");
    return;
  }

  const viewer = await loadViewer(interaction);

  if (grupo === "aba") {
    await interaction.deferUpdate();
    await interaction.editReply(v2Edit(await renderAba(viewer, (acao ?? "geral") as Aba)));
    return;
  }

  if (grupo === "doar") {
    await abrirMenuDoacao(interaction, viewer);
    return;
  }

  // Daqui pra baixo e' tudo poder de Kage.
  if (!viewer.podeKage) {
    await interaction.reply({
      content: `❌ Só o Kage de ${VILLAGE_NAMES[viewer.villageId]}, dentro da mansão, pode fazer isso.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (grupo === "com") {
    await handleComercioButton(interaction, viewer, abaComercio(viewer));
    return;
  }

  if (grupo === "obra") {
    await handleObrasButton(interaction, viewer, abaObras(viewer));
    return;
  }

  if (grupo === "cofre" && acao === "depositar") return abrirModalDeposito(interaction, viewer);
  if (grupo === "cofre" && acao === "sacar") return abrirModalSaque(interaction, viewer);
  if (grupo === "estoque" && acao === "retirar") return abrirSelectRetirada(interaction, viewer);
  if (grupo === "ordens" && acao === "listar") return listarOrdens(interaction, viewer);
  if (grupo === "ordens" && acao === "criar") return abrirModalOrdem(interaction, viewer);
  if (grupo === "ordens" && acao === "cancelar") return cancelarOrdem(interaction, viewer, extra ?? "");
  if (grupo === "ordens" && acao === "convidar") return abrirConviteOrdem(interaction, extra ?? "");

  await interaction.deferUpdate();
}

// ---------------- Doação ----------------

async function abrirMenuDoacao(interaction: ButtonInteraction, viewer: Viewer): Promise<void> {
  const inventario = await prisma.inventoryItem.findMany({
    where: { charId: viewer.charId, qty: { gt: 0 } },
    orderBy: { itemId: "asc" },
    take: 24,
  });

  const select = new StringSelectMenuBuilder()
    .setCustomId("vila:doar:item")
    .setPlaceholder("Escolha o que doar")
    .addOptions(
      { label: "Ryō", value: "__ryo__", emoji: "💰", description: `Você tem ${formatRyo(viewer.ryo)}` },
      ...inventario.map((row) => ({
        label: (getItem(row.itemId)?.name ?? row.name).slice(0, 100),
        value: row.itemId,
        description: `Você tem ${row.qty}`,
      })),
    );

  await interaction.reply(
    v2Payload([
      economyContainer("estoque", [
        titleBlock("estoque", `Doar para ${VILLAGE_NAMES[viewer.villageId]}`),
        text("Escolha Ryō ou um item do seu inventário; a quantidade será confirmada em seguida."),
        selectRow(select),
      ]),
    ]),
  );
}

// Redesenho da aba Comércio, passado aos handlers do modulo de comercio para
// eles voltarem ao painel sem reimplementar a navegacao.
function abaComercio(viewer: Viewer) {
  return (aviso?: string) => renderComercio(viewer, navRow(viewer, "comercio"), aviso);
}

function abaObras(viewer: Viewer) {
  return (aviso?: string) => renderObras(viewer, navRow(viewer, "obras"), aviso);
}

async function roteadorSelect(interaction: AnySelectMenuInteraction): Promise<void> {
  const [, grupo, acao] = interaction.customId.split(":");
  const viewer = await loadViewer(interaction);

  if (grupo === "com") {
    if (!viewer.podeKage) {
      await interaction.reply({
        content: `❌ Só o Kage de ${VILLAGE_NAMES[viewer.villageId]}, dentro da mansão, pode fazer isso.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await handleComercioSelect(interaction, viewer, abaComercio(viewer));
    return;
  }

  if (grupo === "obra") {
    if (!viewer.podeKage) {
      await interaction.reply({
        content: `❌ Só o Kage de ${VILLAGE_NAMES[viewer.villageId]}, dentro da mansão, pode fazer isso.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await handleObrasSelect(interaction, viewer, abaObras(viewer));
    return;
  }

  if (grupo === "doar" && acao === "item" && interaction.isStringSelectMenu()) {
    const itemId = interaction.values[0]!;
    const nome = itemId === "__ryo__" ? "Ryō" : getItem(itemId)?.name ?? itemId;
    const modal = new ModalBuilder()
      .setCustomId(`vila:doar:confirmar:${itemId}`)
      .setTitle(`Doar ${nome}`.slice(0, 45))
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("quantidade")
            .setLabel("Quantidade")
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ),
      );
    await interaction.showModal(modal);
    return;
  }

  if (grupo === "estoque" && acao === "item" && interaction.isStringSelectMenu()) {
    const itemId = interaction.values[0]!;
    const modal = new ModalBuilder()
      .setCustomId(`vila:estoque:confirmar:${itemId}`)
      .setTitle(`Retirar ${getItem(itemId)?.name ?? itemId}`.slice(0, 45))
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId("quantidade").setLabel("Quantidade").setStyle(TextInputStyle.Short).setRequired(true),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("destinatario")
            .setLabel("ID do usuário que vai receber")
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ),
      );
    await interaction.showModal(modal);
    return;
  }

  if (grupo === "ordens" && acao === "convidar" && interaction.isUserSelectMenu()) {
    await convidarNinja(interaction, viewer);
    return;
  }

  await interaction.deferUpdate();
}

// ---------------- Modais ----------------

async function roteadorModal(interaction: ModalSubmitInteraction): Promise<void> {
  const [, grupo, acao, extra] = interaction.customId.split(":");
  const viewer = await loadViewer(interaction);

  // Comercio edita o proprio painel (deferUpdate), entao nao pode passar pelo
  // deferReply generico abaixo.
  if (grupo === "com") {
    if (!viewer.podeKage) {
      await interaction.reply({
        content: "❌ Só o Kage, dentro da mansão, pode fazer isso.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await handleComercioModal(interaction, viewer);
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (grupo === "doar" && acao === "confirmar") {
    const qtd = inteiro(interaction.fields.getTextInputValue("quantidade"));
    if (qtd === null) return void (await interaction.editReply("❌ Quantidade inválida."));

    if (extra === "__ryo__") {
      const r = await donateRyo(viewer.charId, viewer.villageId, qtd, interaction.user.id);
      await interaction.editReply(
        r.ok
          ? `🎁 Você doou **${qtd} Ryō** para ${VILLAGE_NAMES[viewer.villageId]}. Seu saldo: ${formatRyo(r.saldo)}.`
          : `❌ ${r.error}`,
      );
      return;
    }
    const r = await donateItem(viewer.charId, viewer.villageId, extra ?? "", qtd, interaction.user.id);
    await interaction.editReply(
      r.ok
        ? `🎁 Você doou **${qtd}x ${r.name}**. Estoque da vila: ${r.estoque}.`
        : `❌ ${r.error}`,
    );
    return;
  }

  if (!viewer.podeKage) {
    await interaction.editReply("❌ Só o Kage, dentro da mansão, pode fazer isso.");
    return;
  }

  if (grupo === "cofre" && acao === "depositar") {
    const qtd = inteiro(interaction.fields.getTextInputValue("quantidade"));
    if (qtd === null) return void (await interaction.editReply("❌ Quantidade inválida."));
    const r = await kageDeposit(viewer.charId, viewer.villageId, qtd, interaction.user.id);
    await interaction.editReply(
      r.ok
        ? `📥 Depositou **${qtd} Ryō**.\nCofre: ${r.cofreAntes} → **${r.cofreDepois}**\nSeu saldo: ${formatRyo(r.saldoPessoal)}`
        : `❌ ${r.error}`,
    );
    return;
  }

  if (grupo === "cofre" && acao === "sacar") {
    const qtd = inteiro(interaction.fields.getTextInputValue("quantidade"));
    const motivo = interaction.fields.getTextInputValue("motivo");
    if (qtd === null) return void (await interaction.editReply("❌ Quantidade inválida."));

    const r = await kageWithdraw(viewer.charId, viewer.villageId, qtd, motivo, interaction.user.id);
    if (!r.ok) return void (await interaction.editReply(`❌ ${r.error}`));

    await interaction.editReply(
      `📤 Sacou **${r.amount} Ryō**.\nCofre: ${r.cofreAntes} → **${r.cofreDepois}**\nSeu saldo: ${formatRyo(r.saldoPessoal)}`,
    );
    // Registro publico obrigatorio (secao 3.3).
    await anunciar(
      interaction,
      viewer.villageId,
      [
        economyContainer("erro", [
          titleBlock("cofre", `Saque do cofre — ${VILLAGE_NAMES[viewer.villageId]}`),
          text(`<@${interaction.user.id}> sacou **${r.amount} Ryō**.`),
          divider(),
          factsBlock([{ label: "Cofre", value: `${r.cofreAntes} → ${r.cofreDepois} Ryō` }]),
          text(`**Motivo:** ${r.motivo}`),
        ]),
      ],
    );
    return;
  }

  if (grupo === "estoque" && acao === "confirmar") {
    const qtd = inteiro(interaction.fields.getTextInputValue("quantidade"));
    const destinatario = interaction.fields.getTextInputValue("destinatario").replace(/\D/g, "");
    if (qtd === null) return void (await interaction.editReply("❌ Quantidade inválida."));

    const alvo = await prisma.userCharacter.findFirst({
      where: { discordId: destinatario, villageId: viewer.villageId },
    });
    if (!alvo) {
      await interaction.editReply("❌ Não achei personagem dessa vila com esse usuário.");
      return;
    }
    const r = await withdrawStockToCharacter(viewer.villageId, extra ?? "", qtd, alvo.id, interaction.user.id);
    await interaction.editReply(
      r.ok
        ? `📤 Entregou **${qtd}x ${r.name}** a <@${destinatario}>. Restam ${r.restante} no estoque.`
        : `❌ ${r.error}`,
    );
    return;
  }

  if (grupo === "ordens" && acao === "criar") {
    await criarOrdemDoModal(interaction, viewer);
    return;
  }

  await interaction.editReply("Nada a fazer.");
}

function inteiro(valor: string): number | null {
  const n = Number(valor.trim());
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function abrirModalDeposito(interaction: ButtonInteraction, viewer: Viewer): Promise<void> {
  await interaction.showModal(
    new ModalBuilder()
      .setCustomId("vila:cofre:depositar")
      .setTitle(`Depositar no cofre de ${VILLAGE_NAMES[viewer.villageId]}`.slice(0, 45))
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("quantidade")
            .setLabel("Quantidade de Ryō")
            .setPlaceholder(`Você tem ${viewer.ryo}`)
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ),
      ),
  );
}

async function abrirModalSaque(interaction: ButtonInteraction, viewer: Viewer): Promise<void> {
  const cofre = await treasuryView(viewer.villageId);
  await interaction.showModal(
    new ModalBuilder()
      .setCustomId("vila:cofre:sacar")
      .setTitle("Sacar do cofre")
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("quantidade")
            .setLabel(`Quantidade (máximo agora: ${cofre.allowance})`)
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("motivo")
            .setLabel(`Motivo (${ECONOMY.withdrawalReasonMin}-${ECONOMY.withdrawalReasonMax} caracteres)`)
            .setStyle(TextInputStyle.Paragraph)
            .setMinLength(ECONOMY.withdrawalReasonMin)
            .setMaxLength(ECONOMY.withdrawalReasonMax)
            .setRequired(true),
        ),
      ),
  );
}

async function abrirSelectRetirada(interaction: ButtonInteraction, viewer: Viewer): Promise<void> {
  const stock = await prisma.villageStock.findMany({
    where: { villageId: viewer.villageId, qty: { gt: 0 } },
    orderBy: { itemId: "asc" },
    take: 25,
  });
  if (!stock.length) {
    await interaction.reply({ content: "O estoque está vazio.", flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.reply(
    v2Payload([
      economyContainer("estoque", [
        titleBlock("estoque", "Retirar do estoque central"),
        text("Escolha o item. No próximo passo, informe a quantidade e o ninja da vila que o receberá."),
        selectRow(
          new StringSelectMenuBuilder().setCustomId("vila:estoque:item").addOptions(
            stock.map((row) => ({
              label: (getItem(row.itemId)?.name ?? row.name).slice(0, 100),
              value: row.itemId,
              description: `Em estoque: ${row.qty}`,
            })),
          ),
        ),
      ]),
    ]),
  );
}

// ---------------- Ordens de coleta ----------------

async function listarOrdens(interaction: ButtonInteraction, viewer: Viewer): Promise<void> {
  const ordens = await prisma.collectionOrder.findMany({
    where: { villageId: viewer.villageId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  const filhos: ContainerChild[] = [
    titleBlock("ordem", "Ordens de coleta ativas"),
    listBlock(
      null,
      ordens.map(
        (o) =>
          `**${itemLabel(o.itemId, getItem(o.itemId)?.name ?? o.itemId)}** — ${o.deliveredQty}/${o.targetQty}\n` +
          `-# ${ryo(`${o.rewardPerUnit} Ryō`)} por unidade • reserva ${remainingBudget(o.budgetMax, o.budgetSpent)}/${o.budgetMax} • prazo <t:${Math.floor(o.deadline.getTime() / 1000)}:R>`,
      ),
      "Nenhuma ordem ativa.",
    ),
    divider(),
    buttonRow(button({ id: "vila:ordens:criar", label: "Criar ordem", style: ButtonStyle.Success, emojiKey: "ordem" })),
  ];
  for (const o of ordens.slice(0, 4)) {
    filhos.push(
      buttonRow(
        button({
          id: `vila:ordens:convidar:${o.id}`,
          label: `Convidar — ${getItem(o.itemId)?.name ?? o.itemId}`.slice(0, 80),
        }),
        button({ id: `vila:ordens:cancelar:${o.id}`, label: "Cancelar", style: ButtonStyle.Danger }),
      ),
    );
  }

  await interaction.reply(v2Payload([economyContainer("vila", filhos)]));
}

async function abrirModalOrdem(interaction: ButtonInteraction, _viewer: Viewer): Promise<void> {
  const campo = (id: string, label: string, placeholder: string) =>
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId(id)
        .setLabel(label)
        .setPlaceholder(placeholder)
        .setStyle(TextInputStyle.Short)
        .setRequired(true),
    );

  await interaction.showModal(
    new ModalBuilder()
      .setCustomId("vila:ordens:criar")
      .setTitle("Nova ordem de coleta")
      .addComponents(
        campo("item", "ID do recurso", "ex.: madeira, pedra, minerio_ferro"),
        campo("meta", "Quantidade-meta", "ex.: 100"),
        campo("recompensa", "Recompensa por unidade (Ryō)", "ex.: 5"),
        campo("orcamento", "Orçamento máximo (Ryō)", "ex.: 500"),
        campo("horas", "Prazo em horas (1 a 168)", "ex.: 48"),
      ),
  );
}

async function criarOrdemDoModal(interaction: ModalSubmitInteraction, viewer: Viewer): Promise<void> {
  const itemId = interaction.fields.getTextInputValue("item").trim().toLowerCase();
  const meta = inteiro(interaction.fields.getTextInputValue("meta"));
  const recompensa = inteiro(interaction.fields.getTextInputValue("recompensa"));
  const orcamento = inteiro(interaction.fields.getTextInputValue("orcamento"));
  const horas = inteiro(interaction.fields.getTextInputValue("horas"));

  if (!meta || !recompensa || !orcamento || !horas) {
    await interaction.editReply("❌ Todos os números precisam ser inteiros positivos.");
    return;
  }

  const r = await createOrder({
    villageId: viewer.villageId,
    itemId,
    targetQty: meta,
    rewardPerUnit: recompensa,
    budgetMax: orcamento,
    durationMs: horas * 3_600_000,
    audience: "OPEN",
    createdByDiscordId: interaction.user.id,
  });
  if (!r.ok) return void (await interaction.editReply(`❌ ${r.error}`));

  const nome = getItem(itemId)?.name ?? itemId;
  await interaction.editReply(
    `📋 Ordem criada: **${meta}x ${nome}** a ${recompensa} Ryō/unidade.\n` +
      `Reservei **${orcamento} Ryō** do cofre; o que não for pago volta no encerramento.`,
  );

  // Anuncio publico com botao de aceite. Sem ping em massa.
  await anunciar(
    interaction,
    viewer.villageId,
    [
      economyContainer("vila", [
        titleBlock("ordem", `Ordem de coleta — ${VILLAGE_NAMES[viewer.villageId]}`),
        text(`A vila precisa de **${meta}x ${nome}**.`),
        factsBlock([
          { label: "Recompensa", value: ryo(`${recompensa} Ryō por unidade`) },
          { label: "Prazo", value: `<t:${Math.floor(r.order.deadline.getTime() / 1000)}:R>` },
        ]),
        text("-# Ao aceitar, o recurso coletado vai direto ao estoque e você recebe na hora."),
        buttonRow(button({ id: `vila:ordem:aceitar:${r.order.id}`, label: "Aceitar ordem", style: ButtonStyle.Success, emojiKey: "sucesso" })),
      ]),
    ],
  );
}

async function abrirConviteOrdem(interaction: ButtonInteraction, orderId: string): Promise<void> {
  await interaction.reply(
    v2Payload([
      economyContainer("vila", [
        titleBlock("ordem", "Convidar ninja"),
        text("Escolha um ninja da vila para receber o convite por DM."),
        new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
          new UserSelectMenuBuilder().setCustomId(`vila:ordens:convidar:${orderId}`).setMaxValues(1),
        ),
      ]),
    ]),
  );
}

async function convidarNinja(interaction: AnySelectMenuInteraction, viewer: Viewer): Promise<void> {
  const orderId = interaction.customId.split(":")[3] ?? "";
  const alvoId = interaction.values[0]!;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const alvo = await prisma.userCharacter.findFirst({
    where: { discordId: alvoId, villageId: viewer.villageId },
  });
  if (!alvo) {
    await interaction.editReply("❌ Esse usuário não tem personagem da sua vila.");
    return;
  }
  const order = await prisma.collectionOrder.findUnique({ where: { id: orderId } });
  if (!order || order.status !== "ACTIVE") {
    await interaction.editReply("❌ Essa ordem não está mais ativa.");
    return;
  }

  await inviteToOrder(orderId, alvo.id);

  const nome = getItem(order.itemId)?.name ?? order.itemId;
  const convite = [
    economyContainer("vila", [
      titleBlock("ordem", `Convite de coleta — ${VILLAGE_NAMES[viewer.villageId]}`),
      text(`O Kage pediu **${order.targetQty}x ${nome}**.`),
      factsBlock([{ label: "Recompensa", value: ryo(`${order.rewardPerUnit} Ryō por unidade`) }]),
      text("-# Você não é obrigado a aceitar."),
      buttonRow(
        button({ id: `vila:ordem:aceitar:${orderId}`, label: "Aceitar", style: ButtonStyle.Success }),
        button({ id: `vila:ordem:recusar:${orderId}`, label: "Recusar" }),
      ),
    ]),
  ];

  const user = await interaction.client.users.fetch(alvoId).catch(() => null);
  const dm = user ? await user.send(v2Payload(convite, false)).catch(() => null) : null;

  await interaction.editReply(
    dm
      ? `✅ Convite enviado a <@${alvoId}> por DM.`
      : `✅ Convite registrado para <@${alvoId}>. A DM falhou; ele verá em \`/vila\`.`,
  );
}

async function responderOrdem(
  interaction: ButtonInteraction,
  acao: "aceitar" | "recusar",
  orderId: string,
): Promise<void> {
  // No servidor, o personagem é identificado pela guild da interação. Em DM
  // não existe guildId: usar "global" criava outro personagem sem vila e a
  // ordem de Konoha era recusada mesmo para quem tinha o cargo certo. Como o
  // bot opera em um único servidor, a ordem já informa a vila suficiente para
  // recuperar o personagem real daquele jogador.
  const char = interaction.guildId
    ? await getOrCreateCharacter(interaction.user.id, interaction.guildId, interaction.user.username)
    : await personagemDaOrdemEmDm(interaction.user.id, orderId);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (acao === "recusar") {
    await declineOrder(char.id, orderId);
    await interaction.editReply("Convite recusado.");
    return;
  }

  const r = await acceptOrder(char.id, orderId);
  if (!r.ok) return void (await interaction.editReply(`❌ ${r.error}`));

  const nome = getItem(r.order.itemId)?.name ?? r.order.itemId;
  await interaction.editReply(
    `✅ Ordem aceita: **${nome}**.\n` +
      `A partir de agora, todo **${nome}** que você coletar vai direto ao estoque da vila e você recebe ` +
      `**${r.order.rewardPerUnit} Ryō por unidade** na hora. Recursos raros e outros materiais continuam seus.`,
  );
}

async function personagemDaOrdemEmDm(discordId: string, orderId: string) {
  const order = await prisma.collectionOrder.findUnique({
    where: { id: orderId },
    select: { villageId: true },
  });
  const char = order
    ? await prisma.userCharacter.findFirst({
        where: { discordId, villageId: order.villageId },
        orderBy: { updatedAt: "desc" },
      })
    : null;
  if (!char) {
    throw new EconomyError("Não localizei seu personagem nesta vila. Use /vila no servidor e tente novamente.");
  }
  return char;
}

async function cancelarOrdem(
  interaction: ButtonInteraction,
  _viewer: Viewer,
  orderId: string,
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const r = await closeOrder(orderId, "CANCELLED", interaction.user.id);
  await interaction.editReply(
    r.ok
      ? `🛑 Ordem cancelada. Devolvi **${r.devolvido} Ryō** de reserva ao cofre. O que já foi entregue e pago continua valendo.`
      : `❌ ${r.error}`,
  );
}

// ---------------- Anúncio ----------------

async function anunciar(
  interaction: RepliableInteraction,
  villageId: VillageId,
  components: TopLevel[],
): Promise<void> {
  const canal = await interaction.client.channels
    .fetch(VILLAGE_ANNOUNCE_CHANNELS[villageId])
    .catch(() => null);
  if (!canal?.isTextBased() || !("send" in canal)) return;
  await canal.send({ components, flags: MessageFlags.IsComponentsV2 }).catch(() => null);
}
