// Bloco extra (Components V2) de uma instância de MESTRE_ESTILO, encaixado
// dentro do MESMO container de /missoes minhas (ver src/commands/missoes.ts)
// — não é mais um cartão à parte, pra manter todas as missões no mesmo
// container e no mesmo estilo visual.
import { prisma } from "../db/client.js";
import { getItem } from "../data/items.js";
import type { MissionDef } from "../data/types.js";
import { dataOf, type MestreEstiloState } from "../services/missions/mestre-estilo.js";
import { getInventoryQty } from "../services/characters/inventory.js";
import { itemLabel, listBlock, ryo, type ContainerChild } from "./economy-components-v2.js";
import { emoji } from "./economy-emojis.js";

// So' a etapa GATHER precisa de bloco extra: o checklist ao vivo de ryo/itens
// que falta. As outras etapas ja' ficam claras pelos objetivos genericos que
// toda missao mostra (aceitar_convite / reunir_recursos / vencer_mestre).
export async function mestreEstiloExtraBlock(
  def: MissionDef,
  state: MestreEstiloState,
  charId: string,
): Promise<ContainerChild[]> {
  if ((state.stage ?? "INTRO") !== "GATHER") return [];

  const data = dataOf(def);
  const char = await prisma.userCharacter.findUnique({ where: { id: charId }, select: { ryo: true } });
  const ryoAtual = char?.ryo ?? 0;
  const ryoOk = ryoAtual >= data.costRyo;

  const checklist: string[] = [
    `${ryoOk ? emoji("sucesso") : emoji("erro")} ${ryo(data.costRyo)}${ryoOk ? "" : ` (você tem ${ryoAtual})`}`,
  ];
  for (const it of data.costItems) {
    const qty = await getInventoryQty(prisma, charId, it.itemId);
    const ok = qty >= it.qty;
    const name = getItem(it.itemId)?.name ?? it.itemId;
    checklist.push(`${ok ? emoji("sucesso") : emoji("erro")} ${itemLabel(it.itemId, name, it.qty)}${ok ? "" : ` (você tem ${qty})`}`);
  }

  return [listBlock("Precisa trazer", checklist, "Nada pedido.")];
}
