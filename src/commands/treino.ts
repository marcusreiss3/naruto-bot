import {
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { TrainingSession } from "@prisma/client";
import type { Command } from "./types.js";
import { getOrCreateCharacter } from "../services/characters/character-service.js";
import {
  armTrainingTarget,
  beginTrainingSession,
  hitTrainingTarget,
  issueTrainingTarget,
  startTrainingSession,
} from "../services/characters/reaction-training-service.js";
import { buttonRow, divider, singleCard, text, titleBlock, v2Edit, v2Payload, type TopLevel } from "../ui/economy-components-v2.js";
import { log } from "../utils/logger.js";

const PREFIX = "treino";
const timers = new Map<string, ReturnType<typeof setTimeout>>();
type TrainingInteraction = ChatInputCommandInteraction | ButtonInteraction;

function clearTrainingTimer(sessionId: string): void {
  const timer = timers.get(sessionId);
  if (timer) clearTimeout(timer);
  timers.delete(sessionId);
}

function introductionPanel(): TopLevel[] {
  return singleCard("aviso", [
    titleBlock("tempo", "Treino de Reflexos", "Preparação"),
    text("🔵 Clique no alvo azul para ganhar XP.\n⚫ Clicar no alvo preto encerra o treino, mas você mantém o XP conquistado."),
    divider(),
    text("-# O treino começa em 5 segundos. Cada alvo ficará disponível por 1,25 s."),
  ]);
}

function alreadyUsedPanel(session: TrainingSession): TopLevel[] {
  const status = session.status === "COMPLETED"
    ? "Você já concluiu o treino de hoje."
    : session.status === "FAILED"
      ? "Sua tentativa de treino de hoje já foi encerrada."
      : "Você já iniciou a tentativa de treino de hoje.";
  return singleCard("aviso", [
    titleBlock("aviso", "Treino indisponível"),
    text(status),
    divider(),
    text("-# Uma única tentativa é permitida por dia. O próximo treino abre à 00:00 (horário de Brasília)."),
  ]);
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
    divider(),
    ...rows,
  ]);
}

async function armAndScheduleTarget(session: TrainingSession, interaction: TrainingInteraction): Promise<void> {
  if (!session.activeToken) return;
  const armed = await armTrainingTarget(session.id, session.activeToken);
  if (armed) scheduleTargetExpiry(armed, interaction);
}

function scheduleTargetExpiry(session: TrainingSession, interaction: TrainingInteraction): void {
  clearTrainingTimer(session.id);
  if (session.status !== "ACTIVE" || !session.activeToken || !session.expiresAt) return;

  const expectedToken = session.activeToken;
  const delay = Math.max(0, session.expiresAt.getTime() - Date.now()) + 25;
  const timer = setTimeout(async () => {
    timers.delete(session.id);
    try {
      const next = await issueTrainingTarget(session.id, new Date(), expectedToken);
      if (!next || next.status !== "ACTIVE" || !next.activeToken) return;
      // Respostas efêmeras só podem ser atualizadas de forma confiável pelo
      // webhook da interação; Message#edit pode falhar silenciosamente nelas.
      await interaction.editReply(v2Edit(panel(next)));
      await armAndScheduleTarget(next, interaction);
    } catch (error) {
      log.error("Falha ao trocar o alvo do treino:", error);
    }
  }, delay);
  timer.unref();
  timers.set(session.id, timer);
}

function scheduleIntroduction(session: TrainingSession, interaction: ChatInputCommandInteraction): void {
  clearTrainingTimer(session.id);
  if (session.status !== "INTRO" || !session.introEndsAt) return;

  const delay = Math.max(0, session.introEndsAt.getTime() - Date.now());
  const timer = setTimeout(async () => {
    timers.delete(session.id);
    try {
      const started = await beginTrainingSession(session.id);
      if (!started || started.status !== "ACTIVE") return;
      const target = await issueTrainingTarget(started.id);
      if (!target || !target.activeToken) return;
      await interaction.editReply(v2Edit(panel(target)));
      await armAndScheduleTarget(target, interaction);
    } catch (error) {
      log.error("Falha ao iniciar o treino de reflexos:", error);
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
    if (!started.created) {
      await interaction.reply(v2Payload(alreadyUsedPanel(started.session), true));
      return;
    }

    await interaction.reply(v2Payload(introductionPanel(), true));
    scheduleIntroduction(started.session, interaction);
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
    if (result.kind === "BLUE" && session.status === "ACTIVE") {
      await armAndScheduleTarget(session, interaction);
    }
  },
};
