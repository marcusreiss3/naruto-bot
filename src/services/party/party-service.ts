import { prisma } from "../../db/client.js";

// Convites pendentes em memória (chave: guildId:inviteeId).
interface Invite {
  partyId: string;
  leaderId: string;
  ts: number;
}
const INVITE_TTL_MS = 10 * 60 * 1000;
const invites = new Map<string, Invite>();
const ikey = (g: string, u: string) => `${g}:${u}`;

export interface PartyView {
  id: string;
  leaderId: string;
  memberIds: string[];
}

export async function getMyParty(guildId: string, discordId: string): Promise<PartyView | null> {
  const m = await prisma.partyMember.findUnique({
    where: { guildId_discordId: { guildId, discordId } },
    include: { party: { include: { members: true } } },
  });
  if (!m) return null;
  return {
    id: m.party.id,
    leaderId: m.party.leaderId,
    memberIds: m.party.members.map((x) => x.discordId),
  };
}

// IDs de discord da party do usuário (inclui ele). Se não tiver party, retorna [self].
export async function partyMemberIds(guildId: string, discordId: string): Promise<string[]> {
  const p = await getMyParty(guildId, discordId);
  if (!p) return [discordId];
  // garante o próprio primeiro
  return [discordId, ...p.memberIds.filter((id) => id !== discordId)];
}

export async function invite(
  guildId: string,
  inviterId: string,
  inviteeId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (inviterId === inviteeId) return { ok: false, error: "Você não pode se convidar." };

  // garante que o convidante tenha uma party (cria como líder se não tiver)
  let party = await getMyParty(guildId, inviterId);
  if (!party) {
    const created = await prisma.party.create({ data: { guildId, leaderId: inviterId } });
    await prisma.partyMember.create({ data: { partyId: created.id, guildId, discordId: inviterId } });
    party = { id: created.id, leaderId: inviterId, memberIds: [inviterId] };
  }

  const inviteeParty = await getMyParty(guildId, inviteeId);
  if (inviteeParty) return { ok: false, error: "Esse jogador já está em uma party." };

  invites.set(ikey(guildId, inviteeId), { partyId: party.id, leaderId: inviterId, ts: Date.now() });
  return { ok: true };
}

export async function accept(
  guildId: string,
  discordId: string,
): Promise<{ ok: boolean; error?: string; party?: PartyView }> {
  const inv = invites.get(ikey(guildId, discordId));
  if (!inv || Date.now() - inv.ts > INVITE_TTL_MS) {
    invites.delete(ikey(guildId, discordId));
    return { ok: false, error: "Você não tem convite de party pendente (ou expirou)." };
  }
  const exists = await prisma.party.findUnique({ where: { id: inv.partyId } });
  if (!exists) {
    invites.delete(ikey(guildId, discordId));
    return { ok: false, error: "A party não existe mais." };
  }
  // sai de qualquer party atual antes de entrar
  await leave(guildId, discordId);
  await prisma.partyMember.create({ data: { partyId: inv.partyId, guildId, discordId } });
  invites.delete(ikey(guildId, discordId));
  const party = await getMyParty(guildId, discordId);
  return { ok: true, party: party ?? undefined };
}

export async function leave(
  guildId: string,
  discordId: string,
): Promise<{ ok: boolean; disbanded?: boolean }> {
  const p = await getMyParty(guildId, discordId);
  if (!p) return { ok: false };
  if (p.leaderId === discordId) {
    // líder sai -> dissolve a party inteira
    await prisma.party.delete({ where: { id: p.id } });
    return { ok: true, disbanded: true };
  }
  await prisma.partyMember.deleteMany({ where: { guildId, discordId } });
  return { ok: true, disbanded: false };
}
