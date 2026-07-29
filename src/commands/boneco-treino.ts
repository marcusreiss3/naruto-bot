import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import type { Command } from "./types.js";
import { prisma } from "../db/client.js";
import { getScenarioByChannel, getScenarioById } from "../data/index.js";
import { getOrCreateCharacter, attrsFromRow } from "../services/characters/character-service.js";
import {
  getActiveSession,
  startCombat,
  type StartPlayer,
} from "../services/combat/combat-engine.js";
import {
  scheduleTrainingExpiration,
  TRAINING_DURATION_MS,
} from "../services/combat/training-dummy.js";
import { partyMemberIds } from "../services/party/party-service.js";

export const bonecoTreino: Command = {
  data: new SlashCommandBuilder()
    .setName("boneco-treino")
    .setDescription("Cria um boneco de treino temporário por 30 minutos"),

  async execute(interaction: ChatInputCommandInteraction) {
    const channelId = interaction.channelId;
    const guildId = interaction.guildId ?? "global";
    if (await getActiveSession(channelId)) {
      await interaction.reply({
        content: "❌ Já existe um combate ativo neste canal.",
        ephemeral: true,
      });
      return;
    }

    const scenario = getScenarioByChannel(channelId) ?? getScenarioById("campo_aberto");
    if (!scenario) {
      await interaction.reply({ content: "❌ Cenário de treino indisponível.", ephemeral: true });
      return;
    }

    await interaction.deferReply();
    const users = new Map<string, { id: string; username: string }>();
    users.set(interaction.user.id, interaction.user);
    for (const userId of await partyMemberIds(guildId, interaction.user.id)) {
      if (users.has(userId)) continue;
      const user = await interaction.client.users.fetch(userId).catch(() => null);
      if (user) users.set(user.id, user);
    }

    const players: StartPlayer[] = [];
    for (const user of users.values()) {
      const char = await getOrCreateCharacter(user.id, guildId, user.username);
      players.push({
        charId: char.id,
        name: char.name,
        level: char.level,
        hpCurrent: char.hpCurrent,
        hpMax: char.hpMax,
        chakra: char.resources!.chakra,
        energia: char.resources!.energia,
        jutsuIds: char.jutsus.map((j) => j.jutsuId),
        attrs: attrsFromRow(char.attributes!),
        nodes: char.skillNodes.map((n) => n.nodeId),
      });
    }

    const session = await startCombat({
      channelId,
      guildId,
      scenarioId: scenario.id,
      players,
      npcs: [{ templateId: "training_dummy" }],
    });
    const dummy = session.participants.find((p) => p.npcTemplate === "training_dummy");
    if (!dummy) {
      await prisma.combatSession.update({ where: { id: session.id }, data: { status: "ENDED" } });
      await interaction.editReply("❌ Não foi possível criar o boneco de treino.");
      return;
    }

    const expiresAt = Date.now() + TRAINING_DURATION_MS;
    await prisma.combatParticipant.update({
      where: { id: dummy.id },
      data: {
        flagsJson: JSON.stringify({
          isTrainingDummy: true,
          infiniteHp: true,
          expiresAt,
        }),
      },
    });

    scheduleTrainingExpiration(session.id, expiresAt, async (expiredChannelId) => {
      const channel = await interaction.client.channels.fetch(expiredChannelId).catch(() => null);
      if (channel?.isTextBased() && "send" in channel) {
        await channel.send("⏱️ O Boneco de Treino desapareceu após 30 minutos.");
      }
    });

    await interaction.editReply(
      `🥋 **Boneco de Treino criado!**\n` +
        `Ele possui vida infinita, não se move e não ataca. ` +
        `Desaparece <t:${Math.floor(expiresAt / 1000)}:R>.\n` +
        `Participantes: ${players.map((p) => `**${p.name}**`).join(", ")}. Use \`/mapa\` e \`/jutsu\` para treinar.`,
    );
  },
};
