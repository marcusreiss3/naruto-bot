import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type AnySelectMenuInteraction,
  type ButtonInteraction,
} from "discord.js";
import { prisma } from "../db/client.js";
import { CENTER, SECTORS, isSectorKey } from "../data/sectors.js";
import { VILLAGE_NAMES, type VillageId } from "../data/villages.js";
import { EconomyError } from "../services/economy/errors.js";
import {
  activeConstructions,
  buildPreview,
  buildingName,
  capacityView,
  startConstruction,
} from "../services/economy/constructions.js";
import { payMaintenance, pendingMaintenance } from "../services/economy/maintenance.js";
import { productionPreview } from "../services/economy/production.js";
import { startVillageSchedulers } from "../services/economy/village-scheduler.js";

// Aba `Obras` do painel /vila (secoes 6.1 a 6.4 e 8).
//
// Regras estruturais, checadas a cada clique:
//
//   1. Gate de Kage. Igual as outras abas: `podeKage` = ser o Kage E estar na
//      mansao. Cada handler recheca — customId forjado nao passa.
//   2. Nunca digitar nivel nem valor. O jogador escolhe o PREDIO num select; o
//      nivel-alvo, o custo e o fator sao calculados pelo servidor e mostrados
//      numa tela de confirmacao. Nao existe modal de numero aqui.
//   3. Nada de valor confiavel no customId: so' a chave do predio e o id da
//      cobranca de reforma. Custo, vaga e fator sao relidos na transacao.

export interface ObrasViewer {
  villageId: VillageId;
  charId: string;
  ryo: number;
  podeKage: boolean;
}

export interface ObrasPainel {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[];
}

const cid = (...partes: (string | undefined)[]) =>
  ["vila", "obra", ...partes.filter(Boolean)].join(":");

function assertKage(viewer: ObrasViewer): void {
  if (!viewer.podeKage) {
    throw new EconomyError(
      `Só o Kage de ${VILLAGE_NAMES[viewer.villageId]}, dentro da mansão, pode tocar as obras.`,
    );
  }
}

// ---------------- Tela da aba ----------------

