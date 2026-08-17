import { prisma } from "../../db/client.js";
import { getPremiumProduct, type PremiumProductId } from "../../data/premium-products.js";
import { CLANS_BY_VILLAGE, rollClanVillageOptions, rollTrait } from "../../data/sheet-creation.js";
import { CLANS } from "../../data/clans/index.js";
import { getTrait, type TraitDef } from "../../data/traits.js";
import { setClan } from "../characters/character-service.js";
import { setCharacterTrait } from "../characters/trait-service.js";

const TRAIT_SESSION_TTL_MS = 15 * 60_000;

export class PremiumStoreError extends Error {}

export type PremiumWallet = { id: string; ingots: number; clanSpins: number; traitSpins: number };
export type TraitSpinResult = { state: "applied"; trait: TraitDef } | { state: "choice"; sessionId: string; options: TraitDef[] };

export async function getPremiumWallet(discordId: string, guildId: string): Promise<PremiumWallet> {
  return prisma.premiumWallet.upsert({
    where: { discordId_guildId: { discordId, guildId } },
    create: { discordId, guildId },
    update: {},
  });
}

export async function buyPremiumProduct(walletId: string, productId: PremiumProductId, interactionId: string) {
  const product = getPremiumProduct(productId);
  if (!product) throw new PremiumStoreError("Produto premium desconhecido.");
  try {
    await prisma.$transaction(async (tx) => {
      await tx.premiumPurchase.create({ data: { walletId, interactionId, productId: product.id, cost: product.cost } });
      const paid = await tx.premiumWallet.updateMany({
        where: { id: walletId, ingots: { gte: product.cost } },
        data: { ingots: { decrement: product.cost }, [product.spinField]: { increment: 1 } },
      });
      if (paid.count !== 1) throw new PremiumStoreError("Ingots insuficientes para esta compra.");
    });
  } catch (error) {
    if (error instanceof PremiumStoreError) throw error;
    if ((error as { code?: string }).code === "P2002") throw new PremiumStoreError("Esta compra jÃ¡ foi processada.");
    throw error;
  }
  return product;
}

export async function useClanSpin(charId: string, walletId: string) {
  const char = await prisma.userCharacter.findUnique({ where: { id: charId }, include: { clan: true } });
  if (!char) throw new PremiumStoreError("Personagem nÃ£o encontrado.");
  if (char.ninjaRank !== "ACADEMIA") throw new PremiumStoreError("Depois de se tornar Genin, outro ClÃ£ sÃ³ pode ser obtido ao resetar o personagem.");
  if (!char.villageId || !(char.villageId in CLANS_BY_VILLAGE)) throw new PremiumStoreError("Sua Vila de origem nÃ£o estÃ¡ definida para realizar um Giro de ClÃ£.");
  const option = rollClanVillageOptions(25).find((entry) => entry.villageId === char.villageId && entry.clanId !== char.clan?.clanId);
  if (!option) throw new PremiumStoreError("NÃ£o foi possÃ­vel encontrar outro ClÃ£ para sua Vila.");
  const consumed = await prisma.premiumWallet.updateMany({ where: { id: walletId, clanSpins: { gt: 0 } }, data: { clanSpins: { decrement: 1 } } });
  if (consumed.count !== 1) throw new PremiumStoreError("VocÃª nÃ£o possui Giro de ClÃ£ disponÃ­vel.");
  await setClan(charId, option.clanId);
  return CLANS.find((clan) => clan.id === option.clanId)?.name ?? option.clanId;
}

export async function startTraitSpin(charId: string, walletId: string): Promise<TraitSpinResult> {
  const options = rollTrait().options.filter((trait) => Boolean(getTrait(trait.id)));
  if (!options.length) throw new PremiumStoreError("O sorteio de TraÃ§o nÃ£o retornou uma opÃ§Ã£o vÃ¡lida.");
  const wallet = await prisma.premiumWallet.findUnique({ where: { id: walletId }, select: { traitSpins: true } });
  if (!wallet || wallet.traitSpins < 1) throw new PremiumStoreError("VocÃª nÃ£o possui Giro de TraÃ§o disponÃ­vel.");
  if (options.length === 1) {
    const trait = options[0]!;
    const consumed = await prisma.premiumWallet.updateMany({ where: { id: walletId, traitSpins: { gt: 0 } }, data: { traitSpins: { decrement: 1 } } });
    if (consumed.count !== 1) throw new PremiumStoreError("VocÃª nÃ£o possui Giro de TraÃ§o disponÃ­vel.");
    await setCharacterTrait(charId, trait.id);
    return { state: "applied", trait };
  }
  const session = await prisma.$transaction(async (tx) => {
    await tx.premiumSpinSession.deleteMany({ where: { walletId, kind: "TRAIT", usedAt: null } });
    return tx.premiumSpinSession.create({ data: { walletId, kind: "TRAIT", choices: JSON.stringify(options.map((trait) => trait.id)), expiresAt: new Date(Date.now() + TRAIT_SESSION_TTL_MS) } });
  });
  return { state: "choice", sessionId: session.id, options };
}

export async function chooseTraitSpin(charId: string, walletId: string, sessionId: string, traitId: string): Promise<TraitDef> {
  const trait = getTrait(traitId);
  if (!trait) throw new PremiumStoreError("TraÃ§o desconhecido.");
  await prisma.$transaction(async (tx) => {
    const session = await tx.premiumSpinSession.findFirst({ where: { id: sessionId, walletId, kind: "TRAIT", usedAt: null, expiresAt: { gt: new Date() } } });
    if (!session) throw new PremiumStoreError("Esta escolha expirou. FaÃ§a um novo Giro de TraÃ§o.");
    const choices: unknown = JSON.parse(session.choices);
    if (!Array.isArray(choices) || !choices.includes(traitId)) throw new PremiumStoreError("Esse TraÃ§o nÃ£o pertence a este sorteio.");
    const consumed = await tx.premiumWallet.updateMany({ where: { id: walletId, traitSpins: { gt: 0 } }, data: { traitSpins: { decrement: 1 } } });
    if (consumed.count !== 1) throw new PremiumStoreError("VocÃª nÃ£o possui Giro de TraÃ§o disponÃ­vel.");
    const used = await tx.premiumSpinSession.updateMany({ where: { id: session.id, usedAt: null }, data: { usedAt: new Date() } });
    if (used.count !== 1) throw new PremiumStoreError("Esta escolha jÃ¡ foi usada.");
  });
  await setCharacterTrait(charId, traitId);
  return trait;
}
