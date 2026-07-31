// ============================================================================
// Elementos iniciais por clã (Árvore de Ninjutsu / Fundamentos).
// ============================================================================
// Os nós funda_elemento_1..5 NAO sao mais sorteados quando o clã tem uma
// sequência mapeada aqui: cada slot da sequência corresponde a um nó, na
// ordem (funda_elemento_1 = sequence[0], funda_elemento_2 = sequence[1]...).
// Quando a sequência do clã acaba (ou o clã nao esta neste mapa), o nó volta
// a sortear entre os elementos básicos restantes — ver buyNode() em
// services/characters/skill-tree.ts.
//
// Cla ausente deste mapa (ou sem cla) => todo elemento SORTEADO. Isso e
// proposital para clas sem natureza de chakra canonica (Hyuuga, Inuzuka,
// Aburame, Lee, ...) e para o Kakuzu, que no canon domina as cinco naturezas.
//
// A chave e o `clanId` (slug) — o mesmo valor gravado em CharacterClan.clanId.
// So os cinco elementos BASICOS entram aqui; kekkei genkai nunca e sorteado
// nem forçado por aqui (so' via /admin ou o sistema de fusao em
// services/characters/kekkei-genkai.ts).
import type { Element } from "../../config/enums.js";

export const CLAN_STARTING_ELEMENTS: Record<string, Element[]> = {
  // ---- Konoha ----
  senju: ["AGUA"], // Tobirama, mestre de Suiton (e base do Mokuton)
  uchiha: ["FOGO"], // Katon: "nao e um Uchiha ate cuspir fogo"
  sarutobi: ["VENTO"], // Asuma, laminas de Fuuton
  uzumaki: ["VENTO"], // Naruto, Fuuton
  hatake: ["RAIO"], // Kakashi, Raikiri/Chidori
  // ---- Suna ----
  kazekage: ["TERRA"], // Gaara, areia / Doton
  kamaitachi: ["VENTO"], // Temari, foice de vento (kamaitachi)
  // ---- Kiri ----
  hoshigaki: ["AGUA"], // Kisame, Suiton
  hozuki: ["AGUA"], // hidrificacao (Suigetsu/Mangetsu)
  karatachi: ["AGUA"], // Yagura, Kirigakure
  yuki: ["AGUA", "VENTO"], // pedido explicito: agua primeiro, depois vento — os dois que fundem no proprio Hyoton (Gelo)
  // ---- Kumo ----
  yotsuki: ["RAIO"], // Killer B, afinidade de raio de Kumo
  darui: ["RAIO"], // raio negro
  raikage: ["RAIO"], // armadura de raio
  // ---- Iwa ----
  kamizuru: ["TERRA"], // cla das abelhas de Iwagakure
  // Onoki/Bakurei: sequencia de 2-3 elementos, pedido explicito do usuario —
  // os dois tambem tem desconto de fusao pro proprio kekkei genkai (Poeira/
  // Explosão), ver KEKKEI_GENKAI_RECIPES em services/characters/kekkei-genkai.ts.
  onoki: ["TERRA", "VENTO", "FOGO"], // Tsuchikage: Doton nativo, depois Fuuton e Katon (os dois que fundem em Jinton)
  bakurei: ["TERRA", "RAIO"], // Doton nativo, depois Raiton
  // Aleatorios (omitidos de proposito): nara, hyuuga, inuzuka, yamanaka,
  // akimichi, aburame, lee, shirogane, kaguya, chinoike, kakuzu.
};

// Compat: primeiro elemento do clã, usado so' pra pintar o icone do no'
// "Primeiro Elemento" na arvore (ver viewFundamentosTree em skill-tree.ts).
export const CLAN_STARTING_ELEMENT: Record<string, Element> = Object.fromEntries(
  Object.entries(CLAN_STARTING_ELEMENTS)
    .filter(([, seq]) => seq.length > 0)
    .map(([clanId, seq]) => [clanId, seq[0]!]),
);

// Slot (0-based) de cada no' funda_elemento_N na sequência do clã.
const ELEMENT_NODE_SLOT: Record<string, number> = {
  funda_elemento_1: 0,
  funda_elemento_2: 1,
  funda_elemento_3: 2,
  funda_elemento_4: 3,
  funda_elemento_5: 4,
};

// Pura e testavel. Retorna o elemento forçado pro NO especifico (funda_elemento_N)
// SE o clã tiver uma sequência mapeada com esse slot preenchido e o elemento
// ainda nao pertencer ao personagem; senao null (o chamador sorteia).
export function clanStartingElementForNode(
  clanId: string | null,
  nodeId: string,
  owned: Element[],
): Element | null {
  if (!clanId) return null;
  const slot = ELEMENT_NODE_SLOT[nodeId];
  if (slot === undefined) return null;
  const mapped = CLAN_STARTING_ELEMENTS[clanId]?.[slot];
  if (!mapped) return null;
  return owned.includes(mapped) ? null : mapped;
}

// Compat: mesma coisa, so' pro PRIMEIRO elemento (funda_elemento_1) — mantido
// pra nao obrigar callers antigos a passar nodeId quando so' querem o primeiro.
export function clanStartingElement(clanId: string | null, owned: Element[]): Element | null {
  return clanStartingElementForNode(clanId, "funda_elemento_1", owned);
}