export async function renderObras(
  viewer: ObrasViewer,
  navegacao: ActionRowBuilder<ButtonBuilder>[],
  aviso?: string,
): Promise<ObrasPainel> {
  const [capacidade, fila, setores, reformas, producao] = await Promise.all([
    capacityView(viewer.villageId),
    activeConstructions(viewer.villageId),
    prisma.villageUpgrade.findMany({
      where: { villageId: viewer.villageId },
      orderBy: { sectorKey: "asc" },
    }),
    pendingMaintenance(viewer.villageId),
    productionPreview(viewer.villageId),
  ]);

  const porChave = new Map(setores.map((row) => [row.sectorKey, row]));
  const embed = new EmbedBuilder()
    .setColor(0x4f7fc9)
    .setTitle(`🏗️ Obras — ${VILLAGE_NAMES[viewer.villageId]}`)
    .setDescription(
      `${CENTER.emoji} **${CENTER.name}** — nível **${capacidade.centerLevel}**` +
        (capacidade.centerStatus === "OK" ? "" : " ⚠️ _em reforma_") +
        `\nVagas de obra: **${capacidade.usadas}/${capacidade.total}**` +
        (capacidade.limitadaPorReforma
          ? "\n_O Centro está sem reforma: a vila só toca uma obra por vez e perdeu o desconto._"
          : ""),
    );

  if (aviso) embed.addFields({ name: "Aviso", value: aviso.slice(0, 1024) });

  embed.addFields({
    name: "Setores",
    value: SECTORS.map((def) => {
      const linha = porChave.get(def.key);
      const nivel = linha?.level ?? 0;
      const obra = linha?.constructingTo ? ` 🏗️ → ${linha.constructingTo}` : "";
      const reforma = linha && linha.status !== "OK" ? " ⚠️" : "";
      return `${def.emoji} **${def.name}** — nível ${nivel}/5${obra}${reforma}`;
    }).join("\n"),
  });

  embed.addFields({
    name: "Fila",
    value: fila.length
      ? fila
          .map(
            (obra) =>
              `• ${buildingName(obra.buildingType, obra.buildingKey)}` +
              (obra.targetLevel ? ` nível ${obra.targetLevel}` : "") +
              ` — conclui <t:${Math.floor(obra.finishesAt.getTime() / 1000)}:R>`,
          )
          .join("\n")
      : "_Nenhuma obra em andamento._",
  });

  const produtivos = producao.filter((linha) => linha.itens.length);
  embed.addFields({
    name: "Produção diária",
    value: produtivos.length
      ? produtivos
          .map(
            (linha) =>
              `• **${linha.name}**: ${linha.itens.map((i) => `${i.qty} ${i.name}`).join(", ")}` +
              (linha.jaRodouHoje ? " ✅" : ""),
          )
          .join("\n")
          .slice(0, 1024)
      : "_Nenhum setor produzindo. Evolua um setor para o nível 1._",
  });

  if (reformas.length) {
    embed.addFields({
      name: "⚠️ Reformas pendentes",
      value: reformas
        .map(
          (r) =>
            `• **${r.name}** — ${r.ryoDue} Ryō` +
            (r.itens.length ? ` + ${r.itens.map((i) => `${i.qty} ${i.name}`).join(", ")}` : "") +
            ` • ${r.status === "OVERDUE" ? "**atrasada**" : `vence <t:${Math.floor(r.dueAt.getTime() / 1000)}:R>`}`,
        )
        .join("\n")
        .slice(0, 1024),
    });
  }

  const componentes: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [...navegacao];
  if (!viewer.podeKage) return { embeds: [embed], components: componentes };

  componentes.push(
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(cid("pick"))
        .setPlaceholder("Evoluir um prédio")
        .addOptions([
          {
            label: `${CENTER.name} (nível ${capacidade.centerLevel})`.slice(0, 100),
            value: `CENTER:${CENTER.buildingKey}`,
            emoji: CENTER.emoji,
            description: "Mais obras simultâneas e desconto na reforma",
          },
          ...SECTORS.map((def) => ({
            label: `${def.name} (nível ${porChave.get(def.key)?.level ?? 0})`.slice(0, 100),
            value: `SECTOR:${def.key}`,
            emoji: def.emoji,
            description: def.description.slice(0, 100),
          })),
        ]),
    ),
  );

  if (reformas.length) {
    componentes.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(cid("reformaPick"))
          .setPlaceholder("Pagar uma reforma")
          .addOptions(
            reformas.slice(0, 25).map((r) => ({
              label: `${r.name} — ${r.ryoDue} Ryō`.slice(0, 100),
              value: r.id,
              description: (r.status === "OVERDUE" ? "atrasada • " : "") +
                (r.itens.map((i) => `${i.qty} ${i.name}`).join(", ") || "sem material"),
            })),
          ),
      ),
    );
  }

  return { embeds: [embed], components: componentes };
}

// ---------------- Tela de confirmação ----------------

