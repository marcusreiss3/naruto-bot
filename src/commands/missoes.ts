import { EmbedBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import type { Command } from "./types.js";
import { getMission, MISSIONS } from "../data/index.js";
import { getOrCreateCharacter } from "../services/characters/character-service.js";
import { getActiveMissions } from "../services/missions/mission-service.js";

export const missoes: Command = {
  data: new SlashCommandBuilder()
    .setName("missoes")
    .setDescription("Missões")
    .addSubcommand((s) => s.setName("minhas").setDescription("Suas missões ativas"))
    .addSubcommand((s) => s.setName("ativas").setDescription("Lista de missões disponíveis no jogo")),
  async execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    switch (sub) {
      case "minhas":
        return minhas(interaction);
      case "ativas":
        return ativas(interaction);
    }
  },
};

async function minhas(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId ?? "global";
  const char = await getOrCreateCharacter(interaction.user.id, guildId, interaction.user.username);
  const insts = await getActiveMissions(char.id);
  if (insts.length === 0) {
    await interaction.reply({ content: "Você não tem missões ativas.", ephemeral: true });
    return;
  }

  const embed = new EmbedBuilder().setTitle("📋 Suas missões").setColor(0x3498db);
  for (const inst of insts) {
    const def = getMission(inst.missionId);
    if (!def) continue;

    const objectiveStates = new Map(inst.objectives.map((objective) => [objective.objectiveId, objective.done]));
    const visibleObjectives: string[] = [];
    for (const objective of def.objectives) {
      const done = objectiveStates.get(objective.id) ?? false;
      if (done) {
        visibleObjectives.push(`✅ ${objective.description}`);
        continue;
      }
      visibleObjectives.push(`⬜ ${objective.description}`);
      break;
    }
    const objs = visibleObjectives.join("\n");

    embed.addFields({ name: `[${def.rank}] ${def.name}`, value: `${def.description}\n${objs}` });
  }
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function ativas(interaction: ChatInputCommandInteraction): Promise<void> {
  const embed = new EmbedBuilder().setTitle("🗂️ Missões do jogo").setColor(0x95a5a6);
  for (const def of MISSIONS) {
    embed.addFields({ name: `[${def.rank}] ${def.name} (\`${def.id}\`)`, value: def.description });
  }
  await interaction.reply({ embeds: [embed], ephemeral: true });
}
