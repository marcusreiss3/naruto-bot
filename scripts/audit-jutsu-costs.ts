// Audita o custo de TODA ability contra suggestedJutsuCost() (jutsu-balance.ts).
// So' reporta/imprime — nao escreve nada. Rodar: npx tsx scripts/audit-jutsu-costs.ts
// Abilities fora do escopo da formula (summon, mindTransfer, trapField,
// cleanses, reduceEffectDuration, restoreResource, requiredItems,
// equippedItemIds, toggleRules) sao listadas à parte, sem sugestão.
import { ALL_ABILITIES } from "../src/data/index.js";
import { allNodes } from "../src/data/element-trees/index.js";
import { NPCS } from "../src/data/npcs.js";
import { suggestedJutsuCost } from "../src/services/characters/jutsu-balance.js";
import type { Ability } from "../src/data/types.js";

// Conteudo de NPC nao se precifica: NPC nao tem economia de recurso pra
// respeitar. O sinal e' **nao ter `requirements`** (ver jutsus/npc.ts) — e' o
// mesmo teste que autoUnlockJutsus() usa pra nunca dar essas ao jogador.
// Filtra por "aparece em NpcTemplate.abilityIds" pra nao varrer junto as acoes
// de item (item_*.ts), que tambem nao tem requirements mas sao do jogador.
// Custo 0 tambem entra: as do Rei Macaco Enma carregam um `manualOnly: true`
// inofensivo e sem ele apareciam como os dois maiores outliers do roster.
const NPC_ONLY = new Set(
  NPCS.flatMap((npc) => npc.abilityIds ?? []).filter((id) => {
    const ability = ALL_ABILITIES.find((a) => a.id === id);
    return ability && (!ability.requirements || ability.cost === 0);
  }),
);

function isOutOfScope(ab: Ability): boolean {
  return Boolean(
    ab.summon ||
      ab.mindTransfer ||
      ab.trapField ||
      ab.cleanses?.length ||
      ab.reduceEffectDuration?.length ||
      ab.restoreResource ||
      ab.requiredItems?.length ||
      ab.equippedItemIds?.length ||
      ab.toggleRules ||
      (!ab.baseDamage && !ab.baseHeal && !ab.effects?.length && !ab.selfEffects?.length) || // buff/utilidade pura sem numero nenhum
      // conteudo de NPC (jutsus/npc.ts): ver NPC_ONLY acima.
      NPC_ONLY.has(ab.id),
  );
}

// POR QUE a ability saiu do escopo. Sem isso o rodape virava uma lista de 71
// ids e era facil reagir a um "delta" que nunca existiu — a Esfera Explosiva e
// a Palma Rotativa ja' foram tratadas como outlier por engano.
function outOfScopeReason(ab: Ability): string | null {
  if (ab.summon) return "summon";
  if (ab.mindTransfer) return "mindTransfer";
  if (ab.trapField) return "trapField";
  if (ab.cleanses?.length) return "cleanses";
  if (ab.reduceEffectDuration?.length) return "reduceEffectDuration";
  if (ab.restoreResource) return "restoreResource";
  if (ab.requiredItems?.length) return "requiredItems";
  if (ab.equippedItemIds?.length) return "equippedItemIds";
  if (ab.toggleRules) return "toggleRules";
  if (NPC_ONLY.has(ab.id) || (!ab.requirements && ab.cost === 0)) return "conteudo de NPC";
  if (!ab.baseDamage && !ab.baseHeal && !ab.effects?.length && !ab.selfEffects?.length) return "sem dano/cura/efeito";
  return null;
}

// FREIOS que a formula nao ve. A regua e' regua, nao lei: desvio COM freio
// declarado esta certo (Guy Noturno exige nivel 50 + Portao 8 + 1x por
// combate); desvio com a coluna vazia e' divida. Sem esta coluna era preciso
// abrir cada ability a mao pra descobrir de qual dos dois se tratava.
const NODE_BY_ABILITY = new Map<string, { reqLevel: number; reqPool: number; pool: string }>();
for (const node of allNodes()) {
  if (node.grantsAbilityId) {
    NODE_BY_ABILITY.set(node.grantsAbilityId, { reqLevel: node.reqLevel, reqPool: node.reqPool, pool: node.pool });
  }
}

