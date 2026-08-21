import { randomUUID } from "node:crypto";
import { prisma } from "../../db/client.js";
import type { Prisma } from "@prisma/client";
import { getPremiumProduct, type PremiumProductId } from "../../data/premium-products.js";
import { CLANS_BY_VILLAGE, rollClanVillageOptions, rollTrait } from "../../data/sheet-creation.js";
import { CLANS } from "../../data/clans/index.js";
import { getTrait, type TraitDef } from "../../data/traits.js";
import { refreshDerived, setClan } from "../characters/character-service.js";
import { setCharacterTrait } from "../characters/trait-service.js";
import { ATTRIBUTES, type Attribute } from "../../config/enums.js";
import { getNode } from "../../data/element-trees/index.js";
import { releaseAppearance } from "../appearance/appearance-service.js";

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

export type PremiumPurchaseResult = {
  product: ReturnType<typeof getPremiumProduct>;
  refundedPoints?: number;
  characterReset?: boolean;
  removedFightingStyles?: number;
};

async function resetSkillTreeProgression(tx: Prisma.TransactionClient, charId: string): Promise<number> {
  const char = await tx.userCharacter.findUnique({
    where: { id: charId },
    include: { attributes: true, skillNodes: true },
  });
  if (!char?.attributes) throw new PremiumStoreError("Personagem sem atributos.");

  const refundedPoints = ATTRIBUTES.reduce(
    (total, attribute) => total + Number((char.attributes as unknown as Record<Attribute, number>)[attribute] ?? 0),
    0,
  );
  const resetAttributes: Record<string, number> = {};
  for (const attribute of ATTRIBUTES) resetAttributes[attribute] = 0;
  const skillTreeJutsus = [...new Set(char.skillNodes
    .map(({ nodeId }) => getNode(nodeId))
    .filter((node) => node?.kind === "JUTSU" && node.grantsAbilityId)
    .map((node) => node!.grantsAbilityId!))];

  await tx.characterAttributes.update({ where: { charId }, data: resetAttributes });
  await tx.userCharacter.update({ where: { id: charId }, data: { attributePoints: { increment: refundedPoints } } });
  await tx.characterSkillNode.deleteMany({ where: { charId } });
  if (skillTreeJutsus.length) await tx.characterJutsu.deleteMany({ where: { charId, jutsuId: { in: skillTreeJutsus } } });
  return refundedPoints;
}

async function resetFightingStyleProgression(tx: Prisma.TransactionClient, charId: string): Promise<number> {
  const char = await tx.userCharacter.findUnique({
    where: { id: charId },
    include: { fightingStyles: true, skillNodes: true },
  });
  if (!char) throw new PremiumStoreError("Personagem não encontrado.");
  if (!char.fightingStyles.length) throw new PremiumStoreError("Você ainda não aprendeu um estilo de luta para resetar.");

  const ownedStyles = new Set(char.fightingStyles.map((entry) => entry.style));
  const styleNodes = char.skillNodes
    .map(({ nodeId }) => getNode(nodeId))
    .filter((node) => node?.fightingStyle && ownedStyles.has(node.fightingStyle));
  const nodeIds = styleNodes.map((node) => node!.id);
  const styleJutsus = [...new Set(styleNodes
    .filter((node) => node!.kind === "JUTSU" && node!.grantsAbilityId)
    .map((node) => node!.grantsAbilityId!))];

  if (nodeIds.length) await tx.characterSkillNode.deleteMany({ where: { charId, nodeId: { in: nodeIds } } });
  if (styleJutsus.length) await tx.characterJutsu.deleteMany({ where: { charId, jutsuId: { in: styleJutsus } } });
  await tx.characterFightingStyle.deleteMany({ where: { charId } });
  return char.fightingStyles.length;
}

