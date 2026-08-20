import {
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { Command } from "./types.js";
import { getMission, MISSIONS } from "../data/index.js";
import { getOrCreateCharacter } from "../services/characters/character-service.js";
import { abandonMission, getActiveMissions, readState } from "../services/missions/mission-service.js";
import {
  getDailyMissionBoardDay,
  getDailyMissionClaimedMissionIds,
  sweepExpiredBoardMissions,
} from "../services/missions/daily-mission-board.js";
import type { MestreEstiloState } from "../services/missions/mestre-estilo.js";
import { mestreEstiloExtraBlock } from "../ui/mestre-estilo-container.js";
import {
  button,
  buttonRow,
  divider,
  listBlock,
  singleCard,
  text,
  titleBlock,
  v2Edit,
  v2Payload,
  type ContainerChild,
  type TopLevel,
} from "../ui/economy-components-v2.js";
import { emoji } from "../ui/economy-emojis.js";

const PREFIX = "missoes:v1";
const cid = (action: string, arg: string) => `${PREFIX}:${action}:${arg}`;

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

  async handleButton(interaction: ButtonInteraction) {
    const [, , action, instanceId] = interaction.customId.split(":");
    if (action !== "abandonar" || !instanceId) return;
    const guildId = interaction.guildId ?? "global";
    const char = await getOrCreateCharacter(interaction.user.id, guildId, interaction.user.username);
    const result = await abandonMission(char.id, instanceId);
    if (!result.ok) {
      await interaction.reply({ content: `❌ ${result.error ?? "Não foi possível abandonar esta missão."}`, ephemeral: true });
      return;
    }
    const card = await buildMinhasCard(char.id);
    await interaction.update(v2Edit(card));
  },
};

// Botao de abandonar: instancias que vieram do mural (tem claim hoje) e
// mestre de estilo de luta. As demais missoes de historia (gato, bandidos,
// escolta...) tem estado proprio demais pra abandonar com seguranca aqui.
async function buildMinhasCard(charId: string): Promise<TopLevel[]> {
  const dayKey = getDailyMissionBoardDay();
  await sweepExpiredBoardMissions(charId, dayKey);
  const insts = await getActiveMissions(charId);
  if (insts.length === 0) {
    return singleCard("vila", [titleBlock("missoes", "Suas missões", "0 ativa(s)"), text("Você não tem missões ativas.")]);
  }
  const claimedMissionIds = await getDailyMissionClaimedMissionIds(charId, dayKey);

  const children: ContainerChild[] = [titleBlock("missoes", "Suas missões", `${insts.length} ativa(s)`)];

  for (const inst of insts) {
    const def = getMission(inst.missionId);
    if (!def) continue;

    const objectiveStates = new Map(inst.objectives.map((objective) => [objective.objectiveId, objective.done]));
    const visibleObjectives: string[] = [];
    for (const objective of def.objectives) {
      const done = objectiveStates.get(objective.id) ?? false;
      visibleObjectives.push(`${done ? emoji("sucesso") : emoji("pendente")} ${objective.description}`);
      if (!done) break;
    }

    children.push(divider());
    children.push(text(`**[${def.rank}] ${def.name}**\n-# ${def.description}`));
    children.push(listBlock(null, visibleObjectives, "Sem objetivos."));

    // Mestre de estilo de luta ganha um bloco a mais durante GATHER: o
    // checklist ao vivo de ryo/itens que ainda falta trazer. Todo o resto
    // (INTRO/CHALLENGE) já fica claro pelos objetivos genéricos acima —
    // fica tudo no MESMO container, no mesmo estilo das outras missões.
    if (def.type === "MESTRE_ESTILO") {
      const state = readState<MestreEstiloState>(inst.stateJson);
      children.push(...(await mestreEstiloExtraBlock(def, state, charId)));
    }

    if (claimedMissionIds.has(inst.missionId) || def.type === "MESTRE_ESTILO") {
      children.push(
        buttonRow(
          button({ id: cid("abandonar", inst.id), label: "Abandonar missão", style: ButtonStyle.Danger, emojiKey: "erro" }),
        ),
      );
    }
  }

  return singleCard("vila", children);
}

async function minhas(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId ?? "global";
  const char = await getOrCreateCharacter(interaction.user.id, guildId, interaction.user.username);
  await interaction.reply(v2Payload(await buildMinhasCard(char.id), true));
}

async function ativas(interaction: ChatInputCommandInteraction): Promise<void> {
  const embed = new EmbedBuilder().setTitle(`${emoji("missoes")} Missões do jogo`).setColor(0x95a5a6);
  for (const def of MISSIONS) {
    embed.addFields({ name: `[${def.rank}] ${def.name} (\`${def.id}\`)`, value: def.description });
  }
  await interaction.reply({ embeds: [embed], ephemeral: true });
}
