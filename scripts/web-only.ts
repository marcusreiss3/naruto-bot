// Sobe SO o servidor web (site da arvore de habilidades / guias), sem conectar
// o bot no Discord — evita duas instancias do bot respondendo o mesmo comando.
// Usa o mesmo dev.db e o mesmo OAuth do processo normal.
// Rodar: npx tsx scripts/web-only.ts
import { startWebServer } from "../src/server/index.js";

startWebServer().catch((err) => {
  console.error("Falha ao subir o site:", err);
  process.exit(1);
});