async function renderConfirmacao(
  viewer: ObrasViewer,
  buildingType: "SECTOR" | "CENTER",
  buildingKey: string,
): Promise<ObrasPainel> {
  const preview = await buildPreview(viewer.villageId, buildingType, buildingKey);

  const embed = new EmbedBuilder()
    .setColor(preview.motivoBloqueio ? 0x777777 : 0x2f7f4f)
    .setTitle(`🏗️ ${preview.name} — nível ${preview.levelAtual} → ${preview.targetLevel ?? "—"}`)
    .setFooter({
      text: "O custo e o fator de população são congelados no instante da confirmação.",
    });

  if (!preview.custo) {
    embed.setDescription(preview.motivoBloqueio ?? "Sem próximo nível.");
  } else {
    embed
      .setDescription(
        `Custo: **${preview.custo.ryo} Ryō**, ` +
          preview.custo.itens.map((i) => `${i.qty} ${i.name}`).join(", ") +
          `\nFator de população: **${preview.factor.toFixed(2)}** (${preview.ativos} ativos)` +
          `\nConclusão prevista: <t:${Math.floor((preview.conclusaoPrevista?.getTime() ?? 0) / 1000)}:f>`,
      )
      .addFields(
        {
          name: "Cofre disponível",
          value: `${preview.cofreDisponivel} Ryō ${preview.cofreDisponivel >= preview.custo.ryo ? "✅" : "❌"}`,
          inline: true,
        },
        {
          name: "Vagas de obra",
          value: `${preview.capacidade.usadas}/${preview.capacidade.total} ${preview.capacidade.usadas < preview.capacidade.total ? "✅" : "❌"}`,
          inline: true,
        },
        {
          name: "Estoque central",
          value: preview.estoque
            .map((row) => `${row.name}: ${row.tem}/${row.precisa} ${row.tem >= row.precisa ? "✅" : "❌"}`)
            .join("\n"),
        },
      );
    if (preview.motivoBloqueio) {
      embed.addFields({ name: "Bloqueado", value: `❌ ${preview.motivoBloqueio}` });
    }
  }

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(cid("go", buildingType, buildingKey))
          .setLabel("Confirmar obra")
          .setEmoji("✅")
          .setStyle(ButtonStyle.Success)
          .setDisabled(Boolean(preview.motivoBloqueio) || !preview.custo),
        new ButtonBuilder()
          .setCustomId(cid("menu"))
          .setLabel("Cancelar")
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

// ---------------- Handlers ----------------

export async function handleObrasButton(
  interaction: ButtonInteraction,
  viewer: ObrasViewer,
  renderAba: (aviso?: string) => Promise<ObrasPainel>,
): Promise<boolean> {
  const partes = interaction.customId.split(":");
  if (partes[0] !== "vila" || partes[1] !== "obra") return false;
  const acao = partes[2] ?? "";
  assertKage(viewer);

  if (acao === "menu") {
    await interaction.deferUpdate();
    await interaction.editReply(await renderAba());
    return true;
  }

  if (acao === "go") {
    const buildingType = partes[3] === "CENTER" ? "CENTER" : "SECTOR";
    const buildingKey = partes[4] ?? "";
    if (buildingType === "SECTOR" && !isSectorKey(buildingKey)) {
      throw new EconomyError("Setor desconhecido.");
    }
    await interaction.deferUpdate();
    const r = await startConstruction(
      viewer.villageId,
      buildingType,
      buildingKey,
      interaction.user.id,
    );
    if (r.ok) {
      // Rearma os relogios: sem isso, a primeira obra de uma sessao ficaria sem
      // timer ate o proximo boot.
      await startVillageSchedulers(interaction.client).catch(() => undefined);
    }
    await interaction.editReply(
      await renderAba(
        r.ok
          ? `🏗️ **${r.nome}** começou a evoluir para o nível ${r.targetLevel}. ` +
            `Custou ${r.custo.ryo} Ryō e ${r.custo.itens.map((i) => `${i.qty} ${i.name}`).join(", ")}. ` +
            `Conclui <t:${Math.floor(r.obra.finishesAt.getTime() / 1000)}:R>.`
          : `❌ ${r.error}`,
      ),
    );
    return true;
  }

  await interaction.deferUpdate();
  await interaction.editReply(await renderAba());
  return true;
}

export async function handleObrasSelect(
  interaction: AnySelectMenuInteraction,
  viewer: ObrasViewer,
  renderAba: (aviso?: string) => Promise<ObrasPainel>,
): Promise<boolean> {
  const partes = interaction.customId.split(":");
  if (partes[0] !== "vila" || partes[1] !== "obra" || !interaction.isStringSelectMenu()) return false;
  const acao = partes[2] ?? "";
  assertKage(viewer);
  const escolha = interaction.values[0]!;

  if (acao === "pick") {
    const [tipo, chave] = escolha.split(":");
    const buildingType = tipo === "CENTER" ? "CENTER" : "SECTOR";
    if (buildingType === "SECTOR" && !isSectorKey(chave)) {
      throw new EconomyError("Setor desconhecido.");
    }
    await interaction.deferUpdate();
    await interaction.editReply(await renderConfirmacao(viewer, buildingType, chave ?? ""));
    return true;
  }

  if (acao === "reformaPick") {
    await interaction.deferUpdate();
    const r = await payMaintenance(escolha, interaction.user.id);
    await interaction.editReply(
      await renderAba(
        r.ok
          ? `🔧 Reforma paga: **${r.ryoPago} Ryō**` +
            (r.itens.length ? ` + ${r.itens.map((i) => `${i.qty} ${i.name}`).join(", ")}` : "") +
            (r.reativado ? ". O prédio voltou a funcionar." : ".")
          : `❌ ${r.error}`,
      ),
    );
    return true;
  }

  await interaction.deferUpdate();
  await interaction.editReply(await renderAba());
  return true;
}
