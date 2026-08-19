import { EmbedBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import type { Command } from "./types.js";
import { getMission, MISSIONS } from "../data/index.js";
import { getOrCreateCharacter } from "../services/characters/character-service.js";
import { getActiveMissions, readState } from "../services/missions/mission-service.js";
import type { MestreEstiloState } from "../services/missions/mestre-estilo.js";
import { mestreEstiloExtraBlock } from "../ui/mestre-estilo-container.js";
import {
  divider,
  listBlock,
  singleCard,
  text,
  titleBlock,
  v2Payload,
  type ContainerChild,
} from "../ui/economy-components-v2.js";
import { emoji } from "../ui/economy-emojis.js";

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
      children.push(...(await mestreEstiloExtraBlock(def, state, char.id)));
    }
  }

  await interaction.reply(v2Payload(singleCard("vila", children), true));
}

async function ativas(interaction: ChatInputCommandInteraction): Promise<void> {
  const embed = new EmbedBuilder().setTitle(`${emoji("missoes")} Missões do jogo`).setColor(0x95a5a6);
  for (const def of MISSIONS) {
    embed.addFields({ name: `[${def.rank}] ${def.name} (\`${def.id}\`)`, value: def.description });
  }
  await interaction.reply({ embeds: [embed], ephemeral: true });
}
