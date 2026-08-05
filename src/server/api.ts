// API do site. Toda rota exige sessão (getSessionDiscordId). A compra é
// validada no servidor (skill-tree.buyNode) — o cliente só manda o nodeId.
import type { FastifyInstance } from "fastify";
import { ENV } from "../config/env.js";
import { ATTRIBUTE_LABELS, type Attribute, type Element } from "../config/enums.js";
import { getSessionDiscordId } from "./auth.js";
import { ELEMENT_TREES } from "../data/element-trees/index.js";
import { CLAN_TREES } from "../data/clan-trees/index.js";
import { CLANS, getAbility } from "../data/index.js";
import { loadSnapshot, viewTree, viewFundamentosTree, viewClanTree, viewBukijutsuTree, viewIryoNinjutsuTree, viewGenjutsuTree, viewFuinjutsuTree, viewTaijutsuTree, viewArhatTree, viewAdamantinoTree, viewTaijutsuPassivesTree, viewAssassinatoNinjaTree, viewTaijutsuAgitacaoTree, buyNode } from "../services/characters/skill-tree.js";
import { villageForDiscordUser } from "../services/village-service.js";
import { buildMechanicsSummary, buildVisualDescription } from "../services/characters/skill-description.js";
import { MANGEKYO_VARIANT_LABEL } from "../services/characters/mangekyo.js";
import { buildEquipmentCatalog } from "../services/characters/equipment-catalog.js";

export function registerApi(app: FastifyInstance): void {
  // Estado completo: personagem + as árvores com o status de cada nó.
  app.get("/api/state", async (req, reply) => {
    const discordId = getSessionDiscordId(req);
    if (!discordId) return reply.code(401).send({ authenticated: false });

    const villageId = await villageForDiscordUser(ENV.DISCORD_GUILD_ID, discordId);
    const snap = await loadSnapshot(discordId, ENV.DISCORD_GUILD_ID, villageId);
    if (!snap) return reply.send({ authenticated: true, hasChar: false });

    const trees: Record<string, unknown> = {
      FUNDAMENTOS: viewFundamentosTree(snap),
      BUKIJUTSU: viewBukijutsuTree(snap),
      GENJUTSU: viewGenjutsuTree(snap),
      FUINJUTSU: viewFuinjutsuTree(snap),
      TAIJUTSU: viewTaijutsuTree(snap),
      ARHAT: viewArhatTree(snap),
      ADAMANTINO: viewAdamantinoTree(snap),
      TAIJUTSU_PASSIVAS: viewTaijutsuPassivesTree(snap),
      ASSASSINATO_NINJA: viewAssassinatoNinjaTree(snap),
      TAIJUTSU_AGITACAO: viewTaijutsuAgitacaoTree(snap),
      IRYO_NINJUTSU: viewIryoNinjutsuTree(snap),
    };
    for (const el of Object.keys(ELEMENT_TREES) as Element[]) {
      trees[el] = viewTree(snap, el);
    }
    for (const clanId of Object.keys(CLAN_TREES)) {
      trees[clanId.toUpperCase()] = viewClanTree(snap, clanId);
    }
    return reply.send({
      authenticated: true,
      hasChar: true,
      char: {
        name: snap.name,
        level: snap.level,
        // uma bolsa por atributo. O cliente descobre QUAIS bolsas importam na
        // árvore aberta lendo o `pool` de cada nó (vem em NodeView).
        pools: Object.fromEntries(
          (Object.keys(ATTRIBUTE_LABELS) as Attribute[]).map((a) => [
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
        mangekyoVariant: snap.mangekyoVariant ? MANGEKYO_VARIANT_LABEL[snap.mangekyoVariant] : null,
      },
      copiedJutsus: snap.clanId === "uchiha"
        ? (snap.copiedJutsuIds ?? []).flatMap((id) => {
            const ability = getAbility(id);
            if (!ability) return [];
            return [{
              id: ability.id,
              name: ability.name,
              tier: ability.tier,
              category: ability.category,
              element: ability.element,
              resource: ability.resource,
              cost: ability.cost,
              actionType: ability.actionType,
              additionalActionType: ability.additionalActionType,
              range: ability.range,
              shape: ability.shape,
              description: buildVisualDescription(ability.description, ability.visualDescription),
              mechanics: buildMechanicsSummary(ability),
            }];
          })
        : [],
      equipment: buildEquipmentCatalog(),
      trees,
    });
  });

  // Compra de um nó. Revalida tudo no banco.
  app.post("/api/buy", async (req, reply) => {
    const discordId = getSessionDiscordId(req);
    if (!discordId) return reply.code(401).send({ ok: false, error: "Não autenticado." });

    const body = req.body as { nodeId?: string } | undefined;
    if (!body?.nodeId) return reply.code(400).send({ ok: false, error: "nodeId faltando." });

    const villageId = await villageForDiscordUser(ENV.DISCORD_GUILD_ID, discordId);
    const result = await buyNode(discordId, ENV.DISCORD_GUILD_ID, body.nodeId, villageId);
    return reply.send(result);
  });
}
