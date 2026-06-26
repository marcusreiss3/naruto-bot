import {
  ActionRowBuilder,
  ComponentType,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type ChatInputCommandInteraction,
  type Message,
  type StringSelectMenuInteraction,
  type TextBasedChannel,
} from "discord.js";
import { prisma } from "../../db/client.js";
import { MANSAO_HOKAGE_CHANNEL_ID } from "../../data/scenarios/index.js";
import { getMission } from "../../data/missions/index.js";
import { getOrCreateCharacter } from "../characters/character-service.js";
import { getAppearance } from "../appearance/appearance-service.js";
import {
  completeMission,
  buildMissionCompleteEmbed,
  getActiveInstanceByType,
  getInstance,
  markObjective,
  readState,
  setState,
} from "./mission-service.js";
import type { RenderEntity } from "../maps/renderer.js";

const SCROLL = "\u{1F4DC}";
const START_CELL = "C3";
const activeArchivePuzzles = new Set<string>();

interface ArchiveScroll {
  id: string;
  label: string;
  short: string;
  clue: string;
}

const ORDER: ArchiveScroll[] = [
  {
    id: "folha",
    label: "Selo da Folha",
    short: "Folha",
    clue: "abre qualquer arquivo oficial",
  },
  {
    id: "missao",
    label: "Registro de Missao",
    short: "Missao",
    clue: "vem logo depois do selo de abertura",
  },
  {
    id: "cla",
    label: "Genealogia dos Clas",
    short: "Clas",
    clue: "fica antes dos mapas",
  },
  {
    id: "mapa",
    label: "Mapa de Rotas",
    short: "Mapa",
    clue: "precisa vir depois dos registros de clas",
  },
  {
    id: "hokage",
    label: "Decreto do Hokage",
    short: "Hokage",
    clue: "fecha a caixa, pois tem autoridade final",
  },
];

export interface ArchiveScrollsState {
  running?: boolean;
  completed?: boolean;
  step?: number;
  mistakes?: number;
  selected?: string[];
}

interface ArchiveScrollsContext {
  inst: NonNullable<Awaited<ReturnType<typeof getInstance>>>;
  def: NonNullable<ReturnType<typeof getMission>>;
  ownerCharId: string;
}

function ensureState(raw: string): ArchiveScrollsState {
  const state = readState<ArchiveScrollsState>(raw);
  state.running = state.running ?? false;
  state.completed = state.completed ?? false;
  state.step = state.step ?? 0;
  state.mistakes = state.mistakes ?? 0;
  state.selected = state.selected ?? [];
  return state;
}

function maxMistakes(def: ArchiveScrollsContext["def"]): number {
  return Number(def.data?.maxMistakes ?? 3);
}

function stepTimeout(def: ArchiveScrollsContext["def"]): number {
  return Number(def.data?.stepTimeoutMs ?? 60_000);
}

async function findContextByCharId(charId: string): Promise<ArchiveScrollsContext | null> {
  const c = await getActiveInstanceByType(charId, "ARCHIVE_SCROLLS");
  if (!c) return null;
  return { inst: c.inst, def: c.def, ownerCharId: charId };
}

export async function resolveArchiveScrolls(discordId: string, guildId: string): Promise<ArchiveScrollsContext | null> {
  const own = await prisma.userCharacter.findUnique({
    where: { discordId_guildId: { discordId, guildId } },
    select: { id: true },
  });
  return own ? findContextByCharId(own.id) : null;
}

export async function archiveScrollsMapHandle(
  interaction: ChatInputCommandInteraction,
  ctx: ArchiveScrollsContext,
  entities: RenderEntity[],
): Promise<string | null> {
  if (interaction.channelId !== MANSAO_HOKAGE_CHANNEL_ID) return null;
  const guildId = interaction.guildId ?? "global";
  const char = await getOrCreateCharacter(interaction.user.id, guildId, interaction.user.username);
  let state = ensureState(ctx.inst.stateJson);

  await markObjective(ctx.inst.id, "chegar_mansao");
  entities.push(...(await archiveEntities(char, guildId)));

  if (state.completed) {
    return `\nMissao ativa: **${ctx.def.name}** - os arquivos ja foram organizados.`;
  }

  if (activeArchivePuzzles.has(ctx.inst.id)) {
    return `\nMissao ativa: **${ctx.def.name}** - o puzzle dos pergaminhos ja esta em andamento no canal.`;
  }

  // Reinicia se o stateJson ficou com running=true de um processo anterior.
  state.running = true;
  state.step = 0;
  state.mistakes = 0;
  state.selected = [];
  await setState(ctx.inst.id, state);
  activeArchivePuzzles.add(ctx.inst.id);
  void startArchivePuzzle(interaction.channel, ctx.inst.id, interaction.user.id)
    .catch(() => undefined)
    .finally(() => activeArchivePuzzles.delete(ctx.inst.id));
  return `\nMissao ativa: **${ctx.def.name}** - organize os pergaminhos no puzzle enviado no canal.`;
}

