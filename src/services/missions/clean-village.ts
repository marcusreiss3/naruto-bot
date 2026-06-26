import {
  AttachmentBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type Message,
  type TextBasedChannel,
} from "discord.js";
import { prisma } from "../../db/client.js";
import {
  CENTRO_COMERCIAL_CHANNEL_ID,
  PRACA_VILA_DA_FOLHA_CHANNEL_ID,
  getScenarioByChannel,
} from "../../data/index.js";
import type { ScenarioDef } from "../../data/types.js";
import { parseCell, inBounds } from "../../utils/grid.js";
import { moveRange } from "../characters/formulas.js";
import { getOrCreateCharacter } from "../characters/character-service.js";
import { cellDistance } from "../combat/combat-math.js";
import { getAppearance } from "../appearance/appearance-service.js";
import { MapRenderer, type RenderEntity } from "../maps/renderer.js";
import { sendAsPersona, formatPersonaLines } from "../discord/persona-webhook.js";
import { NpcAiService } from "../npc-ai/npc-ai-service.js";
import { getPersona } from "../npc-ai/personas.js";
import {
  buildMissionCompleteEmbed,
  completeMission,
  getActiveInstanceByType,
  markObjective,
  readState,
  setState,
} from "./mission-service.js";

const TRASH = "\u{1F5D1}\uFE0F";
const PERSONA_KEY = "litter_teen";
const TEEN_CELL = "D6";

interface CleanLocation {
  channelId: string;
  objectiveId: string;
  startCell: string;
  trashCells: string[];
  label: string;
}

const LOCATIONS: Record<string, CleanLocation> = {
  [PRACA_VILA_DA_FOLHA_CHANNEL_ID]: {
    channelId: PRACA_VILA_DA_FOLHA_CHANNEL_ID,
    objectiveId: "limpar_praca",
    startCell: "A1",
    trashCells: ["B3", "D8", "E2"],
    label: "Praca da Vila da Folha",
  },
  [CENTRO_COMERCIAL_CHANNEL_ID]: {
    channelId: CENTRO_COMERCIAL_CHANNEL_ID,
    objectiveId: "limpar_centro",
    startCell: "A1",
    trashCells: ["B2", "C6", "E9"],
    label: "Centro Comercial de Konoha",
  },
};

export interface CleanVillageState {
  playerCells?: Record<string, string>;
  trash?: Record<string, string[]>;
  teenSpawned?: boolean;
  teenGone?: boolean;
  teenCell?: string;
}

interface CleanContext {
  inst: NonNullable<Awaited<ReturnType<typeof getActiveInstanceByType>>>["inst"];
  def: NonNullable<Awaited<ReturnType<typeof getActiveInstanceByType>>>["def"];
  ownerCharId: string;
}

function locationFor(channelId: string): CleanLocation | null {
  return LOCATIONS[channelId] ?? null;
}

function trashBlockedCells(scenario: ScenarioDef): Set<string> {
  return new Set([
    ...(scenario.cells.obstacles ?? []),
    ...(scenario.cells.water ?? []),
    ...(scenario.cells.height ?? []),
    ...(scenario.cells.trees ?? []),
  ]);
}

function safeTrashCells(loc: CleanLocation): string[] {
  const scenario = getScenarioByChannel(loc.channelId);
  if (!scenario) return [...loc.trashCells];
  const blocked = trashBlockedCells(scenario);
  return loc.trashCells.filter((cell) => !blocked.has(cell));
}

function trashTotal(loc: CleanLocation): number {
  return safeTrashCells(loc).length;
}

function ensureState(raw: string, channelId?: string): CleanVillageState {
  const state = readState<CleanVillageState>(raw);
  state.playerCells = state.playerCells ?? {};
  state.trash = state.trash ?? {};
  state.teenCell = state.teenCell ?? TEEN_CELL;

  const channels = channelId ? [channelId] : Object.keys(LOCATIONS);
  for (const id of channels) {
    const loc = locationFor(id);
    if (!loc) continue;
    const safeTrash = safeTrashCells(loc);
    state.playerCells[id] = state.playerCells[id] ?? loc.startCell;
    state.trash[id] = (state.trash[id] ?? [...safeTrash]).filter((cell) => safeTrash.includes(cell));
  }
  return state;
}

function allClean(state: CleanVillageState): boolean {
  return Object.values(LOCATIONS).every((loc) => (state.trash?.[loc.channelId] ?? safeTrashCells(loc)).length === 0);
}

function isBlocked(scenario: ScenarioDef, cell: string): boolean {
  return (scenario.cells.obstacles ?? []).includes(cell) || (scenario.cells.water ?? []).includes(cell);
}

