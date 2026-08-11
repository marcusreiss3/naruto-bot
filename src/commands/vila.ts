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
  UserSelectMenuBuilder,
  type AnySelectMenuInteraction,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type GuildMember,
  type ModalSubmitInteraction,
  type RepliableInteraction,
} from "discord.js";
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

const ABAS_KAGE: { id: Aba; label: string; emoji: string }[] = [
  { id: "geral", label: "Visão Geral", emoji: "🏯" },
  { id: "cofre", label: "Cofre", emoji: "💰" },
  { id: "estoque", label: "Estoque", emoji: "📦" },
  { id: "impostos", label: "Impostos", emoji: "🧾" },
  { id: "relatorios", label: "Relatórios", emoji: "📊" },
  { id: "obras", label: "Obras", emoji: "🏗️" },
  { id: "comercio", label: "Comércio", emoji: "🏪" },
];

function abasFor(viewer: Viewer): { id: Aba; label: string; emoji: string }[] {
  if (!viewer.podeKage) {
    return [
      { id: "geral", label: "Visão Geral", emoji: "🏯" },
      { id: "estoque", label: "Estoque", emoji: "📦" },
      { id: "relatorios", label: "Meus recibos", emoji: "🧾" },
    ];
  }
  return ABAS_KAGE;
}

function navRow(viewer: Viewer, atual: Aba): ActionRowBuilder<ButtonBuilder>[] {
  const abas = abasFor(viewer);
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < abas.length; i += 5) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        abas.slice(i, i + 5).map((aba) =>
          new ButtonBuilder()
            .setCustomId(`vila:aba:${aba.id}`)
            .setLabel(aba.label)
            .setEmoji(aba.emoji)
            .setStyle(aba.id === atual ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(aba.id === atual),
        ),
      ),
    );
  }
  return rows;
}

// ---------------- Montagem de cada aba ----------------

async function renderGeral(viewer: Viewer) {
  const village = await prisma.village.findUniqueOrThrow({ where: { id: viewer.villageId } });
  const pop = await activePopulation(viewer.villageId);
  const embed = new EmbedBuilder()
    .setColor(0x2f7f4f)
    .setTitle(`🏯 ${village.name}`)
    .addFields(
      { name: "Kage", value: village.kageDiscordId ? `<@${village.kageDiscordId}>` : "_Administração da staff_", inline: true },
      { name: "Taxa de mercado", value: `${(village.taxRate * 100).toFixed(0)}%`, inline: true },
      {
        name: "Ninjas ativos (14 dias)",
        value:
          `${pop.ativos} (fator ${pop.factor.toFixed(2)})` + (pop.override ? " • _fixado pela staff_" : ""),
        inline: true,
      },
    )
    .setFooter({ text: `${viewer.charName} • ${formatRyo(viewer.ryo)}` });

  // Obras e alertas de reforma sao publicos: o estado da vila e' do jogador
  // tambem. O que fica so' para o Kage e' o cofre (secao 8).
  const [capacidade, fila, reformas] = await Promise.all([
    capacityView(viewer.villageId),
    activeConstructions(viewer.villageId),
    pendingMaintenance(viewer.villageId),
  ]);

  embed.addFields({
    name: `🏗️ Obras (${capacidade.usadas}/${capacidade.total})`,
    value: fila.length
      ? fila
          .map(
            (obra) =>
              `• ${buildingName(obra.buildingType, obra.buildingKey)}` +
              (obra.targetLevel ? ` nível ${obra.targetLevel}` : "") +
              ` — <t:${Math.floor(obra.finishesAt.getTime() / 1000)}:R>`,
          )
          .join("\n")
          .slice(0, 1024)
      : `_Nenhuma obra em andamento._ ${CENTER.name} nível ${capacidade.centerLevel}.`,
  });

  if (reformas.length) {
    const atrasadas = reformas.filter((r) => r.status === "OVERDUE");
    embed.addFields({
      name: atrasadas.length ? "⚠️ Reformas atrasadas" : "🔧 Reformas a pagar",
      value: reformas
        .map(
          (r) =>
            `• **${r.name}** — ${r.ryoDue} Ryō` +
            (r.status === "OVERDUE"
              ? " • **suspenso até pagar**"
              : ` • vence <t:${Math.floor(r.dueAt.getTime() / 1000)}:R>`),
        )
        .join("\n")
        .slice(0, 1024),
    });
  }

  if (viewer.podeKage) {
    const cofre = await treasuryView(viewer.villageId);
    embed.addFields({
      name: "Cofre",
      value: `💰 ${cofre.treasuryRyo} Ryō — disponível ${cofre.available} (reservado ${cofre.reservedRyo})`,
    });
  }

  const componentes: ActionRowBuilder<ButtonBuilder>[] = navRow(viewer, "geral");
  componentes.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("vila:doar:menu").setLabel("Doar").setEmoji("🎁").setStyle(ButtonStyle.Success),
    ),
  );
  return { embeds: [embed], components: componentes };
}