export async function buyPremiumProduct(walletId: string, charId: string, productId: PremiumProductId, interactionId: string): Promise<PremiumPurchaseResult> {
  const product = getPremiumProduct(productId);
  if (!product) throw new PremiumStoreError("Produto premium desconhecido.");
  if (product.kind === "CHARACTER_RESET" || product.kind === "FIGHTING_STYLE_RESET") {
    const activeCombat = await prisma.combatParticipant.findFirst({
      where: { charId, session: { status: "ACTIVE" } },
      select: { id: true },
    });
    if (activeCombat) throw new PremiumStoreError(product.kind === "CHARACTER_RESET"
      ? "Encerre o combate em andamento antes de resetar o personagem."
      : "Encerre o combate em andamento antes de resetar os estilos de luta.");
  }
  let refundedPoints: number | undefined;
  let removedFightingStyles: number | undefined;
  let resetIdentity: { discordId: string; guildId: string } | undefined;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.premiumPurchase.create({ data: { walletId, interactionId, productId: product.id, cost: product.cost } });
      const paid = await tx.premiumWallet.updateMany({
        where: { id: walletId, ingots: { gte: product.cost } },
        data: { ingots: { decrement: product.cost } },
      });
      if (paid.count !== 1) throw new PremiumStoreError("Ingots insuficientes para esta compra.");

      if (product.kind === "SPIN") {
        await tx.premiumWallet.update({ where: { id: walletId }, data: { [product.spinField]: { increment: 1 } } });
      } else if (product.kind === "RESPEC") {
        refundedPoints = await resetSkillTreeProgression(tx, charId);
      } else if (product.kind === "FIGHTING_STYLE_RESET") {
        removedFightingStyles = await resetFightingStyleProgression(tx, charId);
      } else {
        const char = await tx.userCharacter.findUnique({ where: { id: charId }, select: { discordId: true, guildId: true } });
        if (!char) throw new PremiumStoreError("Personagem não encontrado.");
        // Diferente do RESPEC: o Reset Premium troca so' a identidade
        // narrativa. Atributos, pontos investidos, nos das Arvores de
        // Habilidade e jutsus permanecem intactos.
        await tx.userCharacter.update({
          where: { id: charId },
          data: { displayName: null, ninjaRank: "ACADEMIA" },
        });
        await tx.characterProfile.deleteMany({ where: { charId } });
        await tx.sheetCreationSession.deleteMany({ where: { guildId: char.guildId, discordId: char.discordId } });
        await tx.premiumSpinSession.deleteMany({ where: { walletId, usedAt: null } });
        resetIdentity = char;
      }
    });
  } catch (error) {
    if (error instanceof PremiumStoreError) throw error;
    if ((error as { code?: string }).code === "P2002") throw new PremiumStoreError("Esta compra jÃ¡ foi processada.");
    throw error;
  }
  if (product.kind === "RESPEC" || product.kind === "CHARACTER_RESET" || product.kind === "FIGHTING_STYLE_RESET") await refreshDerived(charId);
  if (resetIdentity) await releaseAppearance(resetIdentity.discordId, resetIdentity.guildId).catch(() => undefined);
  return { product, refundedPoints, characterReset: product.kind === "CHARACTER_RESET", removedFightingStyles };
}

export async function useClanSpin(charId: string, walletId: string): Promise<{ id: string; name: string; villageId: string }> {
  const char = await prisma.userCharacter.findUnique({ where: { id: charId }, include: { clan: true, profile: true } });
  if (!char) throw new PremiumStoreError("Personagem nÃ£o encontrado.");
  if (char.ninjaRank !== "ACADEMIA") throw new PremiumStoreError("Depois de se tornar Genin, outro ClÃ£ sÃ³ pode ser obtido ao resetar o personagem.");
  if (!char.villageId || !(char.villageId in CLANS_BY_VILLAGE)) throw new PremiumStoreError("Sua Vila de origem nÃ£o estÃ¡ definida para realizar um Giro de ClÃ£.");
  const option = rollClanVillageOptions(25).find((entry) => entry.villageId !== char.villageId || entry.clanId !== char.clan?.clanId);
  if (!option) throw new PremiumStoreError("NÃ£o foi possÃ­vel encontrar outro ClÃ£ para sua Vila.");
  const consumed = await prisma.premiumWallet.updateMany({ where: { id: walletId, clanSpins: { gt: 0 } }, data: { clanSpins: { decrement: 1 } } });
  if (consumed.count !== 1) throw new PremiumStoreError("VocÃª nÃ£o possui Giro de ClÃ£ disponÃ­vel.");
  const clan = CLANS.find((entry) => entry.id === option.clanId);
  await prisma.userCharacter.update({
    where: { id: charId },
    data: {
      villageId: option.villageId,
      ...(char.profile?.givenName && clan ? { displayName: `${char.profile.givenName} ${clan.name}` } : {}),
    },
  });
  await setClan(charId, option.clanId);
  return { id: option.clanId, name: clan?.name ?? option.clanId, villageId: option.villageId };
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

export type WebPremiumBuyResult =
  | { ok: true; wallet: PremiumWallet; message: string }
  | { ok: false; error: string };

// Mesma regra de negocio do /loja-premium (buyPremiumProduct), so' que
// resolvendo o personagem a partir da sessao web (discordId+guildId) em vez
// de uma interacao do Discord. A guildId sempre vem de ENV.DISCORD_GUILD_ID
// no servidor web, nunca do cliente.
export async function buyPremiumProductForDiscordUser(discordId: string, guildId: string, productId: string): Promise<WebPremiumBuyResult> {
  const product = getPremiumProduct(productId);
  if (!product) return { ok: false, error: "Produto premium desconhecido." };

  const char = await prisma.userCharacter.findUnique({
    where: { discordId_guildId: { discordId, guildId } },
    include: { profile: true },
  });
  if (!char) return { ok: false, error: "Você ainda não tem um personagem. Crie um pelo Discord antes de comprar." };
  if (!char.profile?.completedAt) return { ok: false, error: "Conclua sua ficha (/ficha no Discord) antes de usar a Loja Premium." };

  const wallet = await getPremiumWallet(discordId, guildId);
  try {
    await buyPremiumProduct(wallet.id, char.id, product.id, `web:${randomUUID()}`);
  } catch (error) {
    if (error instanceof PremiumStoreError) return { ok: false, error: error.message };
    throw error;
  }
  const updated = await getPremiumWallet(discordId, guildId);
  return { ok: true, wallet: updated, message: `${product.name} adquirido.` };
}
