"use strict";

// Metadados visuais dos elementos (o servidor manda os dados; isto é só estética).
// FUNDAMENTOS não é um elemento de verdade (é a árvore de ninjutsu básico,
// pré-requisito) — por isso sempre aparece desbloqueada, ver buildElemBar.
const ELEMENTS = [
  { id: "FUNDAMENTOS", name: "Ninjutsu", icon: "", img: "/assets/icons/footer/ninjutsu.png", color: "#8a8a8a" },
  { id: "IRYO_NINJUTSU", name: "Iryō Ninjutsu", icon: "", img: "/assets/icons/footer/iryo-ninjutsu.png", color: "#57c99a" },
  { id: "BUKIJUTSU", name: "Bukijutsu", icon: "", img: "/assets/icons/footer/bukijutsu.png", color: "#b7a27a" },
  { id: "GENJUTSU", name: "Genjutsu", icon: "", img: "/assets/icons/footer/genjutsu.png", color: "#9b63c7" },
  { id: "TAIJUTSU_PASSIVAS", name: "Taijutsu", icon: "", img: "/assets/icons/footer/taijutsu-geral.png", color: "#d8794f" },
  { id: "ASSASSINATO_NINJA", name: "Assassinato Silencioso", icon: "", img: "/assets/icons/footer/assassinato-ninja.png", color: "#7f9ebf" },
  { id: "PUNHO_GENTIL", name: "Punho Gentil", icon: "", img: "/assets/icons/footer/punho-gentil.png", color: "#8abce8", clanGate: "hyuuga" },
  { id: "TAIJUTSU_AGITACAO", name: "Taijutsu de Agitação", icon: "", img: "/assets/icons/footer/taijutsu-agitacao.png", color: "#d67e58" },
  { id: "TAIJUTSU", name: "Punho Forte", icon: "", img: "/assets/icons/footer/taijutsu.png", color: "#d8794f" },
  { id: "ARHAT", name: "Punho Arhat", icon: "", img: "/assets/icons/footer/arhat.png", color: "#b8694f" },
  { id: "ADAMANTINO", name: "Punho Adamantino", icon: "", img: "/assets/icons/footer/adamantino.png", color: "#58b879" },
  { id: "FOGO", name: "Fogo", icon: "", img: "/assets/icons/footer/katon.png", color: "#e2492d" },
  { id: "AGUA", name: "Água", icon: "", img: "/assets/icons/footer/suiton.png", color: "#2b7fd4" },
  { id: "VENTO", name: "Vento", icon: "", img: "/assets/icons/footer/futon.png", color: "#2fa36b" },
  { id: "TERRA", name: "Terra", icon: "", img: "/assets/icons/footer/doton.png", color: "#c08a3a" },
  { id: "RAIO", name: "Raio", icon: "", img: "/assets/icons/footer/raiton.png", color: "#f0c419" },
  // Kekkei genkai.
  { id: "CRISTAL", name: "Cristal", icon: "", img: "/assets/icons/footer/cristal.png", color: "#e85fa6" },
  { id: "VAPOR", name: "Vapor", icon: "", img: "/assets/icons/footer/vapor.png", color: "#f0857a" },
  { id: "CALOR", name: "Calor", icon: "", img: "/assets/icons/footer/calor.png", color: "#d9662b" },
  { id: "LAVA", name: "Lava", icon: "", img: "/assets/icons/footer/lava.png", color: "#b23a1f" },
  { id: "EXPLOSAO", name: "Explosão", icon: "", img: "/assets/icons/footer/explosao.png", color: "#c9a227" },
  { id: "POEIRA", name: "Poeira", icon: "🌫️", img: "/assets/icons/footer/poeira.png", color: "#8a8577" },
  { id: "GELO", name: "Gelo", icon: "❄️", img: "/assets/icons/footer/gelo.png", color: "#a8d8e8" },
  // Árvores de clã (gate por clanId em vez de elemento — ver clanGate abaixo).
  // Ordem por vila, mesmo agrupamento de src/data/clans/index.ts.
  // ---- Konoha ----
  { id: "UCHIHA", name: "Uchiha", icon: "🔴", color: "#b83232", clanGate: "uchiha" },
  { id: "NARA", name: "Nara", icon: "🌑", color: "#5c5c7a", clanGate: "nara" },
  { id: "SENJU", name: "Senju", icon: "🌳", color: "#4f8a55", clanGate: "senju" },
  { id: "HYUUGA", name: "Hyuuga", icon: "👁️", color: "#c9d6e3", clanGate: "hyuuga" },
  { id: "AKIMICHI", name: "Akimichi", icon: "🍖", color: "#d98e3a", clanGate: "akimichi" },
  { id: "ABURAME", name: "Aburame", icon: "🪲", color: "#6f7a35", clanGate: "aburame" },
  { id: "INUZUKA", name: "Inuzuka", icon: "🐕", color: "#a8562e", clanGate: "inuzuka" },
  { id: "UZUMAKI", name: "Uzumaki", icon: "🌀", color: "#c8482f", clanGate: "uzumaki" },
  { id: "SARUTOBI", name: "Sarutobi", icon: "🐒", color: "#6b8e4e", clanGate: "sarutobi" },
  { id: "HATAKE", name: "Hatake", icon: "⚔️", color: "#a8a8b0", clanGate: "hatake" },
  { id: "YAMANAKA", name: "Yamanaka", icon: "🧠", color: "#c9a6d9", clanGate: "yamanaka" },
  // ---- Suna ----
  { id: "KAMAITACHI", name: "Kamaitachi", icon: "🌪️", color: "#8fae8f", clanGate: "kamaitachi" },
  // ---- Kiri ----
  { id: "HOSHIGAKI", name: "Hoshigaki", icon: "🦈", color: "#4a7d8c", clanGate: "hoshigaki" },
  { id: "HOZUKI", name: "Hozuki", icon: "💧", color: "#3a8fbf", clanGate: "hozuki" },
  { id: "KAGUYA", name: "Kaguya", icon: "🦴", color: "#d9d0c1", clanGate: "kaguya" },
  { id: "YUKI", name: "Yuki", icon: "❄️", color: "#a8d8e8", clanGate: "yuki" },
  // ---- Kumo ----
  { id: "CHINOIKE", name: "Chinoike", icon: "🩸", color: "#8c2f2f", clanGate: "chinoike" },
  { id: "RAIKAGE", name: "Raikage", icon: "⚡", color: "#f0c419", clanGate: "raikage" },
  // azul eletrico (nao o amarelo de Raio/Raikage): o Yotsuki e' cla de Raio,
  // mas pedido explicito pra diferenciar pelo azul do relampago.
  { id: "YOTSUKI", name: "Yotsuki", icon: "🐝", color: "#4fb8ff", clanGate: "yotsuki" },
  // ---- Iwa ----
  { id: "KAMIZURU", name: "Kamizuru", icon: "🐝", color: "#d9a441", clanGate: "kamizuru" },
  { id: "ONOKI", name: "Onoki", icon: "🗿", color: "#8a7a5a", clanGate: "onoki" },
  { id: "BAKUREI", name: "Bakurei", icon: "💥", color: "#c9a227", clanGate: "bakurei" },
];

