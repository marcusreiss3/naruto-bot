// Árvore de habilidades de elemento: estado + compra.
//
// ECONOMIA: cada ATRIBUTO tem a própria bolsa de pontos. Todo nó declara de
// qual atributo ele sai (`node.pool`), e o orçamento daquele pool é o VALOR
// daquele atributo:
//   disponivel[attr] = attr - (soma dos custos dos nos comprados com pool=attr)
// Ou seja: um jutsu de soco (pool taijutsu) é pago com Taijutsu, um de espada
// com Kenjutsu, um de selo com Fūinjutsu — nunca tudo com Ninjutsu. Gastar
// numa árvore de clã de Taijutsu não consome o Ninjutsu que banca a árvore
// elemental: são bolsas independentes.
// Comprar NÃO reduz o atributo (ele continua escalando dano); apenas consome
// o orçamento daquele pool. Subiu o atributo no bot → mais orçamento nele.
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
import { BUKIJUTSU_TREE } from "../../data/bukijutsu-tree.js";
import { CLAN_TREES } from "../../data/clan-trees/index.js";
import { getAbility, getClan } from "../../data/index.js";
import { FUNDAMENTOS } from "../../data/element-trees/fundamentals.js";
import { clanStartingElement, CLAN_STARTING_ELEMENT } from "../../data/clans/starting-element.js";
import { buildMechanicsSummary, buildVisualDescription } from "./skill-description.js";
import { abilityIdFromSharinganCopyNode } from "../combat/sharingan.js";
import {
  conditionFromNodeId,
  mangekyoVariantFromNodeId,
  mangekyoVariantNodeId,
  MANGEKYO_VARIANT_LABEL,
  rollMangekyoVariant,
  type CharacterCondition,
  type MangekyoVariant,
} from "./mangekyo.js";

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
  effectiveReqPool: number;
  visualDescription?: string;
  mechanics?: string;
  reason?: string; // se LOCKED: por quê
  combat?: NodeCombat; // presente só em nós JUTSU
}

// Soma o custo deste no e de todos os ancestrais obrigatorios que usam a
// mesma bolsa. Ancestrais compartilhados entram uma unica vez.
export function mandatorySamePoolCost(node: SkillNodeDef): number {
  const visited = new Set<string>();

  function visit(current: SkillNodeDef): void {
    if (visited.has(current.id)) return;
    visited.add(current.id);
    for (const requiredId of current.requires) {
      const required = getNode(requiredId);
      if (required) visit(required);
    }
  }

  visit(node);
  let total = 0;
  for (const nodeId of visited) {
    const required = getNode(nodeId);
    if (required?.pool === node.pool) total += required.cost;
  }
  return total;
}

