import { prisma } from "../../db/client.js";
import {
  PUPPET_SHELLS,
  PUPPET_UPGRADES,
  craftNodeForGrade,
  getPuppetUpgrade,
  isPuppetShell,
  type PuppetShell,
} from "../../data/puppet-upgrades.js";
import { getItem, itemIconUrl } from "../../data/items.js";
import { getAbility } from "../../data/index.js";
import { PUPPET_UPGRADE_ABILITY } from "../../data/jutsus/kugutsu.js";
import { removeInventoryItem } from "../characters/inventory.js";
import { EconomyError, runEconomy } from "../economy/errors.js";
import type { Tx } from "../economy/ledger.js";
import { characterPassiveMods } from "../combat/passives.js";

// no' do cla Shirogane que libera a 3a vaga de mecanismo — permanente, so'
// uma marionete por personagem (ver puppetMechanismCap abaixo).
const EXTRA_SLOT_NODE_ID = "shirogane_braco_extra";

const HOUR = 60 * 60 * 1000;
const REBUILD_DURATION_HOURS = 2;
export const PUPPET_OWNERSHIP_LIMIT = 5;

export interface PuppetCapabilities {
  slots: number;
  leash: number;
  bonusAttack: boolean;
  shellDamageBonus: number;
  shellHpBonus: number;
  shellShieldBonus: number;
  shellEffectTurns: number;
  shellChakraDrainBonus: number;
  // Braço Extra (Shirogane): personagem pode reservar a 3a vaga de mecanismo
  // numa marionete. Nao decide sozinho o teto — ver puppetMechanismCap.
  extraAbilitySlot: boolean;
}

export function puppetCapabilities(owned: Iterable<string>): PuppetCapabilities {
  const nodes = new Set(owned);
  return {
    slots: nodes.has("kugutsu_slot_3") ? 3 : nodes.has("kugutsu_slot_2") ? 2 : 1,
    leash: nodes.has("kugutsu_alcance_fios_iii") ? 5 : nodes.has("kugutsu_alcance_fios_ii") ? 4 : nodes.has("kugutsu_alcance_fios_i") ? 3 : 2,
    bonusAttack: nodes.has("kugutsu_acao_bonus"),
    shellDamageBonus: nodes.has("kugutsu_carapaca_ofensiva_iii") ? 0.35 : nodes.has("kugutsu_carapaca_ofensiva_ii") ? 0.25 : nodes.has("kugutsu_carapaca_ofensiva") ? 0.12 : 0,
    shellHpBonus: nodes.has("kugutsu_carapaca_defensiva_iii") ? 0.45 : nodes.has("kugutsu_carapaca_defensiva_ii") ? 0.30 : nodes.has("kugutsu_carapaca_defensiva") ? 0.15 : 0,
    shellShieldBonus: nodes.has("kugutsu_carapaca_defensiva_iii") ? 0.45 : nodes.has("kugutsu_carapaca_defensiva_ii") ? 0.30 : nodes.has("kugutsu_carapaca_defensiva") ? 0.15 : 0,
    shellEffectTurns: nodes.has("kugutsu_carapaca_efeito_iii") ? 3 : nodes.has("kugutsu_carapaca_efeito_ii") ? 2 : nodes.has("kugutsu_carapaca_efeito") ? 1 : 0,
    shellChakraDrainBonus: nodes.has("kugutsu_carapaca_efeito_iii") ? 0.15 : nodes.has("kugutsu_carapaca_efeito_ii") ? 0.10 : nodes.has("kugutsu_carapaca_efeito") ? 0.05 : 0,
    extraAbilitySlot: nodes.has(EXTRA_SLOT_NODE_ID),
  };
}

// Teto de mecanismos instalaveis numa marionete. Padrao e' 2; o cla Shirogane
// (Braço Extra) libera uma 3a vaga, mas so' numa marionete por personagem —
// permanente uma vez reivindicada (puppet.extraSlot), nunca revertida ao
// desinstalar um mecanismo (so' descartar a marionete libera a vaga de novo).
export function puppetMechanismCap(hasExtraSlotNode: boolean, puppetExtraSlot: boolean, anotherPuppetHasExtraSlot: boolean): number {
  if (puppetExtraSlot) return 3;
  if (hasExtraSlotNode && !anotherPuppetHasExtraSlot) return 3;
  return 2;
}