// Compatibilidade para árvores que acabaram de ganhar arte enquanto o servidor
// de demonstração ainda está com o módulo antigo carregado em memória.
const NODE_IMAGE_FALLBACKS = {
  calor_raiz: "/assets/icons/calor/ebulicao-corporal.png",
  calor_disparo: "/assets/icons/calor/disparo-bolas-calor.png",
  calor_esfera: "/assets/icons/calor/esfera-calor.png",
  calor_ressecamento: "/assets/icons/calor/ressecamento.png",
  calor_assassinato: "/assets/icons/calor/assassinato-calor-extremo.png",
  calor_ondas_termicas: "/assets/icons/calor/ondas-termicas.png",
  calor_pele_rachada: "/assets/icons/calor/pele-rachada.png",
  calor_combustao_interna: "/assets/icons/calor/combustao-interna.png",
  lava_raiz: "/assets/icons/lava/nucleo-magmatico.png",
  lava_balas: "/assets/icons/lava/balas-de-lava.png",
  lava_solucao: "/assets/icons/lava/cobertura-de-lava.png",
  lava_calor_residual: "/assets/icons/lava/calor-residual.png",
  lava_rio: "/assets/icons/lava/rio-de-rochas-flamejantes.png",
  lava_crosta: "/assets/icons/lava/crosta-endurecida.png",
  lava_pele_basaltica: "/assets/icons/lava/pele-basaltica.png",
  lava_apice: "/assets/icons/lava/coracao-do-vulcao.png",
  lava_huaguo: "/assets/icons/lava/monte-huaguo.png",
  explosao_raiz: "/assets/icons/explosao/nucleo-detonante.png",
  explosao_defensiva: "/assets/icons/explosao/explosao-defensiva.png",
  explosao_cortina: "/assets/icons/explosao/cortina-de-fumaca.png",
  explosao_polvora: "/assets/icons/explosao/polvora-refinada.png",
  explosao_impacto: "/assets/icons/explosao/explosao-impacto.png",
  explosao_fragmentacao: "/assets/icons/explosao/fragmentacao.png",
  explosao_blindagem: "/assets/icons/explosao/blindagem-explosiva.png",
  explosao_apice: "/assets/icons/explosao/estilo-explosao-pleno.png",
  explosao_mina: "/assets/icons/explosao/punho-de-mina-terrestre.png",
  poeira_desprendimento: "/assets/icons/poeira/desprendimento-do-mundo-primitivo.png",
  poeira_raiz: "/assets/icons/poeira/nucleo-do-mundo-primitivo.png",
  poeira_pilar: "/assets/icons/poeira/desprendimento-do-mundo-primitivo-pilar.png",
  poeira_estilhaco: "/assets/icons/poeira/fragmentacao-progressiva.png",
  poeira_erosao: "/assets/icons/poeira/erosao-absoluta.png",
  poeira_conica: "/assets/icons/poeira/desprendimento-do-mundo-primitivo-conica.png",
  poeira_projeteis: "/assets/icons/poeira/desprendimento-do-mundo-primitivo-projeteis.png",
  poeira_apice: "/assets/icons/poeira/vazio-absoluto.png",
  gen_raiz: "/assets/icons/genjutsu/veu-da-mente.png",
  gen_raizes_obscuras: "/assets/icons/genjutsu/raizes-obscuras.png",
  gen_ecos_cativeiro: "/assets/icons/genjutsu/ecos-do-cativeiro.png",
  gen_arvore_assassina: "/assets/icons/genjutsu/aprisionamento-da-arvore-assassina.png",
  gen_interrogatorio: "/assets/icons/genjutsu/genjutsu-interrogatorio.png",
  gen_contra_genjutsu: "/assets/icons/genjutsu/contra-genjutsu.png",
  gen_substituicao_ilusoria: "/assets/icons/genjutsu/substituicao-ilusoria.png",
  gen_fluencia_ilusao: "/assets/icons/genjutsu/fluencia-da-ilusao.png",
  gen_penas_caidas: "/assets/icons/genjutsu/penas-caidas.png",
  gen_dominio_do_medo: "/assets/icons/genjutsu/dominio-do-medo.png",
  gen_dominio_mundo_obscuro: "/assets/icons/genjutsu/dominio-do-mundo-obscuro.png",
  gen_visao_inferno: "/assets/icons/genjutsu/ilusao-demoniaca-visao-do-inferno.png",
  agua_muralha: "/assets/icons/agua/muralha-de-agua.png",
  gelo_raiz: "/assets/icons/gelo/sangue-de-gelo.png",
  gelo_agulhas: "/assets/icons/gelo/agulhas-de-gelo.png",
  gelo_espelho: "/assets/icons/gelo/espelho-demoniaco-de-gelo-fino.png",
  gelo_domo: "/assets/icons/gelo/domo-de-iceberg.png",
  gelo_presenca: "/assets/icons/gelo/presenca-silenciosa.png",
  gelo_reflexos: "/assets/icons/gelo/reflexos-gelidos.png",
  gelo_chuva_agulhas: "/assets/icons/gelo/chuva-de-agulhas-geladas.png",
  gelo_apice: "/assets/icons/gelo/dominio-do-espelho-de-gelo.png",
  gelo_agulhas_mil: "/assets/icons/gelo/mil-agulhas-voadoras.png",
  yuki_raiz: "/assets/icons/yuki/controle-de-chakra-yuki.png",
  yuki_agua: "/assets/icons/yuki/dominio-suiton.png",
  yuki_hyoton: "/assets/icons/yuki/dominio-hyoton.png",
  yuki_prisao: "/assets/icons/yuki/prisao-persistente.png",
  yuki_dragao: "/assets/icons/yuki/dragao-ampliado.png",
  yuki_espelho_amplificado: "/assets/icons/yuki/espelho-amplificado.png",
  yuki_chuva_amplificada: "/assets/icons/yuki/nevasca-amplificada.png",
  sarutobi_raiz: "/assets/icons/sarutobi/legado-do-professor.png",
  sarutobi_katon: "/assets/icons/sarutobi/fogo-do-professor.png",
  sarutobi_futon: "/assets/icons/sarutobi/vento-que-aviva-as-chamas.png",
  sarutobi_raiton: "/assets/icons/sarutobi/trovao-certeiro.png",
  sarutobi_suiton: "/assets/icons/sarutobi/correnteza-perene.png",
  sarutobi_doton: "/assets/icons/sarutobi/muralha-do-professor.png",
  onoki_raiz: "/assets/icons/onoki/legado-do-tsuchikage.png",
  onoki_doton: "/assets/icons/onoki/dominio-doton.png",
  onoki_jinton: "/assets/icons/onoki/legado-do-jinton.png",
  onoki_peso_montanha: "/assets/icons/onoki/peso-da-montanha-verdadeira.png",
  onoki_particula_primordial: "/assets/icons/onoki/particula-primordial.png",
  yotsuki_raiz: "/assets/icons/yotsuki/vitalidade-yotsuki.png",
  yotsuki_raiton: "/assets/icons/yotsuki/dominio-raiton.png",
  yotsuki_esfera: "/assets/icons/yotsuki/reflexo-eletrico.png",
  yotsuki_armadura: "/assets/icons/yotsuki/armadura-economica.png",
  yotsuki_assassinato: "/assets/icons/yotsuki/corrente-amplificada.png",
  yotsuki_pilares: "/assets/icons/yotsuki/prisao-amplificada.png",
  yotsuki_kenjutsu_1: "/assets/icons/yotsuki/estilo-das-sete-laminas.png",
  yotsuki_kenjutsu_2: "/assets/icons/yotsuki/corte-fulminante.png",
  bakurei_raiz: "/assets/icons/bakurei/vigor-de-iwa.png",
  bakurei_doton: "/assets/icons/bakurei/dominio-doton-bakurei.png",
  bakurei_bakuton: "/assets/icons/bakurei/dominio-bakuton.png",
  bakurei_punho_rochoso: "/assets/icons/bakurei/punho-reforcado.png",
  bakurei_impacto: "/assets/icons/bakurei/onda-de-choque-ampliada.png",
  bakurei_dragao_terra: "/assets/icons/bakurei/projetil-ampliado.png",
  bakurei_cortina: "/assets/icons/bakurei/cortina-persistente.png",
  bakurei_cupula: "/assets/icons/bakurei/cupula-sufocante.png",
};

const ICON_ASSET_VERSION = "20260804-d";

function versionedIcon(path) {
  if (!path || !path.startsWith("/assets/icons/")) return path;
  return `${path}${path.includes("?") ? "&" : "?"}v=${ICON_ASSET_VERSION}`;
}

function nodeImage(node) {
  return versionedIcon(node.img || NODE_IMAGE_FALLBACKS[node.id]);
}