async function renderEstoque(viewer: Viewer) {
  const stock = await prisma.villageStock.findMany({
    where: { villageId: viewer.villageId, qty: { gt: 0 } },
    orderBy: { itemId: "asc" },
  });
  const linhas = stock.length
    ? stock.map((row) => `• ${getItem(row.itemId)?.name ?? row.name} ×${row.qty}`).join("\n").slice(0, 3900)
    : "_O estoque central está vazio._";

  const embed = new EmbedBuilder()
    .setColor(0x8b5a2b)
    .setTitle(`📦 Estoque central — ${VILLAGE_NAMES[viewer.villageId]}`)
    .setDescription(linhas);

  const componentes: ActionRowBuilder<ButtonBuilder>[] = navRow(viewer, "estoque");
  if (viewer.podeKage) {
    const ordens = await prisma.collectionOrder.count({
      where: { villageId: viewer.villageId, status: "ACTIVE" },
    });
    componentes.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("vila:estoque:retirar").setLabel("Retirar para ninja").setEmoji("📤").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("vila:ordens:listar").setLabel(`Ordens de coleta (${ordens})`).setEmoji("📋").setStyle(ButtonStyle.Primary),
      ),
    );
  }
  return { embeds: [embed], components: componentes };
}

async function renderCofre(viewer: Viewer) {
  const cofre = await treasuryView(viewer.villageId);
  const embed = new EmbedBuilder()
    .setColor(0xc9a227)
    .setTitle(`💰 Cofre — ${VILLAGE_NAMES[viewer.villageId]}`)
    .addFields(
      { name: "Saldo", value: `${cofre.treasuryRyo} Ryō`, inline: true },
      { name: "Reservado", value: `${cofre.reservedRyo} Ryō`, inline: true },
      { name: "Disponível", value: `${cofre.available} Ryō`, inline: true },
      {
        name: "Saque desta semana",
        value: cofre.withdrawalsLocked
          ? "🔒 Bloqueado pela staff"
          : `Já sacou ${cofre.withdrawnThisWeek} Ryō • pode sacar até **${cofre.allowance} Ryō**\n` +
            `_Limite: ${ECONOMY.kageWeeklyWithdrawalRate * 100}% do disponível por semana, teto de ${ECONOMY.kageWithdrawalCap} por saque._`,
      },
    )
    .setFooter({ text: `Competência ${cofre.weekKey} • seu saldo: ${formatRyo(viewer.ryo)}` });

  const componentes: ActionRowBuilder<ButtonBuilder>[] = navRow(viewer, "cofre");
  componentes.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("vila:cofre:depositar").setLabel("Depositar").setEmoji("📥").setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("vila:cofre:sacar")
        .setLabel("Sacar")
        .setEmoji("📤")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(cofre.withdrawalsLocked || cofre.allowance <= 0),
    ),
  );
  return { embeds: [embed], components: componentes };
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

  const embed = new EmbedBuilder()
    .setColor(0x6a5acd)
    .setTitle(`🧾 Impostos — ${VILLAGE_NAMES[viewer.villageId]}`)
    .addFields(
      { name: "Taxa atual", value: `${(village.taxRate * 100).toFixed(0)}%`, inline: true },
      {
        name: `Congelada (${weekKey})`,
        value: periodo ? `${(periodo.taxRateFrozen * 100).toFixed(0)}%` : "_sem competência aberta_",
        inline: true,
      },
      { name: "Arrecadado (total)", value: `${arrecadado._sum.ryoDelta ?? 0} Ryō`, inline: true },
    )
    .setFooter({
      text: "Mudar a taxa afeta o mercado na hora, mas o imposto pessoal só na competência seguinte. A taxa é definida pela staff em /admin-vila.",
    });

  return { embeds: [embed], components: navRow(viewer, "impostos") };
}

