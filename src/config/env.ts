import "./load-env.js";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variavel de ambiente faltando: ${name}`);
  return v;
}

function opt(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

// Normaliza a base do site: aceita "app.squareweb.app", "https://app.squareweb.app"
// e "https://app.squareweb.app/", devolve sempre a forma canonica sem barra final.
//
// Os dois formatos errados ja derrubaram o login em producao:
// - sem esquema, `${base}/auth/callback` nao e' URL absoluta e o Discord recusa
//   o authorize inteiro com "redirect_uri: URL introduzido incorretamente";
// - com barra final, sai "...app//auth/callback", e o Discord compara a URI como
//   texto exato contra o que esta cadastrado no portal, entao nunca bate.
//
// Assumir https no caso sem esquema tambem liga o flag Secure dos cookies em
// server/auth.ts, que le o esquema daqui. Dev local escreve http:// explicito.
function normalizeBaseUrl(raw: string): string {
  const v = raw.trim().replace(/\/+$/, "");
  if (!v) return "";
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

export const ENV = {
  DISCORD_TOKEN: req("DISCORD_TOKEN"),
  DISCORD_CLIENT_ID: req("DISCORD_CLIENT_ID"),
  DISCORD_GUILD_ID: opt("DISCORD_GUILD_ID"),
  DATABASE_URL: opt("DATABASE_URL", "file:./dev.db"),
  ADMIN_ROLE_IDS: opt("ADMIN_ROLE_IDS")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  GROQ_API_KEY: opt("GROQ_API_KEY"),
  GROQ_MODEL: opt("GROQ_MODEL", "llama-3.3-70b-versatile"),
  GROQ_VISION_MODEL: opt("GROQ_VISION_MODEL", "qwen/qwen3.6-27b"),
  GEMINI_API_KEY: opt("GEMINI_API_KEY"),
  GEMINI_MODEL: opt("GEMINI_MODEL", "gemini-2.5-flash"),

  // ---- Site / árvore de habilidades (opcional) ----
  // Sem estes, o servidor web nao sobe e o bot roda normal.
  DISCORD_CLIENT_SECRET: opt("DISCORD_CLIENT_SECRET"),
  // URL publica do site (usada no redirect do OAuth). Ex.: https://app.squareweb.app
  // Ver normalizeBaseUrl: esquema faltando e barra final sao corrigidos aqui.
  WEB_BASE_URL: normalizeBaseUrl(opt("WEB_BASE_URL")),
  // segredo p/ assinar o cookie de sessao
  SESSION_SECRET: opt("SESSION_SECRET"),
  // porta do servidor HTTP (Square injeta PORT)
  WEB_PORT: Number(opt("PORT", "8080")),
};

export const HAS_GROQ = Boolean(ENV.GROQ_API_KEY);
export const HAS_GEMINI = Boolean(ENV.GEMINI_API_KEY);
// So sobe o site se OAuth + guild + base + segredo estiverem configurados.
export const HAS_WEB = Boolean(
  ENV.DISCORD_CLIENT_SECRET && ENV.WEB_BASE_URL && ENV.SESSION_SECRET && ENV.DISCORD_GUILD_ID,
);