async function archiveEntities(
  char: Awaited<ReturnType<typeof getOrCreateCharacter>>,
  guildId: string,
): Promise<RenderEntity[]> {
  const ap = await getAppearance(char.discordId, guildId);
  const entities: RenderEntity[] = [
    {
      cell: START_CELL,
      label: char.name.slice(0, 3),
      name: char.name,
      color: "#3498db",
      kind: "PLAYER",
      hp: char.hpCurrent,
      hpMax: char.hpMax,
      chakra: char.resources?.chakra,
      energia: char.resources?.energia,
      imageUrl: ap?.imageUrl,
    },
  ];
  ["B2", "C2", "D2", "E2", "F2"].forEach((cell) => {
    entities.push({ cell, label: SCROLL, color: "#f1c40f", kind: "MARKER" });
  });
  return entities;
}

function buildEmbed(state: ArchiveScrollsState, def: NonNullable<ReturnType<typeof getMission>>): EmbedBuilder {
  const selected = state.selected?.length
    ? state.selected.map((id, i) => `${i + 1}. ${ORDER.find((s) => s.id === id)?.label ?? id}`).join("\n")
    : "Nenhum pergaminho colocado ainda.";
  return new EmbedBuilder()
    .setColor(0x8e44ad)
    .setTitle("Arquivos da Mansao do Hokage")
    .setDescription(
      [
        "Organize os pergaminhos na ordem correta das prateleiras.",
        "",
        `**Ordem atual:**\n${selected}`,
        "",
        `Erros: **${state.mistakes ?? 0}/${maxMistakes(def)}**`,
      ].join("\n"),
    );
}

function buildMenu(instanceId: string, state: ArchiveScrollsState): ActionRowBuilder<StringSelectMenuBuilder> {
  const selected = new Set(state.selected ?? []);
  const step = (state.step ?? 0) + 1;
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`archive:${instanceId}:${step}`)
      .setPlaceholder(`Escolha o pergaminho da posicao ${step}`)
      .addOptions(
        ORDER.filter((s) => !selected.has(s.id))
          .sort(() => Math.random() - 0.5) // embaralha as opcoes
          .map((s) => ({
            label: s.label,
            description: s.clue.slice(0, 100),
            value: s.id,
          })),
      ),
  );
}

async function startArchivePuzzle(
  channel: TextBasedChannel | null,
  instanceId: string,
  actorDiscordId: string,
): Promise<void> {
  if (!channel || !("send" in channel)) return;
  const inst = await getInstance(instanceId);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "ARCHIVE_SCROLLS") return;

  let state = ensureState(inst.stateJson);
  let msg = await channel.send({ embeds: [buildEmbed(state, def)], components: [buildMenu(instanceId, state)] });

  while ((state.step ?? 0) < ORDER.length) {
    try {
      const pick = (await msg.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        time: stepTimeout(def),
        filter: (i: StringSelectMenuInteraction) =>
          i.user.id === actorDiscordId && i.customId === `archive:${instanceId}:${(state.step ?? 0) + 1}`,
      })) as StringSelectMenuInteraction;
      const value = pick.values[0]!;
      const expected = ORDER[state.step ?? 0]!;

      if (value === expected.id) {
        state.selected!.push(value);
        state.step = (state.step ?? 0) + 1;
      } else {
        state.mistakes = (state.mistakes ?? 0) + 1;
      }

      if ((state.mistakes ?? 0) >= maxMistakes(def)) {
        await failArchiveMission(instanceId, msg, "Erros demais. Os arquivos ficaram ainda mais confusos.");
        return;
      }

      await setState(instanceId, state);
      const done = (state.step ?? 0) >= ORDER.length;
      await pick.update({
        embeds: [buildEmbed(state, def)],
        components: done ? [] : [buildMenu(instanceId, state)],
      });
      if (done) break;
    } catch {
      await failArchiveMission(instanceId, msg, "Tempo esgotado. A pilha de pergaminhos desabou.");
      return;
    }
  }

  state.completed = true;
  state.running = false;
  await markObjective(instanceId, "organizar_pergaminhos");
  await setState(instanceId, state);
  await msg.edit({
    embeds: [
      EmbedBuilder.from(buildEmbed(state, def)).setDescription(
        "Os pergaminhos foram arquivados na ordem correta.\n\n**Folha -> Missao -> Clas -> Mapa -> Hokage**",
      ),
    ],
    components: [],
  });
  const result = await completeMission(inst.charId, inst.missionId);
  if (result) {
    await channel.send({ embeds: [buildMissionCompleteEmbed(def.name, result.rewards)] });
  }
}

async function failArchiveMission(instanceId: string, msg: Message, reason: string): Promise<void> {
  await prisma.missionInstance.update({ where: { id: instanceId }, data: { status: "FAILED" } });
  await msg.edit({
    embeds: [new EmbedBuilder().setColor(0xc0392b).setTitle("Arquivos baguncados").setDescription(reason)],
    components: [],
  }).catch(() => undefined);
}
