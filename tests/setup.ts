// Define env minimo p/ permitir import de modulos que leem ENV.
process.env.DISCORD_TOKEN ??= "test-token";
process.env.DISCORD_CLIENT_ID ??= "test-client";
process.env.DATABASE_URL ??= "file:./test.db";
// sem GROQ_API_KEY -> NpcAiService usa fallback local
delete process.env.GROQ_API_KEY;
