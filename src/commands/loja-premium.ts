import { ButtonStyle, MessageFlags, SlashCommandBuilder, type ButtonInteraction, type ChatInputCommandInteraction } from "discord.js";
import type { Command } from "./types.js";
import { PREMIUM_PRODUCTS, getPremiumProduct, type PremiumProductId } from "../data/premium-products.js";
import { clanIconUrl, SHEET_LOCATION_ROLES, SHEET_VILLAGE_ROLES, traitIconUrl } from "../data/sheet-creation.js";
import { ALL_TRAVEL_ROLE_IDS, TRAVEL_LOCATION_ROLE_IDS } from "../data/travel.js";
import { getClan } from "../data/index.js";
import { type TraitDef } from "../data/traits.js";
import { VILLAGE_NAMES, type VillageId } from "../data/villages.js";
import { getOrCreateCharacter } from "../services/characters/character-service.js";
import { buyPremiumProduct, chooseTraitSpin, getPremiumWallet, PremiumStoreError, startTraitSpin, useClanSpin, type PremiumWallet } from "../services/premium/ingot-store.js";
import { blobAssetUrl } from "../services/blob/asset-manifest.js";
import { ENV } from "../config/env.js";
import { button, buttonRow, divider, economyContainer, factsBlock, mediaGallery, navigationRow, noticeBlock, text, thumbnailSection, titleBlock, v2Edit, v2Payload, type ContainerChild, type TopLevel } from "../ui/economy-components-v2.js";
import { emoji, type EmojiKey } from "../ui/economy-emojis.js";

const PREFIX = "loja-premium:v1";
const SITE_URL = ENV.WEB_BASE_URL || "https://naruto-rp.squareweb.app";
const INGOTS_URL = `${SITE_URL}/#/ingots`;
const cid = (action: string, value?: string) => `${PREFIX}:${action}${value ? `:${value}` : ""}`;
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const RARITY_LABEL: Record<string, string> = { COMUM: "Comum", RARA: "Rara", EPICA: "Épica", LENDARIA: "Lendária", MITICA: "Mítica" };
const PRODUCT_EMOJI: Record<PremiumProductId, EmojiKey> = {
  clan_spin: "giro_cla",
  trait_spin: "giro_traco",
  attribute_respec: "reset_atributos",
  fighting_style_reset: "reset_estilos",
  character_reset: "reset_personagem",
};
type Page = 0 | 1;

function assetUrl(webPath: string): string {
  return blobAssetUrl(webPath) ?? `${SITE_URL}${webPath}`;
}

function productOffer(product: (typeof PREMIUM_PRODUCTS)[number]): ContainerChild[] {
  return [
    text(`### ${emoji(PRODUCT_EMOJI[product.id])} ${product.name}\n${product.description}\n-# Custo: ${product.cost} Ingots`),
    buttonRow(button({
      id: cid("buy", product.id),
      label: `Comprar por ${product.cost} Ingots`,
      style: ButtonStyle.Primary,
      emojiKey: PRODUCT_EMOJI[product.id],
    })),
  ];
}

function pageNav(page: Page): ContainerChild {
  return navigationRow([
    { id: cid("page", "0"), label: "Giros", disabled: page === 0 },
    { id: cid("page", "1"), label: "Recursos e reorganização", disabled: page === 1 },
  ]);
}

