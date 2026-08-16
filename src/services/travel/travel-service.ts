import type { Client, GuildMember } from "discord.js";
import { prisma } from "../../db/client.js";
import {
  ALL_TRAVEL_ROLE_IDS,
  TRAVEL_LOCATIONS,
  TRAVEL_PATHS,
  isTravelLocationId,
  isTravelPathId,
  travelMinutes,
  travelPath,
  type TravelLocationId,
} from "../../data/travel.js";
import {
  divider,
  economyContainer,
  factsBlock,
  noticeBlock,
  text,
  titleBlock,
  v2Public,
} from "../../ui/economy-components-v2.js";
import { emoji } from "../../ui/economy-emojis.js";
import { log } from "../../utils/logger.js";

export class TravelError extends Error {}

export interface TravelStarted {
  origin: TravelLocationId;
  destination: TravelLocationId;
  path: ReturnType<typeof travelPath>;
  minutes: number;
  arriveAt: Date;
}

export async function activeTravel(guildId: string, discordId: string) {
  return prisma.activeTravel.findUnique({
    where: { guildId_discordId: { guildId, discordId } },
  });
}

async function deleteTravel(guildId: string, discordId: string): Promise<void> {
  await prisma.activeTravel.deleteMany({ where: { guildId, discordId } });
}

export async function beginTravel(
  member: GuildMember,
  origin: TravelLocationId,
  destination: TravelLocationId,
  now = new Date(),
): Promise<TravelStarted> {
  if (origin === destination) throw new TravelError("Você já está nesse local.");

  const minutes = travelMinutes(origin, destination);
  if (minutes < 5 || minutes > 20) throw new TravelError("Esta rota não está disponível.");

  const path = travelPath(origin, destination);
  const originRoleId = TRAVEL_LOCATIONS[origin].roleId;
  const targetRoleId = TRAVEL_LOCATIONS[destination].roleId;
  const pathRoleId = TRAVEL_PATHS[path].roleId;
  const arriveAt = new Date(now.getTime() + minutes * 60_000);
  const hadOriginRole = member.roles.cache.has(originRoleId);

  try {
    await prisma.activeTravel.create({
      data: {
        guildId: member.guild.id,
        discordId: member.id,
        origin,
        destination,
        path,
        originRoleId,
        targetRoleId,
        pathRoleId,
        startedAt: now,
        arriveAt,
      },
    });
  } catch {
    const current = await activeTravel(member.guild.id, member.id);
    if (current) throw new TravelError("Você já está viajando.");
    throw new TravelError("Não foi possível reservar essa viagem agora.");
  }

  try {
    // Primeiro concede o caminho para nao deixar o membro sem nenhum canal se
    // o Discord falhar no meio da troca. Depois remove todas as localizacoes
    // antigas e quaisquer caminhos residuais.
    await member.roles.add(pathRoleId, `Viagem para ${TRAVEL_LOCATIONS[destination].label}`);
    const rolesToRemove = ALL_TRAVEL_ROLE_IDS.filter(
      (roleId) => roleId !== pathRoleId && member.roles.cache.has(roleId),
    );
    // Nao use `roles.remove([...])` aqui. Para varios cargos, discord.js monta
    // um PUT com a cache inteira do membro. Logo apos `roles.add`, essa cache
    // pode ainda nao conter o caminho novo e o PUT o apagaria sem erro. A
    // remocao individual usa o endpoint DELETE de um cargo e preserva todos os
    // outros, mesmo com o evento do gateway ainda pendente.
    for (const roleId of rolesToRemove) {
      await member.roles.remove(roleId, "Partida pelo sistema de viagem");
    }
  } catch (error) {
    await deleteTravel(member.guild.id, member.id).catch(() => undefined);
    await member.roles.remove(pathRoleId).catch(() => undefined);
    if (hadOriginRole) await member.roles.add(originRoleId).catch(() => undefined);
    log.error("Falha ao trocar cargos no início da viagem:", error);
    throw new TravelError(
      "Não consegui trocar seus cargos. Confira se o cargo do bot está acima dos cargos de localização.",
    );
  }

  return { origin, destination, path, minutes, arriveAt };
}

function arrivalPayload(destination: TravelLocationId) {
  const local = TRAVEL_LOCATIONS[destination];
  return v2Public([
    economyContainer("cofre", [
      titleBlock("viagem", "Viagem concluída", `${emoji(local.emojiKey)} Você chegou a ${local.label}`),
      noticeBlock("sucesso", "Seu cargo de caminho foi removido e o destino já está liberado."),
      divider(),
      factsBlock([{ label: "Destino", value: `${emoji(local.emojiKey)} ${local.label}` }]),
      text(`Continue sua jornada em <#${local.arrivalChannelId}>.`),
    ]),
  ]);
}

