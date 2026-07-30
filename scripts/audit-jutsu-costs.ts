// Audita o custo de TODA ability contra suggestedJutsuCost() (jutsu-balance.ts).
// So' reporta/imprime — nao escreve nada. Rodar: npx tsx scripts/audit-jutsu-costs.ts
// Abilities fora do escopo da formula (summon, mindTransfer, trapField,
// cleanses, reduceEffectDuration, restoreResource, requiredItems,
// equippedItemIds, toggleRules) sao listadas à parte, sem sugestão.
import { ALL_ABILITIES } from "../src/data/index.js";
import { suggestedJutsuCost } from "../src/services/characters/jutsu-balance.js";
import type { Ability } from "../src/data/types.js";

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
      (!ab.baseDamage && !ab.baseHeal && !ab.effects?.length) || // buff/utilidade pura sem numero nenhum
      // conteudo de NPC de verdade (pombo_bicada, cao_ninja_mordida...): sem
      // requirements de desbloqueio E custo 0 e' o sinal documentado em
      // jutsus/support.ts. NAO confundir com as acoes de item (item_*.ts),
      // que tambem nao tem `requirements` mas JA custam > 0.
      (!ab.requirements && ab.cost === 0),
  );
}

const rows: { id: string; name: string; cost: number; suggested: number; delta: number }[] = [];
const outOfScope: string[] = [];

for (const ab of ALL_ABILITIES) {
  if (isOutOfScope(ab)) {
    outOfScope.push(ab.id);
    continue;
  }
  const suggested = suggestedJutsuCost({
    actionType: ab.actionType,
    shape: ab.shape,
    baseDamage: ab.baseDamage,
    baseHeal: ab.baseHeal,
    effects: ab.effects,
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
    baseDamage: ab.baseDamage ?? 0,
    baseHeal: ab.baseHeal ?? 0,
    shape: ab.shape,
    actionType: ab.actionType,
    effects: (ab.effects ?? []).map((e) => `${e.effectId}d${e.duration ?? 1}c${e.chance ?? 1}`).join("+"),
    flags: [ab.unblockable && "UNBLOCK", ab.undodgeable && "UNDODGE", ab.unguardable && "UNGUARD"].filter(Boolean).join(","),
  } as any);
}

rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

console.log(`\n${rows.length} abilities no escopo da formula, ${outOfScope.length} fora (summon/cleanses/buff puro/etc).\n`);
console.log("id".padEnd(30), "nome".padEnd(38), "atual".padStart(6), "sugerido".padStart(9), "delta".padStart(7));
for (const r of rows) {
  console.log(
    r.id.padEnd(30),
    r.name.slice(0, 36).padEnd(38),
    String(r.cost).padStart(6),
    String(r.suggested).padStart(9),
    (r.delta >= 0 ? "+" : "") + r.delta,
  );
}

const big = rows.filter((r) => Math.abs(r.delta) >= 10);
console.log(`\n${big.length} abilities com |delta| >= 10 (maiores outliers acima).`);
console.log(`Media do delta: ${(rows.reduce((s, r) => s + r.delta, 0) / rows.length).toFixed(2)}`);
console.log(`\nFora de escopo (${outOfScope.length}): ${outOfScope.join(", ")}`);

console.log("\n--- top 20 outliers, campos crus ---");
for (const r of rows.slice(0, 20) as any[]) {
  console.log(
    `${r.id.padEnd(28)} dmg=${String(r.baseDamage).padStart(3)} heal=${r.baseHeal} shape=${r.shape.padEnd(13)} act=${r.actionType.padEnd(9)} flags=${(r.flags || "-").padEnd(10)} effects=${r.effects || "-"} | atual=${r.cost} sugerido=${r.suggested}`,
  );
}
