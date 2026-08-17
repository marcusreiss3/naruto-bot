import { prisma } from "../../db/client.js";
import {
  PUPPET_SHELLS,
  craftNodeForGrade,
  getPuppetUpgrade,
  isPuppetShell,
  type PuppetShell,
} from "../../data/puppet-upgrades.js";
import { getItem } from "../../data/items.js";
import { removeInventoryItem } from "../characters/inventory.js";
import { EconomyError, runEconomy } from "../economy/errors.js";
import type { Tx } from "../economy/ledger.js";

const HOUR = 60 * 60 * 1000;

export interface PuppetCapabilities {
  slots: number;
  leash: number;
  bonusAttack: boolean;
  shellDamageBonus: number;
  shellHpBonus: number;
  shellShieldBonus: number;
  shellEffectTurns: number;
  shellChakraDrainBonus: number;
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
  };
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

async function debitRecipe(
  tx: Tx,
  charId: string,
  ryo: number,
  ingredients: { itemId: string; qty: number }[],
): Promise<void> {
  const char = await tx.userCharacter.findUnique({ where: { id: charId }, select: { ryo: true } });
  if (!char || char.ryo < ryo) throw new EconomyError(`Você precisa de ${ryo} Ryō para iniciar esta construção.`);
  for (const ingredient of ingredients) {
    await removeInventoryItem(tx, charId, ingredient.itemId, ingredient.qty, `Falta ${ingredient.qty}x ${getItem(ingredient.itemId)?.name ?? ingredient.itemId}.`);
  }
  await tx.userCharacter.update({ where: { id: charId }, data: { ryo: { decrement: ryo } } });
}

export async function startPuppetConstruction(charId: string, name: string, shell: string) {
  const normalizedName = validPuppetName(name);
  if (!normalizedName) return { ok: false as const, error: "O nome da marionete deve ter entre 2 e 32 caracteres." };
  if (!isPuppetShell(shell)) return { ok: false as const, error: "Carapaça inválida." };

  return runEconomy(async () => prisma.$transaction(async (tx) => {
    const char = await tx.userCharacter.findUnique({ where: { id: charId }, select: { level: true, skillNodes: { select: { nodeId: true } } } });
    if (!char?.skillNodes.some((node) => node.nodeId === "kugutsu_oficina_inicial")) {
      throw new EconomyError("Compre **Oficina de Marionetes** na árvore de Kugutsu antes de construir uma marionete.");
    }
    const spec = PUPPET_SHELLS[shell];
    await debitRecipe(tx, charId, spec.ryo, spec.ingredients);
    const order = await tx.puppetCraftOrder.create({
      data: { charId, kind: "PUPPET", optionId: shell, puppetName: normalizedName, shell, finishesAt: new Date(Date.now() + spec.durationHours * HOUR) },
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
    if (char.level < upgrade.reqLevel) throw new EconomyError(`${upgrade.name} exige nível ${upgrade.reqLevel}.`);
    if (!char.skillNodes.some((node) => node.nodeId === craftNodeForGrade(upgrade.grade))) {
      throw new EconomyError(`${upgrade.name} exige a Oficina de Grau ${upgrade.grade}.`);
    }
    if (puppet.upgrades.some((part) => part.upgradeId === upgrade.id)) throw new EconomyError("Essa evolução já está instalada nesta marionete.");
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
      const puppet = await tx.puppet.create({ data: { charId, name: order.puppetName, shell: order.shell } });
      await tx.puppetCraftOrder.update({ where: { id: order.id }, data: { status: "INSTALLED", puppetId: puppet.id } });
      return { kind: "PUPPET" as const, puppet };
    }
    if (!order.puppetId || !getPuppetUpgrade(order.optionId)) throw new EconomyError("Dados da evolução inválidos.");
    const installed = await tx.puppetUpgrade.count({ where: { puppetId: order.puppetId } });
    if (installed >= 2) throw new EconomyError("Essa marionete já possui as 2 evoluções instaladas. Libere um slot antes de recolher esta peça.");
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
