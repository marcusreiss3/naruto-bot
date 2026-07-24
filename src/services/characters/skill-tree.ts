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
import {
  ATTRIBUTE_LABELS,
  ELEMENTS,
  isKekkeiGenkai,
  type Attribute,
  type Element,
  type Shape,
} from "../../config/enums.js";
import { ELEMENT_TREES, getNode, type SkillNodeDef } from "../../data/element-trees/index.js";
import { CLAN_TREES } from "../../data/clan-trees/index.js";
import { getAbility, getClan } from "../../data/index.js";
import { FUNDAMENTOS } from "../../data/element-trees/fundamentals.js";
import { clanStartingElement, CLAN_STARTING_ELEMENT } from "../../data/clans/starting-element.js";

// Icone do elemento (footer). So basicos — kekkei genkai nunca e primeiro
// elemento. Usado pra pintar o no "Primeiro Elemento" com o elemento do cla.
const ELEMENT_ICON: Partial<Record<Element, string>> = {
  FOGO: "/assets/icons/footer/katon.png",
  AGUA: "/assets/icons/footer/suiton.png",
  VENTO: "/assets/icons/footer/futon.png",
  TERRA: "/assets/icons/footer/doton.png",
  RAIO: "/assets/icons/footer/raiton.png",
};

// No da Arvore de Ninjutsu que concede o PRIMEIRO elemento — este vem do cla
// (starting-element.ts). Os demais (funda_elemento_2..5) continuam aleatorios.
const FIRST_ELEMENT_NODE_ID = "funda_elemento_1";

// Elementos basicos = os que um personagem pode ganhar por sorteio na arvore
// de Fundamentos. Kekkei genkai fica de fora (so entra via /admin).
const BASIC_ELEMENTS: Element[] = ELEMENTS.filter((e) => !isKekkeiGenkai(e));

// Pura e testavel: dado o que o personagem ja tem, quais elementos basicos
// ainda podem sair no sorteio (funda_elemento_1..5).
export function remainingBasicElements(owned: Element[]): Element[] {
  return BASIC_ELEMENTS.filter((e) => !owned.includes(e));
}

export type NodeStatus = "OWNED" | "BUYABLE" | "LOCKED";

// Perfil de combate da ability que o no concede (so JUTSU). O front usa pra
// mostrar tipo/acao/alcance/area/custo de recurso no modal.
export interface NodeCombat {
  category: string;
  actionType: string;
  resource: "chakra" | "energia";
  cost: number; // custo de recurso (%), NAO o custo em pontos da arvore
  shape: Shape;
  range: number; // em celulas
  baseDamage?: number;
  baseHeal?: number;
}

export interface NodeView extends SkillNodeDef {
  status: NodeStatus;
  reason?: string; // se LOCKED: por quê
  combat?: NodeCombat; // presente só em nós JUTSU
}

// Extrai o perfil de combate da ability concedida por um no JUTSU.
function combatOf(node: SkillNodeDef): NodeCombat | undefined {
  if (node.kind !== "JUTSU" || !node.grantsAbilityId) return undefined;
  const ab = getAbility(node.grantsAbilityId);
  if (!ab) return undefined;
  return {
    category: ab.category,
    actionType: ab.actionType,
    resource: ab.resource,
    cost: ab.cost,
    shape: ab.shape,
    range: ab.range,
    baseDamage: ab.baseDamage,
    baseHeal: ab.baseHeal,
  };
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
  clanId: string | null; // cla do personagem (define o primeiro elemento)
  // valor BRUTO de cada atributo — usado só pelo gate reqAttribute (Hyuuga:
  // Byakugan pede Dojutsu, o resto pede Taijutsu). Não é orçamento: gastar
  // pontos na árvore não consome daqui, é só um requisito de nível.
  attributes: Partial<Record<Attribute, number>>;
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
  attributes: Partial<Record<Attribute, number>> | null;
  elements: { element: string }[];
  skillNodes: { nodeId: string }[];
  clan: { clanId: string } | null;
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
    clanId: char.clan?.clanId ?? null,
    attributes: char.attributes ?? {},
  };
}

// Carrega o snapshot autoritativo do personagem (por discordId+guildId).
export async function loadSnapshot(discordId: string, guildId: string): Promise<CharSnapshot | null> {
  const char = await prisma.userCharacter.findUnique({
    where: { discordId_guildId: { discordId, guildId } },
    include: { attributes: true, elements: true, skillNodes: true, clan: true },
  });
  if (!char) return null;
  return snapFrom(char);
}

