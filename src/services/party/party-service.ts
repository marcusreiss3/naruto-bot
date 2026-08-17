import { prisma } from "../../db/client.js";

// Convites pendentes em memória (chave: guildId:inviteeId).
interface Invite {
  id: string;
  partyId: string;
  leaderId: string;
  ts: number;
}
const INVITE_TTL_MS = 10 * 60 * 1000;
const invites = new Map<string, Invite>();
const ikey = (g: string, u: string) => `${g}:${u}`;

export type PartyMemberRole = "MEMBER" | "SUB_LEADER";

export interface PartyMemberView {
  discordId: string;
  role: PartyMemberRole;
}

export interface PartyView {
  id: string;
  leaderId: string;
  memberIds: string[];
  members: PartyMemberView[];
}

function memberOf(party: PartyView, discordId: string): PartyMemberView | undefined {
  return party.members.find((member) => member.discordId === discordId);
}

function isSubLeader(party: PartyView, discordId: string): boolean {
  return memberOf(party, discordId)?.role === "SUB_LEADER";
}

function canInvite(party: PartyView, discordId: string): boolean {
  return party.leaderId === discordId || isSubLeader(party, discordId);
}

export async function getMyParty(guildId: string, discordId: string): Promise<PartyView | null> {
  const m = await prisma.partyMember.findUnique({
    where: { guildId_discordId: { guildId, discordId } },
    include: { party: { include: { members: true } } },
  });
  if (!m) return null;
  const members = m.party.members.map((member) => ({
    discordId: member.discordId,
    role: member.role as PartyMemberRole,
  }));
  return {
    id: m.party.id,
    leaderId: m.party.leaderId,
    memberIds: members.map((member) => member.discordId),
    members,
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
): Promise<{ ok: boolean; error?: string; inviteId?: string }> {
  if (inviterId === inviteeId) return { ok: false, error: "Você não pode se convidar." };

  // Garante que o primeiro convidante forme sua própria party como líder.
  let party = await getMyParty(guildId, inviterId);
  if (!party) {
    const created = await prisma.party.create({ data: { guildId, leaderId: inviterId } });
    await prisma.partyMember.create({ data: { partyId: created.id, guildId, discordId: inviterId } });
    party = {
      id: created.id,
      leaderId: inviterId,
      memberIds: [inviterId],
      members: [{ discordId: inviterId, role: "MEMBER" }],
    };
  }
  if (!canInvite(party, inviterId)) {
    return { ok: false, error: "Apenas o líder ou um sub-líder pode enviar convites." };
  }

  const inviteeParty = await getMyParty(guildId, inviteeId);
  if (inviteeParty) return { ok: false, error: "Esse jogador já está em uma party." };

  const id = crypto.randomUUID();
  invites.set(ikey(guildId, inviteeId), { id, partyId: party.id, leaderId: inviterId, ts: Date.now() });
  return { ok: true, inviteId: id };
}

export async function accept(
  guildId: string,
  discordId: string,
  inviteId: string,
): Promise<{ ok: boolean; error?: string; party?: PartyView }> {
  const key = ikey(guildId, discordId);
  const inv = invites.get(key);
  if (!inv || inv.id !== inviteId || Date.now() - inv.ts > INVITE_TTL_MS) {
    // Um botão de convite antigo não pode apagar o convite mais novo do mesmo
    // jogador. Só removemos a entrada quando ela própria expirou.
    if (inv && Date.now() - inv.ts > INVITE_TTL_MS) invites.delete(key);
    return { ok: false, error: "Você não tem convite de party pendente (ou expirou)." };
  }
  const exists = await prisma.party.findUnique({ where: { id: inv.partyId } });
  if (!exists) {
    invites.delete(key);
    return { ok: false, error: "A party não existe mais." };
  }
  // Sai de qualquer party atual antes de entrar.
  await leave(guildId, discordId);
  await prisma.partyMember.create({ data: { partyId: inv.partyId, guildId, discordId } });
  invites.delete(key);
  const party = await getMyParty(guildId, discordId);
  return { ok: true, party: party ?? undefined };
}

export function decline(
  guildId: string,
  discordId: string,
  inviteId: string,
): { ok: boolean; error?: string } {
  const key = ikey(guildId, discordId);
  const inv = invites.get(key);
  if (!inv || inv.id !== inviteId || Date.now() - inv.ts > INVITE_TTL_MS) {
    if (inv && Date.now() - inv.ts > INVITE_TTL_MS) invites.delete(key);
    return { ok: false, error: "Este convite não está mais disponível." };
  }
  invites.delete(key);
  return { ok: true };
}

export async function promote(
  guildId: string,
  leaderId: string,
  targetId: string,
): Promise<{ ok: boolean; error?: string; party?: PartyView }> {
  const party = await getMyParty(guildId, leaderId);
  if (!party) return { ok: false, error: "Você não está em uma party." };
  if (party.leaderId !== leaderId) return { ok: false, error: "Apenas o líder pode promover sub-líderes." };
  if (targetId === leaderId) return { ok: false, error: "Você já é o líder da party." };

  const target = memberOf(party, targetId);
  if (!target) return { ok: false, error: "Escolha um integrante da sua party." };
  if (target.role === "SUB_LEADER") return { ok: false, error: "Esse integrante já é sub-líder." };

  await prisma.partyMember.update({
    where: { guildId_discordId: { guildId, discordId: targetId } },
    data: { role: "SUB_LEADER" },
  });
  return { ok: true, party: (await getMyParty(guildId, leaderId)) ?? undefined };
}

export async function removeMember(
  guildId: string,
  actorId: string,
  targetId: string,
): Promise<{ ok: boolean; error?: string; party?: PartyView }> {
  const party = await getMyParty(guildId, actorId);
  if (!party) return { ok: false, error: "Você não está em uma party." };
  if (targetId === actorId) return { ok: false, error: "Para sair da party, use o botão Sair da party." };
  if (targetId === party.leaderId) return { ok: false, error: "O líder não pode ser removido da party." };

  const target = memberOf(party, targetId);
  if (!target) return { ok: false, error: "Escolha um integrante da sua party." };
  const actorIsLeader = party.leaderId === actorId;
  if (!actorIsLeader && !isSubLeader(party, actorId)) {
    return { ok: false, error: "Apenas o líder ou um sub-líder pode remover integrantes." };
  }
  if (!actorIsLeader && target.role !== "MEMBER") {
    return { ok: false, error: "Sub-líderes podem remover apenas membros comuns." };
  }

  await prisma.partyMember.delete({ where: { guildId_discordId: { guildId, discordId: targetId } } });
  return { ok: true, party: (await getMyParty(guildId, actorId)) ?? undefined };
}

export async function leave(
  guildId: string,
  discordId: string,
): Promise<{ ok: boolean; disbanded?: boolean }> {
  const p = await getMyParty(guildId, discordId);
  if (!p) return { ok: false };
  if (p.leaderId === discordId) {
    // Líder sai -> dissolve a party inteira.
    await prisma.party.delete({ where: { id: p.id } });
    return { ok: true, disbanded: true };
  }
  await prisma.partyMember.deleteMany({ where: { guildId, discordId } });
  return { ok: true, disbanded: false };
}
