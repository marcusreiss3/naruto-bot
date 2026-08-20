export const PREMIUM_PRODUCTS = [
  {
    id: "clan_spin",
    name: "Giro de Vila + Clã",
    description: "Libera uma nova rolagem de Vila + Clã enquanto o personagem ainda for da Academia.",
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
    id: "fighting_style_reset",
    name: "Reset de estilos de luta",
    description: "Remove os estilos de luta aprendidos e as habilidades das árvores desses estilos, liberando espaço para aprender outros.",
    cost: 100,
    kind: "FIGHTING_STYLE_RESET",
  },
  {
    id: "character_reset",
    name: "Reset premium de personagem",
    description: "Permite refazer nome, rank, idade, história e aparência; devolve os pontos investidos, remove as habilidades aprendidas nas Árvores de Habilidade e libera novamente o uso de Giros de Vila + Clã.",
    cost: 100,
    kind: "CHARACTER_RESET",
  },
] as const;

export type PremiumProductId = (typeof PREMIUM_PRODUCTS)[number]["id"];

export function getPremiumProduct(id: string) {
  return PREMIUM_PRODUCTS.find((product) => product.id === id);
}
