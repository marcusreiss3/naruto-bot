// Servidor de DEMONSTRAÇÃO do site da árvore de habilidades — sem Prisma, sem
// Discord OAuth, sem rede externa. Serve o mesmo public/ e a mesma lógica de
// views de src/services/characters/skill-tree.ts, mas com um personagem
// fictício guardado só em memória do processo. Rodar: npx tsx scripts/demo-web.ts
import Fastify from "fastify";
import staticPlugin from "@fastify/static";
import path from "node:path";
import {
  ATTRIBUTE_LABELS,
  ATTRIBUTES,
  ELEMENTS,
  isKekkeiGenkai,
  type Attribute,
  type Element,
} from "../src/config/enums.js";
import { ELEMENT_TREES, getNode, type SkillNodeDef } from "../src/data/element-trees/index.js";
import { CLAN_TREES } from "../src/data/clan-trees/index.js";
import { FUNDAMENTOS } from "../src/data/element-trees/fundamentals.js";
import { CLAN_STARTING_ELEMENT } from "../src/data/clans/starting-element.js";
import { getAbility, getClan, CLANS } from "../src/data/index.js";
import {
  buildMechanicsSummary,
  buildVisualDescription,
} from "../src/services/characters/skill-description.js";
import {
  MANGEKYO_VARIANT_LABEL,
  mangekyoVariantNodeId,
  rollMangekyoVariant,
} from "../src/services/characters/mangekyo.js";

const BASIC_ELEMENTS: Element[] = ELEMENTS.filter((e) => !isKekkeiGenkai(e));
const FIRST_ELEMENT_NODE_ID = "funda_elemento_1";
const ELEMENT_ICON: Partial<Record<Element, string>> = {
  FOGO: "/assets/icons/footer/katon.png",
  AGUA: "/assets/icons/footer/suiton.png",
  VENTO: "/assets/icons/footer/futon.png",
  TERRA: "/assets/icons/footer/doton.png",
  RAIO: "/assets/icons/footer/raiton.png",
};

// ---- personagem fictício, só em memória (reinicia ao reiniciar o processo) ----
const DEMO_CLAN_ID = "uchiha";
const attributes: Partial<Record<Attribute, number>> = Object.fromEntries(
  ATTRIBUTES.map((a) => [a, 60]),
);
const elements: Element[] = ["FOGO", "AGUA", "VENTO", "TERRA", "RAIO"];
const owned = new Set<string>(["funda_elemento_1", "funda_disciplina_chakra"].filter((id) => getNode(id)));
const conditions = new Set<string>(["TRAUMA"]);
let mangekyoVariant: string | null = null;

type PoolMap = Partial<Record<Attribute, number>>;

function spentOf(ownedSet: Set<string>): PoolMap {
  const s: PoolMap = {};
  for (const id of ownedSet) {
    const node = getNode(id);
    if (!node) continue;
    s[node.pool] = (s[node.pool] ?? 0) + node.cost;
  }
  return s;
}

function snapshot() {
  const spentByPool = spentOf(owned);
  const pointsByPool: PoolMap = {};
  for (const attr of ATTRIBUTES) {
    pointsByPool[attr] = Math.max(0, (attributes[attr] ?? 1) - (spentByPool[attr] ?? 0));
  }
  return {
    name: "Demo Uchiha",
    level: 60,
    spentByPool,
    pointsByPool,
    elements,
    owned,
    conditions,
    clanId: DEMO_CLAN_ID as string | null,
    attributes,
  };
}