// Símbolos dos clãs na seleção inferior. Mantidos fora dos metadados de cada
// árvore para que árvores sem arquivo continuem usando seu ícone de reserva.
const CLAN_FOOTER_ICONS = {
  // ---- Konoha ----
  uchiha: "/assets/icons/uchiha/sharingan-3-tomoe.png",
  nara: "/assets/icons/footer/Nara_Symbol.png",
  senju: "/assets/icons/footer/Senju_Symbol.png",
  hyuuga: "/assets/icons/footer/Hyuga_symbol.png",
  akimichi: "/assets/icons/footer/Akimichi_Symbol.png",
  aburame: "/assets/icons/footer/Aburame_Symbol.png",
  inuzuka: "/assets/icons/footer/Inuzuka_Symbol.png",
  uzumaki: "/assets/icons/footer/Uzumaki_Symbol.png",
  sarutobi: "/assets/icons/footer/Sarutobi_Symbol.png",
  hatake: "/assets/icons/footer/Hatake_Symbol.png",
  yamanaka: "/assets/icons/footer/Yamanaka_Symbol.png",
  // ---- Suna ----
  kamaitachi: "/assets/icons/footer/Kamaitachi_Symbol.png",
  // ---- Kiri ----
  hoshigaki: "/assets/icons/footer/Hoshigaki_Symbol.png",
  hozuki: "/assets/icons/footer/Hozuki_Symbol.png",
  kaguya: "/assets/icons/footer/Kaguya_Symbol.png",
  yuki: "/assets/icons/footer/Yuki_Symbol.png",
  // ---- Kumo ----
  chinoike: "/assets/icons/footer/Chinoike_Symbol.png",
  raikage: "/assets/icons/footer/Raikage_Symbol.png",
  yotsuki: "/assets/icons/footer/yotsuki.png",
  // ---- Iwa ----
  kamizuru: "/assets/icons/footer/Kamiuru_Symbol.png",
  onoki: "/assets/icons/footer/onoki.png",
  bakurei: "/assets/icons/footer/bakurei.png",
};
// Rótulo de atributo pro chip de requisito extra (reqAttribute) no modal —
// mesmos rótulos de ATTRIBUTE_LABELS em src/config/enums.ts.
const ATTR_LABEL = {
  ninjutsu: "Ninjutsu",
  taijutsu: "Taijutsu",
  genjutsu: "Genjutsu",
  bukijutsu: "Bukijutsu",
  iryoNinjutsu: "Iryō Ninjutsu",
  fuinjutsu: "Fūinjutsu",
  kugutsu: "Kugutsu",
  senjutsu: "Senjutsu",
  dojutsu: "Dōjutsu",
  kenjutsu: "Kenjutsu",
};
// Toggle "Ver todas as árvores" (botão no topo): mostra toda árvore que
// existe no jogo (elementos, kekkei genkai e clãs), não só o que o
// personagem desbloqueou. As que ele não tem entram com classe `locked`
// (mesmo visual de nó bloqueado) — dá pra abrir e olhar os nós, só não dá
// pra comprar nada de fora do próprio clã/elemento (o servidor recusa).
let showAllTrees = false;
// Imagem de fundo por elemento (public/assets/bg). Ausente = sem imagem, só o gradiente.
const BG_ASSET_VERSION = "20260805-d";
const ELEMENT_BG = {
  FUNDAMENTOS: `url('/assets/bg/ninjutsu.png?v=${BG_ASSET_VERSION}')`,
  IRYO_NINJUTSU: `url('/assets/bg/iryo-ninjutsu.png?v=${BG_ASSET_VERSION}')`,
  BUKIJUTSU: `url('/assets/bg/bukijutsu.png?v=${BG_ASSET_VERSION}')`,
  GENJUTSU: `url('/assets/bg/genjutsu.png?v=${BG_ASSET_VERSION}')`,
  // taijutsu passiva (arvore central) + os 4 estilos de luta especificos
  TAIJUTSU_PASSIVAS: `url('/assets/bg/taijutsu.png?v=${BG_ASSET_VERSION}')`,
  TAIJUTSU: `url('/assets/bg/punho-forte.png?v=${BG_ASSET_VERSION}')`,
  ARHAT: `url('/assets/bg/punho-arhat.png?v=${BG_ASSET_VERSION}')`,
  ADAMANTINO: `url('/assets/bg/punho-adamantino.png?v=${BG_ASSET_VERSION}')`,
  TAIJUTSU_AGITACAO: `url('/assets/bg/taijutsu-agitacao.png?v=${BG_ASSET_VERSION}')`,
  ASSASSINATO_NINJA: `url('/assets/bg/assassinato-silencioso.png?v=${BG_ASSET_VERSION}')`,
  FOGO: `url('/assets/bg/fogo.png?v=${BG_ASSET_VERSION}')`,
  AGUA: `url('/assets/bg/agua.png?v=${BG_ASSET_VERSION}')`,
  VENTO: `url('/assets/bg/vento.png?v=${BG_ASSET_VERSION}')`,
  TERRA: `url('/assets/bg/terra.png?v=${BG_ASSET_VERSION}')`,
  RAIO: `url('/assets/bg/raio.png?v=${BG_ASSET_VERSION}')`,
  // kekkei genkai — antes sem fundo (caíam no "none"), a arte nova cobre todas.
  GELO: `url('/assets/bg/gelo.png?v=${BG_ASSET_VERSION}')`,
  CRISTAL: `url('/assets/bg/cristal.png?v=${BG_ASSET_VERSION}')`,
  VAPOR: `url('/assets/bg/vapor.png?v=${BG_ASSET_VERSION}')`,
  CALOR: `url('/assets/bg/calor.png?v=${BG_ASSET_VERSION}')`,
  LAVA: `url('/assets/bg/lava.png?v=${BG_ASSET_VERSION}')`,
  EXPLOSAO: `url('/assets/bg/explosao.png?v=${BG_ASSET_VERSION}')`,
  POEIRA: `url('/assets/bg/poeira.png?v=${BG_ASSET_VERSION}')`,
};
const CLAN_BG = `url('/assets/bg/clas-v2.webp?v=${BG_ASSET_VERSION}')`;
const CLAN_BACKGROUNDS = {
  UCHIHA: `url('/assets/bg/uchiha.png?v=${BG_ASSET_VERSION}')`,
  NARA: `url('/assets/bg/nara.png?v=${BG_ASSET_VERSION}')`,
  SENJU: `url('/assets/bg/senju.png?v=${BG_ASSET_VERSION}')`,
  HYUUGA: `url('/assets/bg/hyuuga.png?v=${BG_ASSET_VERSION}')`,
  AKIMICHI: `url('/assets/bg/akimichi.png?v=${BG_ASSET_VERSION}')`,
  ABURAME: `url('/assets/bg/aburame.png?v=${BG_ASSET_VERSION}')`,
  INUZUKA: `url('/assets/bg/inuzuka.png?v=${BG_ASSET_VERSION}')`,
  UZUMAKI: `url('/assets/bg/uzumaki.png?v=${BG_ASSET_VERSION}')`,
  SARUTOBI: `url('/assets/bg/sarutobi.png?v=${BG_ASSET_VERSION}')`,
  HATAKE: `url('/assets/bg/hatake.png?v=${BG_ASSET_VERSION}')`,
  YAMANAKA: `url('/assets/bg/yamanaka.png?v=${BG_ASSET_VERSION}')`,
  KAMAITACHI: `url('/assets/bg/kamaitachi.png?v=${BG_ASSET_VERSION}')`,
  HOSHIGAKI: `url('/assets/bg/hoshigaki.png?v=${BG_ASSET_VERSION}')`,
  HOZUKI: `url('/assets/bg/hozuki.png?v=${BG_ASSET_VERSION}')`,
  KAGUYA: `url('/assets/bg/kaguya.png?v=${BG_ASSET_VERSION}')`,
  YUKI: `url('/assets/bg/yuki.png?v=${BG_ASSET_VERSION}')`,
  CHINOIKE: `url('/assets/bg/chinoike.png?v=${BG_ASSET_VERSION}')`,
  RAIKAGE: `url('/assets/bg/raikage.png?v=${BG_ASSET_VERSION}')`,
  YOTSUKI: `url('/assets/bg/yotsuki.png?v=${BG_ASSET_VERSION}')`,
  KAMIZURU: `url('/assets/bg/kamizuru.png?v=${BG_ASSET_VERSION}')`,
  ONOKI: `url('/assets/bg/onoki.png?v=${BG_ASSET_VERSION}')`,
  BAKUREI: `url('/assets/bg/bakurei.png?v=${BG_ASSET_VERSION}')`,
};
// Glossário de efeitos: destaca o termo na descrição e explica no hover.
// A descrição vem do servidor como texto puro; o realce é feito aqui por regex,
// então basta escrever o nome do efeito na desc que ele vira link explicativo.
const GLOSSARY = [
  { re: "Inevitável", tip: "Inevitável: este ataque ignora todas as reações defensivas do alvo — Esquiva, Bloqueio e Aparo." },
  { re: "Queimadura(?:s)?", tip: "Queimadura: causa 8 de dano por rodada e reduz em 5% o dano de Taijutsu por acúmulo. Ao juntar 5 acúmulos, causa 40 de dano e os acúmulos são removidos." },
  { re: "Sangramento", tip: "Sangramento: o alvo perde 5 de vida por turno, recebe metade da cura e ainda perde 6 de vida sempre que usa um golpe físico." },
  { re: "Veneno", tip: "Veneno: causa 2 de dano por rodada, mais 1 por acúmulo adicional. Sua duração não pode passar de 5 rodadas." },
  // ATENCAO: alternativas da MAIS LONGA para a mais curta — a regex casa a primeira
  // que servir, entao "Atordoa" antes de "atordoado" cortaria a palavra no meio.
  { re: "Atordoamento|Atordoarem|Atordoar|atordoados|atordoado|Atordoam|Atordoa", tip: "Atordoamento: o alvo não pode agir nem se mover no turno. Perde a vez." },
  { re: "Encharcando|Encharcad[oa]s|Encharcad[oa]", tip: "Encharcado: o alvo está molhado. Com Nuvens de Tempestade, jutsus de Raio causam +75% de dano contra ele. Também serve de condutor para acertos em cadeia." },
  { re: "Fumaça", tip: "Fumaça: bloqueia a linha de visão de técnicas à distância quando fica entre o atacante e o alvo, mas não impede movimento nem ataques corpo a corpo." },
  { re: "Barreira", tip: "Barreira: escudo que absorve parte do dano recebido antes de descontar da sua vida." },
  { re: "Imobilização|preso(?:s)? ao chão", tip: "Imobilização: o alvo não consegue sair do lugar. Ainda pode atacar." },
  { re: "mais lento(?:s)?|Lentidão", tip: "Lentidão: o movimento do alvo cai pela metade." },
  { re: "Defesa reduzida|reduzindo a defesa|reduz a defesa", tip: "Defesa reduzida: o alvo perde 15% de chance de esquivar dos ataques." },
  { re: "não pode(?:m)? ser esquivad[oa](?:s)?", tip: "Não pode ser esquivado: ignora a reação de esquiva do alvo. O ataque sempre acerta." },
  { re: "Ignora Bloqueio e Aparo", tip: "Sem guarda: o alvo ainda pode tentar Esquivar, mas não pode reagir com Bloqueio nem Aparo." },
  { re: "bloque\\w* o Ninjutsu|Bloqueio de Ninjutsu", tip: "Bloqueio de Ninjutsu: o alvo não consegue usar jutsu de categoria Ninjutsu enquanto durar. Não drena chakra (isso seria Dreno de Chakra, outro efeito) — só tranca esse tipo de técnica." },
  { re: "Fuga bloqueada|não consegue fugir|sem poder fugir|não conseguem fugir", tip: "Fuga bloqueada: o alvo não pode usar a ação de fugir do combate enquanto o efeito durar." },
  { re: "Dreno de Chakra|perde 10% de chakra por turno|perder 10% de chakra por turno", tip: "Dreno de Chakra: remove 10% de chakra do alvo no início de cada turno enquanto durar." },
  { re: "Confuso|Confusão", tip: "Confusão: enquanto durar, o alvo confuso ataca alguém aleatório entre todos os vivos em vez de escolher — pode até acertar o próprio time." },
  { re: "Aceleração|Acelerado", tip: "Aceleração: concede +2 de movimento, +10 pontos percentuais de Esquiva e +25 pontos percentuais de chance de fuga. Quem acertar o portador corpo a corpo sofre 8 de dano." },
  { re: "Desarme", tip: "Desarme: o alvo derruba a arma equipada e precisa recuperá-la antes de voltar a usá-la." },
  // (?! de Cem Forças): "Sobrecarga de Cem Forças" e' o NOME de uma habilidade
  // do Punho Adamantino, nao o efeito — citar ela numa descricao nao deve virar
  // tooltip do efeito. Ver a mesma trava em "Colapso" no fim da lista.
  { re: "Sobrecarga(?! de Cem Forças)", tip: "Sobrecarga: aumenta temporariamente o dano. A força do aumento, as técnicas afetadas e a duração aparecem em Efeitos e regras." },
  // ---- exclusivo do clã Nara ----
  { re: "Vínculo de Sombra", tip: "Vínculo de Sombra: sem dano, mas o alvo não pode se mover nem reagir (Esquivar/Bloquear/Aparar) enquanto durar — o corpo dele copia o do usuário. Só uma Esquiva bem-sucedida ANTES do vínculo prender evita o efeito." },
  // ---- kekkei genkai: Cristal ----
  { re: "Cristalizado", tip: "Cristalizado: cristais cravados no corpo do alvo. Cada acúmulo tira 8% de esquiva e 1 de movimento, e não causa dano por turno. Ao juntar 4 acúmulos o cristal se fecha: o alvo é selado (Atordoamento + preso ao chão) e os acúmulos zeram." },
  { re: "selad[oa](?:s)?|selar", tip: "Selado: o casulo de cristal fechou. O alvo fica Atordoado 1 rodada e preso ao chão por 2." },
  { re: "Prisma", tip: "Prisma: casulo de luz sobre você. Corta 60% do dano de Ninjutsu recebido e devolve 30% do que barrou no atacante. Em troca, você fica imóvel e golpes físicos passam inteiros." },
  // ---- kekkei genkai: Vapor ----
  { re: "Corrosão", tip: "Corrosão: causa 5 de dano por rodada e remove 8 pontos de Barreira por acúmulo a cada rodada." },
  // ---- kekkei genkai: Calor ----
  { re: "Desidratação|Desidrata(?:d[oa])?(?:s)?", tip: "Desidratação: reduz em 15% todo o dano causado pelo alvo por acúmulo." },
  // ---- kekkei genkai: Lava ----
  { re: "Magma", tip: "Magma: causa 4 de dano por rodada. Ao juntar 4 acúmulos, eles são removidos e o alvo fica Imobilizado por 2 rodadas, sem Atordoamento." },
  { re: "endureceu|endurecer", tip: "Endureceu: o Magma acumulado fechou. O alvo fica preso no lugar (Imobilização), mas continua podendo agir." },
  // ---- kekkei genkai: Explosão ----
  { re: "Minado", tip: "Minado: não causa dano durante a contagem. Quando a duração termina, causa 20 de dano por acúmulo." },
  { re: "defletiu|redireciona(?:r)?", tip: "Explosão Defensiva: contra um projétil (arma arremessada), apara e devolve o golpe inteiro no atacante em vez de só reduzir o dano." },
  // ---- kekkei genkai: Poeira ----
  { re: "Desintegração", tip: "Desintegração: causa 6 de dano por rodada e remove 10 pontos de Barreira por acúmulo a cada rodada. Ao juntar 3 acúmulos, a Barreira restante é zerada de uma vez e o alvo fica com Defesa Reduzida." },
  // (?<!Palmada do ): "Palmada do Colapso" e' o NOME do jutsu raiz do Punho
  // Arhat, nao o efeito Colapso (que e' de Poeira). Sem essa trava, citar a
  // habilidade numa descricao virava tooltip do efeito errado.
  { re: "colapsou|(?<!Palmada do )colapso", tip: "Colapso: a Desintegração acumulada zerou toda a Barreira do alvo de uma vez e aplicou Defesa Reduzida." },
];
const GLOSSARY_RE = new RegExp("(" + GLOSSARY.map((g) => g.re).join("|") + ")", "gi");