async function renderRelatorios(viewer: Viewer) {
  // Jogador comum ve so' os recibos dele; o Kage ve o movimento da vila.
  if (!viewer.podeKage) {
    const recibos = await prisma.weeklyTaxCharge.findMany({
      where: { charId: viewer.charId },
      orderBy: { chargedAt: "desc" },
      take: 10,
    });
    const linhas = recibos.length
      ? recibos
          .map(
            (r) =>
              `• **${r.weekKey}** — ${r.taxRyo} Ryō (${(r.taxRate * 100).toFixed(0)}% de ${r.taxableBase}) • saldo ${r.balanceBefore} → ${r.balanceAfter}`,
          )
          .join("\n")
      : "_Você ainda não teve cobrança de imposto._";
    return {
      embeds: [
        new EmbedBuilder().setColor(0x6a5acd).setTitle("🧾 Seus recibos de imposto").setDescription(linhas),
      ],
      components: navRow(viewer, "relatorios"),
    };
  }

  const lancamentos = await prisma.villageLedger.findMany({
    where: { villageId: viewer.villageId },
    orderBy: { createdAt: "desc" },
    take: 15,
  });
  const linhas = lancamentos.length
    ? lancamentos
        .map((l) => {
          const valor = l.ryoDelta !== 0 ? ` ${l.ryoDelta > 0 ? "+" : ""}${l.ryoDelta} Ryō` : "";
          const item = l.itemId ? ` ${getItem(l.itemId)?.name ?? l.itemId} ×${l.itemQty}` : "";
          return `• \`${l.type}\`${valor}${item} — ${l.reason || "_sem motivo_"}`;
        })
        .join("\n")
        .slice(0, 3900)
    : "_Sem movimento no livro-caixa._";

  return {
    embeds: [
      new EmbedBuilder()
        .setColor(0x6a5acd)
        .setTitle(`📊 Livro-caixa — ${VILLAGE_NAMES[viewer.villageId]}`)
        .setDescription(linhas)
        .setFooter({ text: "Lançamentos mais recentes. O livro é append-only: correção é lançamento novo." }),
    ],
    components: navRow(viewer, "relatorios"),
  };
}

function renderEmBreve(viewer: Viewer, aba: Aba, titulo: string, etapa: string) {
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(0x555555)
        .setTitle(titulo)
        .setDescription(`_Em breve — ${etapa}._`),
    ],
    components: navRow(viewer, aba),
  };
}