function combatOf(node: SkillNodeDef) {
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

function effectiveReqPool(node: SkillNodeDef): number {
  const visited = new Set<string>();
  const visit = (current: SkillNodeDef): void => {
    if (visited.has(current.id)) return;
    visited.add(current.id);
    for (const requiredId of current.requires) {
      const required = getNode(requiredId);
      if (required) visit(required);
    }
  };
  visit(node);
  let mandatoryCost = 0;
  for (const nodeId of visited) {
    const required = getNode(nodeId);
    if (required?.pool === node.pool) mandatoryCost += required.cost;
  }
  return Math.max(node.reqPool, mandatoryCost);
}

function lockReason(snap: ReturnType<typeof snapshot>, node: SkillNodeDef): string | null {
  if (snap.owned.has(node.id)) return "Já adquirido.";
  if (node.element && !snap.elements.includes(node.element)) return `Requer o elemento ${node.element}.`;
  if (node.clanId && snap.clanId !== node.clanId) return `Requer o clã ${getClan(node.clanId)?.name ?? node.clanId}.`;
  if (node.requiresCondition && !snap.conditions.has(node.requiresCondition)) {
    return `Requer condição: ${node.requiresCondition === "TRAUMA" ? "Trauma" : node.requiresCondition}.`;
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
  const label = ATTRIBUTE_LABELS[node.pool];
  const requiredPool = effectiveReqPool(node);
  if ((snap.attributes[node.pool] ?? 1) < requiredPool) return `Requer ${label} ${requiredPool}.`;
  const left = snap.pointsByPool[node.pool] ?? (snap.attributes[node.pool] ?? 1);
  if (left < node.cost) return `Pontos de ${label} insuficientes (precisa ${node.cost}, restam ${left}).`;
  return null;
}

function viewNodes(snap: ReturnType<typeof snapshot>, nodes: SkillNodeDef[]) {
  return nodes.map((node) => {
    const combat = combatOf(node);
    const ability = node.grantsAbilityId ? getAbility(node.grantsAbilityId) : undefined;
    const mechanics = ability ? buildMechanicsSummary(ability) || undefined : undefined;
    const visualDescription = node.kind === "JUTSU"
      ? buildVisualDescription(node.desc, ability?.visualDescription)
      : undefined;
    const effectiveRequired = effectiveReqPool(node);
    if (snap.owned.has(node.id)) {
      return { ...node, combat, visualDescription, mechanics, effectiveReqPool: effectiveRequired, status: "OWNED" as const };
    }
    const visibleNode = node.concealUntilOwned ? { ...node, img: undefined, icon: "?" } : node;
    const reason = lockReason(snap, node);
    return reason
      ? { ...visibleNode, combat, visualDescription, mechanics, effectiveReqPool: effectiveRequired, status: "LOCKED" as const, reason }
      : { ...visibleNode, combat, visualDescription, mechanics, effectiveReqPool: effectiveRequired, status: "BUYABLE" as const };
  });
}

function buildState() {
  const snap = snapshot();
  const clanElement = snap.clanId ? CLAN_STARTING_ELEMENT[snap.clanId] : undefined;
  const fundamentos = FUNDAMENTOS.map((node) =>
    node.id === FIRST_ELEMENT_NODE_ID && clanElement ? { ...node, img: ELEMENT_ICON[clanElement] ?? node.img } : node,
  );
  const trees: Record<string, unknown> = { FUNDAMENTOS: viewNodes(snap, fundamentos) };
  for (const el of Object.keys(ELEMENT_TREES) as Element[]) trees[el] = viewNodes(snap, ELEMENT_TREES[el]);
  for (const clanId of Object.keys(CLAN_TREES)) trees[clanId.toUpperCase()] = viewNodes(snap, CLAN_TREES[clanId]);

  return {
    authenticated: true,
    hasChar: true,
    char: {
      name: snap.name,
      level: snap.level,
      pools: Object.fromEntries(
        ATTRIBUTES.map((a) => [
          a,
          {
            label: ATTRIBUTE_LABELS[a],
            total: snap.attributes[a] ?? 1,
            spent: snap.spentByPool[a] ?? 0,
            left: snap.pointsByPool[a] ?? (snap.attributes[a] ?? 1),
          },
        ]),
      ),
      elements: [...snap.elements],
      clanId: snap.clanId,
      clanName: snap.clanId ? CLANS.find((c) => c.id === snap.clanId)?.name ?? snap.clanId : null,
      mangekyoVariant,
    },
    copiedJutsus: [],
    trees,
  };
}

async function main() {
  const app = Fastify({ logger: false });
  await app.register(staticPlugin, { root: path.join(process.cwd(), "public"), prefix: "/" });

  app.get("/api/state", async (_req, reply) => reply.send(buildState()));

  app.post("/api/buy", async (req, reply) => {
    const body = req.body as { nodeId?: string } | undefined;
    const node = body?.nodeId ? getNode(body.nodeId) : undefined;
    if (!node) return reply.send({ ok: false, error: "Habilidade inexistente." });
    const snap = snapshot();
    const reason = lockReason(snap, node);
    if (reason) return reply.send({ ok: false, error: reason });
    owned.add(node.id);
    let grantedMangekyoVariant: string | undefined;
    if (node.id === "uchiha_mangekyo_sharingan") {
      const variant = rollMangekyoVariant();
      mangekyoVariant = MANGEKYO_VARIANT_LABEL[variant];
      owned.add(mangekyoVariantNodeId(variant));
      grantedMangekyoVariant = mangekyoVariant;
    }
    let grantedElement: Element | undefined;
    if (node.kind === "ELEMENT") {
      const pool = BASIC_ELEMENTS.filter((e) => !elements.includes(e));
      if (pool.length) {
        grantedElement = pool[Math.floor(Math.random() * pool.length)]!;
        elements.push(grantedElement);
      }
    }
    return reply.send({ ok: true, grantedElement, grantedMangekyoVariant });
  });

  app.post("/auth/logout", async (_req, reply) => reply.send({ ok: true }));

  const port = 8080;
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`\n[DEMO] Site de teste (sem banco/Discord) em http://localhost:${port}\n`);
}

main();
