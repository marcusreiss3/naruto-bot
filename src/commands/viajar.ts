import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  SlashCommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type MessageActionRowComponentBuilder,
} from "discord.js";
import type { Command } from "./types.js";
import {
  TRAVEL_LOCATION_IDS,
  TRAVEL_LOCATIONS,
  TRAVEL_PATHS,
  isTravelLocationId,
  travelLocationFromChannel,
  travelMinutes,
  type TravelLocationId,
} from "../data/travel.js";
import {
  divider,
  economyContainer,
  factsBlock,
  noticeBlock,
  text,
  titleBlock,
  v2Edit,
  type ContainerChild,
  type TopLevel,
} from "../ui/economy-components-v2.js";
import {
  TravelError,
  activeTravel,
  armTravelScheduler,
  beginTravel,
  validStoredTravel,
} from "../services/travel/travel-service.js";
import { emoji } from "../ui/economy-emojis.js";

const PREFIX = "viajar:v1";
const villageDestinations = TRAVEL_LOCATION_IDS.filter(
  (id) => TRAVEL_LOCATIONS[id].kind === "VILLAGE",
);
const openWorldDestinations = TRAVEL_LOCATION_IDS.filter(
  (id) => TRAVEL_LOCATIONS[id].kind === "OPEN_WORLD",
);

function destinationButton(origin: TravelLocationId, destination: TravelLocationId): ButtonBuilder {
  const local = TRAVEL_LOCATIONS[destination];
  const current = origin === destination;
  return new ButtonBuilder()
    .setCustomId(`${PREFIX}:go:${origin}:${destination}`)
    .setLabel(current ? `${local.label} · você está aqui` : `${local.label} · ${travelMinutes(origin, destination)} min`)
    .setEmoji(emoji(local.emojiKey))
    .setStyle(current ? ButtonStyle.Secondary : ButtonStyle.Primary)
    .setDisabled(current);
}

function row(origin: TravelLocationId, destinations: TravelLocationId[]) {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    ...destinations.map((destination) => destinationButton(origin, destination)),
  );
}

export function renderTravelMenu(origin: TravelLocationId): TopLevel[] {
  const local = TRAVEL_LOCATIONS[origin];
  const children: ContainerChild[] = [
    titleBlock("viagem", "Central de Viagem", "Escolha o próximo destino da sua jornada"),
    factsBlock([{ label: "Local atual", value: `${emoji(local.emojiKey)} ${local.label}` }]),
    noticeBlock(
      "aviso",
      "Ao partir, seu cargo atual será trocado por um cargo de caminho até a chegada automática.",
    ),
    divider(true),
    text(`## ${emoji("grupo_vilas")} Vilas Ocultas\n-# O tempo considera a posição de cada nação no mundo shinobi.`),
    row(origin, villageDestinations),
    divider(true),
    text(`## ${emoji("mundo_aberto")} Mundo Aberto\n-# Floresta inclui o Rio; Montanhas incluem a Caverna.`),
    row(origin, openWorldDestinations),
    text("-# Duração das rotas: de 5 a 20 minutos. A escolha é confirmada imediatamente."),
  ];
  return [economyContainer("vila", children)];
}

function renderStarted(result: Awaited<ReturnType<typeof beginTravel>>): TopLevel[] {
  const origin = TRAVEL_LOCATIONS[result.origin];
  const destination = TRAVEL_LOCATIONS[result.destination];
  const path = TRAVEL_PATHS[result.path];
  const unix = Math.floor(result.arriveAt.getTime() / 1_000);
  return [
    economyContainer("cofre", [
      titleBlock("viajando", "Viagem iniciada", `${origin.label} → ${destination.label}`),
      noticeBlock("sucesso", "Sua partida foi registrada e os cargos já foram atualizados."),
      divider(),
      factsBlock([
        { label: "Destino", value: `${emoji(destination.emojiKey)} ${destination.label}` },
        { label: "Duração", value: `${result.minutes} min` },
      ]),
      text(`**Rota atual**\n${emoji(path.emojiKey)} ${path.label}`),
      text(`**Chegada automática**\n<t:${unix}:F> • <t:${unix}:R>`),
      text("-# Você receberá uma mensagem quando o destino for liberado."),
    ]),
  ];
}