export function effectiveReqPool(node: SkillNodeDef): number {
  return Math.max(node.reqPool, mandatorySamePoolCost(node));
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

function mechanicsOf(node: SkillNodeDef): string | undefined {
  if (node.kind !== "JUTSU" || !node.grantsAbilityId) return undefined;
  const ability = getAbility(node.grantsAbilityId);
  if (!ability) return undefined;
  return buildMechanicsSummary(ability) || undefined;
}

function visualDescriptionOf(node: SkillNodeDef): string | undefined {
  if (node.kind !== "JUTSU" || !node.grantsAbilityId) return undefined;
  const ability = getAbility(node.grantsAbilityId);
  return buildVisualDescription(node.desc, ability?.visualDescription);
}

export type PoolMap = Partial<Record<Attribute, number>>;

export interface CharSnapshot {
  charId: string;
  name: string;
  level: number;
  // gasto e disponível POR ATRIBUTO (bolsas independentes).
  spentByPool: PoolMap; // soma dos custos dos nós comprados, por pool
  pointsByPool: PoolMap; // disponível = atributo - spentByPool[atributo]
  elements: Element[]; // elementos desbloqueados
  owned: Set<string>; // ids de nó comprados
  copiedJutsuIds?: string[]; // arsenal permanente aprendido pelo Sharingan
  conditions?: Set<CharacterCondition>;
  mangekyoVariant?: MangekyoVariant;
  clanId: string | null; // cla do personagem (define o primeiro elemento)
  // valor BRUTO de cada atributo. É o TETO de cada bolsa (orçamento) e também
  // o que o gate reqPool/reqAttribute compara. Gastar pontos na árvore não
  // reduz esse valor — só consome o disponível derivado dele.
  attributes: PoolMap;
}

// Soma o custo dos nós possuídos, separado por pool.
function spentOf(owned: Set<string>): PoolMap {
  const s: PoolMap = {};
  for (const id of owned) {
    const node = getNode(id);
    if (!node) continue;
    s[node.pool] = (s[node.pool] ?? 0) + node.cost;
  }
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
  const copiedJutsuIds = char.skillNodes
    .map((s) => abilityIdFromSharinganCopyNode(s.nodeId))
    .filter((id): id is string => Boolean(id));
  const conditions = new Set(
    char.skillNodes
      .map((s) => conditionFromNodeId(s.nodeId))
      .filter((condition): condition is CharacterCondition => Boolean(condition)),
  );
  const mangekyoVariant = char.skillNodes
    .map((s) => mangekyoVariantFromNodeId(s.nodeId))
    .find((variant): variant is MangekyoVariant => Boolean(variant));
  const attributes: PoolMap = char.attributes ?? {};
  const spentByPool = spentOf(owned);
  // disponível de cada pool = valor do atributo - o que já foi gasto nele.
  // Só entram os atributos que têm valor ou gasto (evita poluir a UI com as
  // 10 bolsas quando o personagem só usa duas).
  const pointsByPool: PoolMap = {};
  for (const attr of new Set([
    ...(Object.keys(attributes) as Attribute[]),
    ...(Object.keys(spentByPool) as Attribute[]),
  ])) {
    pointsByPool[attr] = Math.max(0, (attributes[attr] ?? 1) - (spentByPool[attr] ?? 0));
  }
  return {
    charId: char.id,
    name: char.displayName?.trim() || char.name, // nome RP, senao username
    level: char.level,
    spentByPool,
    pointsByPool,
    elements: char.elements.map((e) => e.element as Element),
    owned,
    copiedJutsuIds,
    conditions,
    mangekyoVariant,
    clanId: char.clan?.clanId ?? null,
    attributes,
  };
}

// Carrega o snapshot autoritativo do personagem (por discordId+guildId).
export async function loadSnapshot(discordId: string, guildId: string): Promise<CharSnapshot | null> {
  const char = await prisma.userCharacter.findUnique({
    where: { discordId_guildId: { discordId, guildId } },
    include: { attributes: true, elements: true, skillNodes: true, clan: true },
  });
  if (!char) return null;
  const snap = snapFrom(char);

  // Personagens que compraram o Mangekyō antes de as variações serem
  // persistidas recebem uma única variação aqui. O upsert torna a migração
  // idempotente e evita que um refresh troque o olho já recebido.
  if (snap.owned.has("uchiha_mangekyo_sharingan") && !snap.mangekyoVariant) {
    const variant = rollMangekyoVariant();
    await prisma.characterSkillNode.upsert({
      where: { charId_nodeId: { charId: char.id, nodeId: mangekyoVariantNodeId(variant) } },
      create: { charId: char.id, nodeId: mangekyoVariantNodeId(variant) },
      update: {},
    });
    snap.mangekyoVariant = variant;
  }

  return snap;
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
  if (node.requiresCondition && !snap.conditions?.has(node.requiresCondition)) {
    return `Requer condição: ${node.requiresCondition === "TRAUMA" ? "Trauma" : node.requiresCondition}.`;
  }
  for (const req of node.requires) {
    if (!snap.owned.has(req)) {
      const parent = getNode(req);
      return `Requer antes: ${parent?.name ?? req}.`;
    }
  }
  if (snap.level < node.reqLevel) return `Requer nível ${node.reqLevel}.`;
  // gate cruzado (atributo DIFERENTE do pool). Hoje nenhum nó usa, mas o
  // contrato vale: um jutsu pode exigir um atributo que não é o que o paga.
  if (node.reqAttribute) {
    const have = snap.attributes[node.reqAttribute.attribute] ?? 0;
    if (have < node.reqAttribute.value) {
      return `Requer ${ATTRIBUTE_LABELS[node.reqAttribute.attribute]} ${node.reqAttribute.value}.`;
    }
  }
  // gate e orçamento saem do MESMO atributo (node.pool).
  const label = ATTRIBUTE_LABELS[node.pool];
  const requiredPool = effectiveReqPool(node);
  if ((snap.attributes[node.pool] ?? 1) < requiredPool) return `Requer ${label} ${requiredPool}.`;
  const left = snap.pointsByPool[node.pool] ?? (snap.attributes[node.pool] ?? 1);
  if (left < node.cost) {
    return `Pontos de ${label} insuficientes (precisa ${node.cost}, restam ${left}).`;
  }
  return null;
}

// Estado completo de uma árvore para exibir (não decide nada de gravação).
export function viewTree(snap: CharSnapshot, element: Element): NodeView[] {
  return ELEMENT_TREES[element].map((node) => {
    const combat = combatOf(node);
    const mechanics = mechanicsOf(node);
    const visualDescription = visualDescriptionOf(node);
    const effectiveRequired = effectiveReqPool(node);
    if (snap.owned.has(node.id)) {
      return { ...node, combat, visualDescription, mechanics, effectiveReqPool: effectiveRequired, status: "OWNED" };
    }
    const reason = lockReason(snap, node);
    return reason
      ? { ...node, combat, visualDescription, mechanics, effectiveReqPool: effectiveRequired, status: "LOCKED", reason }
      : { ...node, combat, visualDescription, mechanics, effectiveReqPool: effectiveRequired, status: "BUYABLE" };
  });
}

// Mesma logica de viewTree, mas pra arvore de um CLA (sem `element`, gate por clanId).
export function viewClanTree(snap: CharSnapshot, clanId: string): NodeView[] {
  return (CLAN_TREES[clanId] ?? []).map((node) => {
    const combat = combatOf(node);
    const mechanics = mechanicsOf(node);
    const visualDescription = visualDescriptionOf(node);
    const effectiveRequired = effectiveReqPool(node);
    if (snap.owned.has(node.id)) {
      return { ...node, combat, visualDescription, mechanics, effectiveReqPool: effectiveRequired, status: "OWNED" };
    }
    const visibleNode = node.concealUntilOwned ? { ...node, img: undefined, icon: "?" } : node;
    const reason = lockReason(snap, node);
    return reason
      ? { ...visibleNode, combat, visualDescription, mechanics, effectiveReqPool: effectiveRequired, status: "LOCKED", reason }
      : { ...visibleNode, combat, visualDescription, mechanics, effectiveReqPool: effectiveRequired, status: "BUYABLE" };
  });
}

export function viewBukijutsuTree(snap: CharSnapshot): NodeView[] {
  return BUKIJUTSU_TREE.map((node) => {
    const combat = combatOf(node);
    const mechanics = mechanicsOf(node);
    const visualDescription = visualDescriptionOf(node);
    const effectiveRequired = effectiveReqPool(node);
    if (snap.owned.has(node.id)) {
      return { ...node, combat, visualDescription, mechanics, effectiveReqPool: effectiveRequired, status: "OWNED" };
    }
    const reason = lockReason(snap, node);
    return reason
      ? { ...node, combat, visualDescription, mechanics, effectiveReqPool: effectiveRequired, status: "LOCKED", reason }
      : { ...node, combat, visualDescription, mechanics, effectiveReqPool: effectiveRequired, status: "BUYABLE" };
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
    const withIcon = {
      ...node,
      img,
      combat: combatOf(node),
      visualDescription: visualDescriptionOf(node),
      mechanics: mechanicsOf(node),
    };
    const effectiveRequired = effectiveReqPool(node);
    if (snap.owned.has(node.id)) {
      return { ...withIcon, effectiveReqPool: effectiveRequired, status: "OWNED" };
    }
    const reason = lockReason(snap, node);
    return reason
      ? { ...withIcon, effectiveReqPool: effectiveRequired, status: "LOCKED", reason }
      : { ...withIcon, effectiveReqPool: effectiveRequired, status: "BUYABLE" };
  });
}

export interface BuyResult {
  ok: boolean;
  error?: string;
  pointsLeft?: number; // sobra da bolsa DO POOL do nó comprado
  pool?: Attribute; // de qual bolsa saiu
  grantedAbilityId?: string;
  grantedElement?: Element; // no ELEMENT: qual elemento saiu no sorteio
  grantedMangekyoVariant?: string;
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
    // atributo — o custo é "descontado" via soma dos nós possuídos daquele pool.
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

    let grantedMangekyoVariant: MangekyoVariant | undefined;
    if (node.id === "uchiha_mangekyo_sharingan") {
      grantedMangekyoVariant = rollMangekyoVariant();
      await tx.characterSkillNode.create({
        data: { charId: char.id, nodeId: mangekyoVariantNodeId(grantedMangekyoVariant) },
      });
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

    const leftBefore = snap.pointsByPool[node.pool] ?? (snap.attributes[node.pool] ?? 1);
    return {
      ok: true,
      pointsLeft: leftBefore - node.cost,
      pool: node.pool,
      grantedAbilityId,
      grantedElement,
      grantedMangekyoVariant: grantedMangekyoVariant ? MANGEKYO_VARIANT_LABEL[grantedMangekyoVariant] : undefined,
    };
  });
}
