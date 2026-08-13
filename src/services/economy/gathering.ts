import { prisma } from "../../db/client.js";
import { ECONOMY } from "../../config/balance.js";
import { getItem, isRareResource } from "../../data/items.js";
import { SECTORS } from "../../data/sectors.js";
import { bonusUnits, distributeBonus, sectorGatherBonus } from "./sector-math.js";
import {
  areaForChannel,
  GATHER_ACTION_LABELS,
  GATHER_RARE_BY_ACTION,
  type GatherAction,
  type GatherAreaDef,
} from "../../data/gathering.js";
import { addInventoryItem } from "../characters/inventory.js";
import { EconomyError, runEconomy } from "./errors.js";
import { activeOrderFor, closeFinishedOrders, deliverToOrder } from "./collection-orders.js";

export interface GatherLoot {
  itemId: string;
  qty: number;
}

// Fonte de aleatoriedade injetavel: os testes passam uma sequencia fixa e
// conferem exatamente quais itens saem. Nunca chamar Math.random direto no
// meio da regra.
export type Rng = () => number;

const defaultRng: Rng = Math.random;

function pick<T>(list: readonly T[], rng: Rng): T {
  return list[Math.floor(rng() * list.length)] ?? list[0]!;
}

function intBetween(min: number, max: number, rng: Rng): number {
  return min + Math.floor(rng() * (max - min + 1));
}

// Caca e pesca tem forma propria: 2-5 do alvo principal e 0-2 do secundario.
// As demais acoes distribuem 3-7 unidades entre os recursos da area.
//
// A ORDEM das chamadas de rng() e' contrato com os testes:
//   caca/pesca: [qtd principal] [qtd secundaria] [raro?] [bonus de setor?]
//   demais:     [total] [um sorteio por unidade] [raro?] [bonus de setor?]
//
// O dado do bonus de setor e' chamado DEPOIS do dado do raro e SOMENTE quando
// a vila do ninja tem bonus (`bonus > 0`). Sem setor evoluido, a sequencia e'
// exatamente a de antes da etapa 06.
export function rollGathering(
  area: GatherAreaDef,
  action: GatherAction,
  rng: Rng = defaultRng,
  bonus: SectorBonus = { fator: 0 },
): GatherLoot[] {
  const pool = area.pools[action];
  if (!pool?.length) return [];

  const loot = new Map<string, number>();
  const add = (itemId: string, qty: number) => {
    if (qty <= 0) return;
    loot.set(itemId, (loot.get(itemId) ?? 0) + qty);
  };

  if (action === "CACAR" || action === "PESCAR") {
    const [principal, secundario] = pool;
    add(principal!, intBetween(ECONOMY.huntMin, ECONOMY.huntMax, rng));
    const extra = intBetween(0, ECONOMY.huntSecondaryMax, rng);
    if (secundario) add(secundario, extra);
    else rng(); // mantem a sequencia estavel mesmo sem secundario
  } else {
    const total = intBetween(ECONOMY.gatherMin, ECONOMY.gatherMax, rng);
    for (let i = 0; i < total; i += 1) add(pick(pool, rng), 1);
  }

  // Raro: 5% fixo, exatamente 1 unidade, sem bonus de nivel ou de obra.
  // Minerio Raro so' de mineracao, Madeira Reforcada so' de coleta natural.
  const rare = GATHER_RARE_BY_ACTION[action];
  if (rare && rng() < ECONOMY.rareResourceChance) add(rare, 1);

  const bruto: GatherLoot[] = [...loot.entries()].map(([itemId, qty]) => ({ itemId, qty }));
  if (bonus.fator <= 0) return bruto;

  // Bonus do setor da vila: SO' recurso comum e, nos Poços, so' Água Limpa.
  // A trava contra raro esta em dois lugares — o filtro aqui e o filtro dentro
  // de distributeBonus — porque essa e' a regra que a secao 6.3 mais protege.
  const elegivel = (itemId: string) =>
    !isRareResource(itemId) && (!bonus.onlyItemId || itemId === bonus.onlyItemId);
  const totalComum = bruto
    .filter((entry) => elegivel(entry.itemId))
    .reduce((soma, entry) => soma + entry.qty, 0);
  const extras = bonusUnits(totalComum, bonus.fator, rng());
  return distributeBonus(bruto, extras, elegivel);
}

export interface SectorBonus {
  fator: number;
  // Poços bonificam apenas Água Limpa, mesmo colhendo outra coisa junto.
  onlyItemId?: string;
}

// Bonus que a vila do ninja concede a esta acao. Setor em NECESSITA_REFORMA
// nao bonifica nada (secao 6.4); vila nula tambem nao.
export async function sectorBonusFor(
  villageId: string | null | undefined,
  action: GatherAction,
): Promise<SectorBonus> {
  if (!villageId) return { fator: 0 };
  const def = SECTORS.find((sector) => sector.bonusAction === action);
  if (!def) return { fator: 0 };
  const linha = await prisma.villageUpgrade.findUnique({
    where: { villageId_sectorKey: { villageId, sectorKey: def.key } },
    select: { level: true, status: true },
  });
  if (!linha) return { fator: 0 };
  return {
    fator: sectorGatherBonus(linha.level, linha.status),
    onlyItemId: def.bonusOnlyItemId,
  };
}