function panel(wallet: PremiumWallet, feedback?: string, page: Page = 0): TopLevel[] {
  const spins = PREMIUM_PRODUCTS.filter((product) => product.kind === "SPIN");
  const extras = PREMIUM_PRODUCTS.filter((product) => product.kind !== "SPIN");
  const children: ContainerChild[] = [
    titleBlock("ingots", "Loja Premium", "Produtos adquiridos com Ingots"),
    factsBlock([
      { label: "Ingots", value: String(wallet.ingots) },
      { label: `${emoji("giro_cla")} Giros de Vila + Clã`, value: String(wallet.clanSpins) },
      { label: `${emoji("giro_traco")} Giros de Traço`, value: String(wallet.traitSpins) },
    ]),
  ];
  if (feedback) children.push(noticeBlock(feedback.startsWith("✅") ? "sucesso" : "erro", feedback.replace(/^[✅❌]\s*/, "")));
  children.push(divider(), pageNav(page));
  if (page === 0) {
    children.push(divider(), text(`## Giros\nUse ${emoji("giro_cla")} para revelar uma nova possibilidade de Vila + Clã ou ${emoji("giro_traco")} para um novo Traço.`));
    for (const product of spins) children.push(...productOffer(product));
    children.push(
      divider(),
      text("## Giros disponíveis\nUse os Giros que você já possui."),
      buttonRow(
        button({ id: cid("use-clan"), label: "Usar Giro de Vila + Clã", emojiKey: "giro_cla", disabled: wallet.clanSpins < 1 }),
        button({ id: cid("use-trait"), label: "Usar Giro de Traço", emojiKey: "giro_traco", disabled: wallet.traitSpins < 1 }),
      ),
      text("-# Giros de Vila + Clã sorteiam uma nova origem válida e só podem ser usados enquanto o personagem ainda for da Academia."),
    );
  } else {
    children.push(divider(), text("## Recursos e reorganização\nOpções diretas para reorganizar sua progressão."));
    for (const product of extras) children.push(...productOffer(product));
  }
  children.push(
    divider(),
    text(`### ${emoji("ingots")} Sobre Ingots\n[Abra a aba de Ingots no site](${INGOTS_URL}) para ver como conseguir e no que gastar.`),
  );
  return [economyContainer("obras", children)];
}

function spinAnimationPanel(title: string, icon: EmojiKey, stage: string, step: number, total: number): TopLevel[] {
  const progress = "■".repeat(step + 1) + "□".repeat(total - step - 1);
  return [economyContainer("obras", [
    titleBlock(icon, title, "Sorteio em andamento"),
    text(`**${stage}**\n[${progress}]`),
    text("-# O resultado é definido pelas probabilidades normais."),
  ])];
}

function traitRevealPanel(trait: TraitDef): TopLevel[] {
  return [economyContainer("obras", [
    titleBlock("giro_traco", "Traço definido", `Faixa ${RARITY_LABEL[trait.rarity] ?? trait.rarity}`),
    mediaGallery(assetUrl(traitIconUrl(trait)), `Ícone do Traço ${trait.name}`),
    text(`## ${trait.name}\n${trait.description}`),
    text(`[Conheça os Traços no site](${SITE_URL}/#/guias/traits)`),
    divider(),
    buttonRow(button({ id: cid("back"), label: "Voltar à Loja Premium", emojiKey: "ingots" })),
  ])];
}

function clanRevealPanel(clanId: string, villageId: VillageId): TopLevel[] {
  const clan = getClan(clanId);
  if (!clan) throw new PremiumStoreError("Clã sorteado não encontrado.");
  return [economyContainer("obras", [
    titleBlock("giro_cla", "Origem definida", `${VILLAGE_NAMES[villageId]} · Clã ${clan.name}`),
    mediaGallery(assetUrl(clanIconUrl(clan.id)), `Símbolo do Clã ${clan.name}`),
    text(`## ${clan.name}\n${clan.description}`),
    text(`[Conheça os Clãs no site](${SITE_URL}/#/guias/clas-e-spins)`),
    divider(),
    buttonRow(button({ id: cid("back"), label: "Voltar à Loja Premium", emojiKey: "ingots" })),
  ])];
}

