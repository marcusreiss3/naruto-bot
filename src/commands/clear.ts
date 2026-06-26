import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { Command } from "./types.js";
import { isAdmin } from "../utils/permissions.js";

export const clear: Command = {
  data: new SlashCommandBuilder()
    .setName("clear")
    .setDescription("(Admin) Apaga mensagens recentes deste canal")
    .addIntegerOption((o) =>
      o
        .setName("quantidade")
        .setDescription("Quantas mensagens apagar (1-100)")
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true),
    )
    // exige Gerenciar Mensagens p/ ver o comando (defesa extra além do isAdmin)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!isAdmin(interaction)) {
      await interaction.reply({ content: "⛔ Apenas admins.", flags: MessageFlags.Ephemeral });
      return;
    }
    const channel = interaction.channel;
    if (!channel || !("bulkDelete" in channel)) {
      await interaction.reply({ content: "❌ Não dá pra apagar mensagens aqui.", flags: MessageFlags.Ephemeral });
      return;
    }
    const amount = interaction.options.getInteger("quantidade", true);

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      // bulkDelete só apaga mensagens com menos de 14 dias
      const deleted = await channel.bulkDelete(amount, true);
      await interaction.editReply(`🧹 Apaguei **${deleted.size}** mensagem(ns).`);
    } catch (err) {
      await interaction.editReply(
        `❌ Falha ao apagar (mensagens com +14 dias não podem ser apagadas em massa). ${(err as Error).message}`,
      );
    }
  },
};
