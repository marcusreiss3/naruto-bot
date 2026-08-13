// Emojis da economia, por CHAVE SEMANTICA (etapa 08).
//
// Nenhum renderizador escreve emoji literal: todos pedem por chave. Assim,
// quando a staff subir os emojis customizados do servidor, muda-se UM mapa
// aqui e a interface inteira acompanha — nenhum handler precisa ser tocado.
//
// ---------------------------------------------------------------------------
// COMO CONFIGURAR EMOJI CUSTOMIZADO
// ---------------------------------------------------------------------------
// Preencha `CUSTOM_EMOJIS` abaixo com a string COMPLETA do emoji do servidor:
//
//     const CUSTOM_EMOJIS: Partial<Record<EmojiKey, string>> = {
//       madeira: "<:madeira:1234567890123456789>",
//       ryo: "<:ryo:1234567890123456789>",
//     };
//
// A mesma string serve para texto e para `ButtonBuilder.setEmoji()`, que aceita
// tanto Unicode quanto o formato `<:nome:id>`. Chave ausente cai no placeholder
// Unicode: um emoji nao configurado NUNCA quebra nem esvazia a interface.
//
// Emoji animado usa `<a:nome:id>`. Nao invente ID: um ID que nao existe no
// servidor renderiza como texto cru para todo mundo.

import { ITEM_CATEGORY_ICONS, getItem } from "../data/items.js";

// ---------------- Chaves ----------------

// Materiais e produtos citados na tabela da etapa 08. A chave e' o proprio
// `itemId` quando existe item correspondente — assim `itemEmoji()` resolve
// direto, sem tabela de traducao no meio.
export const ECONOMY_EMOJI_PLACEHOLDERS = {
  // Ryo e cofre
  ryo: "💴",
  cofre: "🏦",

  // Madeira e derivados
  madeira: "🪵",
  fibra_vegetal: "🧵",
  papel: "📄",
  lenha: "🔥",

  // Mineral
  pedra: "🪨",
  minerio_ferro: "⛏️",
  carvao: "⬛",
  argila: "🏺",

  // Natural e alimento cru
  agua_limpa: "💧",
  carne_crua: "🥩",
  peixe_cru: "🐟",
  fruta: "🍎",
  grao: "🌾",
  couro: "🧤",
  erva_medicinal: "🌿",

  // Processados
  lingote_ferro: "🔩",
  aco: "⚙️",
  polvora: "💥",
  tinta_de_selo: "🖋️",

  // Raros
  minerio_raro: "💎",
  madeira_reforcada: "🌳",

  // Equipamento
  kunai: "🔪",
  shuriken: "✴️",
  senbon: "📍",
  papel_bomba: "🧨",
  katana: "🗡️",
  lamina_chakra: "✨",
  pergaminho_arsenal: "📜",

  // Lojas
  shop_MERCADO_GERAL: "🧺",
  shop_EMPORIO: "🍎",
  shop_MARCENARIA: "🪵",
  shop_FUNDICAO: "🔥",
  shop_ICHIRAKU: "🍜",
  shop_OFICINA_SELOS: "📜",

  // Vila e gestao
  vila: "🏯",
  kage: "👑",
  estoque: "📦",
  obras: "🏗️",
  impostos: "🧾",
  relatorio: "📊",
  producao: "⚙️",
  ordem: "📋",
  manutencao: "🛠️",

  // ---- Fora da tabela da etapa 08 ----
  // Itens e conceitos que a tabela nao cita mas que os paineis mostram. Sao
  // placeholders Unicode como os outros e seguem o mesmo caminho de override.
  sal: "🧂",
  farinha: "🌾",
  caldo: "🍲",
  tempero: "🧄",
  pao: "🍞",
  carne_cozida: "🍖",
  peixe_cozido: "🍣",
  ensopado: "🍲",
  dango: "🍡",
  lamen: "🍜",
  fuma_shuriken: "🌀",
  bomba_fumaca: "💨",
  fios_aco_ninja: "🧷",
  kunai_explosiva: "💣",
  corrente_ferro: "⛓️",
  esfera_explosiva: "🔮",
  pergaminho_arsenal_gasto: "📃",

  // Estados e navegacao
  sucesso: "✅",
  aviso: "⚠️",
  erro: "❌",
  bloqueio: "🔒",
  recibo: "🧾",
  saciedade: "🍙",
  mochila: "🎒",
  caravana: "🐫",
  tempo: "⏳",
  populacao: "🧑‍🤝‍🧑",
} as const;

export type EmojiKey = keyof typeof ECONOMY_EMOJI_PLACEHOLDERS;

// ---------------- Override da staff ----------------

// PREENCHA AQUI quando os emojis customizados existirem no servidor.
// Deixe vazio enquanto nao houver: placeholder Unicode e' o padrao.
const CUSTOM_EMOJIS: Partial<Record<EmojiKey, string>> = {};

// Override em tempo de execucao. Existe para o teste e para um futuro carregador
// de configuracao; o caminho normal continua sendo a constante acima.
const runtimeOverrides = new Map<EmojiKey, string>();

export function configureEconomyEmoji(key: EmojiKey, custom: string | null): void {
  if (custom === null) runtimeOverrides.delete(key);
  else runtimeOverrides.set(key, custom);
}

export function resetEconomyEmojis(): void {
  runtimeOverrides.clear();
}

// ---------------- Leitura ----------------

// Emoji de uma chave conhecida. Sempre devolve algo renderizavel.
export function emoji(key: EmojiKey): string {
  return runtimeOverrides.get(key) ?? CUSTOM_EMOJIS[key] ?? ECONOMY_EMOJI_PLACEHOLDERS[key];
}

export function isEmojiKey(value: string): value is EmojiKey {
  return Object.prototype.hasOwnProperty.call(ECONOMY_EMOJI_PLACEHOLDERS, value);
}

// Emoji de um item do catalogo. Cai no icone da CATEGORIA quando o item nao tem
// chave propria — nunca devolve vazio, entao um item novo aparece com cara de
// item em vez de sumir do painel.
export function itemEmoji(itemId: string): string {
  if (isEmojiKey(itemId)) return emoji(itemId);
  const categoria = getItem(itemId)?.category;
  return categoria ? ITEM_CATEGORY_ICONS[categoria] : ECONOMY_EMOJI_PLACEHOLDERS.estoque;
}

export function shopEmoji(shopType: string): string {
  const chave = `shop_${shopType}`;
  return isEmojiKey(chave) ? emoji(chave) : ECONOMY_EMOJI_PLACEHOLDERS.estoque;
}
