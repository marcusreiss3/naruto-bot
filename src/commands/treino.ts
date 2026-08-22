import {
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Message,
} from "discord.js";
import type { TrainingSession } from "@prisma/client";
import type { Command } from "./types.js";
import { getOrCreateCharacter } from "../services/characters/character-service.js";
import {
  hitTrainingTarget,
  issueTrainingTarget,
  startTrainingSession,
} from "../services/characters/reaction-training-service.js";
import { buttonRow, divider, singleCard, text, titleBlock, v2Edit, v2Payload, type TopLevel } from "../ui/economy-components-v2.js";

const PREFIX = "treino";
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function clearTrainingTimer(sessionId: string): void {
  const timer = timers.get(sessionId);
  if (timer) clearTimeout(timer);
  timers.delete(sessionId);
}

function panel(session: TrainingSession, feedback?: string): TopLevel[] {
  if (session.status === "COMPLETED") {
    return singleCard("cofre", [
      titleBlock("sucesso", "Treino concluído", "Meta diária alcançada"),
      text(`🔵 **${session.xpEarned}/${session.xpGoal} XP** conquistados no treino de hoje.`),
      divider(),
      text("-# Sua próxima tentativa ficará disponível à 00:00 (horário de Brasília)."),
    ]);
  }
  if (session.status === "FAILED") {
    return singleCard("erro", [
      titleBlock("erro", "Treino encerrado", "Você clicou no alvo preto"),
      text(`⚫ O treino terminou. Você manteve os **${session.xpEarned}/${session.xpGoal} XP** já conquistados.`),
      divider(),
      text("-# A próxima tentativa fica disponível à 00:00 (horário de Brasília)."),
    ]);
  }

  const targetActive = Boolean(session.activeToken && session.activeKind && session.activeSlot !== null && session.expiresAt);
  const rows = Array.from({ length: 3 }, (_, row) => buttonRow(
    ...Array.from({ length: 3 }, (_, col) => {
      const slot = row * 3 + col;
      const active = targetActive && session.activeSlot === slot;
      if (active) {
        const black = session.activeKind === "BLACK";
        return new ButtonBuilder()
          .setCustomId(`${PREFIX}:hit:${session.id}:${session.activeToken}`)
          .setStyle(black ? ButtonStyle.Danger : ButtonStyle.Primary)
          .setEmoji(black ? "⚫" : "🔵");
      }
      return new ButtonBuilder()
        .setCustomId(`${PREFIX}:empty:${session.id}:${slot}`)
        .setLabel("·")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true);
    }),
  ));

  return singleCard("cofre", [
    titleBlock("tempo", "Treino de Reflexos", "Acerte os alvos azuis. O preto encerra a tentativa."),
    text(`**Progresso:** 🔵 **${session.xpEarned}/${session.xpGoal} XP**${feedback ? `\n${feedback}` : ""}`),
    text("-# O alvo muda de posição a cada 1,25 s. Não clicar apenas troca o alvo; clicar no preto falha."),
    divider(),
    ...rows,
  ]);
}

function scheduleTargetExpiry(session: TrainingSession, message: Message): void {
  clearTrainingTimer(session.id);
  if (session.status !== "ACTIVE" || !session.activeToken || !session.expiresAt) return;

  const expectedToken = session.activeToken;
  const delay = Math.max(0, session.expiresAt.getTime() - Date.now()) + 25;
  const timer = setTimeout(async () => {
    timers.delete(session.id);
    try {
      const next = await issueTrainingTarget(session.id, new Date(), expectedToken);
      if (!next) return;
      await message.edit(v2Edit(panel(next)));
      scheduleTargetExpiry(next, message);
    } catch {
      // Se a mensagem/canal sumiu, o estado continua no banco e /treino pode
      // retomar a tentativa depois, sem abrir um segundo uso no mesmo dia.
    }
  }, delay);
  timer.unref();
  timers.set(session.id, timer);
}

export const treino: Command = {
  data: new SlashCommandBuilder()
    .setName("treino")
    .setDescription("Inicia seu treino diário de reflexos"),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: "Use este comando dentro do servidor.", ephemeral: true });
      return;
    }
    const character = await getOrCreateCharacter(interaction.user.id, interaction.guildId, interaction.user.username);
    const started = await startTrainingSession(character.id);
    let session = started.session;

    if (session.status === "ACTIVE" && (!session.activeToken || !session.expiresAt || session.expiresAt <= new Date())) {
      const issued = await issueTrainingTarget(session.id);
      if (issued) session = issued;
    }

    await interaction.reply(v2Payload(panel(session), true));
    const message = await interaction.fetchReply();
    scheduleTargetExpiry(session, message);
  },

  async handleButton(interaction: ButtonInteraction) {
    const [, action, sessionId, token] = interaction.customId.split(":");
    if (action !== "hit" || !sessionId || !token || !interaction.guildId) return;

    const character = await getOrCreateCharacter(interaction.user.id, interaction.guildId, interaction.user.username);
    const result = await hitTrainingTarget({ sessionId, charId: character.id, token });
    if (!result.ok) {
      const message = result.reason === "OWNER"
        ? "Este treino pertence a outro jogador."
        : "Esse alvo já mudou de posição.";
      await interaction.reply({ content: message, ephemeral: true });
      return;
    }

    let session = result.session;
    let feedback: string | undefined;
    if (result.kind === "BLACK") {
      clearTrainingTimer(session.id);
    } else {
      feedback = `🔵 **+${result.gainedXp} XP**`;
      if (session.status === "ACTIVE") {
        const next = await issueTrainingTarget(session.id);
        if (next) session = next;
      }
    }

    await interaction.update(v2Edit(panel(session, feedback)));
    scheduleTargetExpiry(session, interaction.message);
  },
};
