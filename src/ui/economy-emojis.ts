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

import { ITEM_CATEGORY_ICONS, getItem, type ItemCategory } from "../data/items.js";

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
  // Categorias de inventario
  categoria_armas: "⚔️",
  categoria_ferramentas: "🧰",
  categoria_consumiveis: "🧪",
  categoria_comidas: "🍙",
  categoria_materiais: "🧱",
  categoria_itens_importantes: "🔑",
  categoria_outros: "📦",

  // Navegacao e paineis gerais
  viagem: "🗺️",
  viajando: "🥾",
  grupo_vilas: "🏘️",
  mundo_aberto: "🌍",
  konoha: "🍃",
  suna: "🏜️",
  kiri: "🌫️",
  kumo: "☁️",
  iwagakure: "🪨",
  floresta_rio: "🌲",
  montanhas_caverna: "🏔️",
  campo_aberto: "🌄",
  deserto: "🏜️",
  combate: "⚔️",
  mapa: "🗺️",
  missoes: "📋",
  party: "👥",
  perfil: "📜",
  informacao: "ℹ️",
  pendente: "⬜",
  convite: "📨",
  sair_party: "🚪",
  lider_party: "👑",
  objetivo: "🧭",
  investigacao: "🔎",
  descoberta: "🧩",
  aparencia: "🎭",
} as const;

export type EmojiKey = keyof typeof ECONOMY_EMOJI_PLACEHOLDERS;

// ---------------- Override da staff ----------------