async function syncOriginRoles(interaction: ButtonInteraction, villageId: VillageId): Promise<void> {
  const guild = interaction.guild;
  if (!guild) throw new PremiumStoreError("Este Giro precisa ser usado dentro do servidor.");
  const member = await guild.members.fetch(interaction.user.id);
  const villageRole = SHEET_VILLAGE_ROLES[villageId];
  const locationRole = SHEET_LOCATION_ROLES[villageId];
  const reason = "Giro Premium de Vila + Clã";
  if (!member.roles.cache.has(villageRole)) await member.roles.add(villageRole, reason);
  if (!member.roles.cache.has(locationRole)) await member.roles.add(locationRole, reason);
  for (const roleId of Object.values(SHEET_VILLAGE_ROLES)) {
    if (roleId !== villageRole && member.roles.cache.has(roleId)) await member.roles.remove(roleId, reason);
  }
  for (const roleId of new Set([...TRAVEL_LOCATION_ROLE_IDS, ...ALL_TRAVEL_ROLE_IDS])) {
    if (roleId !== locationRole && member.roles.cache.has(roleId)) await member.roles.remove(roleId, reason);
  }
}

function respecConfirmationPanel(wallet: PremiumWallet): TopLevel[] {
  const cost = getPremiumProduct("attribute_respec")!.cost;
  return [economyContainer("obras", [
    titleBlock("reset_atributos", "Confirmar reset de atributos", "Esta ação usa Ingots e altera sua ficha"),
    factsBlock([{ label: "Ingots", value: String(wallet.ingots) }, { label: "Custo", value: String(cost) }]),
    divider(),
    noticeBlock("aviso", "Todos os atributos serão zerados, os pontos investidos voltarão ao saldo e as habilidades aprendidas nas Árvores de Habilidade serão removidas."),
    text("Você poderá redistribuir os pontos com `/atributos` depois do reset."),
    divider(),
    buttonRow(
      button({ id: cid("confirm-respec"), label: `Confirmar reset por ${cost} Ingots`, style: ButtonStyle.Danger, emojiKey: "reset_atributos" }),
      button({ id: cid("cancel-respec"), label: "Cancelar", style: ButtonStyle.Secondary }),
    ),
  ])];
}

function characterResetConfirmationPanel(wallet: PremiumWallet): TopLevel[] {
  const cost = getPremiumProduct("character_reset")!.cost;
  return [economyContainer("obras", [
    titleBlock("reset_personagem", "Confirmar reset premium", "Esta ação usa Ingots e prepara uma nova ficha"),
    factsBlock([{ label: "Ingots", value: String(wallet.ingots) }, { label: "Custo", value: String(cost) }]),
    divider(),
    noticeBlock("aviso", "Nome, rank, idade, aparência e história serão resetados. O rank volta para Academia, permitindo usar Giros de Vila + Clã novamente. Os pontos investidos voltarão ao saldo e as habilidades aprendidas nas Árvores de Habilidade serão removidas."),
    text("Você manterá nível, XP, Vila, Clã, Traço, inventário, Ryō, Ingots e Giros disponíveis."),
    text("Depois, use `/ficha` para preencher novamente os dados narrativos do personagem."),
    divider(),
    buttonRow(
      button({ id: cid("confirm-character-reset"), label: `Confirmar reset por ${cost} Ingots`, style: ButtonStyle.Danger, emojiKey: "reset_personagem" }),
      button({ id: cid("cancel-character-reset"), label: "Cancelar", style: ButtonStyle.Secondary }),
    ),
  ])];
}

function fightingStyleResetConfirmationPanel(wallet: PremiumWallet): TopLevel[] {
  const cost = getPremiumProduct("fighting_style_reset")!.cost;
  return [economyContainer("obras", [
    titleBlock("reset_estilos", "Confirmar reset de estilos", "Esta ação usa Ingots e reorganiza seus estilos de luta"),
    factsBlock([{ label: "Ingots", value: String(wallet.ingots) }, { label: "Custo", value: String(cost) }]),
    divider(),
    noticeBlock("aviso", "Todos os estilos de luta aprendidos serão removidos, junto das habilidades e técnicas exclusivas de suas árvores."),
    text("Seus atributos, nível e demais habilidades permanecem. Depois do reset, você poderá aprender outros estilos com os mestres."),
    divider(),
    buttonRow(
      button({ id: cid("confirm-fighting-style-reset"), label: `Confirmar reset por ${cost} Ingots`, style: ButtonStyle.Danger, emojiKey: "reset_estilos" }),
      button({ id: cid("cancel-fighting-style-reset"), label: "Cancelar", style: ButtonStyle.Secondary }),
    ),
  ])];
}

