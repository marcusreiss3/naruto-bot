import {
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type GuildMember,
} from "discord.js";
import type { Command } from "./types.js";
import { prisma } from "../db/client.js";
import { VILLAGE_NAMES } from "../data/villages.js";
import { getOrCreateCharacter } from "../services/characters/character-service.js";
import { EconomyError } from "../services/economy/errors.js";
import { requireVillage } from "../services/economy/village-access.js";
import { economyContainer, factsBlock, titleBlock, v2Payload } from "../ui/economy-components-v2.js";

// Porta manual e segura para reparar a vila persistida do personagem. O
// jogador não escolhe o valor: a única fonte é o cargo de vila que ele possui
// no servidor. Assim ninguém consegue se declarar Konoha/Suna por comando.
export const sincronizarVila: Command = {
  data: new SlashCommandBuilder()
    .setName("sincronizar-vila")
    .setDescription("Atualiza a vila do seu personagem a partir do seu cargo"),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: "❌ Use este comando dentro do servidor.", flags: MessageFlags.Ephemeral });
      return;
    }

    try {
      const villageId = requireVillage(interaction.member as GuildMember | null);
      const char = await getOrCreateCharacter(interaction.user.id, interaction.guildId, interaction.user.username);
      await prisma.userCharacter.update({ where: { id: char.id }, data: { villageId } });
      await interaction.reply(
        v2Payload([
          economyContainer("vila", [
            titleBlock("vila", "Vila sincronizada"),
            factsBlock([
              { label: "Personagem", value: char.displayName?.trim() || char.name },
              { label: "Vila", value: VILLAGE_NAMES[villageId] },
            ]),
          ]),
        ]),
      );
    } catch (err) {
      const msg = err instanceof EconomyError ? err.message : "Não consegui sincronizar sua vila.";
      await interaction.reply({ content: `❌ ${msg}`, flags: MessageFlags.Ephemeral });
    }
  },
};
