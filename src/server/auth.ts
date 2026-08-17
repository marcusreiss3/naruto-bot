// OAuth2 do Discord (fluxo authorization code) + sessão por cookie assinado.
// O cookie guarda só o discordId; assinado com SESSION_SECRET → o cliente não
// consegue forjar. A identidade do jogador vem daqui, nunca do corpo da request.
import type { FastifyInstance, FastifyRequest } from "fastify";
import { randomBytes } from "node:crypto";
import { ENV } from "../config/env.js";
import { log } from "../utils/logger.js";

const SESSION_COOKIE = "nid";
const STATE_COOKIE = "oauth_state";
const secure = ENV.WEB_BASE_URL.startsWith("https");
const REDIRECT_URI = `${ENV.WEB_BASE_URL}/auth/callback`;

// O cookie de state precisa sobreviver ao retorno do Discord. Essa volta e' uma
// navegacao top-level cross-site, que SameSite=Lax deveria permitir — mas
// navegadores com bloqueio agressivo de terceiros (Opera GX com o blocker
// nativo ligado) descartam o cookie mesmo assim, e o callback caia sempre em
// "sem_cookie". SameSite=None resolve, so' que exige Secure; em dev sobre http
// o navegador descartaria o cookie na hora, entao la' fica Lax.
const STATE_SAME_SITE = secure ? "none" : "lax";

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
      sameSite: STATE_SAME_SITE,
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

    // Cada causa tem nome proprio: as quatro falham do mesmo jeito pro usuario,
    // mas o conserto de cada uma e' diferente (URI no portal, cookie bloqueado
    // pelo navegador, SESSION_SECRET trocado, login aberto em duas abas).
    const motivo = !q.code
      ? "sem_code"
      : !q.state
        ? "sem_state_na_url"
        : !stateRaw
          ? "sem_cookie"
          : !stateUn.valid
            ? "assinatura_invalida"
            : stateUn.value !== q.state
              ? "state_divergente"
              : null;
    if (motivo) {
      log.warn(`OAuth callback recusado: ${motivo} (ua=${req.headers["user-agent"] ?? "?"})`);
      return reply
        .code(400)
        .type("text/html")
        .send(page(`Login inválido (${motivo}). <a href='/'>Voltar</a>.`));
    }
    // motivo === null ja garante code presente, mas o compilador nao liga a
    // cadeia de ternarios ao campo; o cast documenta a garantia.
    const code = q.code as string;
    reply.clearCookie(STATE_COOKIE, { path: "/" });

    const tokRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: ENV.DISCORD_CLIENT_ID,
        client_secret: ENV.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
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