function traitChoicePanel(wallet: PremiumWallet, sessionId: string, options: ReadonlyArray<TraitDef>): TopLevel[] {
  const children: ContainerChild[] = [
    titleBlock("giro_traco", "Uma assinatura mítica foi encontrada", "Escolha um dos Traços revelados"),
    factsBlock([{ label: `${emoji("giro_traco")} Giros de Traço`, value: String(wallet.traitSpins) }]),
    divider(),
  ];
  for (const trait of options) {
    children.push(
      thumbnailSection(`**${trait.name}**\nFaixa: **${RARITY_LABEL[trait.rarity] ?? trait.rarity}**\n${trait.description}`, assetUrl(traitIconUrl(trait)), `Ícone do Traço ${trait.name}`),
      buttonRow(button({ id: cid("trait-choice", `${sessionId}:${trait.id}`), label: `Escolher ${trait.name}`, style: ButtonStyle.Primary, emojiKey: "giro_traco" })),
    );
  }
  children.push(text(`[Conheça os Traços no site](${SITE_URL}/#/guias/traits)`));
  return [economyContainer("obras", children)];
}

async function revealSpin(interaction: ButtonInteraction, title: string, icon: EmojiKey, stages: readonly string[], reveal: TopLevel[]): Promise<void> {
  await interaction.update(v2Edit(spinAnimationPanel(title, icon, stages[0]!, 0, stages.length)));
  for (let index = 1; index < stages.length; index += 1) {
    await wait(520);
    await interaction.editReply(v2Edit(spinAnimationPanel(title, icon, stages[index]!, index, stages.length)));
  }
  await wait(520);
  await interaction.editReply(v2Edit(reveal));
}

async function stateFor(interaction: ChatInputCommandInteraction | ButtonInteraction) {
  if (!interaction.guildId) throw new PremiumStoreError("Esta loja só funciona dentro do servidor.");
  const char = await getOrCreateCharacter(interaction.user.id, interaction.guildId, interaction.user.username);
  if (!char.profile?.completedAt) throw new PremiumStoreError("Conclua sua ficha antes de usar a Loja Premium.");
  const wallet = await getPremiumWallet(interaction.user.id, interaction.guildId);
  return { char, wallet };
}

