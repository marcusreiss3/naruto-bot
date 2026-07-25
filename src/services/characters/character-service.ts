import { prisma } from "../../db/client.js";
import { BALANCE } from "../../config/balance.js";
import { ATTRIBUTES, type Attribute, type Element } from "../../config/enums.js";
import { ALL_ABILITIES, getClan } from "../../data/index.js";
import { getNode } from "../../data/element-trees/index.js";
import { maxHp, expectedMasteryPoints } from "./formulas.js";
import { meetsRequirements } from "./requirements.js";

export { meetsRequirements };

// Extrai os 9 atributos de uma linha de CharacterAttributes. Iterar ATTRIBUTES
// evita ter que tocar aqui toda vez que um atributo novo entra no enum.
export function attrsFromRow(row: Record<string, unknown>): Record<Attribute, number> {
  const out = {} as Record<Attribute, number>;
  for (const a of ATTRIBUTES) out[a] = (row[a] as number | undefined) ?? 1;
  return out;
}

export type FullCharacter = NonNullable<Awaited<ReturnType<typeof getFullCharacter>>>;

export async function getFullCharacter(discordId: string, guildId: string) {
  return prisma.userCharacter.findUnique({
    where: { discordId_guildId: { discordId, guildId } },
    include: {
      attributes: true,
      resources: true,
      mastery: true,
      clan: true,
      elements: true,
      jutsus: true,
      inventory: true,
      skillNodes: true, // nos da arvore comprados (passivas entram no combate por aqui)
    },
  });
}

export async function getOrCreateCharacter(discordId: string, guildId: string, name: string) {
  const existing = await getFullCharacter(discordId, guildId);
  if (existing) return existing;

  const created = await prisma.userCharacter.create({
    data: {
      discordId,
      guildId,
      name,
      hpCurrent: BALANCE.hpBase,
      hpMax: BALANCE.hpBase,
      attributes: { create: {} },
      resources: { create: {} },
      mastery: { create: {} },
    },
  });
  await refreshDerived(created.id);
  return (await getFullCharacter(discordId, guildId))!;
}

// Define o nome RP do personagem (displayName). Vazio/null limpa e volta ao username.
export async function setCharacterName(
  discordId: string,
  guildId: string,
  displayName: string | null,
): Promise<void> {
  const clean = displayName?.trim() || null;
  await prisma.userCharacter.update({
    where: { discordId_guildId: { discordId, guildId } },
    data: { displayName: clean },
  });
}

// Recalcula hpMax e clampa hpCurrent. Roda apos mudancas de level/atributo.
export async function refreshDerived(charId: string): Promise<void> {
  const char = await prisma.userCharacter.findUnique({
    where: { id: charId },
    include: { attributes: true },
  });
  if (!char || !char.attributes) return;
  const hp = maxHp(char.level, char.attributes.taijutsu);
  const hpCurrent = Math.min(char.hpCurrent, hp) || hp;
  await prisma.userCharacter.update({
    where: { id: charId },
    data: { hpMax: hp, hpCurrent },
  });
}

export async function setLevel(charId: string, level: number): Promise<void> {
  const char = await prisma.userCharacter.findUnique({ where: { id: charId } });
  if (!char) return;
  level = Math.max(1, Math.min(BALANCE.maxLevel, level));
  const delta = level - char.level;
  const newPoints = char.attributePoints + Math.max(0, delta) * BALANCE.attributePointsPerLevel;
  const masteryPoints = expectedMasteryPoints(level);
  await prisma.userCharacter.update({
    where: { id: charId },
    data: { level, attributePoints: newPoints, masteryPoints },
  });
  await refreshDerived(charId);
  await autoUnlockJutsus(charId);
}

export async function addXp(charId: string, xp: number): Promise<{ leveledTo: number | null }> {
  const char = await prisma.userCharacter.findUnique({ where: { id: charId } });
  if (!char) return { leveledTo: null };
  let total = char.xp + xp;
  let level = char.level;
  let gained = 0;
  while (level < BALANCE.maxLevel && total >= BALANCE.xpPerLevel(level)) {
    total -= BALANCE.xpPerLevel(level);
    level++;
    gained++;
  }
  // no nível máximo, não acumula XP excedente
  if (level >= BALANCE.maxLevel) total = 0;
  await prisma.userCharacter.update({
    where: { id: charId },
    data: {
      xp: total,
      level,
      attributePoints: char.attributePoints + gained * BALANCE.attributePointsPerLevel,
      masteryPoints: expectedMasteryPoints(level),
    },
  });
  if (gained > 0) {
    await refreshDerived(charId);
    await autoUnlockJutsus(charId);
  }
  return { leveledTo: gained > 0 ? level : null };
}

export async function addAttribute(charId: string, attr: Attribute, delta: number): Promise<void> {
  await prisma.characterAttributes.update({
    where: { charId },
    data: { [attr]: { increment: delta } },
  });
  if (attr === "taijutsu") await refreshDerived(charId);
  await autoUnlockJutsus(charId);
}