// ---------------- Cooldown ----------------

export interface CooldownClaim {
  ok: boolean;
  retryAfterMs: number;
}

// Reserva a acao de forma atomica. A condicao `availableAt <= agora` vai no
// WHERE do UPDATE: dois cliques simultaneos nao conseguem passar os dois, entao
// nao existe recompensa dobrada.
export async function claimGatherCooldown(
  charId: string,
  action: GatherAction,
  now = new Date(),
): Promise<CooldownClaim> {
  const proximo = new Date(now.getTime() + ECONOMY.gatherCooldownMs);

  const { count } = await prisma.gatheringCooldown.updateMany({
    where: { charId, action, availableAt: { lte: now } },
    data: { availableAt: proximo },
  });
  if (count === 1) return { ok: true, retryAfterMs: 0 };

  const existente = await prisma.gatheringCooldown.findUnique({
    where: { charId_action: { charId, action } },
    select: { availableAt: true },
  });
  if (existente) {
    return { ok: false, retryAfterMs: Math.max(0, existente.availableAt.getTime() - now.getTime()) };
  }

  // Primeira vez do personagem nessa acao. Se dois cliques chegarem juntos, a
  // unicidade (charId, action) derruba o segundo — que entao esta em cooldown.
  try {
    await prisma.gatheringCooldown.create({ data: { charId, action, availableAt: proximo } });
    return { ok: true, retryAfterMs: 0 };
  } catch {
    return { ok: false, retryAfterMs: ECONOMY.gatherCooldownMs };
  }
}

// ---------------- Acao completa ----------------

export interface GatherResult {
  area: GatherAreaDef;
  action: GatherAction;
  loot: GatherLoot[];
  // Preenchido quando o ninja tem ordem ativa e colheu o recurso-alvo.
  delivery?: { itemId: string; entregue: number; pago: number };
}

export async function performGathering(
  charId: string,
  channelId: string,
  action: GatherAction,
  options: { rng?: Rng; villageId?: string | null; now?: Date } = {},
): Promise<{ ok: true; result: GatherResult } | { ok: false; error: string }> {
  const area = areaForChannel(channelId);
  if (!area) {
    return { ok: false, error: "Aqui não há o que colher. Use os canais de exploração." };
  }
  if (!area.pools[action]?.length) {
    return {
      ok: false,
      error: `**${GATHER_ACTION_LABELS[action]}** não é possível em **${area.name}**.`,
    };
  }

  const now = options.now ?? new Date();
  const claim = await claimGatherCooldown(charId, action, now);
  if (!claim.ok) {
    const minutos = Math.ceil(claim.retryAfterMs / 60_000);
    return {
      ok: false,
      error: `Você ainda está se recuperando. Tente ${GATHER_ACTION_LABELS[action].toLowerCase()} de novo em **${minutos} min**.`,
    };
  }

  // Bonus da vila DO NINJA, independente de onde ele esta coletando (secao 6.3).
  const bonus = await sectorBonusFor(options.villageId, action);
  const loot = rollGathering(area, action, options.rng, bonus);
  // Ordem ativa desvia SO' o recurso-alvo. Raro e recurso fora do alvo seguem
  // para o inventario pessoal — deliverToOrder recusa raro por conta propria.
  const order = await activeOrderFor(charId, now);

  return runEconomy(async () => {
    let delivery: GatherResult["delivery"];

    await prisma.$transaction(async (tx) => {
      for (const entry of loot) {
        let paraInventario = entry.qty;

        if (order && entry.itemId === order.itemId) {
          const entregue = await deliverToOrder(tx, charId, order.id, entry.itemId, entry.qty, now);
          paraInventario = entregue.sobrouParaInventario;
          if (entregue.entregue > 0) {
            delivery = {
              itemId: entry.itemId,
              entregue: entregue.entregue,
              pago: entregue.pago,
            };
          }
        }

        if (paraInventario > 0) {
          await addInventoryItem(tx, charId, entry.itemId, paraInventario);
        }
      }
      // Trilha da secao 4.2: canal, vila, acao, itens e horario. Nao e'
      // livro-caixa — coleta nao move Ryo nem acumulador tributavel.
      await tx.economyActionLog.create({
        data: {
          charId,
          action,
          channelId,
          villageId: options.villageId ?? null,
          detailsJson: JSON.stringify({ areaId: area.id, loot, delivery: delivery ?? null }),
        },
      });
    });

    // Fecha a ordem se esta entrega bateu a meta ou esgotou o orçamento.
    if (delivery) await closeFinishedOrders(now);

    return { result: { area, action, loot, delivery } };
  }).then((r) =>
    r.ok ? { ok: true as const, result: r.result } : { ok: false as const, error: r.error },
  );
}

export function describeLoot(loot: GatherLoot[]): string {
  if (!loot.length) return "_Nada desta vez._";
  return loot
    .map((entry) => `• ${getItem(entry.itemId)?.name ?? entry.itemId} ×${entry.qty}`)
    .join("\n");
}

export { EconomyError };
