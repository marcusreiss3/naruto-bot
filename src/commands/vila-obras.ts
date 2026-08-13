import {
  ButtonStyle,
  StringSelectMenuBuilder,
  type AnySelectMenuInteraction,
  type ButtonInteraction,
} from "discord.js";
import {
  button,
  buttonRow,
  divider,
  economyContainer,
  factsBlock,
  feedbackBlock,
  listBlock,
  noticeBlock,
  ryo,
  selectRow,
  text,
  titleBlock,
  v2Edit,
  type ContainerChild,
  type TopLevel,
} from "../ui/economy-components-v2.js";
import { emoji } from "../ui/economy-emojis.js";
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

// Painel V2: árvore de componentes de topo, sem embeds nem content.
export type ObrasPainel = TopLevel[];

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
  navegacao: ContainerChild[],
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

  const filhos: ContainerChild[] = [
    titleBlock("obras", `Obras de ${VILLAGE_NAMES[viewer.villageId]}`),
  ];
  if (aviso) filhos.push(feedbackBlock(aviso));

  filhos.push(
    factsBlock([
      {
        label: CENTER.name,
        value: `nível ${capacidade.centerLevel}${capacidade.centerStatus === "OK" ? "" : " • em reforma"}`,
      },
      { label: "Vagas de obra", value: `${capacidade.usadas}/${capacidade.total}` },
    ]),
  );
  if (capacidade.limitadaPorReforma) {
    filhos.push(
      noticeBlock(
        "aviso",
        "O Centro está sem reforma: a vila só toca uma obra por vez e perdeu o desconto.",
      ),
    );
  }

  filhos.push(
    divider(),
    listBlock(
      "Em andamento",
      fila.map(
        (obra) =>
          `${buildingName(obra.buildingType, obra.buildingKey)}` +
          (obra.targetLevel ? ` → nível ${obra.targetLevel}` : "") +
          ` — conclui <t:${Math.floor(obra.finishesAt.getTime() / 1000)}:R>`,
      ),
      "Nenhuma obra em andamento.",
    ),
    divider(),
    listBlock(
      "Setores",
      SECTORS.map((def) => {
        const linha = porChave.get(def.key);
        const nivel = linha?.level ?? 0;
        const obra = linha?.constructingTo ? ` ${emoji("obras")} → ${linha.constructingTo}` : "";
        const reforma = linha && linha.status !== "OK" ? ` ${emoji("aviso")} sem reforma` : "";
        return `${def.emoji} **${def.name}** — nível ${nivel}/5${obra}${reforma}`;
      }),
      "—",
    ),
  );

  const produtivos = producao.filter((linha) => linha.itens.length);
  filhos.push(
    divider(),
    listBlock(
      `${emoji("producao")} Produção diária`,
      produtivos.map(
        (linha) =>
          `**${linha.name}**: ${linha.itens.map((i) => `${i.qty} ${i.name}`).join(", ")}` +
          (linha.jaRodouHoje ? ` ${emoji("sucesso")} já rodou hoje` : ""),
      ),
      "Nenhum setor produzindo. Evolua um setor para o nível 1.",
    ),
  );

  if (reformas.length) {
    filhos.push(
      divider(),
      listBlock(
        `${emoji("manutencao")} Reformas pendentes`,
        reformas.map(
          (r) =>
            `**${r.name}** — ${ryo(`${r.ryoDue} Ryō`)}` +
            (r.itens.length ? ` + ${r.itens.map((i) => `${i.qty} ${i.name}`).join(", ")}` : "") +
            ` • ${r.status === "OVERDUE" ? "**atrasada**" : `vence <t:${Math.floor(r.dueAt.getTime() / 1000)}:R>`}`,
        ),
        "—",
      ),
    );
  }

  filhos.push(divider(), ...navegacao);
  // Jogador comum lê a aba inteira, mas não recebe controle nenhum.
  if (!viewer.podeKage) return [economyContainer("obras", filhos)];

  // Sem vaga livre: o select some e o motivo aparece em texto. A etapa 08 proíbe
  // botão desabilitado sem explicação — e o serviço revalida de qualquer jeito.
  if (capacidade.usadas >= capacidade.total) {
    filhos.push(
      noticeBlock(
        "bloqueio",
        `Todas as ${capacidade.total} vaga(s) de obra estão ocupadas. Aguarde uma obra concluir para iniciar outra.`,
      ),
    );
  } else {
    filhos.push(
      selectRow(
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
  }

  if (reformas.length) {
    filhos.push(
      selectRow(
        new StringSelectMenuBuilder()
          .setCustomId(cid("reformaPick"))
          .setPlaceholder("Pagar uma reforma")
          .addOptions(
            reformas.slice(0, 25).map((r) => ({
              label: `${r.name} — ${r.ryoDue} Ryō`.slice(0, 100),
              value: r.id,
              description:
                (r.status === "OVERDUE" ? "atrasada • " : "") +
                (r.itens.map((i) => `${i.qty} ${i.name}`).join(", ") || "sem material"),
            })),
          ),
      ),
    );
  }

  return [economyContainer("obras", filhos)];
}

// ---------------- Tela de confirmação ----------------

async function renderConfirmacao(
  viewer: ObrasViewer,
  buildingType: "SECTOR" | "CENTER",
  buildingKey: string,
): Promise<ObrasPainel> {
  const preview = await buildPreview(viewer.villageId, buildingType, buildingKey);
  const ok = (cumpre: boolean) => (cumpre ? emoji("sucesso") : emoji("erro"));

  const filhos: ContainerChild[] = [
    titleBlock(
      "obras",
      `${preview.name} — nível ${preview.levelAtual} → ${preview.targetLevel ?? "—"}`,
    ),
  ];

  if (!preview.custo) {
    filhos.push(noticeBlock("bloqueio", preview.motivoBloqueio ?? "Sem próximo nível."));
  } else {
    filhos.push(
      factsBlock([
        { label: "Custo", value: ryo(`${preview.custo.ryo} Ryō`) },
        { label: "Fator de população", value: `${preview.factor.toFixed(2)} (${preview.ativos} ativos)` },
      ]),
      text(
        `**Materiais:** ${preview.custo.itens.map((i) => `${i.qty} ${i.name}`).join(", ")}\n` +
          `**Conclusão prevista:** <t:${Math.floor((preview.conclusaoPrevista?.getTime() ?? 0) / 1000)}:f>`,
      ),
      divider(),
      // Cada requisito com o próprio veredito: o Kage vê o que falta antes de
      // clicar, não depois do erro.
      listBlock(
        "Requisitos",
        [
          `${ok(preview.cofreDisponivel >= preview.custo.ryo)} Cofre disponível: ${preview.cofreDisponivel}/${preview.custo.ryo} Ryō`,
          `${ok(preview.capacidade.usadas < preview.capacidade.total)} Vagas de obra: ${preview.capacidade.usadas}/${preview.capacidade.total}`,
          ...preview.estoque.map(
            (row) => `${ok(row.tem >= row.precisa)} ${row.name}: ${row.tem}/${row.precisa}`,
          ),
        ],
        "—",
      ),
    );
    if (preview.motivoBloqueio) filhos.push(noticeBlock("bloqueio", preview.motivoBloqueio));
  }

  filhos.push(
    divider(),
    buttonRow(
      button({
        id: cid("go", buildingType, buildingKey),
        label: "Confirmar obra",
        style: ButtonStyle.Success,
        disabled: Boolean(preview.motivoBloqueio) || !preview.custo,
      }),
      button({ id: cid("menu"), label: "Cancelar" }),
    ),
    text("-# O custo e o fator de população são congelados no instante da confirmação."),
  );

  return [economyContainer(preview.motivoBloqueio ? "aviso" : "obras", filhos)];
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
    await interaction.editReply(v2Edit(await renderAba()));
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
      v2Edit(
        await renderAba(
          r.ok
            ? `**${r.nome}** começou a evoluir para o nível ${r.targetLevel}. ` +
              `Custou ${r.custo.ryo} Ryō e ${r.custo.itens.map((i) => `${i.qty} ${i.name}`).join(", ")}. ` +
              `Conclui <t:${Math.floor(r.obra.finishesAt.getTime() / 1000)}:R>.`
            : `❌ ${r.error}`,
        ),
      ),
    );
    return true;
  }

  await interaction.deferUpdate();
  await interaction.editReply(v2Edit(await renderAba()));
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
    await interaction.editReply(v2Edit(await renderConfirmacao(viewer, buildingType, chave ?? "")));
    return true;
  }

  if (acao === "reformaPick") {
    await interaction.deferUpdate();
    const r = await payMaintenance(escolha, interaction.user.id);
    await interaction.editReply(
      v2Edit(
        await renderAba(
          r.ok
            ? `Reforma paga: **${r.ryoPago} Ryō**` +
              (r.itens.length ? ` + ${r.itens.map((i) => `${i.qty} ${i.name}`).join(", ")}` : "") +
              (r.reativado ? ". O prédio voltou a funcionar." : ".")
            : `❌ ${r.error}`,
        ),
      ),
    );
    return true;
  }

  await interaction.deferUpdate();
  await interaction.editReply(v2Edit(await renderAba()));
  return true;
}
