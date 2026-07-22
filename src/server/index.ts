// Servidor HTTP do site da árvore de habilidades. Roda NO MESMO processo do bot
// (mesma instância do Prisma → sem disputa pelo SQLite). Só sobe se HAS_WEB.
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import staticPlugin from "@fastify/static";
import path from "node:path";
import { ENV, HAS_WEB } from "../config/env.js";
import { log } from "../utils/logger.js";
import { registerAuth } from "./auth.js";
import { registerApi } from "./api.js";

export async function startWebServer(): Promise<void> {
  if (!HAS_WEB) {
    log.info(
      "Site desativado. Configure DISCORD_CLIENT_SECRET, WEB_BASE_URL, SESSION_SECRET e DISCORD_GUILD_ID para ligar.",
    );
    return;
  }

  const app = Fastify({ logger: false, trustProxy: true });
  await app.register(cookie, { secret: ENV.SESSION_SECRET });
  await app.register(staticPlugin, {
    root: path.join(process.cwd(), "public"),
    prefix: "/",
  });

  registerAuth(app);
  registerApi(app);

  await app.listen({ port: ENV.WEB_PORT, host: "0.0.0.0" });
  log.info(`Site no ar em ${ENV.WEB_BASE_URL} (porta ${ENV.WEB_PORT}).`);
}
