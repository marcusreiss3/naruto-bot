import {
  MessageFlags,
  SlashCommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { Command } from "./types.js";
import { SHEET_LAUNCH_CHANNEL_ID } from "../data/sheet-creation.js";
import { handleSheetButton, openSheetChannel } from "../services/sheet/sheet-service.js";

export const ficha: Command = {
  data: new SlashCommandBuilder()
    .setName("ficha")
    .setDescription("Inicia a criação guiada da sua ficha de personagem"),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild || !interaction.member) {
      await interaction.reply({ content: "Este comando só funciona dentro do servidor.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (interaction.channelId !== SHEET_LAUNCH_CHANNEL_ID) {
      await interaction.reply({
        content: `Use \`/ficha\` em <#${SHEET_LAUNCH_CHANNEL_ID}>.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const result = await openSheetChannel(interaction.guild, member);
    if (result.status === "COMPLETED") {
      await interaction.editReply("Sua ficha já foi concluída. Use `/perfil ver` para consultá-la.");
      return;
    }
    if (result.status === "EXISTING") {
      await interaction.editReply(`Você já possui uma criação em andamento: <#${result.channelId}>.`);
      return;
    }
    if (result.status === "RESUMED") {
      await interaction.editReply(`Um novo canal privado foi criado em <#${result.channelId}> e sua ficha continuará de onde você parou.`);
      return;
    }
    await interaction.editReply(`Seu canal privado foi criado em <#${result.channelId}>.`);
  },

  async handleButton(interaction: ButtonInteraction) {
    await handleSheetButton(interaction);
  },
};