function brakes(ab: Ability): string[] {
  const out: string[] = [];
  if (ab.oncePerCombat) out.push("1x/combate");
  if (ab.requiresActiveDoujutsu) out.push(`dojutsu:${ab.requiresActiveDoujutsu.label}`);
  if (ab.gateRules) out.push(`portao ${ab.gateRules.gate}`);
  if (ab.requiresActiveEffectFromAbilityId) out.push(`exige ${ab.requiresActiveEffectFromAbilityId}`);
  if (ab.requiresAbilityId) out.push(`sabe ${ab.requiresAbilityId}`);
  if (ab.requiresStorm) out.push("tempestade");
  if (ab.chainWetTargets) out.push("alvo Encharcado");
  if (ab.requiresTargetEffect?.length) out.push(`alvo sob ${ab.requiresTargetEffect.join("/")}`);
  const node = NODE_BY_ABILITY.get(ab.id);
  if (node) out.push(`nv${node.reqLevel}/${node.pool.slice(0, 4)}${node.reqPool}`);
  else if (ab.requirements?.level) out.push(`nv${ab.requirements.level}`);
  if (ab.push) out.push(`push${ab.push}`);
  return out;
}

const rows: {
  id: string; name: string; cost: number; suggested: number; delta: number; brakes: string;
}[] = [];
const outOfScope: { id: string; reason: string }[] = [];

for (const ab of ALL_ABILITIES) {
  if (isOutOfScope(ab)) {
    outOfScope.push({ id: ab.id, reason: outOfScopeReason(ab) ?? "?" });
    continue;
  }
  const suggested = suggestedJutsuCost({
    actionType: ab.actionType,
    shape: ab.shape,
    baseDamage: ab.baseDamage,
    baseHeal: ab.baseHeal,
    effects: ab.effects,
    selfEffects: ab.selfEffects,
    unblockable: ab.unblockable,
    undodgeable: ab.undodgeable,
    unguardable: ab.unguardable,
  });
  rows.push({
    id: ab.id,
    name: ab.name,
    cost: ab.cost,
    suggested,
    delta: suggested - ab.cost,
    brakes: brakes(ab).join(", "),
  });
}

rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

console.log(`\n${rows.length} abilities no escopo da formula, ${outOfScope.length} fora.\n`);
console.log(
  "id".padEnd(30), "nome".padEnd(36), "atual".padStart(5), "sug".padStart(4), "delta".padStart(6), "  freios (o que a formula NAO ve)",
);
console.log("-".repeat(140));
for (const r of rows) {
  console.log(
    r.id.padEnd(30),
    r.name.slice(0, 34).padEnd(36),
    String(r.cost).padStart(5),
    String(r.suggested).padStart(4),
    ((r.delta >= 0 ? "+" : "") + r.delta).padStart(6),
    "  " + (r.brakes || "-"),
  );
}

// A leitura do relatorio: delta grande COM freio esta explicado; delta grande
// com "-" na coluna de freios e' divida e precisa de decisao.
const semFreio = rows.filter((r) => Math.abs(r.delta) >= 4 && !r.brakes);
console.log(`\n--- ${semFreio.length} desvios de 4+ SEM freio nenhum (candidatos a divida) ---`);
for (const r of semFreio) {
  console.log(`  ${r.id.padEnd(30)} ${String(r.cost).padStart(3)} -> ${String(r.suggested).padStart(3)}  (${r.delta >= 0 ? "+" : ""}${r.delta})`);
}

const big = rows.filter((r) => Math.abs(r.delta) >= 10);
console.log(`\n${big.length} abilities com |delta| >= 10. Media do delta: ${(rows.reduce((s, r) => s + r.delta, 0) / rows.length).toFixed(2)}`);

console.log(`\n--- fora de escopo (${outOfScope.length}): o "sugerido" delas nao significa nada ---`);
const porMotivo = new Map<string, string[]>();
for (const { id, reason } of outOfScope) porMotivo.set(reason, [...(porMotivo.get(reason) ?? []), id]);
for (const [reason, ids] of [...porMotivo].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${reason.padEnd(22)} (${String(ids.length).padStart(2)})  ${ids.join(", ")}`);
}
