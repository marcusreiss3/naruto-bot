// Componentes V2 do fluxo de aprendizado de estilo de luta
// (services/missions/mestre-estilo.ts): o bloco extra dentro de /missoes
// minhas E os cartõezinhos de sistema (convite, aceite, recusa, início do
// combate) que substituem as mensagens de texto cru mandadas no canal.
import type { ActionRowBuilder, MessageActionRowComponentBuilder } from "discord.js";
import { prisma } from "../db/client.js";
import { getItem } from "../data/items.js";
import type { MissionDef } from "../data/types.js";
import { dataOf, type MestreEstiloState } from "../services/missions/mestre-estilo-types.js";
import { getInventoryQty } from "../services/characters/inventory.js";
import {
  divider,
  economyContainer,
  itemLabel,
  listBlock,
  noticeBlock,
  ryo,
  text,
  titleBlock,
  type ContainerChild,
  type TopLevel,
} from "./economy-components-v2.js";
import { emoji } from "./economy-emojis.js";

type ButtonRow = ActionRowBuilder<MessageActionRowComponentBuilder>;

// Linhas ✅/❌ de ryo + itens contra o inventário AO VIVO — usado tanto no
// checklist de /missoes quanto nos cartões de convite/lembrete abaixo, pra
// nunca haver dois jeitos diferentes de calcular a mesma coisa.
async function costLines(def: MissionDef, charId: string): Promise<string[]> {
  const data = dataOf(def);
  const char = await prisma.userCharacter.findUnique({ where: { id: charId }, select: { ryo: true } });
  const ryoAtual = char?.ryo ?? 0;
  const ryoOk = ryoAtual >= data.costRyo;

  const lines: string[] = [
    `${ryoOk ? emoji("sucesso") : emoji("erro")} ${ryo(data.costRyo)}${ryoOk ? "" : ` (você tem ${ryoAtual})`}`,
  ];
  for (const it of data.costItems) {
    const qty = await getInventoryQty(prisma, charId, it.itemId);
    const ok = qty >= it.qty;
    const name = getItem(it.itemId)?.name ?? it.itemId;
    lines.push(`${ok ? emoji("sucesso") : emoji("erro")} ${itemLabel(it.itemId, name, it.qty)}${ok ? "" : ` (você tem ${qty})`}`);
  }
  return lines;
}

// So' a etapa GATHER precisa de bloco extra em /missoes: o checklist ao vivo
// de ryo/itens que falta. As outras etapas ja' ficam claras pelos objetivos
// genericos que toda missao mostra (aceitar_convite / reunir_recursos /
// vencer_mestre).
export async function mestreEstiloExtraBlock(
  def: MissionDef,
  state: MestreEstiloState,
  charId: string,
): Promise<ContainerChild[]> {
  if ((state.stage ?? "INTRO") !== "GATHER") return [];
  return [listBlock("Precisa trazer", await costLines(def, charId), "Nada pedido.")];
}

// ---------------- Cartões de sistema no canal (curtos, sem texto de IA) ----------------

function inviteCardContent(masterName: string, styleLabel: string): ContainerChild[] {
  return [
    titleBlock("convite", `Convite de ${masterName}`, styleLabel),
    text(`${masterName} topa te ensinar — mas só se você provar comprometimento primeiro.`),
  ];
}

// Convite formal: titulo + 1 linha + os 2 botoes, sem nada mais — cabe numa
// tela sem rolar.
export function inviteCard(masterName: string, styleLabel: string, buttons: ButtonRow): TopLevel[] {
  return [economyContainer("vila", [...inviteCardContent(masterName, styleLabel), buttons])];
}

// Mesmo cartao do convite, mas sem os botoes — usado pra "fechar" a mensagem
// depois que o jogador ja clicou (Components V2 nao aceita `components: []`
// vazio, entao a edicao troca o botao por nada em vez de zerar tudo).
export function closedInviteCard(masterName: string, styleLabel: string): TopLevel[] {
  return [economyContainer("vila", inviteCardContent(masterName, styleLabel))];
}

export function declinedCard(masterName: string): TopLevel[] {
  return [economyContainer("vila", [noticeBlock("aviso", `Você recusou o convite de **${masterName}**. Volte a falar com ele quando mudar de ideia.`)])];
}

// Aceite: mesmo checklist do /missoes, mas anunciado na hora — o jogador nao
// devia precisar rodar outro comando so' pra saber o que trazer.
export async function acceptedCard(masterName: string, def: MissionDef, charId: string): Promise<TopLevel[]> {
  return [
    economyContainer("vila", [
      titleBlock("objetivo", `${masterName} aceitou te treinar`, "Traga isto e use /interagir de novo"),
      divider(),
      listBlock(null, await costLines(def, charId), "Nada pedido."),
    ]),
  ];
}

// Ainda falta algo no GATHER: mesmo checklist, encaixado logo depois da fala
// do mestre (que já cobrou em personagem).
export async function stillMissingCard(def: MissionDef, charId: string): Promise<TopLevel[]> {
  return [economyContainer("vila", [listBlock("Ainda falta", await costLines(def, charId), "Nada pedido.")])];
}

export function combatStartCard(masterName: string): TopLevel[] {
  return [economyContainer("vila", [text(`${emoji("combate")} Combate final contra **${masterName}** iniciado! Use \`/mapa\`.`)])];
}

export function combatLostCard(): TopLevel[] {
  return [economyContainer("vila", [noticeBlock("erro", "Você perdeu o combate final. Volte a falar com o mestre quando quiser tentar de novo.")])];
}
