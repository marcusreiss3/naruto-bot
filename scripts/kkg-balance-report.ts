// Comparativo entre as Kekkei Genkai: PN, nos, passivas, dano com as passivas
// proprias e efeito exclusivo de cada linhagem. Mesmo papel do
// clan-balance-report.ts, mas pro eixo dos KKG. So' imprime, nao escreve nada.
// Rodar: npx tsx scripts/kkg-balance-report.ts
import { ALL_ABILITIES } from "../src/data/index.js";
import { ELEMENT_TREES } from "../src/data/element-trees/index.js";
import { passiveMods } from "../src/services/combat/passives.js";
import { KEKKEI_GENKAI, type EffectId } from "../src/config/enums.js";

// Efeito que so' aquela linhagem aplica. Deriva do roster em vez de uma lista
// fixa: se alguem criar um KKG novo sem efeito proprio, aparece "—" aqui.
function exclusiveEffect(element: string): string {
  const mine = new Set<EffectId>();
  const others = new Set<EffectId>();
  for (const ability of ALL_ABILITIES) {
    for (const effect of ability.effects ?? []) {
      (ability.element === element ? mine : others).add(effect.effectId);
    }
  }
  const only = [...mine].filter((id) => !others.has(id));
  return only.length ? only.join("+") : "—";
}

const rows = KEKKEI_GENKAI.map((element) => {
  const tree = ELEMENT_TREES[element] ?? [];
  const passives = tree.filter((n) => n.kind === "PASSIVE");
  const owned = passives.filter((n) => n.reqLevel <= 45).map((n) => n.id);
  const abilities = tree
    .filter((n) => n.kind === "JUTSU" && n.reqLevel <= 45 && n.grantsAbilityId)
    .map((n) => ALL_ABILITIES.find((a) => a.id === n.grantsAbilityId)!)
    .filter(Boolean);
  const comDano = abilities.filter((a) => (a.baseDamage ?? 0) > 0);
  const calc = comDano.map((a) => {
    const m = passiveMods(owned, a);
    return { id: a.id, dmg: a.baseDamage! * m.damageMult, cost: a.cost * m.costMult };
  });
  const totalDmg = calc.reduce((s, r) => s + r.dmg, 0);
  const totalCost = calc.reduce((s, r) => s + r.cost, 0);
  const best = calc.length ? calc.reduce((w, r) => (r.dmg > w.dmg ? r : w)) : null;
  const pn = tree.reduce((s, n) => s + n.cost, 0);
  const sRank = tree.find((n) => n.rank === "S");
  return {
    el: element,
    pn,
    nos: tree.length,
    pass: passives.length,
    jut: abilities.length,
    medio: totalDmg / (calc.length || 1),
    melhor: best?.dmg ?? 0,
    melhorId: best?.id ?? "-",
    custoDano: totalCost / (totalDmg || 1),
    picoPN: (best?.dmg ?? 0) / (pn || 1),
    sLevel: sRank?.reqLevel ?? 0,
    efeito: exclusiveEffect(element),
  };
}).sort((a, b) => b.medio - a.medio);

const n = (v: number, d = 2) => v.toFixed(d);
console.log(
  "elemento".padEnd(10), "PN".padStart(4), "nos".padStart(4), "pass".padStart(5), "jut".padStart(4),
  "medio".padStart(7), "melhor".padStart(7), "custo/dano".padStart(11), "pico/PN".padStart(8),
  "nvS".padStart(4), " efeito exclusivo",
);
for (const r of rows) {
  console.log(
    r.el.padEnd(10), String(r.pn).padStart(4), String(r.nos).padStart(4), String(r.pass).padStart(5),
    String(r.jut).padStart(4), n(r.medio).padStart(7), n(r.melhor).padStart(7),
    n(r.custoDano).padStart(11), n(r.picoPN).padStart(8),
    String(r.sLevel || "-").padStart(4), " " + r.efeito,
  );
}
console.log("\nmelhor golpe de cada linhagem:");
for (const r of rows) console.log(`  ${r.el.padEnd(10)} ${r.melhorId.padEnd(26)} ${n(r.melhor)}`);