function renderError(message: string): TopLevel[] {
  return [
    economyContainer("erro", [
      titleBlock("erro", "Não foi possível viajar"),
      noticeBlock("erro", message),
      text("-# Use /viajar novamente depois de corrigir o problema."),
    ]),
  ];
}

function renderActive(row: NonNullable<Awaited<ReturnType<typeof activeTravel>>>): TopLevel[] {
  if (!validStoredTravel(row)) {
    return renderError("Sua viagem salva possui dados inválidos. Peça para a staff verificar o registro.");
  }
  const destination = TRAVEL_LOCATIONS[row.destination];
  const path = TRAVEL_PATHS[row.path];
  const unix = Math.floor(row.arriveAt.getTime() / 1_000);
  return [
    economyContainer("aviso", [
      titleBlock("viajando", "Você já está viajando", `${emoji(path.emojiKey)} ${path.label}`),
      factsBlock([{ label: "Destino", value: `${emoji(destination.emojiKey)} ${destination.label}` }]),
      divider(),
      text(`**Chegada automática**\n<t:${unix}:F> • <t:${unix}:R>`),
      noticeBlock("bloqueio", "Espere a chegada antes de iniciar outra viagem."),
    ]),
  ];
}

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (!interaction.guildId) {
    await interaction.editReply(v2Edit(renderError("Este comando só funciona dentro do servidor.")));
    return;
  }

  const current = await activeTravel(interaction.guildId, interaction.user.id);
  if (current) {
    await interaction.editReply(v2Edit(renderActive(current)));
    return;
  }

  const origin = travelLocationFromChannel(interaction.channelId);
  if (!origin) {
    const channels = TRAVEL_LOCATION_IDS.flatMap((id) => TRAVEL_LOCATIONS[id].channelIds);
    await interaction.editReply(
      v2Edit([
        economyContainer("erro", [
          titleBlock("viagem", "Viagem indisponível neste canal"),
          noticeBlock("erro", "Use /viajar em um portão de vila ou em uma área do mundo aberto."),
          divider(),
          text(`**Canais permitidos**\n${channels.map((id) => `• <#${id}>`).join("\n")}`),
        ]),
      ]),
    );
    return;
  }

  await interaction.editReply(v2Edit(renderTravelMenu(origin)));
}

async function handleButton(interaction: ButtonInteraction): Promise<void> {
  const [command, version, action, rawOrigin, rawDestination] = interaction.customId.split(":");
  if (command !== "viajar" || version !== "v1" || action !== "go") return;
  await interaction.deferUpdate();

  if (!interaction.guild || !interaction.guildId) {
    await interaction.editReply(v2Edit(renderError("Este botão só funciona dentro do servidor.")));
    return;
  }
  if (!isTravelLocationId(rawOrigin) || !isTravelLocationId(rawDestination)) {
    await interaction.editReply(v2Edit(renderError("O destino selecionado não existe.")));
    return;
  }

  const origin = travelLocationFromChannel(interaction.channelId);
  if (!origin || origin !== rawOrigin) {
    await interaction.editReply(v2Edit(renderError("O painel foi aberto fora de um ponto de partida válido.")));
    return;
  }

  try {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!member.roles.cache.has(TRAVEL_LOCATIONS[origin].roleId)) {
      throw new TravelError(
        `Você não possui o cargo de localização de ${TRAVEL_LOCATIONS[origin].label}. Use o ponto de partida onde você está atualmente.`,
      );
    }
    const result = await beginTravel(member, origin, rawDestination);
    await armTravelScheduler(interaction.client);
    await interaction.editReply(v2Edit(renderStarted(result)));
  } catch (error) {
    const message = error instanceof TravelError ? error.message : "Ocorreu um erro inesperado ao iniciar a viagem.";
    await interaction.editReply(v2Edit(renderError(message)));
  }
}

export const viajar: Command = {
  data: new SlashCommandBuilder()
    .setName("viajar")
    .setDescription("Viaje entre as vilas e as áreas do mundo aberto"),
  execute,
  handleButton,
};
