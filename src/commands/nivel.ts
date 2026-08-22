import { AttachmentBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import type { Command } from "./types.js";
import { BALANCE } from "../config/balance.js";
import { getOrCreateCharacter } from "../services/characters/character-service.js";
import { renderLevelCard } from "../ui/level-card.js";

// Etapa visual: a ficha e o XP não são consultados aqui ainda. O comando só
// exibe a arte-base que receberá o preenchimento na próxima implementação.
export const nivel: Command = {
  data: new SlashCommandBuilder()
    .setName("nivel")
    .setDescription("Mostra sua barra de nível"),

  async execute(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId ?? "global";
    const character = await getOrCreateCharacter(interaction.user.id, guildId, interaction.user.username);
    const card = await renderLevelCard({
      name: character.displayName?.trim() || character.name,
      level: character.level,
      xp: character.xp,
      xpRequired: character.level >= BALANCE.maxLevel ? 0 : BALANCE.xpPerLevel(character.level),
    });
    await interaction.reply({ files: [new AttachmentBuilder(card, { name: "nivel.png" })] });
  },
};