// Desconto Shirogane (puppetCraftCostMult) aplicado ao Ryo e aos ingredientes
// de criar/reformar uma marionete. Piso de 1 unidade por ingrediente — o
// desconto nunca zera um material.
export function applyCraftDiscount(
  ryo: number,
  ingredients: { itemId: string; qty: number }[],
  mult: number,
): { ryo: number; ingredients: { itemId: string; qty: number }[] } {
  return {
    ryo: Math.max(0, Math.round(ryo * mult)),
    ingredients: ingredients.map((ingredient) => ({ ...ingredient, qty: Math.max(1, Math.round(ingredient.qty * mult)) })),
  };
}

export interface KugutsuArsenalEntry {
  id: string;
  name: string;
  description: string;
  grade: number;
  reqLevel: number;
  category: string;
  actionType: string;
  additionalActionType?: string;
  resource: string;
  cost: number;
  range: number;
  shape: string;
  baseDamage?: number;
  baseHeal?: number;
  ryo: number;
  durationHours: number;
  ingredients: { itemId: string; name: string; qty: number; icon: string }[];
}

// Catalogo estatico do site: todo mecanismo que existe pra instalar numa
// marionete, com o combate (igual a um no' JUTSU normal) e a receita de
// construcao junto (igual ao /craft marionete mostra no Discord). Nao
// depende de personagem — e' o mesmo pra qualquer um que abrir a arvore.
export function buildKugutsuArsenal(): KugutsuArsenalEntry[] {
  const entries: KugutsuArsenalEntry[] = [];
  for (const upgrade of PUPPET_UPGRADES) {
    const abilityId = PUPPET_UPGRADE_ABILITY[upgrade.id];
    const ability = abilityId ? getAbility(abilityId) : undefined;
    if (!ability) continue;
    entries.push({
      id: ability.id,
      name: ability.name,
      description: upgrade.description,
      grade: upgrade.grade,
      reqLevel: upgrade.reqLevel,
      category: ability.category,
      actionType: ability.actionType,
      additionalActionType: ability.additionalActionType,
      resource: ability.resource,
      cost: ability.cost,
      range: ability.range,
      shape: ability.shape,
      baseDamage: ability.baseDamage,
      baseHeal: ability.baseHeal,
      ryo: upgrade.ryo,
      durationHours: upgrade.durationHours,
      ingredients: upgrade.ingredients.map((ingredient) => ({
        itemId: ingredient.itemId,
        name: getItem(ingredient.itemId)?.name ?? ingredient.itemId,
        qty: ingredient.qty,
        icon: itemIconUrl(ingredient.itemId),
      })),
    });
  }
  return entries;
}

export async function refreshPuppetOrders(charId: string): Promise<void> {
  await prisma.puppetCraftOrder.updateMany({
    where: { charId, status: "BUILDING", finishesAt: { lte: new Date() } },
    data: { status: "READY" },
  });
}

export async function listPuppetWorkshop(charId: string) {
  await refreshPuppetOrders(charId);
  return prisma.userCharacter.findUnique({
    where: { id: charId },
    select: {
      level: true,
      ryo: true,
      inventory: { select: { itemId: true, qty: true } },
      skillNodes: { select: { nodeId: true } },
      puppets: { include: { upgrades: true }, orderBy: { createdAt: "asc" } },
      puppetOrders: { orderBy: { createdAt: "desc" } },
    },
  });
}

function validPuppetName(value: string): string | null {
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 32) return null;
  return name;
}

