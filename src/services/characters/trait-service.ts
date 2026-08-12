// Leitura e atribuicao da trait do personagem. O SORTEIO nao mora aqui: por
// enquanto a trait so' entra por /admin (a mecanica de sorteio ainda esta' em
// aberto — ver TRAITS.txt).
import { prisma } from "../../db/client.js";
import { getTrait, type TraitDef } from "../../data/traits.js";
import { characterPassiveMods, type CharacterPassiveMods } from "../combat/passives.js";

export async function getCharacterTrait(charId: string): Promise<TraitDef | null> {
  const row = await prisma.characterTrait.findUnique({ where: { charId } });
  if (!row) return null;
  return getTrait(row.traitId) ?? null;
}

// UMA por personagem: upsert em vez de create, entao trocar a trait substitui
// em vez de acumular.
export async function setCharacterTrait(charId: string, traitId: string): Promise<TraitDef> {
  const trait = getTrait(traitId);
  if (!trait) throw new Error(`Trait desconhecida: ${traitId}`);
  const anterior = await prisma.characterTrait.findUnique({ where: { charId } });
  await prisma.characterTrait.upsert({
    where: { charId },
    create: { charId, traitId },
    update: { traitId },
  });
  // Talento Bruto: pontos de atributo extras. E' concessao UNICA, nao um
  // modificador continuo — entao acerta o delta entre a trait antiga e a nova
  // em vez de somar de novo. Trocar a trait por /admin nao vira fonte
  // infinita de pontos, e tirar a trait devolve o que ela deu.
  const antes = anterior ? characterPassiveMods([anterior.traitId]).freeAttributePoints : 0;
  const delta = characterPassiveMods([traitId]).freeAttributePoints - antes;
  if (delta !== 0) {
    await prisma.userCharacter.update({
      where: { id: charId },
      data: { attributePoints: { increment: delta } },
    });
  }
  return trait;
}

export async function clearCharacterTrait(charId: string): Promise<void> {
  const anterior = await prisma.characterTrait.findUnique({ where: { charId } });
  if (!anterior) return;
  await prisma.characterTrait.deleteMany({ where: { charId } });
  const devolver = characterPassiveMods([anterior.traitId]).freeAttributePoints;
  if (devolver > 0) {
    await prisma.userCharacter.update({
      where: { id: charId },
      // Pode ficar negativo se o jogador ja' gastou os pontos extras. E'
      // proposital: o saldo negativo trava novos gastos ate' compensar, em
      // vez de deixar o bonus da trait sobreviver a' remocao dela.
      data: { attributePoints: { decrement: devolver } },
    });
  }
}

// O id da trait entra no MESMO array de nos que a engine ja' consome, entao
// todo bonus dela passa pelos mesmos lookups das passivas de arvore. Ver o
// cabecalho de data/traits.ts.
export function withTraitNode(nodeIds: string[], traitId: string | null | undefined): string[] {
  return traitId ? [...nodeIds, traitId] : nodeIds;
}

// Mods FORA de combate (xp, ryo, item, custo de no'). Le so' a trait — os nos
// de arvore comprados nao participam desses eixos hoje.
export async function traitMods(charId: string): Promise<CharacterPassiveMods> {
  const row = await prisma.characterTrait.findUnique({ where: { charId } });
  return characterPassiveMods(row ? [row.traitId] : []);
}