async function renderAba(viewer: Viewer, aba: Aba) {
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
      const payload = await renderAba(viewer, "geral");

      if (viewer.isKage && !viewer.inMansion) {
        payload.embeds[0]?.setFooter({
          text: `Você é o Kage. Para administrar, use /vila em <#${VILLAGE_MANSIONS[viewer.villageId]}>.`,
        });
      }
      await interaction.editReply(payload);
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
  if (interaction.deferred || interaction.replied) await interaction.editReply({ content: msg, embeds: [], components: [] });
  else await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
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
    await interaction.editReply(await renderAba(viewer, (acao ?? "geral") as Aba));
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

  await interaction.reply({
    content: `🎁 Doar para **${VILLAGE_NAMES[viewer.villageId]}**`,
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
    flags: MessageFlags.Ephemeral,
  });
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
      new EmbedBuilder()
        .setColor(0xc94f4f)
        .setTitle(`📤 Saque do cofre — ${VILLAGE_NAMES[viewer.villageId]}`)
        .setDescription(`<@${interaction.user.id}> sacou **${r.amount} Ryō**.`)
        .addFields(
          { name: "Cofre", value: `${r.cofreAntes} → ${r.cofreDepois} Ryō`, inline: true },
          { name: "Motivo", value: r.motivo },
        ),
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
  await interaction.reply({
    content: "📤 Escolha o item a retirar:",
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder().setCustomId("vila:estoque:item").addOptions(
          stock.map((row) => ({
            label: (getItem(row.itemId)?.name ?? row.name).slice(0, 100),
            value: row.itemId,
            description: `Em estoque: ${row.qty}`,
          })),
        ),
      ),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

// ---------------- Ordens de coleta ----------------

async function listarOrdens(interaction: ButtonInteraction, viewer: Viewer): Promise<void> {
  const ordens = await prisma.collectionOrder.findMany({
    where: { villageId: viewer.villageId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  const embed = new EmbedBuilder()
    .setColor(0x4f7fc9)
    .setTitle("📋 Ordens de coleta ativas")
    .setDescription(
      ordens.length
        ? ordens
            .map(
              (o) =>
                `**${getItem(o.itemId)?.name ?? o.itemId}** — ${o.deliveredQty}/${o.targetQty}\n` +
                `${o.rewardPerUnit} Ryō/unidade • resta ${remainingBudget(o.budgetMax, o.budgetSpent)} de ${o.budgetMax} • prazo <t:${Math.floor(o.deadline.getTime() / 1000)}:R>`,
            )
            .join("\n\n")
        : "_Nenhuma ordem ativa._",
    );

  const linhas: ActionRowBuilder<ButtonBuilder>[] = [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("vila:ordens:criar").setLabel("Criar ordem").setEmoji("➕").setStyle(ButtonStyle.Success),
    ),
  ];
  for (const o of ordens.slice(0, 4)) {
    linhas.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`vila:ordens:convidar:${o.id}`)
          .setLabel(`Convidar — ${getItem(o.itemId)?.name ?? o.itemId}`.slice(0, 80))
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`vila:ordens:cancelar:${o.id}`)
          .setLabel("Cancelar")
          .setStyle(ButtonStyle.Danger),
      ),
    );
  }

  await interaction.reply({ embeds: [embed], components: linhas, flags: MessageFlags.Ephemeral });
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
  const anuncio = new EmbedBuilder()
    .setColor(0x4f7fc9)
    .setTitle(`📋 Ordem de coleta — ${VILLAGE_NAMES[viewer.villageId]}`)
    .setDescription(`A vila precisa de **${meta}x ${nome}**.`)
    .addFields(
      { name: "Recompensa", value: `${recompensa} Ryō por unidade`, inline: true },
      { name: "Prazo", value: `<t:${Math.floor(r.order.deadline.getTime() / 1000)}:R>`, inline: true },
    )
    .setFooter({ text: "Ao aceitar, o recurso coletado vai direto ao estoque e você recebe na hora." });

  await anunciar(
    interaction,
    viewer.villageId,
    anuncio,
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`vila:ordem:aceitar:${r.order.id}`)
        .setLabel("Aceitar ordem")
        .setEmoji("✅")
        .setStyle(ButtonStyle.Success),
    ),
  );
}

async function abrirConviteOrdem(interaction: ButtonInteraction, orderId: string): Promise<void> {
  await interaction.reply({
    content: "Escolha o ninja a convidar (precisa ter personagem da sua vila):",
    components: [
      new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
        new UserSelectMenuBuilder().setCustomId(`vila:ordens:convidar:${orderId}`).setMaxValues(1),
      ),
    ],
    flags: MessageFlags.Ephemeral,
  });
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
  const embed = new EmbedBuilder()
    .setColor(0x4f7fc9)
    .setTitle(`📋 Convite de coleta — ${VILLAGE_NAMES[viewer.villageId]}`)
    .setDescription(`O Kage pediu **${order.targetQty}x ${nome}**.`)
    .addFields({ name: "Recompensa", value: `${order.rewardPerUnit} Ryō por unidade`, inline: true })
    .setFooter({ text: "Você não é obrigado a aceitar." });
  const botoes = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`vila:ordem:aceitar:${orderId}`).setLabel("Aceitar").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`vila:ordem:recusar:${orderId}`).setLabel("Recusar").setStyle(ButtonStyle.Secondary),
  );

  const user = await interaction.client.users.fetch(alvoId).catch(() => null);
  const dm = user ? await user.send({ embeds: [embed], components: [botoes] }).catch(() => null) : null;

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
  const guildId = interaction.guildId ?? "global";
  const char = await getOrCreateCharacter(interaction.user.id, guildId, interaction.user.username);
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
  embed: EmbedBuilder,
  components?: ActionRowBuilder<ButtonBuilder>,
): Promise<void> {
  const canal = await interaction.client.channels
    .fetch(VILLAGE_ANNOUNCE_CHANNELS[villageId])
    .catch(() => null);
  if (!canal?.isTextBased() || !("send" in canal)) return;
  await canal
    .send({ embeds: [embed], components: components ? [components] : [] })
    .catch(() => null);
}
