// ============================================================================
// Primeiro elemento por cla.
// ============================================================================
// O no funda_elemento_1 (Arvore de Ninjutsu / Fundamentos) NAO e mais sorteado:
// o PRIMEIRO elemento vem do cla do personagem, com base no anime/manga. Os
// elementos 2..5 continuam aleatorios (ver skill-tree.ts:buyNode).
//
// Cla ausente deste mapa (ou sem cla) => primeiro elemento SORTEADO. Isso e
// proposital para clas sem natureza de chakra canonica (Hyuuga, Inuzuka,
// Aburame, Lee, ...) e para o Kakuzu, que no canon domina as cinco naturezas.
//
// A chave e o `clanId` (slug) — o mesmo valor gravado em CharacterClan.clanId.
// So os cinco elementos BASICOS entram aqui; kekkei genkai nunca e primeiro
// elemento (so via /admin).
import type { Element } from "../../config/enums.js";

export const CLAN_STARTING_ELEMENT: Record<string, Element> = {
  // ---- Konoha ----
  senju: "AGUA", // Tobirama, mestre de Suiton (e base do Mokuton)
  uchiha: "FOGO", // Katon: "nao e um Uchiha ate cuspir fogo"
  sarutobi: "VENTO", // Asuma, laminas de Fuuton
  uzumaki: "VENTO", // Naruto, Fuuton
  hatake: "RAIO", // Kakashi, Raikiri/Chidori
  // ---- Suna ----
  kazekage: "TERRA", // Gaara, areia / Doton
  kamaitachi: "VENTO", // Temari, foice de vento (kamaitachi)
  // ---- Kiri ----
  hoshigaki: "AGUA", // Kisame, Suiton
  hozuki: "AGUA", // hidrificacao (Suigetsu/Mangetsu)
  karatachi: "AGUA", // Yagura, Kirigakure
  yuki: "AGUA", // Hyoton (gelo) tem a agua como base
  // ---- Kumo ----
  yotsuki: "RAIO", // Killer B, afinidade de raio de Kumo
  darui: "RAIO", // raio negro
  raikage: "RAIO", // armadura de raio
  // ---- Iwa ----
  kamizuru: "TERRA", // cla das abelhas de Iwagakure
  onoki: "TERRA", // Tsuchikage, Doton
  // Aleatorios (omitidos de proposito): nara, hyuuga, inuzuka, yamanaka,
  // akimichi, aburame, lee, shirogane, kaguya, chinoike, bakurei, kakuzu.
};

// Pura e testavel. Retorna o elemento inicial do cla SE ele estiver mapeado e
// ainda nao pertencer ao personagem; senao null (o chamador sorteia).
export function clanStartingElement(
  clanId: string | null,
  owned: Element[],
): Element | null {
  if (!clanId) return null;
  const mapped = CLAN_STARTING_ELEMENT[clanId];
  if (!mapped) return null;
  return owned.includes(mapped) ? null : mapped;
}
