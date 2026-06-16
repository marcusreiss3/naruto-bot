import "dotenv/config";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variavel de ambiente faltando: ${name}`);
  return v;
}

function opt(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
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
  GROQ_VISION_MODEL: opt("GROQ_VISION_MODEL", "meta-llama/llama-4-scout-17b-16e-instruct"),
  GEMINI_API_KEY: opt("GEMINI_API_KEY"),
  GEMINI_MODEL: opt("GEMINI_MODEL", "gemini-flash-latest"),
};

export const HAS_GROQ = Boolean(ENV.GROQ_API_KEY);
export const HAS_GEMINI = Boolean(ENV.GEMINI_API_KEY);
