import { ButtonStyle, MessageFlags, SlashCommandBuilder, type ButtonInteraction, type ChatInputCommandInteraction } from "discord.js";
import type { Command } from "./types.js";
import { PREMIUM_PRODUCTS, getPremiumProduct, type PremiumProductId } from "../data/premium-products.js";
import { getOrCreateCharacter } from "../services/characters/character-service.js";
import { buyPremiumProduct, chooseTraitSpin, getPremiumWallet, PremiumStoreError, startTraitSpin, useClanSpin, type PremiumWallet } from "../services/premium/ingot-store.js";
import { button, buttonRow, divider, economyContainer, factsBlock, noticeBlock, text, titleBlock, v2Edit, v2Payload, type ContainerChild, type TopLevel } from "../ui/economy-components-v2.js";

const PREFIX = "loja-premium:v1";
const cid = (action: string, value?: string) => `${PREFIX}:${action}${value ? `:${value}` : ""}`;

function panel(wallet: PremiumWallet, feedback?: string): TopLevel[] {
  const children: ContainerChild[] = [
    titleBlock("ingots", "Loja Premium", "Produtos adquiridos com Ingots"),
    factsBlock([
      { label: "Ingots", value: String(wallet.ingots) },
      { label: "Giros de Clã", value: String(wallet.clanSpins) },
      { label: "Giros de Traço", value: String(wallet.traitSpins) },
    ]),
  ];
  if (feedback) children.push(noticeBlock(feedback.startsWith("✅") ? "sucesso" : "erro", feedback.replace(/^[✅❌]\s*/, "")));
  children.push(divider());
  for (const product of PREMIUM_PRODUCTS) {
    children.push(text(`**${product.name}** — ${product.description}\nCusto: **${product.cost} Ingots**`), buttonRow(button({ id: cid("buy", product.id), label: `Comprar por ${product.cost} Ingots`, style: ButtonStyle.Primary })));
  }
  children.push(divider(), buttonRow(
    button({ id: cid("use-clan"), label: "Usar Giro de Clã", disabled: wallet.clanSpins < 1 }),
    button({ id: cid("use-trait"), label: "Usar Giro de Traço", disabled: wallet.traitSpins < 1 }),
  ), text("-# Giros de Clã só podem ser usados enquanto o personagem ainda for da Academia."));
  return [economyContainer("cofre", children)];
}

function traitChoicePanel(wallet: PremiumWallet, sessionId: string, options: ReadonlyArray<{ id: string; name: string; description: string }>): TopLevel[] {
  const children: ContainerChild[] = [
    titleBlock("ingots", "Escolha seu Traço Mítico", "O Giro só será consumido quando você confirmar uma opção."),
    factsBlock([{ label: "Giros de Traço", value: String(wallet.traitSpins) }]),
    divider(),
  ];
  for (const trait of options) {
    children.push(text(`**${trait.name}** — ${trait.description}`), buttonRow(button({ id: cid("trait-choice", `${sessionId}:${trait.id}`), label: `Escolher ${trait.name}`, style: ButtonStyle.Primary })));
  }
  return [economyContainer("cofre", children)];
}

async function stateFor(interaction: ChatInputCommandInteraction | ButtonInteraction) {
  if (!interaction.guildId) throw new PremiumStoreError("Esta loja só funciona dentro do servidor.");
  const char = await getOrCreateCharacter(interaction.user.id, interaction.guildId, interaction.user.username);
  if (!char.profile?.completedAt) throw new PremiumStoreError("Conclua sua ficha antes de usar a Loja Premium.");
  const wallet = await getPremiumWallet(interaction.user.id, interaction.guildId);
  return { char, wallet };
}

export const lojaPremium: Command = {
  data: new SlashCommandBuilder().setName("loja-premium").setDescription("Compra Giros usando Ingots"),

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
        await buyPremiumProduct(wallet.id, product.id as PremiumProductId, interaction.id);
        feedback = `✅ ${product.name} adquirido.`;
      } else if (action === "use-clan") {
        const clanName = await useClanSpin(char.id, wallet.id);
        feedback = `✅ Giro de Clã usado: agora você é do Clã ${clanName}.`;
      } else if (action === "use-trait") {
        const result = await startTraitSpin(char.id, wallet.id);
        if (result.state === "choice") {
          await interaction.update(v2Edit(traitChoicePanel(wallet, result.sessionId, result.options)));
          return;
        }
        feedback = `✅ Giro de Traço usado: você recebeu ${result.trait.name}.`;
      } else if (action === "trait-choice") {
        const trait = await chooseTraitSpin(char.id, wallet.id, value ?? "", traitId ?? "");
        feedback = `✅ Giro de Traço usado: você recebeu ${trait.name}.`;
      } else return;
      const updated = await getPremiumWallet(interaction.user.id, interaction.guildId!);
      await interaction.update(v2Edit(panel(updated, feedback)));
    } catch (error) {
      const state = await stateFor(interaction).catch(() => null);
      const message = `❌ ${error instanceof Error ? error.message : "Não foi possível concluir a operação."}`;
      await interaction.update(v2Edit(panel(state?.wallet ?? { id: "", ingots: 0, clanSpins: 0, traitSpins: 0 }, message)));
    }
  },
};