function validPuppetAppearanceUrl(value: string | undefined): string | null | undefined {
  const url = value?.trim();
  if (!url) return undefined;
  if (url.length > 2_000) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

async function debitRecipe(
  tx: Tx,
  charId: string,
  ryo: number,
  ingredients: { itemId: string; qty: number }[],
): Promise<void> {
  const char = await tx.userCharacter.findUnique({ where: { id: charId }, select: { ryo: true } });
  if (!char || char.ryo < ryo) throw new EconomyError(`Você precisa de ${ryo} Ryō para iniciar esta construção.`);
  await debitIngredients(tx, charId, ingredients);
  await tx.userCharacter.update({ where: { id: charId }, data: { ryo: { decrement: ryo } } });
}

async function debitIngredients(
  tx: Tx,
  charId: string,
  ingredients: { itemId: string; qty: number }[],
): Promise<void> {
  for (const ingredient of ingredients) {
    await removeInventoryItem(tx, charId, ingredient.itemId, ingredient.qty, `Falta ${ingredient.qty}x ${getItem(ingredient.itemId)?.name ?? ingredient.itemId}.`);
  }
}

export function puppetRebuildIngredients(shell: PuppetShell): { itemId: string; qty: number }[] {
  return PUPPET_SHELLS[shell].ingredients.map((ingredient) => ({ ...ingredient, qty: Math.ceil(ingredient.qty / 2) }));
}

export async function startPuppetConstruction(charId: string, name: string, shell: string, appearanceUrl?: string) {
  const normalizedName = validPuppetName(name);
  if (!normalizedName) return { ok: false as const, error: "O nome da marionete deve ter entre 2 e 32 caracteres." };
  if (!isPuppetShell(shell)) return { ok: false as const, error: "Carapaça inválida." };
  const normalizedAppearanceUrl = validPuppetAppearanceUrl(appearanceUrl);
  if (normalizedAppearanceUrl === null) return { ok: false as const, error: "A aparência precisa ser um link http(s) válido, com até 2.000 caracteres." };

  return runEconomy(async () => prisma.$transaction(async (tx) => {
    const char = await tx.userCharacter.findUnique({ where: { id: charId }, select: { level: true, skillNodes: { select: { nodeId: true } } } });
    if (!char) throw new EconomyError("Personagem não encontrado.");
    if (!char.skillNodes.some((node) => node.nodeId === "kugutsu_oficina_inicial")) {
      throw new EconomyError("Compre **Oficina de Marionetes** na árvore de Kugutsu antes de construir uma marionete.");
    }
    const [owned, pending] = await Promise.all([
      tx.puppet.count({ where: { charId } }),
      tx.puppetCraftOrder.count({ where: { charId, kind: "PUPPET", status: { in: ["BUILDING", "READY"] } } }),
    ]);
    if (owned + pending >= PUPPET_OWNERSHIP_LIMIT) {
      throw new EconomyError(`Você já ocupa os ${PUPPET_OWNERSHIP_LIMIT} slots de marionete. Descarte uma para construir outra.`);
    }
    const spec = PUPPET_SHELLS[shell];
    const craftMult = characterPassiveMods(char.skillNodes.map((node) => node.nodeId)).puppetCraftCostMult;
    const { ryo, ingredients } = applyCraftDiscount(spec.ryo, spec.ingredients, craftMult);
    await debitRecipe(tx, charId, ryo, ingredients);
    const order = await tx.puppetCraftOrder.create({
      data: { charId, kind: "PUPPET", optionId: shell, puppetName: normalizedName, appearanceUrl: normalizedAppearanceUrl, shell, finishesAt: new Date(Date.now() + spec.durationHours * HOUR) },
    });
    await tx.economyActionLog.create({ data: { charId, action: "CRAFT_PUPPET", detailsJson: JSON.stringify({ shell, name: normalizedName, orderId: order.id }) } });
    return { order, name: normalizedName, shell: shell as PuppetShell, durationHours: spec.durationHours };
  }));
}

export async function startPuppetUpgradeConstruction(charId: string, puppetId: string, upgradeId: string) {
  const upgrade = getPuppetUpgrade(upgradeId);
  if (!upgrade) return { ok: false as const, error: "Evolução de marionete inválida." };

  return runEconomy(async () => prisma.$transaction(async (tx) => {
    const char = await tx.userCharacter.findUnique({ where: { id: charId }, select: { level: true, skillNodes: { select: { nodeId: true } } } });
    if (!char) throw new EconomyError("Personagem não encontrado.");
    const puppet = await tx.puppet.findFirst({ where: { id: puppetId, charId }, include: { upgrades: true } });
    if (!puppet) throw new EconomyError("Marionete não encontrada.");
    if (puppet.destroyedAt) throw new EconomyError("Reconstrua a marionete antes de instalar um mecanismo.");
    if (char.level < upgrade.reqLevel) throw new EconomyError(`${upgrade.name} exige nível ${upgrade.reqLevel}.`);
    if (!char.skillNodes.some((node) => node.nodeId === craftNodeForGrade(upgrade.grade))) {
      throw new EconomyError(`${upgrade.name} exige a Oficina de Grau ${upgrade.grade}.`);
    }
    if (puppet.upgrades.some((part) => part.upgradeId === upgrade.id)) throw new EconomyError("Essa evolução já está instalada nesta marionete.");
    const hasExtraSlotNode = char.skillNodes.some((node) => node.nodeId === EXTRA_SLOT_NODE_ID);
    const anotherPuppetHasExtraSlot = await tx.puppet.findFirst({ where: { charId, extraSlot: true, NOT: { id: puppet.id } } });
    const cap = puppetMechanismCap(hasExtraSlotNode, puppet.extraSlot, Boolean(anotherPuppetHasExtraSlot));
    if (puppet.upgrades.length >= cap) {
      throw new EconomyError(
        cap >= 3
          ? "Essa marionete já atingiu o limite de 3 mecanismos (Braço Extra)."
          : "Essa marionete já possui os 2 mecanismos padrão. O Braço Extra do clã Shirogane libera uma 3ª vaga, mas só numa marionete por vez.",
      );
    }
    await debitRecipe(tx, charId, upgrade.ryo, upgrade.ingredients);
    const order = await tx.puppetCraftOrder.create({
      data: { charId, puppetId, kind: "UPGRADE", optionId: upgrade.id, finishesAt: new Date(Date.now() + upgrade.durationHours * HOUR) },
    });
    await tx.economyActionLog.create({ data: { charId, action: "CRAFT_PUPPET", detailsJson: JSON.stringify({ puppetId, upgradeId, orderId: order.id }) } });
    return { order, upgrade };
  }));
}

export async function claimPuppetConstruction(charId: string, orderId: string) {
  await refreshPuppetOrders(charId);
  return runEconomy(async () => prisma.$transaction(async (tx) => {
    const order = await tx.puppetCraftOrder.findFirst({ where: { id: orderId, charId, status: "READY" } });
    if (!order) throw new EconomyError("Esta construção ainda não está pronta ou já foi recolhida.");
    if (order.kind === "PUPPET") {
      if (!order.puppetName || !order.shell || !isPuppetShell(order.shell)) throw new EconomyError("Dados da carapaça inválidos.");
      const puppet = await tx.puppet.create({ data: { charId, name: order.puppetName, appearanceUrl: order.appearanceUrl, shell: order.shell } });
      await tx.puppetCraftOrder.update({ where: { id: order.id }, data: { status: "INSTALLED", puppetId: puppet.id } });
      return { kind: "PUPPET" as const, puppet };
    }
    if (order.kind === "REBUILD") {
      if (!order.puppetId) throw new EconomyError("Dados da reconstrução inválidos.");
      const puppet = await tx.puppet.findFirst({ where: { id: order.puppetId, charId, destroyedAt: { not: null } } });
      if (!puppet) throw new EconomyError("Esta marionete não precisa ser reconstruída ou foi descartada.");
      await tx.puppet.update({ where: { id: puppet.id }, data: { destroyedAt: null } });
      await tx.puppetCraftOrder.update({ where: { id: order.id }, data: { status: "INSTALLED" } });
      return { kind: "REBUILD" as const, puppet };
    }
    if (!order.puppetId || !getPuppetUpgrade(order.optionId)) throw new EconomyError("Dados da evolução inválidos.");
    const puppet = await tx.puppet.findFirst({ where: { id: order.puppetId, charId } });
    if (!puppet) throw new EconomyError("Marionete não encontrada.");
    const installed = await tx.puppetUpgrade.count({ where: { puppetId: order.puppetId } });
    const hasExtraSlotNode = (await tx.characterSkillNode.findFirst({ where: { charId, nodeId: EXTRA_SLOT_NODE_ID } })) !== null;
    const anotherPuppetHasExtraSlot = await tx.puppet.findFirst({ where: { charId, extraSlot: true, NOT: { id: puppet.id } } });
    const cap = puppetMechanismCap(hasExtraSlotNode, puppet.extraSlot, Boolean(anotherPuppetHasExtraSlot));
    if (installed >= cap) throw new EconomyError("Essa marionete já possui as evoluções instaladas no limite atual. Libere um slot antes de recolher esta peça.");
    // 1a vez cruzando de 2 pra 3 nesta marionete: reserva a vaga extra pra ela
    // permanentemente (nao reverte ao desinstalar — so' descartar a marionete
    // libera de novo, ver puppetMechanismCap).
    if (installed === 2 && !puppet.extraSlot) {
      await tx.puppet.update({ where: { id: puppet.id }, data: { extraSlot: true } });
    }
    await tx.puppetUpgrade.create({ data: { puppetId: order.puppetId, upgradeId: order.optionId } });
    await tx.puppetCraftOrder.update({ where: { id: order.id }, data: { status: "INSTALLED" } });
    return { kind: "UPGRADE" as const, upgrade: getPuppetUpgrade(order.optionId)! };
  }));
}

export async function uninstallPuppetUpgrade(charId: string, puppetId: string, upgradeId: string) {
  return runEconomy(async () => prisma.$transaction(async (tx) => {
    const puppet = await tx.puppet.findFirst({ where: { id: puppetId, charId } });
    if (!puppet) throw new EconomyError("Marionete não encontrada.");
    const part = await tx.puppetUpgrade.findUnique({ where: { puppetId_upgradeId: { puppetId, upgradeId } } });
    if (!part) throw new EconomyError("Essa evolução não está instalada nesta marionete.");
    await tx.puppetUpgrade.delete({ where: { id: part.id } });
    return { upgrade: getPuppetUpgrade(upgradeId)?.name ?? upgradeId };
  }));
}

export async function startPuppetRebuild(charId: string, puppetId: string) {
  return runEconomy(async () => prisma.$transaction(async (tx) => {
    const puppet = await tx.puppet.findFirst({ where: { id: puppetId, charId } });
    if (!puppet) throw new EconomyError("Marionete não encontrada.");
    if (!puppet.destroyedAt) throw new EconomyError("Esta marionete não foi destruída.");
    const existing = await tx.puppetCraftOrder.findFirst({ where: { charId, puppetId, kind: "REBUILD", status: "BUILDING" } });
    if (existing) throw new EconomyError("A reconstrução desta marionete já está em andamento.");
    const shell = puppet.shell as PuppetShell;
    if (!isPuppetShell(shell)) throw new EconomyError("Carapaça inválida.");
    const skillNodes = await tx.characterSkillNode.findMany({ where: { charId }, select: { nodeId: true } });
    const craftMult = characterPassiveMods(skillNodes.map((node) => node.nodeId)).puppetCraftCostMult;
    const { ingredients } = applyCraftDiscount(0, puppetRebuildIngredients(shell), craftMult);
    await debitIngredients(tx, charId, ingredients);
    const order = await tx.puppetCraftOrder.create({
      data: { charId, puppetId, kind: "REBUILD", optionId: shell, finishesAt: new Date(Date.now() + REBUILD_DURATION_HOURS * HOUR) },
    });
    await tx.economyActionLog.create({ data: { charId, action: "REBUILD_PUPPET", detailsJson: JSON.stringify({ puppetId, orderId: order.id }) } });
    return { order, puppet, ingredients, durationHours: REBUILD_DURATION_HOURS };
  }));
}

export async function discardPuppet(charId: string, puppetId: string) {
  return runEconomy(async () => prisma.$transaction(async (tx) => {
    const puppet = await tx.puppet.findFirst({ where: { id: puppetId, charId } });
    if (!puppet) throw new EconomyError("Marionete não encontrada.");
    await tx.puppetCraftOrder.updateMany({ where: { puppetId, status: "BUILDING" }, data: { status: "CANCELLED" } });
    await tx.puppet.delete({ where: { id: puppet.id } });
    await tx.economyActionLog.create({ data: { charId, action: "DISCARD_PUPPET", detailsJson: JSON.stringify({ puppetId, name: puppet.name }) } });
    return { name: puppet.name };
  }));
}
