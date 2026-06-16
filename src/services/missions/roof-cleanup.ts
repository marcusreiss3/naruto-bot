import {
  AttachmentBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type TextBasedChannel,
} from "discord.js";
import { prisma } from "../../db/client.js";
import { ACADEMIA_GENIN_CHANNEL_ID, getScenarioByChannel } from "../../data/index.js";
import { getMission } from "../../data/missions/index.js";
import { parseCell, inBounds } from "../../utils/grid.js";
import { getOrCreateCharacter } from "../characters/character-service.js";
import { moveRange } from "../characters/formulas.js";
import { getAppearance } from "../appearance/appearance-service.js";
import { cellDistance } from "../combat/combat-math.js";
import { getActiveSession, startCombat } from "../combat/combat-engine.js";
import { MapRenderer, type RenderEntity } from "../maps/renderer.js";
import { partyMemberIds } from "../party/party-service.js";
import { cacheAttrs, gatherPartyPlayers } from "./combat-party.js";
import {
  completeMission,
  getActiveInstanceByType,
  getInstance,
  markObjective,
  readState,
  setState,
} from "./mission-service.js";

const POOP = "\u{1F4A9}";
const START_CELL = "B2";
const TRASH_CELLS = ["B1", "C1", "D1"] as const;
const OBJECTIVE_BY_CELL: Record<string, string> = {
  B1: "limpar_b1",
  C1: "limpar_c1",
  D1: "limpar_d1",
};

export interface RoofCleanupState {
  playerCell?: string;
  trash?: string[];
  combatStarted?: boolean;
}

interface RoofCleanupContext {
  inst: NonNullable<Awaited<ReturnType<typeof getInstance>>>;
  def: NonNullable<ReturnType<typeof getMission>>;
  ownerCharId: string;
}

function ensureState(raw: string): RoofCleanupState {
  const state = readState<RoofCleanupState>(raw);
  state.playerCell = state.playerCell ?? START_CELL;
  state.trash = state.trash ?? [...TRASH_CELLS];
  state.combatStarted = state.combatStarted ?? false;
  return state;
}

async function findContextByCharId(charId: string): Promise<RoofCleanupContext | null> {
  const c = await getActiveInstanceByType(charId, "ROOF_CLEANUP");
  if (!c) return null;
  return { inst: c.inst, def: c.def, ownerCharId: charId };
}

export async function resolveRoofCleanup(discordId: string, guildId: string): Promise<RoofCleanupContext | null> {
  const own = await prisma.userCharacter.findUnique({
    where: { discordId_guildId: { discordId, guildId } },
    select: { id: true },
  });
  if (own) {
    const ctx = await findContextByCharId(own.id);
    if (ctx) return ctx;
  }

  for (const did of await partyMemberIds(guildId, discordId)) {
    if (did === discordId) continue;
    const uc = await prisma.userCharacter.findUnique({
      where: { discordId_guildId: { discordId: did, guildId } },
      select: { id: true },
    });
    if (!uc) continue;
    const ctx = await findContextByCharId(uc.id);
    if (ctx) return ctx;
  }
  return null;
}

export async function roofCleanupMapHandle(
  interaction: ChatInputCommandInteraction,
  ctx: RoofCleanupContext,
  entities: RenderEntity[],
): Promise<string | null> {
  if (interaction.channelId !== ACADEMIA_GENIN_CHANNEL_ID) return null;
  const guildId = interaction.guildId ?? "global";
  const char = await getOrCreateCharacter(interaction.user.id, guildId, interaction.user.username);
  const state = ensureState(ctx.inst.stateJson);
  await setState(ctx.inst.id, state);
  entities.push(...(await roofEntities(state, char, guildId)));
  const left = state.trash?.length ?? 0;
  return `\nMissao ativa: **${ctx.def.name}** - limpe os pontos ${POOP} com \`/mover\`. Restantes: **${left}/3**.`;
}

