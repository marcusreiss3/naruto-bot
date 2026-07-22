// Árvore de habilidades de elemento: estado + compra.
//
// ECONOMIA: o orçamento da árvore é o VALOR DO ATRIBUTO NINJUTSU. Você sobe
// ninjutsu no /atributos e ganha "pontos de ninjutsu" para gastar aqui.
//   disponivel = ninjutsu - (soma dos custos dos nos ja comprados)
// Comprar NÃO reduz o atributo ninjutsu (ele continua escalando dano); apenas
// consome orçamento. Subiu ninjutsu no bot → mais orçamento na árvore.
//
// REGRA DE OURO: nada vindo do cliente é confiável. buyNode revalida TUDO
// contra o banco dentro de uma transação. O front só manda o nodeId.
import { prisma } from "../../db/client.js";
import type { Element } from "../../config/enums.js";
import { ELEMENT_TREES, getNode, type SkillNodeDef } from "../../data/element-trees/index.js";

export type NodeStatus = "OWNED" | "BUYABLE" | "LOCKED";

export interface NodeView extends SkillNodeDef {
  status: NodeStatus;
  reason?: string; // se LOCKED: por quê
}

export interface CharSnapshot {
  charId: string;
  name: string;
  level: number;
  ninjutsu: number; // orçamento total (valor do atributo)
  spent: number; // soma dos custos dos nós já comprados
  points: number; // disponível = ninjutsu - spent
  elements: Element[]; // elementos desbloqueados
  owned: Set<string>; // ids de nó comprados
}

// Soma o custo dos nós possuídos.
function spentOf(owned: Set<string>): number {
  let s = 0;
  for (const id of owned) s += getNode(id)?.cost ?? 0;
  return s;
}

function snapFrom(char: {
  id: string;
  name: string;
  displayName: string | null;
  level: number;
  attributes: { ninjutsu: number } | null;
  elements: { element: string }[];
  skillNodes: { nodeId: string }[];
}): CharSnapshot {
  const owned = new Set(char.skillNodes.map((s) => s.nodeId));
  const ninjutsu = char.attributes?.ninjutsu ?? 1;
  const spent = spentOf(owned);
  return {
    charId: char.id,
    name: char.displayName?.trim() || char.name, // nome RP, senao username
    level: char.level,
    ninjutsu,
    spent,
    points: Math.max(0, ninjutsu - spent),
    elements: char.elements.map((e) => e.element as Element),
    owned,
  };
}

// Carrega o snapshot autoritativo do personagem (por discordId+guildId).
export async function loadSnapshot(discordId: string, guildId: string): Promise<CharSnapshot | null> {
  const char = await prisma.userCharacter.findUnique({
    where: { discordId_guildId: { discordId, guildId } },
    include: { attributes: true, elements: true, skillNodes: true },
  });
  if (!char) return null;
  return snapFrom(char);
}

// Motivo pelo qual um nó NÃO pode ser comprado agora (null = pode).
export function lockReason(snap: CharSnapshot, node: SkillNodeDef): string | null {
  if (snap.owned.has(node.id)) return "Já adquirido.";
  if (!snap.elements.includes(node.element)) return `Requer o elemento ${node.element}.`;
  for (const req of node.requires) {
    if (!snap.owned.has(req)) {
      const parent = getNode(req);
      return `Requer antes: ${parent?.name ?? req}.`;
    }
  }
  if (snap.level < node.reqLevel) return `Requer nível ${node.reqLevel}.`;
  if (snap.ninjutsu < node.reqNinjutsu) return `Requer Ninjutsu ${node.reqNinjutsu}.`;
  if (snap.points < node.cost) {
    return `Pontos de Ninjutsu insuficientes (precisa ${node.cost}, restam ${snap.points}).`;
  }
  return null;
}

// Estado completo de uma árvore para exibir (não decide nada de gravação).
export function viewTree(snap: CharSnapshot, element: Element): NodeView[] {
  return ELEMENT_TREES[element].map((node) => {
    if (snap.owned.has(node.id)) return { ...node, status: "OWNED" };
    const reason = lockReason(snap, node);
    return reason ? { ...node, status: "LOCKED", reason } : { ...node, status: "BUYABLE" };
  });
}

export interface BuyResult {
  ok: boolean;
  error?: string;
  pointsLeft?: number;
  grantedAbilityId?: string;
}

// COMPRA AUTORITATIVA. Revalida contra o banco dentro da transação para evitar
// corrida/estado velho e qualquer injeção pelo cliente.
export async function buyNode(
  discordId: string,
  guildId: string,
  nodeId: string,
): Promise<BuyResult> {
  const node = getNode(nodeId);
  if (!node) return { ok: false, error: "Habilidade inexistente." };

  return prisma.$transaction(async (tx) => {
    const char = await tx.userCharacter.findUnique({
      where: { discordId_guildId: { discordId, guildId } },
      include: { attributes: true, elements: true, skillNodes: true },
    });
    if (!char) return { ok: false, error: "Personagem não encontrado." };

    const snap = snapFrom(char);
    const reason = lockReason(snap, node);
    if (reason) return { ok: false, error: reason };

    // grava o nó (unique [charId,nodeId] barra dupla compra). NÃO mexe no
    // atributo ninjutsu — o custo é "descontado" via soma dos nós possuídos.
    await tx.characterSkillNode.create({ data: { charId: char.id, nodeId: node.id } });

    // JUTSU concede a ability ao personagem (o bot lê CharacterJutsu ao vivo)
    let grantedAbilityId: string | undefined;
    if (node.kind === "JUTSU" && node.grantsAbilityId) {
      const exists = await tx.characterJutsu.findUnique({
        where: { charId_jutsuId: { charId: char.id, jutsuId: node.grantsAbilityId } },
      });
      if (!exists) {
        await tx.characterJutsu.create({
          data: { charId: char.id, jutsuId: node.grantsAbilityId },
        });
      }
      grantedAbilityId = node.grantsAbilityId;
    }

    return { ok: true, pointsLeft: snap.points - node.cost, grantedAbilityId };
  });
}
