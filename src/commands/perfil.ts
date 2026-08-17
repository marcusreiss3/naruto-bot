import { AttachmentBuilder, EmbedBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import type { Command } from "./types.js";
import { ATTRIBUTES, ATTRIBUTE_LABELS, TRAIT_RARITY_LABELS } from "../config/enums.js";
import { getOrCreateCharacter, setCharacterName } from "../services/characters/character-service.js";
import { getClan } from "../data/index.js";
import { getTrait, traitEmoji } from "../data/traits.js";
import { moveRange } from "../services/characters/formulas.js";
import { formatRyo } from "../services/economy/character-economy.js";
import { prisma } from "../db/client.js";
import { emoji } from "../ui/economy-emojis.js";
import { renderProfileCard } from "../ui/profile-card.js";
import { ELEMENT_LABELS, FIGHTING_STYLE_LABELS, NINJA_RANK_LABELS, type Element, type FightingStyle, type NinjaRank } from "../config/enums.js";
import { VILLAGE_NAMES, type VillageId } from "../data/villages.js";

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
      const char = await getOrCreateCharacter(interaction.user.id, guildId, interaction.user.username);
      if (!/^[\p{L}][\p{L}' -]{1,23}$/u.test(nome)) {
        await interaction.reply({ content: "Nome inválido. Use de 2 a 24 caracteres, apenas com letras, espaços, hífen ou apóstrofo.", ephemeral: true });
        return;
      }
      const clanName = char.clan ? getClan(char.clan.clanId)?.name : null;
      const finalName = char.profile?.completedAt && clanName ? `${nome} ${clanName}` : nome;
      await setCharacterName(interaction.user.id, guildId, finalName);
      if (char.profile?.completedAt) {
        await prisma.characterProfile.update({ where: { charId: char.id }, data: { givenName: nome } });
      }
      await interaction.reply({ content: `Nome do personagem definido: **${finalName}**.`, ephemeral: true });
      return;
    }

    const user = interaction.options.getUser("usuario") ?? interaction.user;
    const char = await getOrCreateCharacter(user.id, guildId, user.username);

    const a = char.attributes!;
    const r = char.resources!;
    const m = char.mastery!;
    const elements = char.elements.map((e) => e.element).join(", ") || "nenhum";
    const clan = char.clan ? getClan(char.clan.clanId)?.name ?? char.clan.clanId : "nenhum";
    const trait = char.trait ? getTrait(char.trait.traitId) : undefined;
    const card = await renderProfileCard({
      name: char.displayName?.trim() || char.name,
      username: user.username,
      level: char.level,
      rank: NINJA_RANK_LABELS[char.ninjaRank as NinjaRank] ?? char.ninjaRank,
      village: char.villageId ? (VILLAGE_NAMES[char.villageId as VillageId] ?? char.villageId) : "Sem vila",
      clan,
      trait: trait ? { name: trait.name, rarity: trait.rarity } : undefined,
      hp: { current: char.hpCurrent, max: char.hpMax },
      chakra: r.chakra,
      energy: r.energia,
      elements: char.elements.map((entry) => ELEMENT_LABELS[entry.element as Element] ?? entry.element),
      fightingStyles: char.fightingStyles.map((entry) => FIGHTING_STYLE_LABELS[entry.style as FightingStyle] ?? entry.style),
      appearanceUrl: char.profile?.completedAt ? char.profile.appearanceUrl : undefined,
    });

    const embed = new EmbedBuilder()
      .setTitle(`${emoji("perfil")} ${char.displayName?.trim() || char.name} — Nível ${char.level}`)
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
            `Movimento: **${moveRange()}**`,
          ].join("\n"),
          inline: true,
        },
        {
          name: "Geral",
          value: [
            `XP: **${char.xp}**`,
            // Saldo negativo aparece como divida, nunca como "disponivel".
            char.ryo < 0 ? `Ryo: **${formatRyo(char.ryo)}**` : `Ryo: **${char.ryo}**`,
            `Pontos de atributo: **${char.attributePoints}**`,
            `Elementos: ${elements}`,
            `Clã: ${clan}`,
            `Traço: ${trait ? `**${trait.name}** [${TRAIT_RARITY_LABELS[trait.rarity]}]` : "nenhum"}`,
            ...(char.profile?.completedAt ? [`Idade: **${char.profile.age} anos**`] : []),
          ].join("\n"),
        },
        // Descricao completa em campo proprio: no "Geral" ela estouraria a
        // linha e as traits miticas tem texto longo.
        ...(trait ? [{ name: `${traitEmoji(trait.id)} ${trait.name}`, value: trait.description }] : []),
        ...(char.profile?.completedAt ? [{ name: "História", value: char.profile.story.slice(0, 1024) }] : []),
        {
          name: `Jutsus (${char.jutsus.length})`,
          value: char.jutsus.length
            ? char.jutsus.map((j) => `\`${j.jutsuId}\``).join(", ").slice(0, 1000)
            : "nenhum",
        },
      );

    if (char.profile?.completedAt) embed.setImage(char.profile.appearanceUrl);

    await interaction.reply({ files: [new AttachmentBuilder(card, { name: "perfil.png" })] });
  },
};
