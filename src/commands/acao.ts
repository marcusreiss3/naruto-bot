import {
  EmbedBuilder,
  SlashCommandBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { Command } from "./types.js";
import {
  GATHER_ACTION_BY_SUBCOMMAND,
  GATHER_ACTION_LABELS,
  areasForAction,
  type GatherAction,
} from "../data/gathering.js";
import { getOrCreateCharacter } from "../services/characters/character-service.js";
import { describeLoot, performGathering } from "../services/economy/gathering.js";
import { villageFromMemberStrict } from "../services/economy/village-sync.js";
import type { GuildMember } from "discord.js";

// Frase de abertura por acao. E' RP, nao mecanica: o embed serve para o jogador
// citar no canal. Nao revela chance, cooldown restante nem "quase ganhou".
const NARRATIVA: Record<GatherAction, string> = {
  MINERAR: "Você firma a picareta contra a rocha e trabalha até a veia ceder.",
  COLETAR: "Você vasculha o terreno com calma, separando o que presta do que não presta.",
  CACAR: "Você segue o rastro, espera o momento certo e não erra o bote.",
  PESCAR: "Você lê a corrente, lança a linha e espera o peixe se entregar.",
  COLETAR_AGUA: "Você enche os cantis com água limpa, filtrando o que desce da nascente.",
};

const CORES: Record<GatherAction, number> = {
  MINERAR: 0x8d8d8d,
  COLETAR: 0x4f9d3a,
  CACAR: 0x9d5b2f,
  PESCAR: 0x2f7f9d,
  COLETAR_AGUA: 0x3aa0c8,
};

function canaisPermitidos(action: GatherAction): string {
  return areasForAction(action)
    .map((area) => `<#${area.channelId}>`)
    .join(", ");
}

export const acao: Command = {
  data: new SlashCommandBuilder()
    .setName("acao")
    .setDescription("Ações de exploração nos canais de RP")
    .addSubcommand((s) => s.setName("minerar").setDescription("Extrai pedra, minério e carvão"))
    .addSubcommand((s) => s.setName("coletar").setDescription("Recolhe madeira, fibras, ervas e frutas"))
    .addSubcommand((s) => s.setName("cacar").setDescription("Caça animais por carne e couro"))
    .addSubcommand((s) => s.setName("pescar").setDescription("Pesca peixe no rio"))
    .addSubcommand((s) => s.setName("coletar-agua").setDescription("Recolhe água limpa")),

  async execute(interaction: ChatInputCommandInteraction) {
    const action = GATHER_ACTION_BY_SUBCOMMAND[interaction.options.getSubcommand()];
    if (!action) {
      await interaction.reply({ content: "Ação desconhecida.", flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply();
    const guildId = interaction.guildId ?? "global";
    const char = await getOrCreateCharacter(interaction.user.id, guildId, interaction.user.username);

    const outcome = await performGathering(char.id, interaction.channelId, action, {
      villageId: villageFromMemberStrict(interaction.member as GuildMember | null),
    });

    if (!outcome.ok) {
      const canais = canaisPermitidos(action);
      await interaction.editReply(
        canais ? `${outcome.error}\nLocais possíveis: ${canais}` : outcome.error,
      );
      return;
    }

    const { area, loot } = outcome.result;
    const embed = new EmbedBuilder()
      .setColor(CORES[action])
      .setTitle(`${GATHER_ACTION_LABELS[action]} — ${area.name}`)
      .setDescription(`*${NARRATIVA[action]}*`)
      .addFields({ name: "Você obteve", value: describeLoot(loot) })
      .setFooter({ text: `${char.displayName?.trim() || char.name} • ${area.name}` });

    await interaction.editReply({ embeds: [embed] });
  },
};
