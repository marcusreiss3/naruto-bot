// OAuth2 do Discord (fluxo authorization code) + sessão por cookie assinado.
// O cookie guarda só o discordId; assinado com SESSION_SECRET → o cliente não
// consegue forjar. A identidade do jogador vem daqui, nunca do corpo da request.
import type { FastifyInstance, FastifyRequest } from "fastify";
import { randomBytes } from "node:crypto";
import { ENV } from "../config/env.js";

const SESSION_COOKIE = "nid";
const STATE_COOKIE = "oauth_state";
const secure = ENV.WEB_BASE_URL.startsWith("https");
const REDIRECT_URI = `${ENV.WEB_BASE_URL}/auth/callback`;

// discordId da sessão, ou null. Valida a assinatura do cookie.
export function getSessionDiscordId(req: FastifyRequest): string | null {
  const raw = req.cookies[SESSION_COOKIE];
  if (!raw) return null;
  const un = req.unsignCookie(raw);
  return un.valid && un.value ? un.value : null;
}

export function registerAuth(app: FastifyInstance): void {
  // Início do login: gera state anti-CSRF e manda pro Discord.
  app.get("/auth/login", async (_req, reply) => {
    const state = randomBytes(16).toString("hex");
    reply.setCookie(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      signed: true,
      path: "/",
      maxAge: 600,
    });
    const url = new URL("https://discord.com/oauth2/authorize");
    url.searchParams.set("client_id", ENV.DISCORD_CLIENT_ID);
    url.searchParams.set("redirect_uri", REDIRECT_URI);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "identify");
    url.searchParams.set("state", state);
    return reply.redirect(url.toString());
  });

  // Retorno do Discord: valida state, troca code por token, lê o usuário.
  app.get("/auth/callback", async (req, reply) => {
    const q = req.query as { code?: string; state?: string };
    const stateRaw = req.cookies[STATE_COOKIE];
    const stateUn = stateRaw ? req.unsignCookie(stateRaw) : { valid: false, value: null };
    if (!q.code || !q.state || !stateUn.valid || stateUn.value !== q.state) {
      return reply.code(400).type("text/html").send(page("Login inválido. <a href='/'>Voltar</a>."));
    }
    reply.clearCookie(STATE_COOKIE, { path: "/" });

    const tokRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: ENV.DISCORD_CLIENT_ID,
        client_secret: ENV.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code: q.code,
        redirect_uri: REDIRECT_URI,
      }),
    });
    if (!tokRes.ok) return reply.code(502).type("text/html").send(page("Falha no OAuth do Discord."));
    const tok = (await tokRes.json()) as { access_token?: string };
    if (!tok.access_token) return reply.code(502).type("text/html").send(page("Token ausente."));

    const meRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    });
    if (!meRes.ok) return reply.code(502).type("text/html").send(page("Falha ao ler usuário."));
    const me = (await meRes.json()) as { id?: string };
    if (!me.id) return reply.code(502).type("text/html").send(page("Usuário sem id."));

    reply.setCookie(SESSION_COOKIE, me.id, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      signed: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 dias
    });
    return reply.redirect("/");
  });

  app.post("/auth/logout", async (_req, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return reply.send({ ok: true });
  });
}

function page(msg: string): string {
  return `<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;background:#14100e;color:#eee;padding:40px">${msg}</body>`;
}
