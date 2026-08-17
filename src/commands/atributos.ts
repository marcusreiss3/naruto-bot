import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  type ChatInputCommandInteraction,
  type Message,
} from "discord.js";
import type { Command } from "./types.js";
import { ATTRIBUTES, ATTRIBUTE_LABELS, type Attribute } from "../config/enums.js";
import { getAbility, getClan } from "../data/index.js";
import { getTrait } from "../data/traits.js";
import { getOrCreateCharacter } from "../services/characters/character-service.js";
import { renderAttributesCard } from "../ui/attributes-card.js";
import {
  addToDraft,
  attrHasNoEffect,
  clearDraft,
  commitDraft,
  draftTotal,
  loadAllocState,
  pointsLeft,
  roomFor,
  type AllocState,
} from "../services/characters/attribute-allocator.js";

// Tempo de vida do painel. O rascunho vive so em memoria; se expirar ou o bot
// reiniciar, nada foi gravado e o jogador nao perde ponto.
const PANEL_TIMEOUT_MS = 180_000;

function buildEmbed(state: AllocState, charName: string): EmbedBuilder {
  const left = pointsLeft(state);
  const pending = draftTotal(state.draft);
  const embed = new EmbedBuilder()
    .setColor(left > 0 ? 0x3498db : 0x2ecc71)
    .setTitle(`Atributos de ${charName}`)
    .setDescription("Distribua os pontos pelo seletor e confirme quando terminar.")
    .addFields({
      name: "​",
      value:
        `**Pontos disponíveis: ${left}**` +
        (pending > 0 ? `  ·  ${pending} no rascunho (ainda não gravado)` : ""),
    });

  if (ATTRIBUTES.some((a) => attrHasNoEffect(a) && (state.draft[a] ?? 0) > 0)) {
    embed.setFooter({
      text: "⚠️ Você alocou em atributo sem efeito mecânico. Um admin pode resetar com /admin respec.",
    });
  }
  return embed;
}

async function buildView(state: AllocState, char: Awaited<ReturnType<typeof getOrCreateCharacter>>, username: string) {
  const left = pointsLeft(state);
  const trait = char.trait ? getTrait(char.trait.traitId) : undefined;
  const clan = char.clan ? getClan(char.clan.clanId) : undefined;
  const card = await renderAttributesCard({
    name: char.name,
    username,
    pool: left,
    current: state.current,
    draft: state.draft,
    trait: trait && { name: trait.name, description: trait.description },
    clan: clan && { name: clan.name, description: clan.description },
  });
  return { files: [new AttachmentBuilder(card, { name: "atributos.png" })] };
}

function buildRows(state: AllocState, selected: Attribute | null) {
  const select = new StringSelectMenuBuilder()
    .setCustomId("attr_pick")
    .setPlaceholder(selected ? ATTRIBUTE_LABELS[selected] : "Escolher atributo…")
    .addOptions(
      ATTRIBUTES.map((a) => ({
        label: ATTRIBUTE_LABELS[a],
        value: a,
        description:
          `Atual: ${state.current[a]}` +
          ((state.draft[a] ?? 0) > 0 ? ` (+${state.draft[a]})` : "") +
          (attrHasNoEffect(a) ? " · sem efeito ainda" : ""),
        default: a === selected,
      })),
    );

  const left = pointsLeft(state);
  const canAdd = selected !== null && roomFor(state, selected) > 0;
  const botoes = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("attr_p1")
      .setLabel("+1")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!canAdd),
    new ButtonBuilder()
      .setCustomId("attr_p5")
      .setLabel("+5")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!canAdd || left < 1),
    new ButtonBuilder()
      .setCustomId("attr_all")
      .setLabel("Tudo")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!canAdd),
    new ButtonBuilder()
      .setCustomId("attr_clear")
      .setLabel("↺ Limpar")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(draftTotal(state.draft) === 0),
    new ButtonBuilder()
      .setCustomId("attr_commit")
      .setLabel("✅ Confirmar")
      .setStyle(ButtonStyle.Success)
      .setDisabled(draftTotal(state.draft) === 0),
  );

  return [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select), botoes];
}

export async function abrirPainel(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId ?? "global";
  const char = await getOrCreateCharacter(interaction.user.id, guildId, interaction.user.username);
  const state = await loadAllocState(char.id);
  if (!state) {
    await interaction.reply({ content: "❌ Personagem sem atributos.", ephemeral: true });
    return;
  }
  if (state.pool <= 0) {
    await interaction.reply({
      ...(await buildView(state, char, interaction.user.username)),
      content: "Você não tem pontos para distribuir.",
      ephemeral: true,
    });
    return;
  }

  // efemero: so o dono ve e mexe no proprio painel
  await interaction.reply({
    ...(await buildView(state, char, interaction.user.username)),
    components: buildRows(state, null),
    ephemeral: true,
  });
  const msg = await interaction.fetchReply();

  let selected: Attribute | null = null;
  const collector = (msg as Message).createMessageComponentCollector({
    time: PANEL_TIMEOUT_MS,
    filter: (i) => i.user.id === interaction.user.id,
  });

  collector.on("collect", async (i) => {
    if (i.componentType === ComponentType.StringSelect) {
      selected = i.values[0] as Attribute;
      await i.update({ ...(await buildView(state, char, interaction.user.username)), components: buildRows(state, selected) });
      return;
    }

    if (i.customId === "attr_clear") {
      clearDraft(state);
      await i.update({ ...(await buildView(state, char, interaction.user.username)), components: buildRows(state, selected) });
      return;
    }

    if (i.customId === "attr_commit") {
      collector.stop("commit");
      try {
        const { spent, unlocked } = await commitDraft(char.id, state.draft);
        const fresh = (await loadAllocState(char.id))!;
        const nomes = unlocked.map((id) => getAbility(id)?.name ?? id);
        const extra = nomes.length ? `\n🔓 Jutsu liberado: **${nomes.join(", ")}**` : "";
        await i.update({
          content: `✅ ${spent} ponto(s) gravado(s).${extra}`,
          ...(await buildView(fresh, char, interaction.user.username)),
          components: [],
        });
      } catch (err) {
        await i.update({
          content: `❌ ${(err as Error).message}`,
          embeds: [],
          components: [],
        });
      }
      return;
    }

    if (!selected) return;
    const n = i.customId === "attr_p1" ? 1 : i.customId === "attr_p5" ? 5 : roomFor(state, selected);
    addToDraft(state, selected, n);
    await i.update({ ...(await buildView(state, char, interaction.user.username)), components: buildRows(state, selected) });
  });

  collector.on("end", async (_c, reason) => {
    if (reason === "commit") return;
    // expirou: nada foi gravado, os pontos continuam no pool
    await interaction
      .editReply({
        content: "⌛ Painel expirou. Nada foi gravado — seus pontos continuam disponíveis.",
        components: [],
      })
      .catch(() => undefined);
  });
}

export const atributos: Command = {
  data: new SlashCommandBuilder()
    .setName("atributos")
    .setDescription("Distribui seus pontos de atributo"),
  execute: abrirPainel,
};
