// Fonte unica de verdade de preco/quantidade dos pacotes de Ingots. O
// checkout NUNCA confia em preco vindo do cliente — sempre resolve pelo
// packageId aqui. Os textos de exibicao ficam em public/ingots.js; se mudar
// numero aqui, mude tambem la' pra nao ficar incoerente.
export const INGOT_PACKAGES = [
  { id: "01", title: "Pequeno Cofre", ingots: 400, priceCents: 500 },
  { id: "02", title: "Bolsa de Selos", ingots: 850, priceCents: 1000 },
  { id: "03", title: "Caixa de Suprimentos", ingots: 1800, priceCents: 2000 },
  { id: "04", title: "Baú do Mercador", ingots: 3200, priceCents: 3500 },
  { id: "05", title: "Tesouro do Daimyō", ingots: 5700, priceCents: 6000 },
  { id: "06", title: "Reserva do Hokage", ingots: 10000, priceCents: 10000 },
] as const;

export type IngotPackageId = (typeof INGOT_PACKAGES)[number]["id"];

export function getIngotPackage(id: string) {
  return INGOT_PACKAGES.find((pkg) => pkg.id === id);
}