async function completeOne(client: Client, row: {
  id: string;
  guildId: string;
  discordId: string;
  destination: string;
}): Promise<boolean> {
  if (!isTravelLocationId(row.destination)) {
    log.error(`Viagem ${row.id} tem destino inválido: ${row.destination}.`);
    await prisma.activeTravel.delete({ where: { id: row.id } });
    return true;
  }
  const targetRoleId = TRAVEL_LOCATIONS[row.destination].roleId;

  const guild = client.guilds.cache.get(row.guildId) ?? await client.guilds.fetch(row.guildId).catch(() => null);
  if (!guild) return false;

  let member: GuildMember | null = null;
  try {
    member = await guild.members.fetch(row.discordId);
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? Number((error as { code: unknown }).code)
      : null;
    if (code === 10_007) {
      // Unknown Member: ele realmente saiu do servidor, portanto nao existe
      // cargo de caminho para limpar. Outros erros sao transitorios e ficam
      // para a proxima tentativa, evitando abandonar alguem no caminho.
      await prisma.activeTravel.delete({ where: { id: row.id } });
      return true;
    }
    log.error(`Falha ao buscar membro da viagem ${row.id}:`, error);
    return false;
  }
  if (!member) return false;

  try {
    // Concede o destino antes de retirar o caminho. Em uma falha parcial, a
    // proxima passada e' idempotente e termina a limpeza.
    await member.roles.add(targetRoleId, "Chegada pelo sistema de viagem");
    const rolesToRemove = ALL_TRAVEL_ROLE_IDS.filter(
      (roleId) => roleId !== targetRoleId && member.roles.cache.has(roleId),
    );
    for (const roleId of rolesToRemove) {
      await member.roles.remove(roleId, "Chegada pelo sistema de viagem");
    }
    await prisma.activeTravel.delete({ where: { id: row.id } });

    const user = await client.users.fetch(row.discordId).catch(() => null);
    if (user) await user.send(arrivalPayload(row.destination)).catch(() => null);
    return true;
  } catch (error) {
    log.error(`Falha ao concluir viagem ${row.id}:`, error);
    return false;
  }
}

let schedulerTimer: NodeJS.Timeout | null = null;
let processing = false;

export async function processDueTravels(client: Client, now = new Date()): Promise<number> {
  if (processing) return 0;
  processing = true;
  try {
    const due = await prisma.activeTravel.findMany({
      where: { arriveAt: { lte: now } },
      orderBy: { arriveAt: "asc" },
    });
    let completed = 0;
    for (const row of due) {
      if (await completeOne(client, row)) completed += 1;
    }
    return completed;
  } finally {
    processing = false;
  }
}

export async function armTravelScheduler(client: Client): Promise<void> {
  if (schedulerTimer) clearTimeout(schedulerTimer);
  schedulerTimer = null;

  const next = await prisma.activeTravel.findFirst({ orderBy: { arriveAt: "asc" } });
  if (!next) return;

  // Acorda exatamente na chegada. O teto de um minuto tambem retenta rapido
  // caso uma troca de cargo falhe temporariamente.
  const delay = Math.min(60_000, Math.max(1_000, next.arriveAt.getTime() - Date.now()));
  schedulerTimer = setTimeout(() => {
    void (async () => {
      try {
        const completed = await processDueTravels(client);
        if (completed) log.info(`Viagens: ${completed} chegada(s) concluída(s).`);
      } catch (error) {
        log.error("Falha no relógio de viagens:", error);
      } finally {
        await armTravelScheduler(client).catch((error) =>
          log.error("Falha ao rearmar o relógio de viagens:", error),
        );
      }
    })();
  }, delay);
  schedulerTimer.unref?.();
}

export async function startTravelScheduler(client: Client): Promise<void> {
  const completed = await processDueTravels(client);
  if (completed) log.info(`Viagens: ${completed} chegada(s) restaurada(s) no boot.`);
  await armTravelScheduler(client);
}

export function stopTravelScheduler(): void {
  if (schedulerTimer) clearTimeout(schedulerTimer);
  schedulerTimer = null;
}

export function validStoredTravel<T extends { origin: string; destination: string; path: string }>(
  row: T,
): row is T & { origin: TravelLocationId; destination: TravelLocationId; path: ReturnType<typeof travelPath> } {
  return isTravelLocationId(row.origin) && isTravelLocationId(row.destination) && isTravelPathId(row.path);
}
