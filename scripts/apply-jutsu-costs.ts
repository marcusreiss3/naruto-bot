// Aplica suggestedJutsuCost() como o novo `cost` de toda ability NO ESCOPO da
// formula (ver isOutOfScope, mesmo criterio do audit-jutsu-costs.ts), direto
// nos arquivos-fonte em src/data/**. NAO mexe em abilities fora de escopo
// (summon/mindTransfer/trapField/cleanses/reduceEffectDuration/
// restoreResource/requiredItems/equippedItemIds/toggleRules/buff-puro-sem-numero).
//
// Localiza cada ability pelo `id: "..."` e conta chaves { } a partir dai' pra
// achar o fim EXATO do objeto (nao regex solto no arquivo inteiro) — so'
// entao troca o `cost: N` que estiver DENTRO desse objeto.
//
// Rodar: npx tsx scripts/apply-jutsu-costs.ts        (aplica de verdade)
//        npx tsx scripts/apply-jutsu-costs.ts --dry  (so' mostra o que faria)
import { readFileSync, writeFileSync } from "node:fs";
import { globSync } from "node:fs";
import path from "node:path";
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
      (!ab.baseDamage && !ab.baseHeal && !ab.effects?.length) ||
      // conteudo de NPC de verdade (pombo_bicada, cao_ninja_mordida...): sem
      // requirements de desbloqueio E custo 0 e' o sinal documentado em
      // jutsus/support.ts. NAO confundir com as acoes de item (item_*.ts),
      // que tambem nao tem `requirements` mas JA custam > 0.
      (!ab.requirements && ab.cost === 0),
  );
}

const dryRun = process.argv.includes("--dry");

const targets = new Map<string, number>();
for (const ab of ALL_ABILITIES) {
  if (isOutOfScope(ab)) continue;
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
  if (suggested !== ab.cost) targets.set(ab.id, suggested);
}

console.log(`${targets.size} abilities vao mudar de custo.`);

const files = globSync("src/data/**/*.ts", { cwd: path.resolve(import.meta.dirname, "..") }).map((f) =>
  path.resolve(import.meta.dirname, "..", f),
);

let totalChanged = 0;
for (const file of files) {
  let content = readFileSync(file, "utf8");
  let fileChanged = false;

  for (const [id, newCost] of targets) {
    const idNeedle = `id: "${id}"`;
    const idPos = content.indexOf(idNeedle);
    if (idPos === -1) continue; // este id nao esta' neste arquivo

    // acha o inicio do objeto: primeiro "{" antes de idPos (o objeto que contem este id)
    const objStart = content.lastIndexOf("{", idPos);
    if (objStart === -1) continue;

    // conta chaves a partir de objStart pra achar o "}" que fecha ESTE objeto
    let depth = 0;
    let objEnd = -1;
    for (let i = objStart; i < content.length; i++) {
      const ch = content[i];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          objEnd = i;
          break;
        }
      }
    }
    if (objEnd === -1) continue;

    const objText = content.slice(objStart, objEnd + 1);
    const costMatch = objText.match(/cost:\s*[\d.]+/);
    if (!costMatch) {
      console.warn(`  ! ${id}: achei o objeto mas nao achei "cost:" dentro dele — pulei.`);
      continue;
    }
    const newObjText = objText.replace(/cost:\s*[\d.]+/, `cost: ${newCost}`);
    if (newObjText === objText) continue;

    content = content.slice(0, objStart) + newObjText + content.slice(objEnd + 1);
    fileChanged = true;
    totalChanged++;
    targets.delete(id); // achado e trocado — nao precisa procurar em outro arquivo
    console.log(`  ${path.relative(process.cwd(), file)}: ${id} -> cost: ${newCost}`);
  }

  if (fileChanged && !dryRun) writeFileSync(file, content, "utf8");
}

console.log(`\n${totalChanged} custos trocados${dryRun ? " (DRY RUN — nada foi escrito)" : ""}.`);
if (targets.size > 0) {
  console.log(`\n${targets.size} ids NAO encontrados em nenhum arquivo (verificar): ${[...targets.keys()].join(", ")}`);
}
