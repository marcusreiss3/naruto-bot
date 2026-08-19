import { ButtonStyle, MessageFlags, SlashCommandBuilder, type ButtonInteraction, type ChatInputCommandInteraction } from "discord.js";
import type { Command } from "./types.js";
import { PREMIUM_PRODUCTS, getPremiumProduct, type PremiumProductId } from "../data/premium-products.js";
import { clanIconUrl, traitIconUrl } from "../data/sheet-creation.js";
import { getClan } from "../data/index.js";
import { type TraitDef } from "../data/traits.js";
import { VILLAGE_NAMES, type VillageId } from "../data/villages.js";
import { getOrCreateCharacter } from "../services/characters/character-service.js";
import { buyPremiumProduct, chooseTraitSpin, getPremiumWallet, PremiumStoreError, startTraitSpin, useClanSpin, type PremiumWallet } from "../services/premium/ingot-store.js";
import { blobAssetUrl } from "../services/blob/asset-manifest.js";
import { ENV } from "../config/env.js";
import { button, buttonRow, divider, economyContainer, factsBlock, mediaGallery, noticeBlock, text, thumbnailSection, titleBlock, v2Edit, v2Payload, type ContainerChild, type TopLevel } from "../ui/economy-components-v2.js";
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
  ryo_10000: "ryo",
  attribute_respec: "reset_atributos",
  character_reset: "reset_personagem",
};

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

