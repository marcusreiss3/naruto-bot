import { EmbedBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import type { Command } from "./types.js";
import { getMyParty, invite, accept, leave } from "../services/party/party-service.js";

export const party: Command = {
  data: new SlashCommandBuilder()
    .setName("party")
    .setDescription("Grupo de jogadores (aparecem juntos no combate)")
    .addSubcommand((s) =>
      s
        .setName("convidar")
        .setDescription("Convida um jogador para sua party")
        .addUserOption((o) => o.setName("jogador").setDescription("Quem convidar").setRequired(true)),
    )
    .addSubcommand((s) => s.setName("aceitar").setDescription("Aceita o convite de party pendente"))
    .addSubcommand((s) => s.setName("sair").setDescription("Sai da party (líder dissolve a party)"))
    .addSubcommand((s) => s.setName("ver").setDescription("Mostra sua party")),

  async execute(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId ?? "global";
    const sub = interaction.options.getSubcommand();

    if (sub === "convidar") {
      const alvo = interaction.options.getUser("jogador", true);
      if (alvo.bot) {
        await interaction.reply({ content: "❌ Não dá pra convidar um bot.", ephemeral: true });
        return;
      }
      const r = await invite(guildId, interaction.user.id, alvo.id);
      if (!r.ok) {
        await interaction.reply({ content: `❌ ${r.error}`, ephemeral: true });
        return;
      }
      await interaction.reply(
        `📨 <@${alvo.id}>, você foi convidado para a party de <@${interaction.user.id}>! Use \`/party aceitar\`.`,
      );
      return;
    }

    if (sub === "aceitar") {
      const r = await accept(guildId, interaction.user.id);
      if (!r.ok) {
        await interaction.reply({ content: `❌ ${r.error}`, ephemeral: true });
        return;
      }
      const ids = r.party?.memberIds.map((id) => `<@${id}>`).join(", ") ?? `<@${interaction.user.id}>`;
      await interaction.reply(`✅ <@${interaction.user.id}> entrou na party!\nMembros: ${ids}`);
      return;
    }

    if (sub === "sair") {
      const r = await leave(guildId, interaction.user.id);
      if (!r.ok) {
        await interaction.reply({ content: "ℹ️ Você não está em uma party.", ephemeral: true });
        return;
      }
      await interaction.reply(
        r.disbanded
          ? `🚪 Você era o líder — a party foi dissolvida.`
          : `🚪 <@${interaction.user.id}> saiu da party.`,
      );
      return;
    }

    // ver
    const p = await getMyParty(guildId, interaction.user.id);
    if (!p) {
      await interaction.reply({ content: "ℹ️ Você não está em uma party. Use `/party convidar`.", ephemeral: true });
      return;
    }
    const embed = new EmbedBuilder()
      .setTitle("👥 Sua Party")
      .setColor(0x1abc9c)
      .setDescription(
        p.memberIds.map((id) => `${id === p.leaderId ? "👑" : "•"} <@${id}>`).join("\n"),
      );
    await interaction.reply({ embeds: [embed] });
  },
};
