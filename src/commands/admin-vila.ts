import {
  EmbedBuilder,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { Command } from "./types.js";
import { isAdmin } from "../utils/permissions.js";
import { NINJA_RANKS, NINJA_RANK_LABELS, type NinjaRank } from "../config/enums.js";
import { VILLAGE_IDS, VILLAGE_NAMES, normalizeVillageId } from "../data/villages.js";
import { VILLAGE_MANSIONS } from "../services/village-service.js";
import { getOrCreateCharacter } from "../services/characters/character-service.js";
import {
  adminAddCharacterRyo,
  adminSetCharacterRyo,
  formatRyo,
  normalizeNinjaRank,
} from "../services/economy/character-economy.js";
import { getVillage } from "../services/economy/village-economy.js";
import { prisma } from "../db/client.js";
import { recordLedger } from "../services/economy/ledger.js";
import { villageFromMember } from "../services/village-service.js";
import { getItem, ITEMS } from "../data/items.js";
import {
  adminAdjustStock,
  adminAdjustTreasury,
  setKage,
  setTaxRate,
  setWithdrawalsLocked,
} from "../services/economy/treasury.js";
import { activePopulation } from "../services/economy/population.js";
import { syncIchirakuChannel } from "../services/economy/ichiraku-channel.js";
import {
  CENTER,
  MAX_CENTER_LEVEL,
  MAX_SECTOR_LEVEL,
  SECTORS,
  isSectorKey,
} from "../data/sectors.js";
import { ICHIRAKU_CONSTRUCTION } from "../data/shops.js";
import {
  activeConstructions,
  buildingName,
  cancelConstruction,
  capacityView,
  forceFinishConstruction,
} from "../services/economy/constructions.js";
import { resolveMaintenance } from "../services/economy/maintenance.js";
import {
  setCenterLevel,
  setPopulationOverride,
  setSectorLevel,
} from "../services/economy/admin-levels.js";

const rankChoices = NINJA_RANKS.map((rank) => ({ name: NINJA_RANK_LABELS[rank], value: rank }));
const villageChoices = VILLAGE_IDS.map((id) => ({ name: VILLAGE_NAMES[id], value: id }));
const sectorChoices = SECTORS.map((sector) => ({ name: sector.name, value: sector.key }));
// Predio = os quatro setores + Centro + Ichiraku. E' o alcance da fila de obras
// e da reforma; as outras quatro lojas nunca ocupam vaga nem pagam manutencao.
const buildingChoices = [
  ...sectorChoices,
  { name: CENTER.name, value: CENTER.buildingKey as string },
  { name: "Ichiraku — Casa de Lámen", value: ICHIRAKU_CONSTRUCTION.buildingKey as string },
];

function buildingTypeOf(key: string): "SECTOR" | "CENTER" | "SHOP" {
  if (key === CENTER.buildingKey) return "CENTER";
  if (key === ICHIRAKU_CONSTRUCTION.buildingKey) return "SHOP";
  return "SECTOR";
}

// Comando de staff separado de /admin, como pedido na secao 8 do spec.
// Nesta etapa so' existem as duas acoes que servem para conferir a fundacao:
// definir rank e ver o estado de uma vila. As demais entram nas etapas 2 a 6.
export const adminVila: Command = {
  data: new SlashCommandBuilder()
    .setName("admin-vila")
    .setDescription("Administração de vilas e economia (staff)")
    .addSubcommand((s) =>
      s
        .setName("ver")
        .setDescription("Mostra cofre, taxa e estoque de uma vila")
        .addStringOption((o) =>
          o.setName("vila").setDescription("Vila").addChoices(...villageChoices).setRequired(true),
        ),
    )
    .addSubcommandGroup((g) =>
      g
        .setName("rank")
        .setDescription("Rank narrativo do ninja")
        .addSubcommand((s) =>
          s
            .setName("set")
            .setDescription("Define o rank de um ninja")
            .addUserOption((o) => o.setName("usuario").setDescription("Usuário").setRequired(true))
            .addStringOption((o) =>
              o.setName("rank").setDescription("Rank").addChoices(...rankChoices).setRequired(true),
            )
            .addStringOption((o) =>
              o.setName("motivo").setDescription("Motivo (vai para a auditoria)").setRequired(true),
            ),
        ),
    )
    .addSubcommandGroup((g) =>
      g
        .setName("kage")
        .setDescription("Kage da vila")
        .addSubcommand((s) =>
          s
            .setName("set")
            .setDescription("Define o Kage jogador de uma vila")
            .addStringOption((o) => o.setName("vila").setDescription("Vila").addChoices(...villageChoices).setRequired(true))
            .addUserOption((o) => o.setName("usuario").setDescription("Novo Kage").setRequired(true))
            .addStringOption((o) => o.setName("motivo").setDescription("Motivo").setRequired(true)),
        )
        .addSubcommand((s) =>
          s
            .setName("npc")
            .setDescription("Liga/desliga o modo Kage NPC (gerido pela staff)")
            .addStringOption((o) => o.setName("vila").setDescription("Vila").addChoices(...villageChoices).setRequired(true))
            .addBooleanOption((o) => o.setName("ativado").setDescription("Kage NPC?").setRequired(true))
            .addStringOption((o) => o.setName("motivo").setDescription("Motivo").setRequired(true)),
        ),
    )
    .addSubcommandGroup((g) =>
      g
        .setName("cofre")
        .setDescription("Cofre da vila")
        .addSubcommand((s) =>
          s
            .setName("ajustar")
            .setDescription("Soma ou subtrai Ryō do cofre")
            .addStringOption((o) => o.setName("vila").setDescription("Vila").addChoices(...villageChoices).setRequired(true))
            .addIntegerOption((o) => o.setName("delta").setDescription("Positivo credita, negativo debita").setRequired(true))
            .addStringOption((o) => o.setName("motivo").setDescription("Motivo").setRequired(true)),
        ),
    )
    .addSubcommandGroup((g) =>
      g
        .setName("estoque")
        .setDescription("Estoque central")
        .addSubcommand((s) =>
          s
            .setName("ajustar")
            .setDescription("Soma ou subtrai itens do estoque")
            .addStringOption((o) => o.setName("vila").setDescription("Vila").addChoices(...villageChoices).setRequired(true))
            .addStringOption((o) => o.setName("item").setDescription("Item").setAutocomplete(true).setRequired(true))
            .addIntegerOption((o) => o.setName("delta").setDescription("Positivo adiciona, negativo remove").setRequired(true))
            .addStringOption((o) => o.setName("motivo").setDescription("Motivo").setRequired(true)),
        ),
    )
    .addSubcommandGroup((g) =>
      g
        .setName("imposto")
        .setDescription("Taxa de imposto da vila")
        .addSubcommand((s) =>
          s
            .setName("set")
            .setDescription("Define a taxa (só vale na competência seguinte)")
            .addStringOption((o) => o.setName("vila").setDescription("Vila").addChoices(...villageChoices).setRequired(true))
            .addIntegerOption((o) =>
              o.setName("percentual").setDescription("De 0 a 15").setMinValue(0).setMaxValue(15).setRequired(true),
            )
            .addStringOption((o) => o.setName("motivo").setDescription("Motivo").setRequired(true)),
        ),
    )
    .addSubcommandGroup((g) =>
      g
        .setName("saque")
        .setDescription("Bloqueio de saque")
        .addSubcommand((s) =>
          s
            .setName("bloquear")
            .setDescription("Bloqueia ou libera saques do cofre")
            .addStringOption((o) => o.setName("vila").setDescription("Vila").addChoices(...villageChoices).setRequired(true))
            .addBooleanOption((o) => o.setName("ativado").setDescription("Bloquear?").setRequired(true))
            .addStringOption((o) => o.setName("motivo").setDescription("Motivo").setRequired(true)),
        ),
    )
    .addSubcommandGroup((g) =>
      g
        .setName("ryo")
        .setDescription("Ryō pessoal de um ninja")
        .addSubcommand((s) =>
          s
            .setName("set")
            .setDescription("Define o saldo exato de Ryō de um ninja")
            .addUserOption((o) => o.setName("usuario").setDescription("Ninja").setRequired(true))
            .addIntegerOption((o) =>
              o.setName("valor").setDescription("Saldo exato (negativo vira dívida)").setRequired(true),
            )
            .addStringOption((o) => o.setName("motivo").setDescription("Motivo").setRequired(true)),
        )
        .addSubcommand((s) =>
          s
            .setName("add")
            .setDescription("Soma ou subtrai Ryō de um ninja")
            .addUserOption((o) => o.setName("usuario").setDescription("Ninja").setRequired(true))
            .addIntegerOption((o) =>
              o.setName("delta").setDescription("Positivo credita, negativo debita").setRequired(true),
            )
            .addStringOption((o) => o.setName("motivo").setDescription("Motivo").setRequired(true)),
        ),
    )
    .addSubcommandGroup((g) =>
      g
        .setName("nivel")
        .setDescription("Nível dos setores da vila")
        .addSubcommand((s) =>
          s
            .setName("set")
            .setDescription("Define o nível de um setor (0 a 5)")
            .addStringOption((o) => o.setName("vila").setDescription("Vila").addChoices(...villageChoices).setRequired(true))
            .addStringOption((o) => o.setName("setor").setDescription("Setor").addChoices(...sectorChoices).setRequired(true))
            .addIntegerOption((o) =>
              o.setName("nivel").setDescription("De 0 a 5").setMinValue(0).setMaxValue(MAX_SECTOR_LEVEL).setRequired(true),
            )
            .addStringOption((o) => o.setName("motivo").setDescription("Motivo").setRequired(true)),
        ),
    )
    .addSubcommandGroup((g) =>
      g
        .setName("centro")
        .setDescription("Centro da Vila")
        .addSubcommand((s) =>
          s
            .setName("set")
            .setDescription("Define o nível do Centro (1 a 3)")
            .addStringOption((o) => o.setName("vila").setDescription("Vila").addChoices(...villageChoices).setRequired(true))
            .addIntegerOption((o) =>
              o.setName("nivel").setDescription("De 1 a 3").setMinValue(1).setMaxValue(MAX_CENTER_LEVEL).setRequired(true),
            )
            .addStringOption((o) => o.setName("motivo").setDescription("Motivo").setRequired(true)),
        ),
    )
    .addSubcommandGroup((g) =>
      g
        .setName("obra")
        .setDescription("Fila de obras da vila")
        .addSubcommand((s) =>
          s
            .setName("listar")
            .setDescription("Mostra a fila de obras e as vagas")
            .addStringOption((o) => o.setName("vila").setDescription("Vila").addChoices(...villageChoices).setRequired(true))
            .addStringOption((o) => o.setName("motivo").setDescription("Motivo").setRequired(true)),
        )
        .addSubcommand((s) =>
          s
            .setName("concluir")
            .setDescription("Antecipa a conclusão de uma obra em andamento")
            .addStringOption((o) => o.setName("vila").setDescription("Vila").addChoices(...villageChoices).setRequired(true))
            .addStringOption((o) => o.setName("predio").setDescription("Prédio").addChoices(...buildingChoices).setRequired(true))
            .addStringOption((o) => o.setName("motivo").setDescription("Motivo").setRequired(true)),
        )
        .addSubcommand((s) =>
          s
            .setName("cancelar")
            .setDescription("Cancela uma obra (sem reembolso) e libera a vaga")
            .addStringOption((o) => o.setName("vila").setDescription("Vila").addChoices(...villageChoices).setRequired(true))
            .addStringOption((o) => o.setName("predio").setDescription("Prédio").addChoices(...buildingChoices).setRequired(true))
            .addStringOption((o) => o.setName("motivo").setDescription("Motivo").setRequired(true)),
        ),
    )
    .addSubcommandGroup((g) =>
      g
        .setName("manutencao")
        .setDescription("Reforma semanal")
        .addSubcommand((s) =>
          s
            .setName("resolver")
            .setDescription("Perdoa a reforma pendente e reativa o prédio")
            .addStringOption((o) => o.setName("vila").setDescription("Vila").addChoices(...villageChoices).setRequired(true))
            .addStringOption((o) => o.setName("predio").setDescription("Prédio").addChoices(...buildingChoices).setRequired(true))
            .addStringOption((o) => o.setName("motivo").setDescription("Motivo").setRequired(true)),
        ),
    )
    .addSubcommandGroup((g) =>
      g
        .setName("populacao")
        .setDescription("População ativa da vila")
        .addSubcommand((s) =>
          s
            .setName("override")
            .setDescription("Fixa o número de ativos (-1 volta à apuração real)")
            .addStringOption((o) => o.setName("vila").setDescription("Vila").addChoices(...villageChoices).setRequired(true))
            .addIntegerOption((o) =>
              o.setName("ativos").setDescription("-1 remove o override").setMinValue(-1).setRequired(true),
            )
            .addStringOption((o) => o.setName("motivo").setDescription("Motivo").setRequired(true)),
        ),
    )
    .addSubcommandGroup((g) =>
      g
        .setName("ichiraku")
        .setDescription("Canal de RP do Ichiraku")
        .addSubcommand((s) =>
          s
            .setName("canal")
            .setDescription("Cria ou reaproveita o canal do Ichiraku e abre a loja")
            .addStringOption((o) => o.setName("vila").setDescription("Vila").addChoices(...villageChoices).setRequired(true))
            .addStringOption((o) => o.setName("motivo").setDescription("Motivo").setRequired(true)),
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!isAdmin(interaction)) {
      await interaction.reply({ content: "⛔ Você não tem permissão.", ephemeral: true });
      return;
    }
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();

    await interaction.deferReply({ ephemeral: true });

    if (group === "rank" && sub === "set") return handleRankSet(interaction);
    // `ryo` e `rank` sao sobre um NINJA, nao sobre uma vila: nao tem opcao
    // `vila` e por isso nao passam pelo handleVillageAdmin.
    if (group === "ryo") return handleRyoSet(interaction, sub);
    if (!group && sub === "ver") return handleVer(interaction);
    if (group) return handleVillageAdmin(interaction, group, sub);
    await interaction.editReply("Subcomando desconhecido.");
  },

  async autocomplete(interaction) {
    const q = interaction.options.getFocused().toLocaleLowerCase("pt-BR");
    await interaction.respond(
      ITEMS.filter((item) => `${item.name} ${item.id}`.toLocaleLowerCase("pt-BR").includes(q))
        .slice(0, 25)
        .map((item) => ({ name: item.name, value: item.id })),
    );
  },
};

// Todas as ações de staff exigem `motivo` e geram ADMIN_ADJUSTMENT no
// livro-caixa — nenhuma altera saldo ou estoque sem deixar rastro.
async function handleVillageAdmin(
  interaction: ChatInputCommandInteraction,
  group: string,
  sub: string,
): Promise<void> {
  const villageId = normalizeVillageId(interaction.options.getString("vila", true));
  const motivo = interaction.options.getString("motivo", true).trim();
  const nome = VILLAGE_NAMES[villageId];
  const actor = interaction.user.id;

  if (group === "kage" && sub === "set") {
    const user = interaction.options.getUser("usuario", true);
    await setKage(villageId, user.id, false, motivo, actor);
    await interaction.editReply(`✅ <@${user.id}> agora é o Kage de **${nome}**.\nMotivo: ${motivo}`);
    return;
  }

  if (group === "kage" && sub === "npc") {
    const ativado = interaction.options.getBoolean("ativado", true);
    // Kage NPC: staff opera a vila; nao existe Kage jogador enquanto isso.
    await setKage(villageId, ativado ? null : null, ativado, motivo, actor);
    await interaction.editReply(
      `✅ **${nome}**: Kage NPC ${ativado ? "**ativado**" : "**desativado**"}.\nMotivo: ${motivo}`,
    );
    return;
  }

  if (group === "cofre" && sub === "ajustar") {
    const delta = interaction.options.getInteger("delta", true);
    const r = await adminAdjustTreasury(villageId, delta, motivo, actor);
    await interaction.editReply(
      r.ok ? `✅ Cofre de **${nome}**: ${delta > 0 ? "+" : ""}${delta} Ryō → **${r.saldo}**.\nMotivo: ${motivo}` : `❌ ${r.error}`,
    );
    return;
  }

  if (group === "estoque" && sub === "ajustar") {
    const itemId = interaction.options.getString("item", true);
    const delta = interaction.options.getInteger("delta", true);
    const r = await adminAdjustStock(villageId, itemId, delta, motivo, actor);
    await interaction.editReply(
      r.ok ? `✅ **${nome}**: ${r.name} ${delta > 0 ? "+" : ""}${delta} → **${r.qty}**.\nMotivo: ${motivo}` : `❌ ${r.error}`,
    );
    return;
  }

  if (group === "imposto" && sub === "set") {
    const percentual = interaction.options.getInteger("percentual", true);
    const r = await setTaxRate(villageId, percentual / 100, motivo, actor);
    await interaction.editReply(
      r.ok
        ? `✅ Taxa de **${nome}** agora é **${percentual}%**.\n_A competência aberta já congelou a taxa antiga; isto vale a partir da próxima._\nMotivo: ${motivo}`
        : `❌ ${r.error}`,
    );
    return;
  }

  if (group === "nivel" && sub === "set") {
    const setor = interaction.options.getString("setor", true);
    const nivel = interaction.options.getInteger("nivel", true);
    if (!isSectorKey(setor)) return void (await interaction.editReply("❌ Setor desconhecido."));
    const r = await setSectorLevel(villageId, setor, nivel, motivo, actor);
    await interaction.editReply(
      r.ok
        ? `✅ **${nome}** — ${r.name}: nível ${r.de} → **${r.para}**.` +
          resumoLimpeza(r.obrasCanceladas, r.reformasEncerradas) +
          `\nMotivo: ${motivo}`
        : `❌ ${r.error}`,
    );
    return;
  }

  if (group === "centro" && sub === "set") {
    const nivel = interaction.options.getInteger("nivel", true);
    const r = await setCenterLevel(villageId, nivel, motivo, actor);
    if (!r.ok) return void (await interaction.editReply(`❌ ${r.error}`));
    const capacidade = await capacityView(villageId);
    await interaction.editReply(
      `✅ **${nome}** — ${r.name}: nível ${r.de} → **${r.para}**.` +
        resumoLimpeza(r.obrasCanceladas, r.reformasEncerradas) +
        `\nVagas de obra agora: **${capacidade.usadas}/${capacidade.total}**.\nMotivo: ${motivo}`,
    );
    return;
  }

  if (group === "populacao" && sub === "override") {
    const ativos = interaction.options.getInteger("ativos", true);
    const r = await setPopulationOverride(villageId, ativos < 0 ? null : ativos, motivo, actor);
    if (!r.ok) return void (await interaction.editReply(`❌ ${r.error}`));
    const pop = await activePopulation(villageId);
    await interaction.editReply(
      (r.ativos === null
        ? `✅ **${nome}** voltou à apuração real de população.`
        : `✅ População de **${nome}** fixada em **${r.ativos}** ativos.`) +
        `\nAgora: ${pop.ativos} ativos, fator ${pop.factor.toFixed(2)}.\nMotivo: ${motivo}`,
    );
    return;
  }

  if (group === "obra") {
    await handleObraAdmin(interaction, villageId, sub, motivo, actor, nome);
    return;
  }

  if (group === "manutencao" && sub === "resolver") {
    const predio = interaction.options.getString("predio", true);
    const r = await resolveMaintenance(villageId, predio, motivo, actor);
    await interaction.editReply(
      r.ok
        ? `✅ ${r.resolvidas} reforma(s) de **${buildingName(buildingTypeOf(predio), predio)}** encerrada(s) em **${nome}**; o prédio voltou a funcionar.\nMotivo: ${motivo}`
        : `❌ ${r.error}`,
    );
    return;
  }

  // Retomada manual da criacao do canal do Ichiraku (secao 7.7). Idempotente:
  // se o canal ja existe, reaproveita; nunca cria duplicado e nunca cobra a
  // obra de novo.
  if (group === "ichiraku" && sub === "canal") {
    const r = await syncIchirakuChannel(interaction.client, villageId);
    const explicacao: Record<string, string> = {
      CREATED: `✅ Canal criado: <#${r.channelId}>. O Ichiraku de **${nome}** está aberto.`,
      REUSED: `✅ Reaproveitei o canal <#${r.channelId}>. O Ichiraku de **${nome}** está aberto.`,
      ALREADY_ACTIVE: `ℹ️ O Ichiraku de **${nome}** já está aberto em <#${r.channelId}>.`,
      NOT_PENDING: `ℹ️ O Ichiraku de **${nome}** não está esperando canal (ainda bloqueado ou em obras).`,
      NO_CATEGORY: `❌ Não achei a categoria \`${r.detail}\` de **${nome}**. Confira ICHIRAKU_CATEGORY_BY_VILLAGE.`,
      NO_PERMISSION: `❌ Falta permissão de gerenciar canais. A loja continua aguardando; rode de novo depois de ajustar.`,
      ERROR: `❌ Falhou: ${r.detail}. A loja continua aguardando e nada foi cobrado de novo.`,
    };
    await interaction.editReply(`${explicacao[r.status] ?? r.status}\nMotivo: ${motivo}`);
    return;
  }

  if (group === "saque" && sub === "bloquear") {
    const ativado = interaction.options.getBoolean("ativado", true);
    await setWithdrawalsLocked(villageId, ativado, motivo, actor);
    await interaction.editReply(
      `✅ Saques de **${nome}** ${ativado ? "🔒 **bloqueados**" : "**liberados**"}.\nMotivo: ${motivo}`,
    );
    return;
  }

  await interaction.editReply("Subcomando desconhecido.");
}

// Ajuste do Ryo pessoal. E' a unica porta, alem da cobranca semanal de imposto,
// que pode deixar um saldo negativo — e so' porque e' staff, com motivo e
// auditoria. Nenhum caminho de jogo ganhou permissao nova.
async function handleRyoSet(
  interaction: ChatInputCommandInteraction,
  sub: string,
): Promise<void> {
  const guildId = interaction.guildId ?? "global";
  const user = interaction.options.getUser("usuario", true);
  const motivo = interaction.options.getString("motivo", true).trim();
  const char = await getOrCreateCharacter(user.id, guildId, user.username);
  const quem = char.displayName?.trim() || char.name;

  const r =
    sub === "set"
      ? await adminSetCharacterRyo(
          char.id,
          interaction.options.getInteger("valor", true),
          motivo,
          interaction.user.id,
        )
      : await adminAddCharacterRyo(
          char.id,
          interaction.options.getInteger("delta", true),
          motivo,
          interaction.user.id,
        );

  await interaction.editReply(
    `✅ **${quem}**: ${formatRyo(r.antes)} → **${formatRyo(r.depois)}**.` +
      (r.depois < 0
        ? "\n⚠️ _Saldo negativo: ele não consegue comprar, doar nem sacar até voltar ao positivo._"
        : "") +
      `\nMotivo: ${motivo}`,
  );
}

function resumoLimpeza(obras: number, reformas: number): string {
  const partes: string[] = [];
  if (obras > 0) partes.push(`${obras} obra(s) pendente(s) cancelada(s) e vaga liberada`);
  if (reformas > 0) partes.push(`${reformas} reforma(s) sem objeto encerrada(s)`);
  return partes.length ? `\n_${partes.join("; ")}._` : "";
}

// Fila de obras pela staff. `concluir` NAO tem caminho proprio de conclusao:
// ele antecipa o prazo e deixa o job normal fechar, para nao existirem duas
// rotinas capazes de subir nivel.
async function handleObraAdmin(
  interaction: ChatInputCommandInteraction,
  villageId: ReturnType<typeof normalizeVillageId>,
  sub: string,
  motivo: string,
  actor: string,
  nome: string,
): Promise<void> {
  if (sub === "listar") {
    const [capacidade, fila] = await Promise.all([
      capacityView(villageId),
      activeConstructions(villageId),
    ]);
    await interaction.editReply(
      `🏗️ **${nome}** — Centro nível ${capacidade.centerLevel}` +
        (capacidade.centerStatus === "OK" ? "" : " ⚠️ em reforma") +
        ` • vagas **${capacidade.usadas}/${capacidade.total}**\n` +
        (fila.length
          ? fila
              .map(
                (obra) =>
                  `• ${buildingName(obra.buildingType, obra.buildingKey)}` +
                  (obra.targetLevel ? ` nível ${obra.targetLevel}` : "") +
                  ` — conclui <t:${Math.floor(obra.finishesAt.getTime() / 1000)}:R>`,
              )
              .join("\n")
          : "_Sem obra em andamento._"),
    );
    return;
  }

  const predio = interaction.options.getString("predio", true);
  const obra = (await activeConstructions(villageId)).find((row) => row.buildingKey === predio);
  if (!obra) {
    await interaction.editReply(
      `❌ Não há obra em andamento de **${buildingName(buildingTypeOf(predio), predio)}** em **${nome}**.`,
    );
    return;
  }

  if (sub === "concluir") {
    const r = await forceFinishConstruction(obra.id, motivo, actor);
    await interaction.editReply(
      r.ok
        ? `✅ Obra de **${buildingName(obra.buildingType, obra.buildingKey)}** concluída em **${nome}** (${r.concluidas.length} processada[s]).\nMotivo: ${motivo}`
        : `❌ ${r.error}`,
    );
    return;
  }

  if (sub === "cancelar") {
    const r = await cancelConstruction(obra.id, motivo, actor);
    await interaction.editReply(
      r.ok
        ? `🛑 Obra de **${buildingName(obra.buildingType, obra.buildingKey)}** cancelada em **${nome}**; a vaga voltou.\n_Não há reembolso: o custo já foi consumido._\nMotivo: ${motivo}`
        : `❌ ${r.error}`,
    );
    return;
  }

  await interaction.editReply("Subcomando desconhecido.");
}

async function handleRankSet(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId ?? "global";
  const user = interaction.options.getUser("usuario", true);
  const rank = normalizeNinjaRank(interaction.options.getString("rank", true));
  const motivo = interaction.options.getString("motivo", true).trim();

  const char = await getOrCreateCharacter(user.id, guildId, user.username);
  const before = normalizeNinjaRank(char.ninjaRank);
  if (before === rank) {
    await interaction.editReply(
      `ℹ️ **${char.displayName ?? char.name}** já é **${NINJA_RANK_LABELS[rank]}**.`,
    );
    return;
  }

  const member = await interaction.guild?.members.fetch(user.id).catch(() => null);
  const villageId = villageFromMember(member);

  await prisma.$transaction(async (tx) => {
    await tx.userCharacter.update({ where: { id: char.id }, data: { ninjaRank: rank } });
    // Toda acao administrativa gera auditoria, mesmo sem mover Ryo.
    await recordLedger(tx, {
      type: "ADMIN_ADJUSTMENT",
      villageId,
      charId: char.id,
      actorDiscordId: interaction.user.id,
      reason: motivo,
      meta: { field: "ninjaRank", from: before, to: rank, targetDiscordId: user.id },
    });
  });

  await interaction.editReply(
    `✅ **${char.displayName ?? char.name}**: ${NINJA_RANK_LABELS[before]} → **${NINJA_RANK_LABELS[rank]}**.\nMotivo: ${motivo}`,
  );
}

async function handleVer(interaction: ChatInputCommandInteraction): Promise<void> {
  const villageId = normalizeVillageId(interaction.options.getString("vila", true));
  const village = await getVillage(villageId);
  if (!village) {
    await interaction.editReply(
      `❌ ${VILLAGE_NAMES[villageId]} ainda não existe no banco. Rode \`npm run seed\`.`,
    );
    return;
  }

  const stock = village.stock.length
    ? village.stock
        .map((row) => `• ${getItem(row.itemId)?.name ?? row.name} ×${row.qty}`)
        .join("\n")
        .slice(0, 1024)
    : "_Vazio._";

  const kage = village.kageDiscordId ? `<@${village.kageDiscordId}>` : "_Nenhum (NPC/staff)_";
  const pop = await activePopulation(villageId);

  const embed = new EmbedBuilder()
    .setTitle(`🏯 ${village.name}`)
    .setColor(0x2f3136)
    .addFields(
      { name: "Cofre", value: `💰 ${formatRyo(village.treasuryRyo)}`, inline: true },
      {
        name: "Reservado / livre",
        value: `${village.reservedRyo} / ${Math.max(0, village.treasuryRyo - village.reservedRyo)} Ryō`,
        inline: true,
      },
      { name: "Taxa", value: `${(village.taxRate * 100).toFixed(1).replace(".", ",")}%`, inline: true },
      { name: "Kage", value: kage, inline: true },
      {
        name: "Administração",
        value: village.managedByStaff ? "Staff" : "Kage jogador",
        inline: true,
      },
      {
        name: "Saques",
        value: village.withdrawalsLocked ? "🔒 Bloqueados" : "Liberados",
        inline: true,
      },
      {
        name: "Ninjas ativos (14 dias)",
        value:
          village.populationOverride !== null
            ? `${village.populationOverride} _(override)_`
            : `${pop.ativos} • fator ${pop.factor.toFixed(2)}`,
        inline: true,
      },
      { name: "Mansão", value: `<#${VILLAGE_MANSIONS[villageId]}>`, inline: true },
      { name: "Estoque central", value: stock },
    );

  await interaction.editReply({ embeds: [embed] });
}
