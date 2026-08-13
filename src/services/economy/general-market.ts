// Caravana do Mercado Geral (secao 7.2.1 de docs/economia-vilas.md).
//
// O NPC deixou de ter estoque infinito. Cada vila recebe, as 00:05 locais,
// QUATRO ofertas sorteadas sem repeticao, com quantidade compartilhada
// congelada na criacao. Fora dessas quatro nao existe compra no balcao.
//
// O estado do dia vive no BANCO, na unicidade (vila, dayKey, itemId) — mesma
// escolha dos outros relogios da vila. Consequencias:
//
//   - reinicio do bot NAO rerrola: `ensureGeneralMarketOffers` reencontra as
//     linhas do dia e devolve as mesmas;
//   - o job repetido nao duplica: o INSERT esbarra na unicidade;
//   - uma virada perdida offline e' recuperada na primeira abertura de /loja,
//     porque a compra e o painel tambem chamam `ensureGeneralMarketOffers`.
//
// A parte sorteavel e' pura (`pickWeighted`) para o teste conseguir fixar o
// gerador e conferir a distribuicao sem banco nem relogio.

import { prisma } from "../../db/client.js";
import { ECONOMY } from "../../config/balance.js";
import { getItem } from "../../data/items.js";
import { GENERAL_MARKET_POOL, isGeneralMarketMaterial, type MarketOfferDef } from "../../data/shops.js";
import type { VillageId } from "../../data/villages.js";
import { addInventoryItem } from "../characters/inventory.js";
import { spendCharacterRyo } from "./character-economy.js";
import { EconomyError, runEconomy } from "./errors.js";
import { activePopulation } from "./population.js";
import { generalMarketItemPrice } from "./shop-pricing.js";
import { dayKeyFor, nextDailyAt } from "./week.js";

// ---------------- Regras puras ----------------

// Quantidade compartilhada de UMA oferta: limitar(min, max, teto(k x ativos)).
// Vila morta ainda recebe o piso — a caravana e' saida de emergencia, e zerar
// a oferta de quem nao tem ninguem ativo trancaria a vila fora dela.
export function offerQuantity(ativos: number): number {
  const bruto = Math.ceil(ECONOMY.generalMarketQtyPerActive * Math.max(0, ativos));
  return Math.min(ECONOMY.generalMarketQtyMax, Math.max(ECONOMY.generalMarketQtyMin, bruto));
}

// Sorteio ponderado SEM repeticao. Cada rodada escolhe um item proporcional ao
// peso e o remove do bolo, entao as quatro ofertas do dia sao sempre
// diferentes. `rand` e' injetavel so' para o teste.
export function pickWeighted(
  pool: MarketOfferDef[],
  quantidade: number,
  rand: () => number = Math.random,
): string[] {
  const restantes = [...pool];
  const escolhidos: string[] = [];
  const alvo = Math.min(quantidade, restantes.length);

  while (escolhidos.length < alvo) {
    const total = restantes.reduce((soma, row) => soma + row.weight, 0);
    if (total <= 0) break;
    // `rand()` em [0,1) => sorteio em [0, total).
    let ponto = rand() * total;
    let indice = restantes.length - 1;
    for (let i = 0; i < restantes.length; i += 1) {
      ponto -= restantes[i]!.weight;
      if (ponto < 0) {
        indice = i;
        break;
      }
    }
    escolhidos.push(restantes[indice]!.itemId);
    restantes.splice(indice, 1);
  }

  return escolhidos;
}

// Proxima virada da caravana, para o rodape do embed e para o agendamento.
export function nextCaravanAt(now = new Date()): Date {
  return nextDailyAt(now, ECONOMY.generalMarketHour, ECONOMY.generalMarketMinute);
}

// ---------------- Semente estavel do dia ----------------

