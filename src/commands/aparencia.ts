import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import type { Command } from "./types.js";
import { isAdmin } from "../utils/permissions.js";
import { HAS_GEMINI } from "../config/env.js";
import { log } from "../utils/logger.js";
import {
  claimWithIdentified,
  getAppearance,
  releaseAppearance,
  identifyCharacter,
  type ClaimResult,
  type IdentifiedCharacter,
  type MemberPresenceCheck,
} from "../services/appearance/appearance-service.js";
import { MAX_APPEARANCE_IMAGE_BYTES } from "../services/appearance/image-download.js";
import { standardizeTypedName } from "../services/appearance/vision.js";
import { emoji } from "../ui/economy-emojis.js";

// Estado pendente de confirmação por usuário (guild:user -> dados).
interface Pending {
  imageUrl: string;
  identified: IdentifiedCharacter;
  ts: number;
}
const PENDING_TTL_MS = 10 * 60 * 1000;
const pending = new Map<string, Pending>();
const pkey = (guildId: string, userId: string) => `${guildId}:${userId}`;

function setPending(guildId: string, userId: string, data: Omit<Pending, "ts">): void {
  pending.set(pkey(guildId, userId), { ...data, ts: Date.now() });
}
function getPending(guildId: string, userId: string): Pending | undefined {
  const p = pending.get(pkey(guildId, userId));
  if (!p) return undefined;
  if (Date.now() - p.ts > PENDING_TTL_MS) {
    pending.delete(pkey(guildId, userId));
    return undefined;
  }
  return p;
}
function clearPending(guildId: string, userId: string): void {
  pending.delete(pkey(guildId, userId));
}

function presenceChecker(interaction: { guild: ChatInputCommandInteraction["guild"] }): MemberPresenceCheck {
  return async (discordId) => {
    const guild = interaction.guild;
    if (!guild) return true;
    try {
      await guild.members.fetch(discordId);
      return true;
    } catch {
      return false;
    }
  };
}

// Monta a mensagem final a partir do resultado do claim.
function renderResult(result: ClaimResult, imageUrl: string): { content?: string; embeds?: EmbedBuilder[] } {
  switch (result.status) {
    case "STORAGE_UNAVAILABLE":
      return { content: "❌ Não foi possível salvar a imagem no Blob agora. Tente novamente em alguns instantes." };
    case "AI_UNAVAILABLE":
      return { content: "❌ Identificação por IA indisponível." };
    case "NOT_RECOGNIZED":
      return { content: "❌ Não consegui identificar o personagem." };
    case "TAKEN":
      return {
        content: `🚫 **${result.characterName}** já está em uso por <@${result.holderId}>. Escolha outro personagem.`,
      };
    case "OK": {
      const embed = new EmbedBuilder()
        .setTitle(`${emoji("aparencia")} Aparência definida!`)
        .setDescription(
          `A aparência que você escolheu foi de **${result.characterName}**.` +
            (result.reassignedFrom ? `\n_(liberado de um membro que saiu do servidor)_` : ""),
        )
        .setColor(0x2ecc71)
        .setImage(imageUrl)
        .setFooter({ text: `Confiança: ${(result.confidence * 100).toFixed(0)}%` });
      return { embeds: [embed] };
    }
  }
}

