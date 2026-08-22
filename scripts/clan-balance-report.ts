import { ALL_ABILITIES } from "../src/data/index.js";
import { CLAN_TREES } from "../src/data/clan-trees/index.js";
import { ELEMENT_TREES } from "../src/data/element-trees/index.js";
import { TAIJUTSU_PASSIVES_TREE } from "../src/data/taijutsu-passives-tree.js";
import { passiveMods } from "../src/services/combat/passives.js";
import type { Ability } from "../src/data/types.js";

const CLANS = ["akimichi", "inuzuka", "kaguya", "hyuuga", "raikage", "hoshigaki", "chinoike", "kamaitachi", "hozuki"] as const;
const LEVELS = [5, 10, 20, 30, 45] as const;

const abilityNode = new Map(
  Object.values(CLAN_TREES).flat().filter((node) => node.grantsAbilityId).map((node) => [node.grantsAbilityId!, node]),
);

function clanAbilities(clanId: string, level: number): Ability[] {
  return ALL_ABILITIES.filter((ability) =>
    ability.requirements?.clanId === clanId &&
    (ability.baseDamage ?? 0) > 0 &&
    (abilityNode.get(ability.id)?.reqLevel ?? Infinity) <= level
  );
}

function ownedClanNodes(clanId: string, level: number): string[] {
  return CLAN_TREES[clanId]!.filter((node) => node.kind === "PASSIVE" && node.reqLevel <= level).map((node) => node.id);
}

function compatibleNodes(ability: Ability, level: number): string[] {
  const ids: string[] = [];
  if (ability.category === "TAIJUTSU") {
    ids.push(...TAIJUTSU_PASSIVES_TREE.filter((node) => node.kind === "PASSIVE" && node.reqLevel <= level).map((node) => node.id));
  }
  if (ability.element) {
    ids.push(...ELEMENT_TREES[ability.element].filter((node) => node.kind === "PASSIVE" && node.reqLevel <= level).map((node) => node.id));
  }
  return ids;
}

function measure(clanId: string, level: number, withCrossTree: boolean) {
  const abilities = clanAbilities(clanId, level);
  const clanNodes = ownedClanNodes(clanId, level);
  const rows = abilities.map((ability) => {
    const owned = withCrossTree ? [...clanNodes, ...compatibleNodes(ability, level)] : clanNodes;
    const mods = passiveMods(owned, ability);
    return {
      id: ability.id,
      damage: (ability.baseDamage ?? 0) * mods.damageMult,
      cost: ability.cost * mods.costMult,
    };
  });
  const totalDamage = rows.reduce((sum, row) => sum + row.damage, 0);
  const totalCost = rows.reduce((sum, row) => sum + row.cost, 0);
  const best = rows.reduce((winner, row) => row.damage > winner.damage ? row : winner, { id: "—", damage: 0, cost: 0 });
  return {
    count: rows.length,
    averageDamage: rows.length ? totalDamage / rows.length : 0,
    costPerDamage: totalDamage ? totalCost / totalDamage : 0,
    best,
  };
}

for (const clanId of CLANS) {
  const pn = CLAN_TREES[clanId]!.reduce((sum, node) => sum + node.cost, 0);
  const fullPassives = ownedClanNodes(clanId, 99);
  const damagePassives = fullPassives.filter((nodeId) => {
    const sample = clanAbilities(clanId, 99)[0];
    return sample && passiveMods([nodeId], sample).damageMult > 1;
  });
  const full = measure(clanId, 99, false);
  console.log(JSON.stringify({
    clanId,
    pn,
    damagePassives,
    clanPeak: Number(full.best.damage.toFixed(2)),
    peakPerPn: Number((full.best.damage / pn).toFixed(2)),
    levels: LEVELS.map((level) => {
      const own = measure(clanId, level, false);
      const cross = measure(clanId, level, true);
      return {
        level,
        skills: own.count,
        averageDamage: Number(own.averageDamage.toFixed(2)),
        costPerDamage: Number(own.costPerDamage.toFixed(3)),
        best: `${own.best.id}:${own.best.damage.toFixed(2)}`,
        crossAverageDamage: Number(cross.averageDamage.toFixed(2)),
        crossCostPerDamage: Number(cross.costPerDamage.toFixed(3)),
        crossBest: `${cross.best.id}:${cross.best.damage.toFixed(2)}`,
      };
    }),
  }));
}
