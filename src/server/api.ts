// API do site. O catálogo de Guias é público e independente da ficha; estado
// e compras exigem sessão. A compra é revalidada no servidor.
import type { FastifyInstance } from "fastify";
import { ENV } from "../config/env.js";
import { ATTRIBUTE_LABELS, TRAIT_RARITY_LABELS, type Attribute, type Element } from "../config/enums.js";
import { getSessionDiscordId } from "./auth.js";
import { ELEMENT_TREES } from "../data/element-trees/index.js";
import { CLAN_TREES } from "../data/clan-trees/index.js";
import { CLANS, getAbility } from "../data/index.js";
import { getTrait } from "../data/traits.js";
import { loadSnapshot, viewTree, viewFundamentosTree, viewClanTree, viewKazekageSandPreview, viewBukijutsuTree, viewIryoNinjutsuTree, viewGenjutsuTree, viewFuinjutsuTree, viewKugutsuTree, viewTaijutsuTree, viewArhatTree, viewAdamantinoTree, viewTaijutsuPassivesTree, viewAssassinatoNinjaTree, viewTaijutsuAgitacaoTree, buyNode } from "../services/characters/skill-tree.js";
import { villageForDiscordUser } from "../services/village-service.js";
import { buildMechanicsSummary, buildVisualDescription } from "../services/characters/skill-description.js";
import { MANGEKYO_VARIANT_LABEL } from "../services/characters/mangekyo.js";
import { buildGuideCatalog } from "../services/characters/equipment-catalog.js";
import { buildKugutsuArsenal } from "../services/puppets/puppet-service.js";
import { buyPremiumProductForDiscordUser } from "../services/premium/ingot-store.js";
import { createIngotCheckout, handleMercadoPagoWebhook, IngotCheckoutError } from "../services/premium/ingot-checkout.js";
import { log } from "../utils/logger.js";

export function registerApi(app: FastifyInstance): void {
  app.get("/api/guides/catalog", async (_req, reply) => {
    reply.header("Cache-Control", "no-store");
    return reply.send(buildGuideCatalog());
  });

  // Estado completo: personagem + as árvores com o status de cada nó.
  app.get("/api/state", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
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
      KUGUTSU: viewKugutsuTree(snap),
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
    trees.KAZEKAGE_AREIA = viewKazekageSandPreview(snap, "AREIA");
    trees.KAZEKAGE_FERRO = viewKazekageSandPreview(snap, "FERRO");
    trees.KAZEKAGE_OURO = viewKazekageSandPreview(snap, "OURO");
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
        trait: (() => {
          const t = snap.traitId ? getTrait(snap.traitId) : undefined;
          if (!t) return null;
          return { id: t.id, name: t.name, rarity: t.rarity, rarityLabel: TRAIT_RARITY_LABELS[t.rarity], description: t.description };
        })(),
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
      kugutsuArsenal: buildKugutsuArsenal(),
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

  // Compra de produto da Loja Premium (Giros, resets) direto pelo site.
  // Revalida saldo e regras no servidor, igual ao /loja-premium do bot.
  app.post("/api/premium/buy", async (req, reply) => {
    const discordId = getSessionDiscordId(req);
    if (!discordId) return reply.code(401).send({ ok: false, error: "Não autenticado." });

    const body = req.body as { productId?: string } | undefined;
    if (!body?.productId) return reply.code(400).send({ ok: false, error: "productId faltando." });

    const result = await buyPremiumProductForDiscordUser(discordId, ENV.DISCORD_GUILD_ID, body.productId);
    return reply.send(result);
  });

  // Inicia a compra de um pacote de Ingots via Mercado Pago Checkout Pro.
  // Devolve a URL de redirecionamento; o credito real so' acontece quando o
  // webhook confirmar o pagamento (nunca aqui, nunca antes de pagar).
  app.post("/api/premium/checkout", async (req, reply) => {
    const discordId = getSessionDiscordId(req);
    if (!discordId) return reply.code(401).send({ ok: false, error: "Não autenticado." });

    const body = req.body as { packageId?: string } | undefined;
    if (!body?.packageId) return reply.code(400).send({ ok: false, error: "packageId faltando." });

    try {
      const { url } = await createIngotCheckout(discordId, ENV.DISCORD_GUILD_ID, body.packageId);
      return reply.send({ ok: true, url });
    } catch (error) {
      if (error instanceof IngotCheckoutError) return reply.code(400).send({ ok: false, error: error.message });
      throw error;
    }
  });

  // Notificação do Mercado Pago. Não usa sessão — a identidade de quem
  // chama vem da assinatura HMAC (x-signature), verificada dentro do
  // service. Responde 200 sempre que a notificação foi lida (mesmo que o
  // pedido já estivesse processado), pra não entrar em loop de reenvio; só
  // devolve erro quando algo realmente falhou.
  app.post("/api/premium/webhook", async (req, reply) => {
    const query = req.query as Record<string, string | undefined>;
    const outcome = await handleMercadoPagoWebhook({
      xSignature: req.headers["x-signature"] as string | undefined,
      xRequestId: req.headers["x-request-id"] as string | undefined,
      dataId: query["data.id"],
      type: query["type"],
    });
    if (!outcome.handled) log.warn("webhook premium ignorado:", outcome.reason);
    return reply.code(200).send({ ok: true });
  });
}
