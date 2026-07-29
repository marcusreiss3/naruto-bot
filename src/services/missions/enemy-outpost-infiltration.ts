import type { ChatInputCommandInteraction, TextBasedChannel } from "discord.js";
import { prisma } from "../../db/client.js";
import { CAMPO_ABERTO_CHANNEL_ID } from "../../data/scenarios/index.js";
import { getMission } from "../../data/missions/index.js";
import { getOrCreateCharacter, attrsFromRow } from "../characters/character-service.js";
import { getActiveSession, startCombat } from "../combat/combat-engine.js";
import { partyMemberIds } from "../party/party-service.js";
import { cacheAttrs, gatherPartyPlayers } from "./combat-party.js";
import {
  buildMissionCompleteEmbed,
  completeMission,
  getActiveInstanceByType,
  getInstance,
  markObjective,
  readState,
  setState,
} from "./mission-service.js";

export interface EnemyOutpostState {
  stage?: "READY" | "FIGHT" | "DONE";
  combatStarted?: boolean;
}

interface EnemyOutpostContext {
  inst: NonNullable<Awaited<ReturnType<typeof getInstance>>>;
  def: NonNullable<ReturnType<typeof getMission>>;
  ownerCharId: string;
}

function ensureState(raw: string): EnemyOutpostState {
  const state = readState<EnemyOutpostState>(raw);
  state.stage = state.stage ?? "READY";
  state.combatStarted = state.combatStarted ?? false;
  return state;
}

function scenarioId(def: EnemyOutpostContext["def"]): string {
  return String(def.data?.outpostScenarioId ?? "posto_inimigo");
}

function guardTemplate(def: EnemyOutpostContext["def"]): string {
  return String(def.data?.guardTemplate ?? "enemy_outpost_guard");
}

function commanderTemplate(def: EnemyOutpostContext["def"]): string {
  return String(def.data?.commanderTemplate ?? "enemy_outpost_commander");
}

function guardCount(def: EnemyOutpostContext["def"]): number {
  return Number(def.data?.guardCount ?? 3);
}

async function findContextByCharId(charId: string): Promise<EnemyOutpostContext | null> {
  const c = await getActiveInstanceByType(charId, "ENEMY_OUTPOST_INFILTRATION");
  if (!c) return null;
  return { inst: c.inst, def: c.def, ownerCharId: charId };
}

export async function resolveEnemyOutpostInfiltration(
  discordId: string,
  guildId: string,
): Promise<EnemyOutpostContext | null> {
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

export async function enemyOutpostMapHandle(
  interaction: ChatInputCommandInteraction,
  ctx: EnemyOutpostContext,
): Promise<string | null> {
  if (interaction.channelId !== CAMPO_ABERTO_CHANNEL_ID) return null;

  const state = ensureState(ctx.inst.stateJson);
  if (state.stage === "DONE") return null;

  if (await getActiveSession(interaction.channelId)) {
    return `\nMissao ativa: **${ctx.def.name}** - elimine os inimigos do posto.`;
  }

  const guildId = interaction.guildId ?? "global";
  const char = await getOrCreateCharacter(interaction.user.id, guildId, interaction.user.username);
  state.stage = "FIGHT";
  state.combatStarted = true;
  await markObjective(ctx.inst.id, "chegar_campo_aberto");
  await markObjective(ctx.inst.id, "invadir_posto");
  await setState(ctx.inst.id, state);
  await startOutpostCombat(interaction.channel, interaction.channelId, guildId, char, ctx);

  return `\nMissao ativa: **${ctx.def.name}** - o posto inimigo foi invadido. Derrote todos os inimigos.`;
}

async function startOutpostCombat(
  channel: TextBasedChannel | null,
  channelId: string,
  guildId: string,
  char: Awaited<ReturnType<typeof getOrCreateCharacter>>,
  ctx: EnemyOutpostContext,
): Promise<void> {
  const { players, attrsById } = await gatherPartyPlayers(channel, guildId, {
    charId: char.id,
    name: char.name,
    level: char.level,
    hpCurrent: char.hpCurrent,
    hpMax: char.hpMax,
    chakra: char.resources?.chakra ?? 100,
    energia: char.resources?.energia ?? 100,
    jutsuIds: char.jutsus.map((j: { jutsuId: string }) => j.jutsuId),
    attrs: attrsFromRow(char.attributes ?? {}),
  });

  const session = await startCombat({
    channelId,
    guildId,
    scenarioId: scenarioId(ctx.def),
    players,
    npcs: [
      { templateId: commanderTemplate(ctx.def) },
      ...Array.from({ length: guardCount(ctx.def) }, () => ({ templateId: guardTemplate(ctx.def) })),
    ],
    missionInstanceId: ctx.inst.id,
  });
  await cacheAttrs(session, attrsById);

  if (channel && "send" in channel) {
    await channel.send(
      `⚔️ **Infiltracao iniciada!** ${players.length} ninja(s) invadiram o posto. Elimine o comandante e os guardas. Use \`/mapa\`.`,
    );
  }
}

export async function onEnemyOutpostCombatWon(
  interaction: ChatInputCommandInteraction,
  instanceId: string,
): Promise<void> {
  const inst = await getInstance(instanceId);
  if (!inst || inst.status !== "ACTIVE") return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "ENEMY_OUTPOST_INFILTRATION") return;

  const state = ensureState(inst.stateJson);
  state.stage = "DONE";
  state.combatStarted = false;
  await markObjective(inst.id, "eliminar_inimigos");
  await setState(inst.id, state);

  const result = await completeMission(inst.charId, inst.missionId);
  if (result) {
    await interaction.followUp({ embeds: [buildMissionCompleteEmbed(def.name, result.rewards)] });
  }
}