const escHtml = (s) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// Envolve cada termo do glossário num <span> com tooltip. Uma passada só (regex
// combinada) para nunca reprocessar o HTML que acabou de ser inserido.
function highlightEffects(text) {
  return escHtml(text).replace(GLOSSARY_RE, (match) => {
    const entry = GLOSSARY.find((g) => new RegExp("^(?:" + g.re + ")$", "i").test(match));
    if (!entry) return match;
    return `<span class="fx" tabindex="0" data-tip="${escHtml(entry.tip)}">${match}</span>`;
  });
}

// Tooltip do glossário (.fx): um único elemento fixed reaproveitado, medido e
// reposicionado por JS a cada hover/foco — não dá pra centralizar isso só em
// CSS (::after) sem estourar a borda da tela quando a palavra tá perto da
// margem do modal. "Empurra" o balão pra dentro da viewport e vira a seta.
let fxTip = null;
function ensureFxTip() {
  if (!fxTip) {
    fxTip = document.createElement("div");
    fxTip.className = "fx-tip";
    fxTip.setAttribute("role", "tooltip");
    document.body.appendChild(fxTip);
  }
  return fxTip;
}
function showFxTip(el) {
  const tip = ensureFxTip();
  tip.textContent = el.dataset.tip || "";
  tip.classList.add("show");
  const margin = 10;
  const r = el.getBoundingClientRect();
  const tr = tip.getBoundingClientRect(); // já com texto certo, mas ainda no lugar antigo — só o tamanho importa aqui

  // horizontal: centraliza na palavra, depois empurra pra dentro da tela
  let left = r.left + r.width / 2 - tr.width / 2;
  left = Math.max(margin, Math.min(left, window.innerWidth - tr.width - margin));

  // vertical: prefere acima da palavra; sem espaço, desce pra baixo dela
  const above = r.top - tr.height - 9;
  const below = r.bottom + 9;
  const up = above >= margin;
  const top = up ? above : below;

  tip.style.left = left + "px";
  tip.style.top = top + "px";
  tip.classList.toggle("dir-up", up);
  tip.classList.toggle("dir-down", !up);

  // seta aponta pro centro da palavra, mas sem sair da caixa do balão
  const arrowLeft = Math.max(10, Math.min(r.left + r.width / 2 - left, tr.width - 10));
  tip.style.setProperty("--arrowLeft", arrowLeft + "px");
}
function hideFxTip() {
  if (fxTip) fxTip.classList.remove("show");
}
document.addEventListener("mouseover", (e) => {
  const fx = e.target.closest(".fx");
  if (fx) showFxTip(fx);
});
document.addEventListener("mouseout", (e) => {
  if (e.target.closest(".fx")) hideFxTip();
});
document.addEventListener("focusin", (e) => {
  const fx = e.target.closest(".fx");
  if (fx) showFxTip(fx);
});
document.addEventListener("focusout", (e) => {
  if (e.target.closest(".fx")) hideFxTip();
});

