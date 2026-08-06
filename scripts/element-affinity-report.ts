import { ALL_ABILITIES } from "../src/data/index.js";
import { ELEMENT_TREES } from "../src/data/element-trees/index.js";
import { passiveMods } from "../src/services/combat/passives.js";

for (const element of ["AGUA", "VENTO"] as const) {
  const tree = ELEMENT_TREES[element];
  const owned = tree.filter((node) => node.kind === "PASSIVE" && node.reqLevel <= 45).map((node) => node.id);
  const abilities = tree
    .filter((node) => node.kind === "JUTSU" && node.reqLevel <= 45 && node.grantsAbilityId)
    .map((node) => ALL_ABILITIES.find((ability) => ability.id === node.grantsAbilityId)!)
    .filter((ability) => (ability?.baseDamage ?? 0) > 0);
  const rows = abilities.map((ability) => {
    const mods = passiveMods(owned, ability);
    return { id: ability.id, damage: ability.baseDamage! * mods.damageMult, cost: ability.cost * mods.costMult };
  });
  const damage = rows.reduce((sum, row) => sum + row.damage, 0);
  const cost = rows.reduce((sum, row) => sum + row.cost, 0);
  const best = rows.reduce((winner, row) => row.damage > winner.damage ? row : winner);
  console.log(JSON.stringify({
    element,
    pn: tree.reduce((sum, node) => sum + node.cost, 0),
    skills: rows.length,
    averageDamage: Number((damage / rows.length).toFixed(2)),
    best,
    costPerDamage: Number((cost / damage).toFixed(3)),
  }));
}