export async function setAttribute(charId: string, attr: Attribute, value: number): Promise<void> {
  await prisma.characterAttributes.update({ where: { charId }, data: { [attr]: value } });
  if (attr === "taijutsu") await refreshDerived(charId);
  await autoUnlockJutsus(charId);
}

// gasta 1 ponto de atributo (jogador)
export async function spendAttributePoint(charId: string, attr: Attribute): Promise<boolean> {
  const char = await prisma.userCharacter.findUnique({ where: { id: charId } });
  if (!char || char.attributePoints < 1) return false;
  await prisma.userCharacter.update({
    where: { id: charId },
    data: { attributePoints: { decrement: 1 } },
  });
  await addAttribute(charId, attr, 1);
  return true;
}

export async function setResource(charId: string, resource: "chakra" | "energia", value: number): Promise<void> {
  const v = Math.max(0, Math.min(BALANCE.resourceMax, value));
  await prisma.characterResourceState.update({ where: { charId }, data: { [resource]: v } });
}

export async function setMastery(
  charId: string,
  resource: "chakra" | "energia",
  level: "BASICO" | "CONTROLADO" | "MESTRE",
): Promise<void> {
  const field = resource === "chakra" ? "chakraMastery" : "energiaMastery";
  await prisma.characterMastery.update({ where: { charId }, data: { [field]: level } });
}

export async function setElement(charId: string, element: Element): Promise<void> {
  await prisma.characterElement.upsert({
    where: { charId_element: { charId, element } },
    create: { charId, element },
    update: {},
  });
  await autoUnlockJutsus(charId);
}

export async function removeElement(charId: string, element: Element): Promise<void> {
  await prisma.characterElement
    .delete({ where: { charId_element: { charId, element } } })
    .catch(() => undefined);
}

export async function setClan(charId: string, clanId: string): Promise<void> {
  await prisma.characterClan.upsert({
    where: { charId },
    create: { charId, clanId },
    update: { clanId },
  });
  await grantAutoClanNodes(charId, clanId);
  await autoUnlockJutsus(charId);
}

// Nos que o personagem ja nasce possuindo ao escolher o cla (ex: Inuzuka
// nasce com o cao ninja, nao desbloqueia upando — ver ClanDef.autoGrantedNodeIds
// e o no isolado em data/clan-trees/index.ts). Idempotente: pode rodar de
// novo (ex: admin trocando o cla) sem duplicar nada.
async function grantAutoClanNodes(charId: string, clanId: string): Promise<void> {
  const clan = getClan(clanId);
  if (!clan?.autoGrantedNodeIds?.length) return;
  for (const nodeId of clan.autoGrantedNodeIds) {
    const node = getNode(nodeId);
    if (!node) continue;
    await prisma.characterSkillNode.upsert({
      where: { charId_nodeId: { charId, nodeId } },
      create: { charId, nodeId },
      update: {},
    });
    if (node.kind === "JUTSU" && node.grantsAbilityId) {
      await prisma.characterJutsu.upsert({
        where: { charId_jutsuId: { charId, jutsuId: node.grantsAbilityId } },
        create: { charId, jutsuId: node.grantsAbilityId },
        update: {},
      });
    }
  }
}

export async function addJutsu(charId: string, jutsuId: string): Promise<void> {
  await prisma.characterJutsu.upsert({
    where: { charId_jutsuId: { charId, jutsuId } },
    create: { charId, jutsuId },
    update: {},
  });
}

export async function removeJutsu(charId: string, jutsuId: string): Promise<void> {
  await prisma.characterJutsu
    .deleteMany({ where: { charId, jutsuId } })
    .catch(() => undefined);
}

// Desbloqueio automatico: adiciona jutsus cujos requisitos foram atingidos (exceto manualOnly).
export async function autoUnlockJutsus(charId: string): Promise<string[]> {
  const char = await prisma.userCharacter.findUnique({
    where: { id: charId },
    include: { attributes: true, elements: true, clan: true, jutsus: true },
  });
  if (!char || !char.attributes) return [];
  const ctx = {
    level: char.level,
    attrs: attrsFromRow(char.attributes),
    elements: char.elements.map((e) => e.element as Element),
    clanId: char.clan?.clanId ?? null,
  };
  const owned = new Set(char.jutsus.map((j) => j.jutsuId));
  const unlocked: string[] = [];
  for (const ab of ALL_ABILITIES) {
    if (owned.has(ab.id)) continue;
    if (ab.requirements?.manualOnly) continue;
    if (!ab.requirements) continue; // sem requisitos: nao auto-concede genericos
    if (meetsRequirements(ab, ctx)) {
      await prisma.characterJutsu.create({ data: { charId, jutsuId: ab.id } }).catch(() => undefined);
      unlocked.push(ab.id);
    }
  }
  return unlocked;
}