function scaryAction(content: string): boolean {
  const text = content
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
  return /\b(mato|matar|mata|mataria|ameaco|ameacar|ameaca|intimido|intimidar|espanto|expulso|assusto|assustar|dou um susto|vou te bater|apanhar)\b/.test(text);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function resolveCleanVillage(discordId: string, guildId: string): Promise<CleanContext | null> {
  const own = await prisma.userCharacter.findUnique({
    where: { discordId_guildId: { discordId, guildId } },
    select: { id: true },
  });
  if (!own) return null;
  const ctx = await getActiveInstanceByType(own.id, "CLEAN_VILLAGE");
  if (!ctx) return null;
  return { inst: ctx.inst, def: ctx.def, ownerCharId: own.id };
}

export async function cleanVillageMapHandle(
  interaction: ChatInputCommandInteraction,
  ctx: CleanContext,
  entities: RenderEntity[],
): Promise<string | null> {
  const loc = locationFor(interaction.channelId);
  if (!loc) return null;

  const guildId = interaction.guildId ?? "global";
  const char = await getOrCreateCharacter(interaction.user.id, guildId, interaction.user.username);
  const state = ensureState(ctx.inst.stateJson, interaction.channelId);
  await setState(ctx.inst.id, state);

  entities.push(...(await cleanVillageEntities(state, interaction.channelId, char, guildId)));
  const remaining = state.trash?.[interaction.channelId]?.length ?? 0;
  if (interaction.channelId === CENTRO_COMERCIAL_CHANNEL_ID && state.teenSpawned && !state.teenGone) {
    return `\nMissao ativa: **${ctx.def.name}** - recolha o lixo restante e espante o adolescente com uma acao escrita no canal.`;
  }
  return `\nMissao ativa: **${ctx.def.name}** - ${loc.label}: **${remaining}/${trashTotal(loc)}** lixos restantes. Use \`/mover\` ate cada ${TRASH}.`;
}

async function cleanVillageEntities(
  state: CleanVillageState,
  channelId: string,
  char: Awaited<ReturnType<typeof getOrCreateCharacter>>,
  guildId: string,
): Promise<RenderEntity[]> {
  const entities: RenderEntity[] = [];
  const ap = await getAppearance(char.discordId, guildId);
  entities.push({
    cell: state.playerCells?.[channelId] ?? locationFor(channelId)?.startCell ?? "A1",
    label: char.name.slice(0, 3),
    name: char.name,
    color: "#3498db",
    kind: "PLAYER",
    hp: char.hpCurrent,
    hpMax: char.hpMax,
    chakra: char.resources?.chakra,
    energia: char.resources?.energia,
    imageUrl: ap?.imageUrl,
  });

  for (const cell of state.trash?.[channelId] ?? []) {
    entities.push({ cell, label: TRASH, color: "#7f8c8d", kind: "MARKER" });
  }

  if (channelId === CENTRO_COMERCIAL_CHANNEL_ID && state.teenSpawned && !state.teenGone) {
    entities.push({
      cell: state.teenCell ?? TEEN_CELL,
      name: "Adolescente",
      label: "Ado",
      color: "#c0392b",
      kind: "NPC",
      imageFile: "npcs/litter-teen.png",
    });
  }
  return entities;
}

async function renderCleanVillage(
  scenario: ScenarioDef,
  state: CleanVillageState,
  channelId: string,
  char: Awaited<ReturnType<typeof getOrCreateCharacter>>,
  guildId: string,
): Promise<Buffer> {
  const entities = await cleanVillageEntities(state, channelId, char, guildId);
  return MapRenderer.renderScenario({ scenario, entities });
}

async function teenSay(channel: TextBasedChannel | null, playerMessage: string, final = false): Promise<string> {
  const extra = final
    ? "O jogador te intimidou/espantou. Saia assustado e contrariado. Nao morra, nao se machuque e nao inicie combate."
    : "Voce acabou de jogar mais lixo no chao e esta sendo inconveniente. Seja insolente, curto, sem iniciar combate.";
  const text = await NpcAiService.say(PERSONA_KEY, playerMessage, extra, final ? 1 : 0);
  const persona = getPersona(PERSONA_KEY);
  const sent = await sendAsPersona(channel, {
    key: PERSONA_KEY,
    name: persona?.displayName ?? "Adolescente",
    avatarFile: persona?.avatarFile,
    lines: formatPersonaLines(text),
  });
  return sent ? "" : `Adolescente:\n${text}`;
}

async function maybeComplete(
  channel: TextBasedChannel | null,
  charId: string,
  missionId: string,
  state: CleanVillageState,
): Promise<void> {
  if (!allClean(state) || !state.teenGone) return;
  const result = await completeMission(charId, missionId);
  if (!result || !channel || !("send" in channel)) return;
  await channel.send({ embeds: [buildMissionCompleteEmbed("Limpar a Vila", result.rewards)] });
}

export async function moverCleanVillage(interaction: ChatInputCommandInteraction, dest: string): Promise<boolean> {
  const channelId = interaction.channelId;
  const loc = locationFor(channelId);
  if (!loc) return false;
  const scenario = getScenarioByChannel(channelId);
  if (!scenario) return false;

  const guildId = interaction.guildId ?? "global";
  const char = await getOrCreateCharacter(interaction.user.id, guildId, interaction.user.username);
  const ctx = await getActiveInstanceByType(char.id, "CLEAN_VILLAGE");
  if (!ctx) return false;

  const coord = parseCell(dest);
  if (!coord || !inBounds(coord, scenario.rows, scenario.cols)) {
    await interaction.reply({ content: "Celula invalida.", ephemeral: true });
    return true;
  }
  if (isBlocked(scenario, dest)) {
    await interaction.reply({ content: "Esse local esta bloqueado.", ephemeral: true });
    return true;
  }

  let state = ensureState(ctx.inst.stateJson, channelId);
  const from = state.playerCells![channelId]!;
  const limit = moveRange(char.attributes!.taijutsu);
  if (cellDistance(from, dest) > limit) {
    await interaction.reply({
      content: `Fora do alcance de movimento (max ${limit} casas a partir de ${from}).`,
      ephemeral: true,
    });
    return true;
  }

  state.playerCells![channelId] = dest;
  const remaining = state.trash![channelId]!;
  const trashIndex = remaining.indexOf(dest);
  const collected = trashIndex >= 0;

  if (collected) {
    await interaction.reply("Coletando lixo...");
    await sleep(1200);
    remaining.splice(trashIndex, 1);
    if (remaining.length === 0) await markObjective(ctx.inst.id, loc.objectiveId);

    const teenAppears =
      channelId === CENTRO_COMERCIAL_CHANNEL_ID &&
      remaining.length === 1 &&
      !state.teenSpawned;
    if (teenAppears) {
      state.teenSpawned = true;
      state.teenGone = false;
      state.teenCell = TEEN_CELL;
    }

    await setState(ctx.inst.id, state);

    const logs = [`${char.name} recolheu o lixo em ${dest}.`, `${loc.label}: ${remaining.length}/${trashTotal(loc)} lixos restantes.`];
    if (teenAppears) logs.push("Um adolescente aparece jogando mais lixo no chao. Espante ele com uma acao escrita no canal.");
    const png = await renderCleanVillage(scenario, state, channelId, char, guildId);
    const file = new AttachmentBuilder(png, { name: "limpar-vila.png" });
    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setDescription(logs.join("\n").slice(0, 4000))
      .setImage("attachment://limpar-vila.png");
    await interaction.followUp({ embeds: [embed], files: [file] });

    if (teenAppears) {
      const fallback = await teenSay(interaction.channel, "(voce chega jogando lixo no chao)", false);
      if (fallback) await interaction.followUp(fallback);
    }
    await maybeComplete(interaction.channel, char.id, ctx.def.id, state);
    return true;
  }

  await setState(ctx.inst.id, state);
  const png = await renderCleanVillage(scenario, state, channelId, char, guildId);
  const file = new AttachmentBuilder(png, { name: "limpar-vila.png" });
  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setDescription(`${char.name} moveu-se para ${dest}.`)
    .setImage("attachment://limpar-vila.png");
  await interaction.reply({ embeds: [embed], files: [file] });
  return true;
}

export async function continueCleanVillageMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.guildId) return false;
  if (message.channelId !== CENTRO_COMERCIAL_CHANNEL_ID) return false;

  const ctx = await resolveCleanVillage(message.author.id, message.guildId);
  if (!ctx) return false;
  let state = ensureState(ctx.inst.stateJson, message.channelId);
  if (!state.teenSpawned || state.teenGone) return false;

  if (!scaryAction(message.content || "")) {
    const fallback = await teenSay(message.channel, message.content || "...", false);
    if (fallback && "send" in message.channel) await message.channel.send(fallback);
    return true;
  }

  state.teenGone = true;
  await markObjective(ctx.inst.id, "espantar_adolescente");
  await setState(ctx.inst.id, state);
  const fallback = await teenSay(message.channel, message.content || "...", true);
  if (fallback && "send" in message.channel) await message.channel.send(fallback);
  await maybeComplete(message.channel, ctx.ownerCharId, ctx.def.id, state);
  return true;
}