export const lojaPremium: Command = {
  data: new SlashCommandBuilder().setName("loja-premium").setDescription("Compra produtos usando Ingots"),

  async execute(interaction: ChatInputCommandInteraction) {
    try {
      const { wallet } = await stateFor(interaction);
      await interaction.reply(v2Payload(panel(wallet)));
    } catch (error) {
      await interaction.reply({ content: `❌ ${error instanceof Error ? error.message : "Não foi possível abrir a Loja Premium."}`, flags: MessageFlags.Ephemeral });
    }
  },

  async handleButton(interaction: ButtonInteraction) {
    const [, , action, value, traitId] = interaction.customId.split(":");
    if (!action) return;
    let page: Page = 0;
    try {
      const { char, wallet } = await stateFor(interaction);
      let feedback = "";
      if (action === "page") {
        page = value === "1" ? 1 : 0;
        await interaction.update(v2Edit(panel(wallet, undefined, page)));
        return;
      } else if (action === "buy") {
        const product = getPremiumProduct(value ?? "");
        if (!product) throw new PremiumStoreError("Produto premium desconhecido.");
        page = product.kind === "SPIN" ? 0 : 1;
        if (product.kind === "RESPEC") {
          await interaction.update(v2Edit(respecConfirmationPanel(wallet)));
          return;
        }
        if (product.kind === "CHARACTER_RESET") {
          await interaction.update(v2Edit(characterResetConfirmationPanel(wallet)));
          return;
        }
        if (product.kind === "FIGHTING_STYLE_RESET") {
          await interaction.update(v2Edit(fightingStyleResetConfirmationPanel(wallet)));
          return;
        }
        await buyPremiumProduct(wallet.id, char.id, product.id as PremiumProductId, interaction.id);
        feedback = `✅ ${product.name} adquirido.`;
      } else if (action === "confirm-respec") {
        page = 1;
        const result = await buyPremiumProduct(wallet.id, char.id, "attribute_respec", interaction.id);
        feedback = `✅ Reset concluído. ${result.refundedPoints ?? 0} ponto(s) devolvido(s); atributos e habilidades das Árvores de Habilidade foram removidos.`;
      } else if (action === "confirm-character-reset") {
        page = 1;
        const result = await buyPremiumProduct(wallet.id, char.id, "character_reset", interaction.id);
        feedback = `✅ Reset concluído. ${result.refundedPoints ?? 0} ponto(s) devolvido(s). Use /ficha para registrar o novo nome, idade, história e aparência.`;
      } else if (action === "confirm-fighting-style-reset") {
        page = 1;
        const result = await buyPremiumProduct(wallet.id, char.id, "fighting_style_reset", interaction.id);
        feedback = `✅ Reset concluído. ${result.removedFightingStyles ?? 0} estilo(s) de luta e suas habilidades exclusivas foram removidos.`;
      } else if (action === "cancel-respec" || action === "cancel-character-reset" || action === "cancel-fighting-style-reset") {
        await interaction.update(v2Edit(panel(wallet, undefined, 1)));
        return;
      } else if (action === "back") {
        await interaction.update(v2Edit(panel(wallet, undefined, 0)));
        return;
      } else if (action === "use-clan") {
        const clan = await useClanSpin(char.id, wallet.id);
        if (!(clan.villageId in VILLAGE_NAMES)) throw new PremiumStoreError("A Vila sorteada não está definida.");
        await syncOriginRoles(interaction, clan.villageId as VillageId);
        await revealSpin(interaction, "Sorteio de origem", "giro_cla", ["Consultando as Vilas", "Lendo as possibilidades", "Confirmando Vila + Clã"], clanRevealPanel(clan.id, clan.villageId as VillageId));
        return;
      } else if (action === "use-trait") {
        const result = await startTraitSpin(char.id, wallet.id);
        const updated = await getPremiumWallet(interaction.user.id, interaction.guildId!);
        const reveal = result.state === "choice"
          ? traitChoicePanel(updated, result.sessionId, result.options)
          : traitRevealPanel(result.trait);
        await revealSpin(interaction, "Sorteio de Traço", "giro_traco", ["Lendo probabilidades", "Definindo faixa", "Identificando assinatura"], reveal);
        return;
      } else if (action === "trait-choice") {
        const trait = await chooseTraitSpin(char.id, wallet.id, value ?? "", traitId ?? "");
        await interaction.update(v2Edit(traitRevealPanel(trait)));
        return;
      } else return;
      const updated = await getPremiumWallet(interaction.user.id, interaction.guildId!);
      await interaction.update(v2Edit(panel(updated, feedback, page)));
    } catch (error) {
      const state = await stateFor(interaction).catch(() => null);
      const message = `❌ ${error instanceof Error ? error.message : "Não foi possível concluir a operação."}`;
      const payload = v2Edit(panel(state?.wallet ?? { id: "", ingots: 0, clanSpins: 0, traitSpins: 0 }, message, page));
      if (interaction.replied || interaction.deferred) await interaction.editReply(payload);
      else await interaction.update(payload);
    }
  },
};