function panel(wallet: PremiumWallet, feedback?: string): TopLevel[] {
  const spins = PREMIUM_PRODUCTS.filter((product) => product.kind === "SPIN");
  const extras = PREMIUM_PRODUCTS.filter((product) => product.kind !== "SPIN");
  const children: ContainerChild[] = [
    titleBlock("ingots", "Loja Premium", "Produtos adquiridos com Ingots"),
    factsBlock([
      { label: "Ingots", value: String(wallet.ingots) },
      { label: `${emoji("giro_cla")} Giros de Clã`, value: String(wallet.clanSpins) },
      { label: `${emoji("giro_traco")} Giros de Traço`, value: String(wallet.traitSpins) },
    ]),
  ];
  if (feedback) children.push(noticeBlock(feedback.startsWith("✅") ? "sucesso" : "erro", feedback.replace(/^[✅❌]\s*/, "")));
  children.push(divider(), text(`## Giros\nUse ${emoji("giro_cla")} para revelar uma nova possibilidade de Clã ou ${emoji("giro_traco")} para um novo Traço.`));
  for (const product of spins) children.push(...productOffer(product));
  children.push(divider(), text("## Recursos e reorganização\nOpções diretas para o saldo e para reorganizar sua progressão."));
  for (const product of extras) children.push(...productOffer(product));
  children.push(
    divider(),
    text("## Giros disponíveis\nUse os Giros que você já possui."),
    buttonRow(
      button({ id: cid("use-clan"), label: "Usar Giro de Clã", emojiKey: "giro_cla", disabled: wallet.clanSpins < 1 }),
      button({ id: cid("use-trait"), label: "Usar Giro de Traço", emojiKey: "giro_traco", disabled: wallet.traitSpins < 1 }),
    ),
    text("-# Giros de Clã só podem ser usados enquanto o personagem ainda for da Academia."),
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

function respecConfirmationPanel(wallet: PremiumWallet): TopLevel[] {
  return [economyContainer("obras", [
    titleBlock("reset_atributos", "Confirmar reset de atributos", "Esta ação usa Ingots e altera sua ficha"),
    factsBlock([{ label: "Ingots", value: String(wallet.ingots) }, { label: "Custo", value: "100" }]),
    divider(),
    noticeBlock("aviso", "Todos os atributos serão zerados, os pontos investidos voltarão ao saldo e as habilidades aprendidas nas Árvores de Habilidade serão removidas."),
    text("Você poderá redistribuir os pontos com `/atributos` depois do reset."),
    divider(),
    buttonRow(
      button({ id: cid("confirm-respec"), label: "Confirmar reset por 100 Ingots", style: ButtonStyle.Danger, emojiKey: "reset_atributos" }),
      button({ id: cid("cancel-respec"), label: "Cancelar", style: ButtonStyle.Secondary }),
    ),
  ])];
}

function characterResetConfirmationPanel(wallet: PremiumWallet): TopLevel[] {
  return [economyContainer("obras", [
    titleBlock("reset_personagem", "Confirmar reset premium", "Esta ação usa Ingots e prepara uma nova ficha"),
    factsBlock([{ label: "Ingots", value: String(wallet.ingots) }, { label: "Custo", value: "100" }]),
    divider(),
    noticeBlock("aviso", "Nome, rank, idade, aparência e história serão resetados. Os pontos investidos voltarão ao saldo e as habilidades aprendidas nas Árvores de Habilidade serão removidas."),
    text("Você manterá nível, XP, Vila, Clã, Traço, inventário, Ryō, Ingots e Giros disponíveis."),
    text("Depois, use `/ficha` para preencher novamente os dados narrativos do personagem."),
    divider(),
    buttonRow(
      button({ id: cid("confirm-character-reset"), label: "Confirmar reset por 100 Ingots", style: ButtonStyle.Danger, emojiKey: "reset_personagem" }),
      button({ id: cid("cancel-character-reset"), label: "Cancelar", style: ButtonStyle.Secondary }),
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
    try {
      const { char, wallet } = await stateFor(interaction);
      let feedback = "";
      if (action === "buy") {
        const product = getPremiumProduct(value ?? "");
        if (!product) throw new PremiumStoreError("Produto premium desconhecido.");
        if (product.kind === "RESPEC") {
          await interaction.update(v2Edit(respecConfirmationPanel(wallet)));
          return;
        }
        if (product.kind === "CHARACTER_RESET") {
          await interaction.update(v2Edit(characterResetConfirmationPanel(wallet)));
          return;
        }
        await buyPremiumProduct(wallet.id, char.id, product.id as PremiumProductId, interaction.id);
        feedback = product.kind === "RYO" ? `✅ ${product.ryo.toLocaleString("pt-BR")} Ryō adicionados ao seu saldo.` : `✅ ${product.name} adquirido.`;
      } else if (action === "confirm-respec") {
        const result = await buyPremiumProduct(wallet.id, char.id, "attribute_respec", interaction.id);
        feedback = `✅ Reset concluído. ${result.refundedPoints ?? 0} ponto(s) devolvido(s); atributos e habilidades das Árvores de Habilidade foram removidos.`;
      } else if (action === "confirm-character-reset") {
        const result = await buyPremiumProduct(wallet.id, char.id, "character_reset", interaction.id);
        feedback = `✅ Reset concluído. ${result.refundedPoints ?? 0} ponto(s) devolvido(s). Use /ficha para registrar o novo nome, idade, história e aparência.`;
      } else if (action === "cancel-respec" || action === "cancel-character-reset" || action === "back") {
        await interaction.update(v2Edit(panel(wallet)));
        return;
      } else if (action === "use-clan") {
        const clan = await useClanSpin(char.id, wallet.id);
        if (!char.villageId || !(char.villageId in VILLAGE_NAMES)) throw new PremiumStoreError("Sua Vila de origem não está definida.");
        await revealSpin(interaction, "Sorteio de origem", "giro_cla", ["Consultando sua Vila", "Lendo as possibilidades", "Confirmando Clã"], clanRevealPanel(clan.id, char.villageId as VillageId));
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
      await interaction.update(v2Edit(panel(updated, feedback)));
    } catch (error) {
      const state = await stateFor(interaction).catch(() => null);
      const message = `❌ ${error instanceof Error ? error.message : "Não foi possível concluir a operação."}`;
      const payload = v2Edit(panel(state?.wallet ?? { id: "", ingots: 0, clanSpins: 0, traitSpins: 0 }, message));
      if (interaction.replied || interaction.deferred) await interaction.editReply(payload);
      else await interaction.update(payload);
    }
  },
};
