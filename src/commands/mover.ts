import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import type { Command } from "./types.js";
import { mover as moverFlow } from "./combate.js";

export const mover: Command = {
  data: new SlashCommandBuilder()
    .setName("mover")
    .setDescription("Move seu personagem no combate (ou na missão do gato)")
    .addStringOption((o) => o.setName("destino").setDescription("Célula (ex: B5)").setRequired(true)),
  execute(interaction: ChatInputCommandInteraction) {
    return moverFlow(interaction);
  },
};
