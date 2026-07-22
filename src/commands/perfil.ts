import { EmbedBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import type { Command } from "./types.js";
import { ATTRIBUTES, ATTRIBUTE_LABELS } from "../config/enums.js";
import { getOrCreateCharacter, setCharacterName } from "../services/characters/character-service.js";
import { getClan } from "../data/index.js";
import { moveRange } from "../services/characters/formulas.js";

export const perfil: Command = {
  data: new SlashCommandBuilder()
    .setName("perfil")
    .setDescription("Mostra o perfil do personagem")
    .addSubcommand((s) =>
      s
        .setName("ver")
        .setDescription("Ver perfil")
        .addUserOption((o) => o.setName("usuario").setDescription("Usuário (padrão: você)")),
    )
    .addSubcommand((s) =>
      s
        .setName("nome")
        .setDescription("Define o nome do seu personagem (aparece no site e na ficha)")
        .addStringOption((o) =>
          o.setName("nome").setDescription("Nome do personagem").setRequired(true).setMaxLength(32),
        ),
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId ?? "global";

    if (interaction.options.getSubcommand() === "nome") {
      const nome = interaction.options.getString("nome", true).trim();
      await getOrCreateCharacter(interaction.user.id, guildId, interaction.user.username);
      await setCharacterName(interaction.user.id, guildId, nome);
      await interaction.reply({ content: `✅ Nome do personagem definido: **${nome}**.`, ephemeral: true });
      return;
    }

    const user = interaction.options.getUser("usuario") ?? interaction.user;
    const char = await getOrCreateCharacter(user.id, guildId, user.username);

    const a = char.attributes!;
    const r = char.resources!;
    const m = char.mastery!;
    const elements = char.elements.map((e) => e.element).join(", ") || "nenhum";
    const clan = char.clan ? getClan(char.clan.clanId)?.name ?? char.clan.clanId : "nenhum";

    const embed = new EmbedBuilder()
      .setTitle(`📜 ${char.displayName?.trim() || char.name} — Nível ${char.level}`)
      .setColor(0xe67e22)
      .addFields(
        {
          name: "Atributos",
          value: ATTRIBUTES.map(
            (attr) => `${ATTRIBUTE_LABELS[attr]}: **${(a as unknown as Record<string, number>)[attr] ?? 1}**`,
          ).join("\n"),
          inline: true,
        },
        {
          name: "Recursos",
          value: [
            `Chakra: **${r.chakra.toFixed(0)}%** (${m.chakraMastery})`,
            `Energia: **${r.energia.toFixed(0)}%** (${m.energiaMastery})`,
            `HP: **${char.hpCurrent}/${char.hpMax}**`,
            `Movimento: **${moveRange(a.taijutsu)}**`,
          ].join("\n"),
          inline: true,
        },
        {
          name: "Geral",
          value: [
            `XP: **${char.xp}**`,
            `Ryo: **${char.ryo}**`,
            `Pontos de atributo: **${char.attributePoints}**`,
            `Elementos: ${elements}`,
            `Clã: ${clan}`,
          ].join("\n"),
        },
        {
          name: `Jutsus (${char.jutsus.length})`,
          value: char.jutsus.length
            ? char.jutsus.map((j) => `\`${j.jutsuId}\``).join(", ").slice(0, 1000)
            : "nenhum",
        },
      );

    await interaction.reply({ embeds: [embed] });
  },
};