async function roofEntities(
  state: RoofCleanupState,
  char: Awaited<ReturnType<typeof getOrCreateCharacter>>,
  guildId: string,
): Promise<RenderEntity[]> {
  const entities: RenderEntity[] = [];
  const ap = await getAppearance(char.discordId, guildId);
  entities.push({
    cell: state.playerCell ?? START_CELL,
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
  for (const cell of state.trash ?? []) {
    entities.push({ cell, label: POOP, color: "#7f8c8d", kind: "MARKER" });
  }
  return entities;
}

async function renderRoof(
  state: RoofCleanupState,
  char: Awaited<ReturnType<typeof getOrCreateCharacter>>,
  guildId: string,
): Promise<Buffer> {
  const scenario = getScenarioByChannel(ACADEMIA_GENIN_CHANNEL_ID)!;
  const entities = await roofEntities(state, char, guildId);
  return MapRenderer.renderScenario({ scenario, entities });
}

function isBlocked(cell: string): boolean {
  const scenario = getScenarioByChannel(ACADEMIA_GENIN_CHANNEL_ID);
  if (!scenario) return true;
  return (scenario.cells.obstacles ?? []).includes(cell) || (scenario.cells.water ?? []).includes(cell);
}

function pigeonTemplate(def: RoofCleanupContext["def"]): string {
  return String(def.data?.pigeonTemplate ?? "roof_pigeon");
}

function pigeonCount(def: RoofCleanupContext["def"]): number {
  return Number(def.data?.pigeons ?? 3);
}

export async function moverRoofCleanup(interaction: ChatInputCommandInteraction, dest: string): Promise<boolean> {
  if (interaction.channelId !== ACADEMIA_GENIN_CHANNEL_ID) return false;
  const scenario = getScenarioByChannel(interaction.channelId);
  if (!scenario) return false;

  const guildId = interaction.guildId ?? "global";
  const ctx = await resolveRoofCleanup(interaction.user.id, guildId);
  if (!ctx) return false;
  if (ctx.inst.status !== "ACTIVE") return false;

  const coord = parseCell(dest);
  if (!coord || !inBounds(coord, scenario.rows, scenario.cols)) {
    await interaction.reply({ content: "Celula invalida.", ephemeral: true });
    return true;
  }
  if (isBlocked(dest)) {
    await interaction.reply({ content: "Esse local esta bloqueado.", ephemeral: true });
    return true;
  }

  const char = await getOrCreateCharacter(interaction.user.id, guildId, interaction.user.username);
  let state = ensureState(ctx.inst.stateJson);
  const from = state.playerCell ?? START_CELL;
  const limit = moveRange(char.attributes!.taijutsu);
  if (cellDistance(from, dest) > limit) {
    await interaction.reply({
      content: `Fora do alcance de movimento (max ${limit} casas a partir de ${from}).`,
      ephemeral: true,
    });
    return true;
  }

  state.playerCell = dest;
  const trash = state.trash ?? [];
  const idx = trash.indexOf(dest);
  if (idx < 0) {
    await setState(ctx.inst.id, state);
    const png = await renderRoof(state, char, guildId);
    const file = new AttachmentBuilder(png, { name: "telhado-academia.png" });
    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setDescription(`${char.name} moveu-se para ${dest}.`)
      .setImage("attachment://telhado-academia.png");
    await interaction.reply({ embeds: [embed], files: [file] });
    return true;
  }

  await interaction.reply("Limpando o telhado...");
  trash.splice(idx, 1);
  state.trash = trash;
  await markObjective(ctx.inst.id, OBJECTIVE_BY_CELL[dest]!);
  await setState(ctx.inst.id, state);

  const logs = [`${char.name} limpou a sujeira em ${dest}.`, `Restantes: ${trash.length}/3.`];
  const png = await renderRoof(state, char, guildId);
  const file = new AttachmentBuilder(png, { name: "telhado-academia.png" });
  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setDescription(logs.join("\n"))
    .setImage("attachment://telhado-academia.png");
  await interaction.followUp({ embeds: [embed], files: [file] });

  if (trash.length === 0 && !state.combatStarted) {
    state.combatStarted = true;
    await setState(ctx.inst.id, state);
    await startPigeonCombat(interaction.channel, interaction.channelId, guildId, char, ctx);
  }
  return true;
}

async function startPigeonCombat(
  channel: TextBasedChannel | null,
  channelId: string,
  guildId: string,
  char: Awaited<ReturnType<typeof getOrCreateCharacter>>,
  ctx: RoofCleanupContext,
): Promise<void> {
  if (await getActiveSession(channelId)) {
    if (channel && "send" in channel) await channel.send("Os pombos ja estao no telhado. Use `/mapa`.");
    return;
  }

  const { players, attrsById } = await gatherPartyPlayers(channel, guildId, {
    charId: char.id,
    name: char.name,
    hpCurrent: char.hpCurrent,
    hpMax: char.hpMax,
    chakra: char.resources?.chakra ?? 100,
    energia: char.resources?.energia ?? 100,
    jutsuIds: char.jutsus.map((j: { jutsuId: string }) => j.jutsuId),
    attrs: {
      ninjutsu: char.attributes?.ninjutsu ?? 1,
      iryo: char.attributes?.iryo ?? 1,
      taijutsu: char.attributes?.taijutsu ?? 1,
      genjutsu: char.attributes?.genjutsu ?? 1,
      kenjutsu: char.attributes?.kenjutsu ?? 1,
    },
  });

  const npcs = Array.from({ length: pigeonCount(ctx.def) }, () => ({ templateId: pigeonTemplate(ctx.def) }));
  const session = await startCombat({
    channelId,
    guildId,
    scenarioId: "academia_genin",
    players,
    npcs,
    missionInstanceId: ctx.inst.id,
  });
  await cacheAttrs(session, attrsById);
  if (channel && "send" in channel) {
    await channel.send(`Tres pombos surgem no telhado! Derrote-os para concluir a limpeza. Use \`/mapa\`.`);
  }
}

export async function onRoofCleanupCombatWon(
  interaction: ChatInputCommandInteraction,
  instanceId: string,
): Promise<void> {
  const inst = await getInstance(instanceId);
  if (!inst || inst.status !== "ACTIVE") return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "ROOF_CLEANUP") return;
  await markObjective(inst.id, "derrotar_pombos");
  const result = await completeMission(inst.charId, inst.missionId);
  if (result) {
    await interaction.followUp(
      `Missao concluida: **${def.name}**!\nRecompensas: ${result.rewards.xp} XP, ${result.rewards.ryo} ryo.`,
    );
  }
}
