// API do site. Toda rota exige sessão (getSessionDiscordId). A compra é
// validada no servidor (skill-tree.buyNode) — o cliente só manda o nodeId.
import type { FastifyInstance } from "fastify";
import { ENV } from "../config/env.js";
import type { Element } from "../config/enums.js";
import { getSessionDiscordId } from "./auth.js";
import { ELEMENT_TREES } from "../data/element-trees/index.js";
import { loadSnapshot, viewTree, viewFundamentosTree, buyNode } from "../services/characters/skill-tree.js";

export function registerApi(app: FastifyInstance): void {
  // Estado completo: personagem + as 5 árvores com o status de cada nó.
  app.get("/api/state", async (req, reply) => {
    const discordId = getSessionDiscordId(req);
    if (!discordId) return reply.code(401).send({ authenticated: false });

    const snap = await loadSnapshot(discordId, ENV.DISCORD_GUILD_ID);
    if (!snap) return reply.send({ authenticated: true, hasChar: false });

    const trees: Record<string, unknown> = { FUNDAMENTOS: viewFundamentosTree(snap) };
    for (const el of Object.keys(ELEMENT_TREES) as Element[]) {
      trees[el] = viewTree(snap, el);
    }
    return reply.send({
      authenticated: true,
      hasChar: true,
      char: {
        name: snap.name,
        level: snap.level,
        points: snap.points, // pontos de ninjutsu disponíveis
        ninjutsu: snap.ninjutsu, // orçamento total
        spent: snap.spent,
        elements: [...snap.elements],
      },
      trees,
    });
  });

  // Compra de um nó. Revalida tudo no banco.
  app.post("/api/buy", async (req, reply) => {
    const discordId = getSessionDiscordId(req);
    if (!discordId) return reply.code(401).send({ ok: false, error: "Não autenticado." });

    const body = req.body as { nodeId?: string } | undefined;
    if (!body?.nodeId) return reply.code(400).send({ ok: false, error: "nodeId faltando." });

    const result = await buyNode(discordId, ENV.DISCORD_GUILD_ID, body.nodeId);
    return reply.send(result);
  });
}
