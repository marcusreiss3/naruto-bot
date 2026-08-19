export const PREMIUM_PRODUCTS = [
  {
    id: "clan_spin",
    name: "Giro de Clã",
    description: "Libera uma nova rolagem de Clã enquanto o personagem ainda for da Academia.",
    cost: 100,
    kind: "SPIN",
    spinField: "clanSpins",
  },
  {
    id: "trait_spin",
    name: "Giro de Traço",
    description: "Libera uma nova rolagem de Traço, usando as probabilidades normais.",
    cost: 100,
    kind: "SPIN",
    spinField: "traitSpins",
  },
  {
    id: "ryo_10000",
    name: "10.000 Ryō",
    description: "Adiciona 10.000 Ryō diretamente ao saldo do personagem.",
    cost: 100,
    kind: "RYO",
    ryo: 10_000,
  },
  {
    id: "attribute_respec",
    name: "Reset de atributos",
    description: "Devolve os pontos investidos, zera os atributos e remove as habilidades aprendidas nas Árvores de Habilidade.",
    cost: 100,
    kind: "RESPEC",
  },
  {
    id: "character_reset",
    name: "Reset premium de personagem",
    description: "Permite refazer nome, idade, história e aparência; devolve os pontos investidos e remove as habilidades aprendidas nas Árvores de Habilidade.",
    cost: 100,
    kind: "CHARACTER_RESET",
  },
] as const;

export type PremiumProductId = (typeof PREMIUM_PRODUCTS)[number]["id"];

export function getPremiumProduct(id: string) {
  return PREMIUM_PRODUCTS.find((product) => product.id === id);
}
