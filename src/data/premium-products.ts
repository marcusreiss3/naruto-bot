export const PREMIUM_PRODUCTS = [
  {
    id: "clan_spin",
    name: "Giro de Clã",
    description: "Libera uma nova rolagem de Clã enquanto o personagem ainda for da Academia.",
    cost: 100,
    spinField: "clanSpins",
  },
  {
    id: "trait_spin",
    name: "Giro de Traço",
    description: "Libera uma nova rolagem de Traço, usando as probabilidades normais.",
    cost: 100,
    spinField: "traitSpins",
  },
] as const;

export type PremiumProductId = (typeof PREMIUM_PRODUCTS)[number]["id"];

export function getPremiumProduct(id: string) {
  return PREMIUM_PRODUCTS.find((product) => product.id === id);
}
