import { CLAN_TREES } from "../src/data/clan-trees/index.ts";
import { getAbility } from "../src/data/index.ts";

for (const [clanId, nodes] of Object.entries(CLAN_TREES)) {
  const totalCost = nodes.reduce((a, n) => a + n.cost, 0);
  const jutsuNodes = nodes.filter((n) => n.kind === "JUTSU");
  const dmgs = [];
  for (const n of jutsuNodes) {
    const ab = getAbility(n.grantsAbilityId);
    if (ab && ab.baseDamage) dmgs.push(ab.baseDamage);
  }
  const avg = dmgs.length ? (dmgs.reduce((a, b) => a + b, 0) / dmgs.length).toFixed(1) : "n/a";
  const max = dmgs.length ? Math.max(...dmgs) : "n/a";
  console.log(
    clanId.padEnd(12),
    "nodes:", String(nodes.length).padEnd(3),
    "totalPN:", String(totalCost).padEnd(4),
    "jutsu:", String(jutsuNodes.length).padEnd(3),
    "avgDmg:", String(avg).padEnd(6),
    "maxDmg:", max,
  );
}