export const aparencia: Command = {
  data: new SlashCommandBuilder()
    .setName("aparencia")
    .setDescription("Reserva e gerencia a aparência (personagem) do seu ninja")
    .addSubcommand((s) =>
      s
        .setName("definir")
        .setDescription("Define sua aparência enviando a imagem de um personagem")
        .addAttachmentOption((o) => o.setName("imagem").setDescription("Imagem do personagem").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("ver")
        .setDescription("Mostra a aparência atual")
        .addUserOption((o) => o.setName("usuario").setDescription("Usuário (padrão: você)")),
    )
    .addSubcommand((s) =>
      s
        .setName("liberar")
        .setDescription("(Admin) Libera a aparência reservada de um usuário")
        .addUserOption((o) => o.setName("usuario").setDescription("Usuário").setRequired(true)),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId ?? "global";

    if (sub === "ver") {
      const user = interaction.options.getUser("usuario") ?? interaction.user;
      const ap = await getAppearance(user.id, guildId);
      if (!ap) {
        await interaction.reply({
          content: `ℹ️ ${user.id === interaction.user.id ? "Você" : `<@${user.id}>`} não tem aparência definida. Use \`/aparencia definir\`.`,
          ephemeral: true,
        });
        return;
      }
      const embed = new EmbedBuilder()
        .setTitle(`${emoji("aparencia")} Aparência de ${user.username}`)
        .setDescription(`Personagem: **${ap.characterName}**`)
        .setColor(0x9b59b6)
        .setImage(ap.imageUrl);
      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (sub === "liberar") {
      if (!isAdmin(interaction)) {
        await interaction.reply({ content: "⛔ Apenas admins.", ephemeral: true });
        return;
      }
      const user = interaction.options.getUser("usuario", true);
      const freed = await releaseAppearance(user.id, guildId);
      clearPending(guildId, user.id);
      await interaction.reply({
        content: freed ? `✅ Aparência de <@${user.id}> liberada.` : `ℹ️ <@${user.id}> não tinha aparência reservada.`,
        ephemeral: true,
      });
      return;
    }

    // sub === "definir"
    const attachment = interaction.options.getAttachment("imagem", true);
    if (!attachment.contentType?.startsWith("image/")) {
      await interaction.reply({ content: "❌ Envie um arquivo de imagem.", ephemeral: true });
      return;
    }
    if (attachment.size > MAX_APPEARANCE_IMAGE_BYTES) {
      await interaction.reply({
        content: `❌ Imagem muito grande. Envie uma imagem de até ${MAX_APPEARANCE_IMAGE_BYTES / 1024 / 1024}MB.`,
        ephemeral: true,
      });
      return;
    }
    if (!HAS_GEMINI) {
      await interaction.reply({
        content: "❌ O sistema de aparência está off por enquanto. Tente de novo mais tarde.",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    let id: Awaited<ReturnType<typeof identifyCharacter>>;
    try {
      id = await identifyCharacter(attachment.url);
    } catch (err) {
      log.error("Erro ao identificar aparencia:", err);
      await interaction.editReply("❌ Não consegui analisar essa imagem agora. Tente uma imagem menor ou tente de novo em alguns instantes.");
      return;
    }
    if (id.kind === "NOT_DRAWING") {
      await interaction.editReply(
        "🚫 **Aparência recusada.** A imagem parece ser uma **foto real / pessoa real**.\n\nSó aceitamos **desenho/anime/mangá** (personagens ilustrados). Envie a arte de um personagem.",
      );
      return;
    }
    if (id.kind === "NO_SUBJECT") {
      await interaction.editReply("❌ Não encontrei nenhum personagem nessa imagem. Tente outra mais nítida.");
      return;
    }
    if (id.kind === "VISION_OFFLINE") {
      await interaction.editReply("❌ O sistema de aparência está off por enquanto. Tente de novo mais tarde.");
      return;
    }
    if (id.kind === "INVALID_APPEARANCE") {
      await interaction.editReply(
        "🚫 **Aparência recusada.** Envie um personagem com aparência humana/humanoide de anime ou mangá. Mascotes, animais, criaturas cartunescas e personagens como Po, Angry Birds ou Sonic não são aceitos.",
      );
      return;
    }
    const identified = id.result;

    // Sempre pede confirmação: modelos de visão podem alucinar personagem famoso com confiança alta.
    setPending(guildId, interaction.user.id, { imageUrl: attachment.url, identified });

    const desc = identified.isOc
      ? "Não reconheci um personagem canônico com certeza. É um personagem **original (OC)**?\n\nSe for um personagem conhecido, clique em **corrigir** e digite o nome (ex: `Luffy (One Piece)`)."
      : `Acho que é **${identified.name}** (${(identified.confidence * 100).toFixed(0)}% de certeza).\nÉ isso mesmo?\n\nSe não, clique em **corrigir** e digite o nome certo com a obra (ex: \`Naruto Uzumaki (Naruto)\`) ou marque como OC.`;

    const embed = new EmbedBuilder()
      .setTitle("🤔 Confirme a aparência")
      .setDescription(desc)
      .setColor(0xf1c40f)
      .setImage(attachment.url);

    const confirmLabel = identified.isOc ? "✅ Sim, é OC" : "✅ Confirmar";
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("aparencia:confirm").setLabel(confirmLabel).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("aparencia:reject").setLabel("✏️ Não, corrigir").setStyle(ButtonStyle.Secondary),
    );

    await interaction.editReply({ embeds: [embed], components: [row] });
  },

  async handleButton(interaction: ButtonInteraction) {
    const guildId = interaction.guildId ?? "global";
    const p = getPending(guildId, interaction.user.id);

    if (interaction.customId === "aparencia:reject") {
      if (!p) {
        await interaction.reply({ content: "⌛ Essa confirmação expirou. Use `/aparencia definir` de novo.", ephemeral: true });
        return;
      }
      const modal = new ModalBuilder().setCustomId("aparencia:modal").setTitle("Corrigir personagem");
      const input = new TextInputBuilder()
        .setCustomId("nome")
        .setLabel("Personagem (ex: Luffy (One Piece))")
        .setPlaceholder("Luffy (One Piece)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100);
      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
      await interaction.showModal(modal);
      return;
    }

    // confirm
    await interaction.deferUpdate();
    if (!p) {
      await interaction.editReply({ content: "⌛ Essa confirmação expirou. Use `/aparencia definir` de novo.", embeds: [], components: [] });
      return;
    }
    const result = await claimWithIdentified(
      interaction.user.id,
      guildId,
      p.imageUrl,
      p.identified,
      presenceChecker(interaction),
    );
    clearPending(guildId, interaction.user.id);
    const out = renderResult(result, p.imageUrl);
    await interaction.editReply({ content: out.content ?? null, embeds: out.embeds ?? [], components: [] });
  },

  async handleModal(interaction: ModalSubmitInteraction) {
    const guildId = interaction.guildId ?? "global";
    const p = getPending(guildId, interaction.user.id);
    if (!p) {
      await interaction.reply({ content: "⌛ Essa confirmação expirou. Use `/aparencia definir` de novo.", ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const typed = interaction.fields.getTextInputValue("nome");

    const identified = await standardizeTypedName(typed);
    if (!identified) {
      await interaction.editReply("❌ Não consegui interpretar esse nome. Tente algo como `Luffy (One Piece)`.");
      return;
    }

    const result = await claimWithIdentified(
      interaction.user.id,
      guildId,
      p.imageUrl,
      identified,
      presenceChecker(interaction),
    );
    clearPending(guildId, interaction.user.id);
    await interaction.editReply(renderResult(result, p.imageUrl));
  },
};