const glow = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},.5)`;
};

// Layout da árvore (coordenadas lógicas; o container escala).
// ROW_GAP dá espaço pro rótulo (até 2 linhas, ver .node .lbl no CSS) sem
// nunca alcançar o ícone da linha de baixo — nomes de clã podem ser longos
// ("Transformação Misturada da Besta Humana — Lobo de Três Cabeças"). A
// primeira tentativa (118, clamp 3) ainda deixava só ~10px de folga —
// pouco demais na prática. Agora sobra ~35px mesmo no pior caso.
// Escala do desenho da árvore (+20% sobre o original). Anda junto com o tamanho
// do nó e do rótulo no CSS (.node / .node .lbl): mudar só um lado desencontra o
// espaçamento dos ícones. Não tem relação com o fundo, que é dimensionado pela
// largura do palco.
const CENTER_X = 432, COL_GAP = 180, ROW_GAP = 158, TOP_PAD = 72, WIDTH = 864;

let state = null;      // resposta de /api/state
let activeEl = null;   // elemento em exibição
let modalNode = null;  // nó aberto no modal
let equipmentOpen = false;

const $ = (id) => document.getElementById(id);

async function fetchState() {
  const res = await fetch("/api/state", { credentials: "same-origin" });
  if (res.status === 401) return { authenticated: false };
  return res.json();
}

function show(screen) {
  for (const s of ["login", "nochar", "app"]) $(s).classList.toggle("hidden", s !== screen);
}

// Quais bolsas de atributo a árvore aberta consome, em ordem de peso (a que
// paga mais nós primeiro). Uma árvore pode misturar: o Hyuuga gasta Dōjutsu
// nos dois nós de olho e Taijutsu no resto.
function poolsOfTree(elId) {
  const nodes = (state && state.trees[elId]) || [];
  const count = {};
  for (const n of nodes) if (n.pool) count[n.pool] = (count[n.pool] || 0) + 1;
  return Object.keys(count).sort((a, b) => count[b] - count[a]);
}

// Ícone por atributo (TODO: substituir pelos ícones definitivos por atributo;
// por ora todos usam o mesmo ícone genérico de ninjutsu).
const POOL_ICON = { ninjutsu: "/assets/icons/header/ninjutsu.png" };
const poolIcon = (attr) => POOL_ICON[attr] || "/assets/icons/header/ninjutsu.png";

function updateTop(elId) {
  $("charName").textContent = state.char.name;
  $("charLevel").textContent = "Nv. " + state.char.level;
  // uma caixa por bolsa que a árvore aberta consome (uma só se ela usa um
  // atributo, várias se mistura — ex.: Hyuuga = Dōjutsu + Taijutsu).
  const box = $("charPointsBox");
  box.innerHTML = "";
  for (const attr of poolsOfTree(elId)) {
    const p = state.char.pools[attr];
    if (!p) continue;
    const div = document.createElement("div");
    div.className = "points";
    div.innerHTML =
      `<span class="pt-ico"><img class="pt-img" src="${poolIcon(attr)}" alt=""></span>` +
      `<span class="pt-cur">${p.left}</span><span class="pt-total"> / ${p.total}</span>` +
      `<span class="pt-lbl">${p.label}</span>`;
    box.appendChild(div);
  }
}

// Painel de dossiê (lateral): dados reais do personagem + progresso da árvore ativa.
function updateDossier(elId) {
  if (!state || !state.char) return;
  const c = state.char;
  $("dsName").textContent = c.name;
  $("dsClan").textContent = c.clanName || "Sem clã";
  $("dsLevel").textContent = "Nv. " + c.level;

  // técnicas = nós JUTSU possuídos em todas as árvores
  let techs = 0;
  for (const t of Object.values(state.trees)) {
    for (const n of t) if (n.status === "OWNED" && n.kind === "JUTSU") techs++;
  }
  $("dsTechs").textContent = techs;

  // naturezas de chakra (elementos possuídos)
  const nat = $("dsNatures");
  nat.innerHTML = "";
  if (!c.elements.length) {
    nat.innerHTML = '<span class="nature-empty">Nenhuma desperta</span>';
  } else {
    for (const id of c.elements) {
      const m = ELEMENTS.find((e) => e.id === id);
      if (!m) continue;
      const chip = document.createElement("span");
      chip.className = "nature-chip";
      chip.style.setProperty("--ec", m.color);
      const face = m.img ? `<img src="${m.img}" alt="">` : `<span class="nc-emoji">${m.icon}</span>`;
      chip.innerHTML = `${face}<span>${m.name}</span>`;
      nat.appendChild(chip);
    }
  }

  // uma barra POR bolsa que a árvore aberta consome. Árvore de pool único
  // (elementos, Nara, Aburame) mostra uma; as mistas (Hyuuga = Taijutsu +
  // Dōjutsu, Chinoike = 3) mostram uma pra cada, na mesma hierarquia visual —
  // sem isso o jogador não entende por que um nó está travado.
  const box = $("dsPools");
  box.innerHTML = "";
  for (const attr of poolsOfTree(elId)) {
    const p = c.pools[attr];
    if (!p) continue;
    const spentPct = p.total ? Math.min(100, Math.round((p.spent / p.total) * 100)) : 0;
    const block = document.createElement("div");
    block.className = "pool-row";
    block.innerHTML =
      `<span class="dossier-label">Pontos de ${p.label}</span>` +
      `<div class="meter"><div class="meter-fill" style="width:${spentPct}%"></div></div>` +
      `<span class="meter-cap">${p.left} livres · ${p.total} total</span>`;
    box.appendChild(block);
  }

  // progresso (domínio) da árvore ativa
  const meta = ELEMENTS.find((e) => e.id === elId);
  const nodes = state.trees[elId] || [];
  const owned = nodes.filter((n) => n.status === "OWNED").length;
  const total = nodes.length;
  const pct = total ? Math.round((owned / total) * 100) : 0;
  $("dsTreeName").textContent = (meta ? meta.name : elId) + " · domínio";
  const tb = $("dsTreeBar");
  tb.style.width = pct + "%";
  tb.style.background = meta ? meta.color : "var(--orange)";
  $("dsTreeCap").textContent = `${owned} / ${total} habilidades`;
}

// assinatura do estado p/ detectar mudança sem re-renderizar à toa
let lastSig = "";
const sigOf = (s) => JSON.stringify([s.char, s.trees]);

async function boot() {
  try {
    state = await fetchState();
  } catch {
    // Permite visualizar a tela de login mesmo quando o HTML está sendo
    // servido sem o backend/API do bot.
    return show("login");
  }
  if (!state.authenticated) return show("login");
  if (!state.hasChar) return show("nochar");
  show("app");
  buildElemBar();
  activeEl = state.char.elements[0] || "FUNDAMENTOS";
  renderTree(activeEl);
  lastSig = sigOf(state);
  startSync();
}

// Auto-refresh: puxa o estado do bot periodicamente e ao focar a aba. Assim,
// distribuir ninjutsu no /atributos (ou admin mexer) reflete no site sozinho.
function startSync() {
  setInterval(pull, 5000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) pull(); });
  window.addEventListener("focus", pull);
}

async function pull() {
  let ns;
  try { ns = await fetchState(); } catch { return; }
  if (!ns || !ns.authenticated) { location.reload(); return; } // sessão caiu
  if (!ns.hasChar) return;
  const g = sigOf(ns);
  if (g === lastSig) return; // nada mudou
  state = ns;
  lastSig = g;
  buildElemBar();       // elementos podem ter sido concedidos
  if (equipmentOpen) renderEquipmentPage();
  else renderTree(activeEl); // mantém o elemento aberto, atualiza status/pontos/topo
}

function equipmentAbilityHtml(ability, command) {
  if (!ability) return "";
  const action = actionLabel(ability);
  const damage = ability.baseDamage
    ? `<span>Dano base: <b>${ability.baseDamage}</b></span>`
    : "";
  return `<div class="equipment-ability">
    <div class="equipment-ability-head"><code>${escHtml(command)}</code><strong>${escHtml(ability.name)}</strong></div>
    <div class="equipment-stats">
      <span>${escHtml(CAT_LABEL[ability.category] || ability.category)}</span>
      <span>${escHtml(action)}</span>
      <span>${escHtml(areaText(ability))}</span>
      <span>${escHtml(RES_LABEL[ability.resource] || ability.resource)}: <b>${ability.cost}%</b></span>
      ${damage}
    </div>
    <p>${highlightEffects(ability.mechanics || ability.description)}</p>
  </div>`;
}

function renderEquipmentPage() {
  const catalog = state && state.equipment;
  if (!catalog) return;
  $("equipmentQuickStart").innerHTML =
    `<div class="equipment-section-title"><span>🥷</span><div><small>Primeiros passos</small><h2>Fluxo rápido</h2></div></div>` +
    `<ol>${catalog.quickStart.map((step) => `<li>${escHtml(step)}</li>`).join("")}</ol>`;
  $("equipmentCommands").innerHTML = catalog.commandGroups.map((group) =>
    `<section class="command-group">
      <div class="equipment-section-title"><span>${group.icon}</span><div><small>Comandos básicos</small><h2>${escHtml(group.title)}</h2></div></div>
      <div class="command-grid">${group.commands.map((entry) =>
        `<article><code>${escHtml(entry.command)}</code><p>${escHtml(entry.description)}</p></article>`
      ).join("")}</div>
    </section>`
  ).join("");

  $("equipmentUnarmed").innerHTML =
    `<div class="equipment-section-title"><span>👊</span><div><small>Sem arma equipada</small><h2>Ataque desarmado</h2></div></div>` +
    equipmentAbilityHtml(catalog.unarmedAttack, "/atacar alvo");

  $("equipmentGroups").innerHTML = catalog.categories.flatMap((category) => {
    const items = catalog.items.filter((item) => item.category === category.id);
    if (!items.length) return [];
    const cards = items.map((item) => {
      const actions = item.actions.map((action) => `<span>${escHtml(action.label)}</span>`).join("");
      const basicCommand = item.id === "kunai" ? "/atacar alvo" : `/usar ${item.id}`;
      return `<article class="equipment-card">
        <div class="equipment-card-head">
          <div><small>${escHtml(category.label)}</small><h3>${escHtml(item.name)}</h3></div>
          <div class="equipment-actions">${actions}</div>
        </div>
        <p class="equipment-description">${escHtml(item.description)}</p>
        ${item.specialRule ? `<p class="equipment-special">${escHtml(item.specialRule)}</p>` : ""}
        ${equipmentAbilityHtml(item.basicAbility, basicCommand)}
        ${equipmentAbilityHtml(item.throwAbility, `/arremessar ${item.id} alvo`)}
      </article>`;
    }).join("");
    return [`<section class="equipment-group">
      <div class="equipment-section-title"><span>${category.icon}</span><div><small>Categoria</small><h2>${escHtml(category.label)}</h2></div></div>
      <div class="equipment-grid">${cards}</div>
    </section>`];
  }).join("");
}

function setEquipmentOpen(open) {
  equipmentOpen = open;
  $("equipmentPage").classList.toggle("hidden", !open);
  document.querySelector(".workspace").classList.toggle("hidden", open);
  $("elembar").classList.toggle("hidden", open);
  $("equipmentBtn").classList.toggle("active", open);
  $("charPointsBox").classList.toggle("hidden", open);
  if (open) renderEquipmentPage();
}

function buildElemBar() {
  const bar = $("elembar");
  bar.innerHTML = "";
  for (const e of ELEMENTS) {
    // Punho Gentil continua bloqueado para quem não é Hyuuga, mas fica visível
    // no footer para que a especialização seja encontrável e o requisito fique claro.
    const alwaysVisible = e.id === "PUNHO_GENTIL";
    // So aparece o que o personagem tem. FUNDAMENTOS (Ninjutsu) e' sempre
    // desbloqueado; elemento/kekkei genkai que ele nao possui nem aparece;
    // arvore de cla (clanGate) so aparece pra quem e' daquele cla — OU pra
    // quem ja possui algum no' dela (ex: /admin desbloquear-tudo concede
    // todo no' de todo cla sem trocar o clanId do personagem).
    const unlocked =
      e.id === "FUNDAMENTOS" ||
      e.id === "BUKIJUTSU" || e.id === "IRYO_NINJUTSU" || e.id === "GENJUTSU" || e.id === "TAIJUTSU_PASSIVAS" || e.id === "ASSASSINATO_NINJA" || e.id === "TAIJUTSU_AGITACAO" || e.id === "TAIJUTSU" || e.id === "ARHAT" || e.id === "ADAMANTINO" ||
      (e.clanGate
        ? state.char.clanId === e.clanGate || (state.trees[e.id] || []).some((n) => n.status === "OWNED")
        : state.char.elements.includes(e.id));
    if (!unlocked && !showAllTrees && !alwaysVisible) continue;
    const div = document.createElement("div");
    div.className = "elem" + (!unlocked ? " locked" : "");
    div.style.setProperty("--ec", e.color);
    div.style.setProperty("--ecg", glow(e.color));
    const iconImage = versionedIcon(e.img || (e.clanGate ? CLAN_FOOTER_ICONS[e.clanGate] : undefined));
    const eface = iconImage
      ? `<img class="e-img" src="${iconImage}" alt="" loading="lazy">`
      : e.icon;
    div.innerHTML = `<div class="e-ico">${eface}</div><div class="e-name">${e.name}</div>`;
    div.onclick = () => {
      setEquipmentOpen(false);
      activeEl = e.id;
      renderTree(e.id);
    };
    div.dataset.el = e.id;
    bar.appendChild(div);
  }
}

function actionLabel(ability) {
  const labels = { COMUM: "Ação comum", BONUS: "Ação bônus", MOVIMENTO: "Ação de movimento", REACAO: "Reação" };
  const primary = labels[ability.actionType] || ability.actionType;
  const extra = ability.additionalActionType && (labels[ability.additionalActionType] || ability.additionalActionType);
  return extra ? `${primary} + ${extra}` : primary;
}

function renderTree(elId) {
  const meta = ELEMENTS.find((e) => e.id === elId);
  const nodes = state.trees[elId] || [];
  const ownedIds = new Set(nodes.filter((n) => n.status === "OWNED").map((n) => n.id));
  $("copyArsenalBtn").classList.toggle("hidden", elId !== "UCHIHA");

  // marca ativo na barra
  document.querySelectorAll(".elem").forEach((d) => d.classList.toggle("active", d.dataset.el === elId));
  updateTop(elId);
  updateDossier(elId);

  // título + variáveis de cor
  const title = $("treeTitle");
  title.textContent = meta.name;
  const wrap = $("canvasWrap");
  const stage = document.querySelector(".stage");
  for (const el of [title, wrap, stage]) {
    if (!el) continue;
    el.style.setProperty("--el", meta.color);
    el.style.setProperty("--elGlow", glow(meta.color));
  }
  if (stage) {
    const isClanTree = Boolean(meta?.clanGate);
    stage.style.setProperty("--elBg", ELEMENT_BG[elId] || CLAN_BACKGROUNDS[elId] || (isClanTree ? CLAN_BG : "none"));
    // Padrão único para toda árvore. A arte já é desenhada escura, com o centro
    // quase preto e o personagem na margem direita, então não precisa apanhar de
    // opacidade pra árvore continuar legível — os nós ficam sobre o preto.
    stage.style.setProperty("--elBgOpacity", ".62");
    // Fundos panorâmicos usam sempre a largura do palco como referência. O
    // antigo `cover` recalculava o zoom conforme a altura de cada árvore.
    stage.style.setProperty("--elBgSize", "100% auto");
    // A arte de cada clã já carrega sua própria paleta. Tingir com uma cor de
    // fundo preenchia também as áreas escuras e criava um véu claro no palco.
    stage.style.setProperty("--elBgTint", "transparent");
    stage.style.setProperty("--elBgBlend", "normal");
  }

  // A árvore geral de Taijutsu usa coordenadas com pequenos deslocamentos
  // laterais para desenhar ramos. No eixo vertical, porém, cada degrau precisa
  // de uma linha inteira: isso impede que ícone e rótulo de nós vizinhos se
  // misturem visualmente.
  const layoutRow = (n) => elId === "TAIJUTSU_PASSIVAS" ? Math.round(n.row) : n.row;
  const maxRow = nodes.reduce((m, n) => Math.max(m, layoutRow(n)), 0);
  const height = TOP_PAD + maxRow * ROW_GAP + 110;
  // A coluna é a do arquivo de dados. O desenho de cada árvore é escrito à mão
  // lá e é isso que dá a leitura de tronco central com ramos simétricos; calcular
  // posição a partir dos `requires` desmanchava esse desenho. Coluna 0 fica no
  // meio do palco, sob o título.
  const alcance = nodes.reduce((m, n) => Math.max(m, Math.abs(n.col)), 0);
  const treeWidth = Math.max(WIDTH, alcance * 2 * COL_GAP + 240);
  wrap.style.width = treeWidth + "px";
  wrap.style.height = height + "px";
  // Árvore mais larga que o palco não pode ser centralizada pelo `margin:auto`,
  // e abriria encostada na esquerda, com a raiz fora do eixo do título. Abre
  // rolada até o meio, mostrando o mesmo tanto dos dois lados.
  const rolagem = document.querySelector(".stage-scroll");
  if (rolagem) rolagem.scrollLeft = Math.max(0, (treeWidth - rolagem.clientWidth) / 2);

  const pos = (n) => ({ x: treeWidth / 2 + n.col * COL_GAP, y: TOP_PAD + layoutRow(n) * ROW_GAP });
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));

  // arestas: linha reta (galho ligando pai -> filho) — mesmo estilo das árvores
  // elementais. Quando pai e filho ficam em colunas diferentes (ramificação de
  // clã), em vez de uma diagonal usa duas linhas retas com uma curva de 90°
  // (desce reto até a altura do filho, depois vira pro lado) — mesma leitura
  // ortogonal das árvores sem ramo, só que com um cotovelo no meio.
  const svg = $("edges");
  svg.setAttribute("viewBox", `0 0 ${treeWidth} ${height}`);
  let edges = "";
  for (const n of nodes) {
    const a = pos(n);
    for (const req of n.requires) {
      const p = byId[req];
      if (!p) continue;
      const b = pos(p);
      const on = ownedIds.has(n.id) && ownedIds.has(req) ? " on" : "";
      const d =
        b.x === a.x
          ? `M${b.x},${b.y} L${a.x},${a.y}`
          : `M${b.x},${b.y} L${b.x},${a.y} L${a.x},${a.y}`;
      edges += `<path class="edge${on}" d="${d}"/>`;
    }
  }
  svg.innerHTML = edges;

  // bolinhas
  const cont = $("nodes");
  cont.innerHTML = "";
  for (const n of nodes) {
    const { x, y } = pos(n);
    const div = document.createElement("div");
    const kind = n.kind === "PASSIVE" ? "passive" : "";
    const st = n.status.toLowerCase();
    div.className = `node ${kind} ${st}`;
    div.style.left = x + "px";
    div.style.top = y + "px";
    div.tabIndex = 0;
    div.setAttribute("role", "button");
    div.setAttribute("aria-label", `${n.name}${n.rank ? " (rank " + n.rank + ")" : ""}`);
    const badge = n.rank ? `<span class="badge r-${n.rank}">${n.rank}</span>` : "";
    const image = nodeImage(n);
    const face = image
      ? `<img class="emoji-img" src="${image}" alt="" loading="lazy">`
      : `<span class="emoji">${n.icon}</span>`;
    div.innerHTML = `${face}${badge}<span class="lbl">${n.name}</span>`;
    div.onclick = () => openModal(n);
    div.onkeydown = (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); openModal(n); } };
    cont.appendChild(div);
  }
}

function openCopyArsenal() {
  const list = $("copyArsenalList");
  const copied = state.copiedJutsus || [];
  if (!copied.length) {
    list.innerHTML = '<div class="copy-arsenal-empty">Nenhuma técnica copiada ainda. Ative o Sharingan de três tomoe e observe um Ninjutsu elemental elegível em combate.</div>';
  } else {
    list.innerHTML = copied.map((j) => {
      const category = CAT_LABEL[j.category] || j.category;
      const resource = RES_LABEL[j.resource] || j.resource;
      return `<article class="copy-arsenal-item">
        <h3>${j.name}</h3>
        <div class="copy-arsenal-tags"><span>${category}</span><span>${j.element || "Sem elemento"}</span><span>${resource}: ${j.cost}%</span></div>
        <p>${j.description || ""}</p>
        ${j.mechanics ? `<p><b>Efeitos:</b> ${j.mechanics}</p>` : ""}
      </article>`;
    }).join("");
  }
  $("copyArsenalModal").classList.remove("hidden");
}

function closeCopyArsenal() {
  $("copyArsenalModal").classList.add("hidden");
}

// 1 casa do grid ≈ 1,5 m (escala tática usada só p/ exibir alcance no site).
const METERS_PER_CELL = 1.5;
const CAT_LABEL = { NINJUTSU: "Ninjutsu", TAIJUTSU: "Taijutsu", BUKIJUTSU: "Bukijutsu",
  KENJUTSU: "Kenjutsu", DOJUTSU: "Dojutsu", IRYO_NINJUTSU: "Iryō Ninjutsu", GENJUTSU: "Genjutsu", CLA: "Técnica de Clã" };
const ACT_LABEL = { COMUM: "Ação comum", BONUS: "Ação bônus", REACAO: "Reação" };
const RES_LABEL = { chakra: "Chakra", energia: "Energia" };

// Descreve o formato de área + alcance de um jutsu, em metros.
function areaText(c) {
  const raw = c.range * METERS_PER_CELL;
  const m = (Number.isInteger(raw) ? raw : raw.toFixed(1)).toString().replace(".", ",");
  switch (c.shape) {
    case "MELEE": return "Corpo a corpo (adjacente)";
    case "SELF": return "Em si mesmo";
    case "ALLY": return `Aliado · até ${m} m`;
    case "SINGLE_TARGET": return `Alvo único · até ${m} m`;
    case "LINE": return `Linha reta · ${m} m`;
    case "CONE": return `Cone de 90° · ${m} m`;
    case "RADIUS": return `Explosão em área · raio ${m} m`;
    case "GLOBAL_OR_SCENARIO": return "Campo de batalha inteiro";
    default: return `${m} m`;
  }
}

function openModal(n) {
  modalNode = n;
  const mIcon = $("mIcon");
  const image = nodeImage(n);
  mIcon.innerHTML = image
    ? `<img class="modal-img" src="${image}" alt="">`
    : n.icon;
  $("mName").textContent = n.name;
  const narrative = n.kind === "JUTSU"
    ? escHtml(n.visualDescription || "Uma técnica ninja executada com precisão.")
    : highlightEffects(n.desc);
  const mangekyoVariant = n.id === "uchiha_mangekyo_sharingan" && state.char.mangekyoVariant
    ? `<span class="mechanics-title">Variação recebida</span><span class="mechanics-text"><b>${escHtml(state.char.mangekyoVariant)}</b></span>`
    : "";
  $("mDesc").innerHTML =
    narrative +
    mangekyoVariant +
    (n.mechanics
      ? `<span class="mechanics-title">Efeitos e regras</span><span class="mechanics-text">${highlightEffects(n.mechanics)}</span>`
      : "");
  const rank = $("mRank");
  const kindLabel = n.kind === "ELEMENT" ? "Sorteio de Elemento" : "";
  if (n.rank) { rank.textContent = "Rank " + n.rank; rank.classList.remove("hidden"); }
  else { rank.textContent = kindLabel; rank.classList.toggle("hidden", !kindLabel); }

  const chip = (label, val) => `<span>${label}: <b>${val}</b></span>`;
  let meta = "";
  const c = n.combat;
  if (c) {
    meta += `<span class="meta-h">Em combate</span>`;
    meta += chip("Tipo", CAT_LABEL[c.category] || c.category);
    meta += chip("Ação", actionLabel(c));
    meta += chip("Alcance", areaText(c));
    meta += chip(RES_LABEL[c.resource] || c.resource, c.cost + "%");
    if (c.baseDamage) meta += chip("Dano base", c.baseDamage);
    if (c.baseHeal) meta += chip("Cura base", c.baseHeal);
  }
  meta += `<span class="meta-h">Para aprender</span>`;
  // o custo sai da bolsa do atributo que paga o nó — deixa explícito QUAL.
  const poolLabel = (state.char.pools[n.pool] && state.char.pools[n.pool].label) || ATTR_LABEL[n.pool] || n.pool;
  meta += chip(`Pontos de ${poolLabel}`, n.cost);
  meta += chip("Nível", n.reqLevel);
  // gate cruzado (atributo diferente do que paga) — hoje nenhum nó usa
  if (n.reqAttribute) {
    meta += chip(ATTR_LABEL[n.reqAttribute.attribute] || n.reqAttribute.attribute, n.reqAttribute.value);
  }
  meta += chip(poolLabel, n.effectiveReqPool ?? n.reqPool);
  $("mMeta").innerHTML = meta;

  const reason = $("mReason");
  const buy = $("mBuy");
  if (n.status === "OWNED") {
    reason.textContent = "✓ Você já domina esta técnica.";
    reason.classList.remove("hidden");
    buy.classList.add("hidden");
  } else if (n.status === "BUYABLE") {
    reason.classList.add("hidden");
    buy.classList.remove("hidden");
    buy.disabled = false;
    buy.textContent = `Comprar · ${n.cost} pts`;
  } else {
    reason.textContent = n.reason || "Requisitos não atendidos.";
    reason.classList.remove("hidden");
    buy.classList.remove("hidden");
    buy.disabled = true;
    buy.textContent = "Bloqueado";
  }
  $("modal").classList.remove("hidden");
}

function closeModal() {
  $("modal").classList.add("hidden");
  modalNode = null;
}

async function doBuy() {
  if (!modalNode) return;
  const buy = $("mBuy");
  buy.disabled = true;
  buy.textContent = "Comprando…";
  try {
    const res = await fetch("/api/buy", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodeId: modalNode.id }),
    });
    const out = await res.json();
    if (!out.ok) {
      toast(out.error || "Não foi possível comprar.", true);
      // ressincroniza (estado pode ter mudado)
      state = await fetchState();
      lastSig = sigOf(state);
      renderTree(activeEl);
      closeModal();
      return;
    }
    const elName = out.grantedElement && ELEMENTS.find((e) => e.id === out.grantedElement)?.name;
    const elName2 = out.grantedElement2 && ELEMENTS.find((e) => e.id === out.grantedElement2)?.name;
    const kkgName = out.grantedKekkeiGenkai && ELEMENTS.find((e) => e.id === out.grantedKekkeiGenkai)?.name;
    toast(
      kkgName
        ? `Kekkei Genkai fundido: ${kkgName}! 🌟`
        : out.grantedMangekyoVariant
          ? `${out.grantedMangekyoVariant} despertou! 👁️`
          : elName2
            ? `Elementos sorteados: ${elName} e ${elName2}! 🎴`
            : elName
              ? `Elemento sorteado: ${elName}! 🎴`
              : `Desbloqueado: ${modalNode.name}!`,
    );
    closeModal();
    // recarrega o estado autoritativo e re-renderiza
    state = await fetchState();
    lastSig = sigOf(state);
    renderTree(activeEl);
  } catch {
    toast("Erro de rede.", true);
    buy.disabled = false;
  }
}

let toastTimer = null;
function toast(msg, err) {
  const t = $("toast");
  t.textContent = msg;
  t.className = "toast" + (err ? " err" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), 2600);
}

// listeners
$("mCancel").onclick = closeModal;
$("mBuy").onclick = doBuy;
$("modal").onclick = (e) => { if (e.target.id === "modal") closeModal(); };
$("copyArsenalBtn").onclick = openCopyArsenal;
$("copyArsenalClose").onclick = closeCopyArsenal;
$("copyArsenalModal").onclick = (e) => { if (e.target.id === "copyArsenalModal") closeCopyArsenal(); };
$("logoutBtn").onclick = async () => {
  await fetch("/auth/logout", { method: "POST", credentials: "same-origin" });
  location.reload();
};
$("showAllBtn").onclick = () => {
  showAllTrees = !showAllTrees;
  $("showAllBtn").classList.toggle("active", showAllTrees);
  buildElemBar();
};
$("equipmentBtn").onclick = () => setEquipmentOpen(!equipmentOpen);

boot();