// O sorteio e' DETERMINISTICO a partir de (vila, dia). Nao e' capricho: a
// unicidade (vila, dia, item) sozinha nao impede rerrolagem, porque dois
// sorteios diferentes escolhem itens diferentes, e itens diferentes nao
// colidem — duas chamadas concorrentes na virada gravariam sete ofertas em vez
// de quatro. Com a semente presa ao dia, todo escritor calcula EXATAMENTE o
// mesmo conjunto, e a corrida converge sozinha, sem lock nem transacao.
//
// Muda todo dia e por vila, entao a rotacao continua variada.
function seedFrom(texto: string): number {
  // FNV-1a de 32 bits: barato, estavel entre execucoes e bem espalhado.
  let hash = 2166136261;
  for (let i = 0; i < texto.length; i += 1) {
    hash ^= texto.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// mulberry32: gerador pequeno e reproduzivel. `Math.random` nao serve aqui
// justamente por nao ser reproduzivel.
function seededRandom(seed: number): () => number {
  let estado = seed;
  return () => {
    estado = (estado + 0x6d2b79f5) | 0;
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function dailyRandom(villageId: string, dayKey: string): () => number {
  return seededRandom(seedFrom(`${villageId}:${dayKey}`));
}

// ---------------- Ofertas do dia ----------------

export interface MarketOffer {
  itemId: string;
  name: string;
  initialQty: number;
  remainingQty: number;
}

// Garante as ofertas do dia local e devolve as do `dayKey` corrente.
// Idempotente por construcao: `createMany` com `skipDuplicates` esbarra na
// unicidade (vila, dia, item), entao duas chamadas concorrentes — job e
// abertura de /loja no mesmo instante — convergem para o mesmo conjunto.
export async function ensureGeneralMarketOffers(
  villageId: VillageId,
  now = new Date(),
  // Sem override, a semente vem de (vila, dia): dois escritores simultaneos
  // sorteiam o mesmo conjunto e a corrida converge. So' o teste injeta outro.
  rand?: () => number,
): Promise<MarketOffer[]> {
  const dayKey = dayKeyFor(now);

  const existentes = await prisma.generalMarketOffer.findMany({
    where: { villageId, dayKey },
    orderBy: { itemId: "asc" },
  });
  if (existentes.length > 0) return existentes.map(paraOferta);

  // A populacao ativa e' consulta pesada: fica fora do caminho de leitura e so'
  // roda quando o dia realmente virou.
  const pop = await activePopulation(villageId, now);
  const quantidade = offerQuantity(pop.ativos);
  const sorteados = pickWeighted(
    GENERAL_MARKET_POOL,
    ECONOMY.generalMarketOffersPerDay,
    rand ?? dailyRandom(villageId, dayKey),
  );

  // Uma linha por vez com `upsert`: o SQLite nao suporta `skipDuplicates` no
  // createMany, e o upsert tem a propriedade que interessa aqui — `update: {}`
  // deixa a linha existente EXATAMENTE como esta'. Uma virada repetida jamais
  // devolve `remainingQty` para o valor cheio.
  //
  // O catch cobre a corrida em que outra chamada insere entre o nosso SELECT e
  // o nosso INSERT: a unicidade rejeita, e a releitura abaixo pega o conjunto
  // vencedor. Perder a corrida e' o caminho normal, nao um erro.
  for (const itemId of sorteados) {
    await prisma.generalMarketOffer
      .upsert({
        where: { villageId_dayKey_itemId: { villageId, dayKey, itemId } },
        create: { villageId, dayKey, itemId, initialQty: quantidade, remainingQty: quantidade },
        update: {},
      })
      .catch(() => null);
  }

  // Relemos em vez de devolver o que acabamos de montar: se outra chamada
  // venceu a corrida, o conjunto valido e' o dela.
  const criadas = await prisma.generalMarketOffer.findMany({
    where: { villageId, dayKey },
    orderBy: { itemId: "asc" },
  });
  return criadas.map(paraOferta);
}

function paraOferta(row: {
  itemId: string;
  initialQty: number;
  remainingQty: number;
}): MarketOffer {
  return {
    itemId: row.itemId,
    name: getItem(row.itemId)?.name ?? row.itemId,
    initialQty: row.initialQty,
    remainingQty: row.remainingQty,
  };
}

// Passada do job: roda a virada de todas as vilas. Recupera o que venceu
// offline exatamente uma vez, igual as obras e a producao diaria.
export async function runGeneralMarketPass(now = new Date()): Promise<number> {
  const villages = await prisma.village.findMany({ select: { id: true } });
  let viradas = 0;
  for (const village of villages) {
    const antes = await prisma.generalMarketOffer.count({
      where: { villageId: village.id, dayKey: dayKeyFor(now) },
    });
    await ensureGeneralMarketOffers(village.id as VillageId, now);
    if (antes === 0) viradas += 1;
  }
  return viradas;
}

// ---------------- Compra ----------------

export interface MarketBuyOutcome {
  itemId: string;
  name: string;
  qty: number;
  precoUnitario: number;
  total: number;
  saldo: number;
  restante: number;
}

// Compra no NPC. Transacao curta de proposito: a virada do dia e a populacao
// ativa ficam FORA dela, e dentro sobra so' o que precisa ser atomico —
// revalidar a oferta do dia, decrementar condicionalmente e cobrar.
//
// A trava de concorrencia e' o UPDATE condicional em `remainingQty >= qty`: se
// duas compras simultaneas disputarem a ultima unidade, uma delas nao acha
// linha para atualizar e cai inteira, sem cobrar Ryo.
export async function buyFromGeneralMarket(
  charId: string,
  villageId: VillageId,
  itemId: string,
  qty: number,
  now = new Date(),
) {
  if (!Number.isInteger(qty) || qty <= 0) {
    return { ok: false as const, error: "Informe uma quantidade inteira e positiva." };
  }
  const item = getItem(itemId);
  if (!item) return { ok: false as const, error: "Item desconhecido." };
  if (!isGeneralMarketMaterial(itemId)) {
    return { ok: false as const, error: `O Mercado Geral não vende ${item.name}.` };
  }

  // Recupera uma virada perdida antes de olhar a oferta: quem abre o painel as
  // 00:06 depois de o bot passar a noite desligado compra da caravana nova.
  await ensureGeneralMarketOffers(villageId, now);
  const dayKey = dayKeyFor(now);

  return runEconomy(
    async (): Promise<MarketBuyOutcome> =>
      prisma.$transaction(async (tx) => {
        const village = await tx.village.findUniqueOrThrow({ where: { id: villageId } });
        // Preco recalculado DENTRO da transacao: o painel pode ter sido aberto
        // antes de o Kage mexer na taxa.
        const precoUnitario = generalMarketItemPrice(itemId, village.taxRate);
        if (precoUnitario === undefined || precoUnitario <= 0) {
          throw new EconomyError(`O Mercado Geral não vende ${item.name}.`);
        }

        const oferta = await tx.generalMarketOffer.findUnique({
          where: { villageId_dayKey_itemId: { villageId, dayKey, itemId } },
        });
        if (!oferta) {
          throw new EconomyError(`A caravana de hoje não trouxe ${item.name}.`);
        }
        if (oferta.remainingQty <= 0) {
          throw new EconomyError(`${item.name} esgotou na caravana de hoje.`);
        }

        const { count } = await tx.generalMarketOffer.updateMany({
          where: { id: oferta.id, dayKey, remainingQty: { gte: qty } },
          data: { remainingQty: { decrement: qty } },
        });
        if (count === 0) {
          throw new EconomyError(
            `A caravana só tem ${oferta.remainingQty}x ${item.name} agora.`,
          );
        }

        const total = precoUnitario * qty;
        // Cobra DEPOIS de reservar a unidade: se o saldo nao cobrir, a
        // transacao inteira desfaz e o decremento volta junto.
        const saldo = await spendCharacterRyo(tx, {
          charId,
          amount: total,
          type: "NPC_SALE",
          reason: `Compra de ${qty}x ${item.name} no Mercado Geral`,
          errorMessage: `Você precisa de ${total} Ryō para comprar ${qty}x ${item.name}.`,
          meta: { shopType: "MERCADO_GERAL", itemId, qty, precoUnitario, dayKey },
        });
        await addInventoryItem(tx, charId, itemId, qty);

        return {
          itemId,
          name: item.name,
          qty,
          precoUnitario,
          total,
          saldo,
          restante: oferta.remainingQty - qty,
        };
      }),
  );
}
