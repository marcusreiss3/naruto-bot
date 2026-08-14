// Mostra uso e cobranca do Blob. Util pra conferir se o que o manifesto diz
// bate com o que existe la de verdade — `usage.objects` vem da contabilidade,
// enquanto listObjects() responde de um cache de ~30 min.
//
//   npm run blob:stats
import "../src/config/load-env.js";
import { stats } from "../src/services/blob/blob-client.js";

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1) + " MB";
const brl = (v: number) => "R$ " + v.toFixed(2);

async function main() {
  const s = await stats();
  console.log(`objetos:      ${s.usage.objects}`);
  console.log(`armazenado:   ${mb(s.usage.storage)} de ${mb(s.plan.included)} inclusos no plano`);
  console.log(`espaco extra: ${mb(s.billing.extraStorage)}`);
  console.log(`custo objetos:      ${brl(s.billing.objectsPrice)}`);
  console.log(`custo armazenamento:${brl(s.billing.storagePrice)}`);
  console.log(`estimativa total:   ${brl(s.billing.totalEstimate)}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