// PREENCHA AQUI quando os emojis customizados existirem no servidor.
// Deixe vazio enquanto nao houver: placeholder Unicode e' o padrao.
const CUSTOM_EMOJIS: Partial<Record<EmojiKey, string>> = {
  // Interface, estados e gestao
  ryo: "<:ryo:1538619371767726090>",
  cofre: "<:cofre:1538619349773066320>",
  vila: "<:vila:1538619390243905566>",
  kage: "<:kage:1538619358085914784>",
  estoque: "<:estoque:1538619353027715083>",
  obras: "<:obras:1538619362758361258>",
  impostos: "<:impostos:1538619355326185663>",
  relatorio: "<:relatorio:1538619370455179416>",
  producao: "<:producao:1538619367292674059>",
  ordem: "<:ordem:1538619364276969612>",
  manutencao: "<:manutencao:1538619359520497776>",
  aviso: "<:aviso:1538619323151818823>",
  erro: "<:erro:1538619351505174598>",
  bloqueio: "<:bloqueio:1538619331707928637>",
  sucesso: "<:sucesso:1538619385567125615>",
  recibo: "<:recibo:1538619368974319656>",
  mochila: "<:mochila:1538619361051414528>",
  saciedade: "<:saciedade:1538619373194059816>",
  caravana: "<:caravana:1538619333431922699>",
  tempo: "<:tempo:1538619387404091512>",
  populacao: "<:populacao:1538619365803560970>",

  // Lojas
  shop_MERCADO_GERAL: "<:shop_mercado_geral:1538619382157279333>",
  shop_EMPORIO: "<:shop_emporio:1538619375026831400>",
  shop_MARCENARIA: "<:shop_marcenaria:1538619380424773735>",
  shop_FUNDICAO: "<:shop_fundicao:1538619377023451327>",
  shop_ICHIRAKU: "<:shop_ichiraku:1538619378512175154>",
  shop_OFICINA_SELOS: "<:shop_oficina_selos:1538619383864234115>",

  // Categorias de inventario
  categoria_armas: "<:categoria_armas:1538619335809966201>",
  categoria_ferramentas: "<:categoria_ferramentas:1538619340998447225>",
  categoria_consumiveis: "<:categoria_consumiveis:1538619338662219818>",
  categoria_comidas: "<:categoria_comidas:1538619337584279713>",
  categoria_materiais: "<:categoria_materiais:1538619345146613841>",
  categoria_itens_importantes: "<:categoria_itens_importantes:1538619343070429334>",
  categoria_outros: "<:categoria_outros:1538619347260669987>",

  // Navegacao e paineis gerais
  viagem: "<:viagem:1538638598486626515>",
  viajando: "<:viajando:1538638599505973359>",
  grupo_vilas: "<:grupo_vilas:1538638576961458247>",
  mundo_aberto: "<:mundo_aberto:1538638592392298502>",
  konoha: "<:konoha:1538638584666529963>",
  suna: "<:suna:1538638596859367475>",
  kiri: "<:kiri:1538638582976356443>",
  kumo: "<:kumo:1538639194367463547>",
  iwagakure: "<:iwagakure:1538638581453688872>",
  floresta_rio: "<:floresta_rio:1538638575095259217>",
  montanhas_caverna: "<:montanhas_caverna:1538638590974754816>",
  campo_aberto: "<:campo_aberto:1538638570078736487>",
  deserto: "<:deserto:1538638573287514192>",
  combate: "<:combate:1538638571542675456>",
  mapa: "<:mapa:1538638588114116728>",
  missoes: "<:missoes:1538638589515145257>",
  party: "<:party:1538638593856245862>",
  perfil: "<:perfil:1538638595441827930>",
  informacao: "<:informacao:1538638579771637942>",
  pendente: "<:pendente:1538642322030596146>",
  convite: "<:convite:1538642318754848818>",
  sair_party: "<:sair_party:1538642323523641454>",
  lider_party: "<:lider_party:1538642320319062036>",
  objetivo: "<:objetivo:1538652720721035275>",
  investigacao: "<:investigacao:1538652718951043193>",
  descoberta: "<:descoberta:1538652717566787684>",
  aparencia: "<:aparencia:1538653836091072582>",
  // Madeira e derivados
  madeira: "<:madeira:1538182896613986314>",
  fibra_vegetal: "<:fibra_vegetal:1538182874216534027>",
  papel: "<:papel:1538182904734023792>",
  lenha: "<:lenha:1538182892616945774>",

  // Mineral
  pedra: "<:pedra:1538182907821039626>",
  minerio_ferro: "<:minerio_de_ferro:1538182899973496983>",
  carvao: "<:carvao:1538182940188483706>",
  argila: "<:argila:1538182930591912037>",

  // Natural e alimento cru
  agua_limpa: "<:agua_limpa:1538182929048539227>",
  carne_crua: "<:carne_crua:1538182938833846272>",
  peixe_cru: "<:peixe_cru:1538182912304746546>",
  fruta: "<:fruta:1538182878645457016>",
  grao: "<:grao:1538182881153654884>",
  couro: "<:couro:1538182944596697179>",
  erva_medicinal: "<:erva_medicinal:1538182867975143535>",

  // Processados
  lingote_ferro: "<:lingote_de_ferro:1538182894927880302>",
  aco: "<:aco:1538182927308038205>",
  polvora: "<:polvora:1538182917380116480>",
  tinta_de_selo: "<:tinta_de_selo:1538182925458087936>",

  // Raros
  minerio_raro: "<:minerio_raro:1538182901735358595>",
  madeira_reforcada: "<:madeira_reforcada:1538182898136653874>",

  // Equipamento
  kunai: "<:kunai:1538182886371627098>",
  shuriken: "<:shuriken:1538182921515438150>",
  senbon: "<:senbon:1538182920148230214>",
  papel_bomba: "<:papel_bomba:1538182906151968768>",
  katana: "<:katana:1538182882441568337>",
  lamina_chakra: "<:lamina_chakra:1538182890850885753>",
  pergaminho_arsenal: "<:pergaminho_ninja:1538182915379433574>",

  // ---- Fora da tabela da etapa 08 ----
  sal: "<:sal:1538182918785208321>",
  farinha: "<:farinha:1538182872991666186>",
  caldo: "<:caldo:1538182934538756096>",
  tempero: "<:tempero:1538182923792941086>",
  pao: "<:pao:1538182903375208548>",
  carne_cozida: "<:carne_cozida:1538182936795549707>",
  peixe_cozido: "<:peixe_cozido:1538182909742022737>",
  ensopado: "<:ensopado:1538182865802498108>",
  dango: "<:dango:1538182947159674901>",
  lamen: "<:lamen:1538182889378684938>",
  fuma_shuriken: "<:fuma_shuriken:1538182879916589077>",
  bomba_fumaca: "<:bomba_fumaa:1538182932529811517>",
  fios_aco_ninja: "<:fios_de_aco:1538182876741500958>",
  kunai_explosiva: "<:kunai_explosiva:1538182887881445446>",
  corrente_ferro: "<:corrente_ferro:1538182941744824330>",
  esfera_explosiva: "<:esfera_explosiva:1538182869313130526>",
  pergaminho_arsenal_gasto: "<:pergaminho_desgastado:1538182914246975508>",
};

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

const INVENTORY_CATEGORY_EMOJI: Record<ItemCategory, EmojiKey> = {
  WEAPON: "categoria_armas",
  NINJA_TOOL: "categoria_ferramentas",
  CONSUMABLE: "categoria_consumiveis",
  FOOD: "categoria_comidas",
  MATERIAL: "categoria_materiais",
  KEY_ITEM: "categoria_itens_importantes",
  OTHER: "categoria_outros",
};

/** Emoji estrutural para os grupos do /inventario; nao usa o icone de um item. */
export function inventoryCategoryEmoji(category: ItemCategory): string {
  return emoji(INVENTORY_CATEGORY_EMOJI[category]);
}

export function shopEmoji(shopType: string): string {
  const chave = `shop_${shopType}`;
  return isEmojiKey(chave) ? emoji(chave) : ECONOMY_EMOJI_PLACEHOLDERS.estoque;
}