// Motivo pelo qual um nó NÃO pode ser comprado agora (null = pode).
export function lockReason(snap: CharSnapshot, node: SkillNodeDef): string | null {
  if (snap.owned.has(node.id)) return "Já adquirido.";
  // nos de Fundamentos nao tem `element` (nao sao de nenhuma natureza de
  // chakra) — pulam essa exigencia de proposito.
  if (node.element && !snap.elements.includes(node.element)) {
    return `Requer o elemento ${node.element}.`;
  }
  if (node.clanId && snap.clanId !== node.clanId) {
    return `Requer o clã ${getClan(node.clanId)?.name ?? node.clanId}.`;
  }
  for (const req of node.requires) {
    if (!snap.owned.has(req)) {
      const parent = getNode(req);
      return `Requer antes: ${parent?.name ?? req}.`;
    }
  }
  if (snap.level < node.reqLevel) return `Requer nível ${node.reqLevel}.`;
  if (node.reqAttribute) {
    const have = snap.attributes[node.reqAttribute.attribute] ?? 0;
    if (have < node.reqAttribute.value) {
      return `Requer ${ATTRIBUTE_LABELS[node.reqAttribute.attribute]} ${node.reqAttribute.value}.`;
    }
  }
  if (snap.ninjutsu < node.reqNinjutsu) return `Requer Ninjutsu ${node.reqNinjutsu}.`;
  if (snap.points < node.cost) {
    return `Pontos de Ninjutsu insuficientes (precisa ${node.cost}, restam ${snap.points}).`;
  }
  return null;
}

// Estado completo de uma árvore para exibir (não decide nada de gravação).
export function viewTree(snap: CharSnapshot, element: Element): NodeView[] {
  return ELEMENT_TREES[element].map((node) => {
    const combat = combatOf(node);
    if (snap.owned.has(node.id)) return { ...node, combat, status: "OWNED" };
    const reason = lockReason(snap, node);
    return reason ? { ...node, combat, status: "LOCKED", reason } : { ...node, combat, status: "BUYABLE" };
  });
}

// Mesma logica de viewTree, mas pra arvore de um CLA (sem `element`, gate por clanId).
export function viewClanTree(snap: CharSnapshot, clanId: string): NodeView[] {
  return (CLAN_TREES[clanId] ?? []).map((node) => {
    const combat = combatOf(node);
    if (snap.owned.has(node.id)) return { ...node, combat, status: "OWNED" };
    const reason = lockReason(snap, node);
    return reason ? { ...node, combat, status: "LOCKED", reason } : { ...node, combat, status: "BUYABLE" };
  });
}

// Mesma logica de viewTree, mas pra arvore de Fundamentos (sem `element`).
// O no "Primeiro Elemento" mostra o icone do elemento que o CLA concede; cla
// sem elemento definido (aleatorio/sem cla) mantem o icone generico elements.png.
export function viewFundamentosTree(snap: CharSnapshot): NodeView[] {
  const clanElement = snap.clanId ? CLAN_STARTING_ELEMENT[snap.clanId] : undefined;
  return FUNDAMENTOS.map((node) => {
    const img =
      node.id === FIRST_ELEMENT_NODE_ID && clanElement ? ELEMENT_ICON[clanElement] ?? node.img : node.img;
    const withIcon = { ...node, img, combat: combatOf(node) };
    if (snap.owned.has(node.id)) return { ...withIcon, status: "OWNED" };
    const reason = lockReason(snap, node);
    return reason ? { ...withIcon, status: "LOCKED", reason } : { ...withIcon, status: "BUYABLE" };
  });
}

export interface BuyResult {
  ok: boolean;
  error?: string;
  pointsLeft?: number;
  grantedAbilityId?: string;
  grantedElement?: Element; // no ELEMENT: qual elemento saiu no sorteio
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
      include: { attributes: true, elements: true, skillNodes: true, clan: true },
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

    // ELEMENT (Arvore de Ninjutsu): o PRIMEIRO elemento (funda_elemento_1) vem
    // do cla (starting-element.ts). Os demais (2..5) sao sorteados entre os
    // basicos que o personagem ainda nao tem. Kekkei genkai fica fora (so /admin).
    let grantedElement: Element | undefined;
    if (node.kind === "ELEMENT") {
      const pool = remainingBasicElements(snap.elements);
      if (pool.length === 0) return { ok: false, error: "Todos os elementos básicos já foram concedidos." };
      const doCla = node.id === FIRST_ELEMENT_NODE_ID ? clanStartingElement(snap.clanId, snap.elements) : null;
      grantedElement = doCla ?? pool[Math.floor(Math.random() * pool.length)]!;
      await tx.characterElement.create({ data: { charId: char.id, element: grantedElement } });
    }

    return { ok: true, pointsLeft: snap.points - node.cost, grantedAbilityId, grantedElement };
  });
}
