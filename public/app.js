"use strict";

// Metadados visuais dos elementos (o servidor manda os dados; isto é só estética).
// FUNDAMENTOS não é um elemento de verdade (é a árvore de ninjutsu básico,
// pré-requisito) — por isso sempre aparece desbloqueada, ver buildElemBar.
const ELEMENTS = [
  { id: "FUNDAMENTOS", name: "Ninjutsu", icon: "", img: "/assets/icons/footer/ninjutsu.png", color: "#8a8a8a" },
  { id: "IRYO_NINJUTSU", name: "Iryō Ninjutsu", icon: "", img: "/assets/icons/footer/iryo-ninjutsu.png", color: "#57c99a" },
  { id: "BUKIJUTSU", name: "Bukijutsu", icon: "", img: "/assets/icons/footer/bukijutsu.png", color: "#b7a27a" },
  { id: "GENJUTSU", name: "Genjutsu", icon: "", img: "/assets/icons/footer/genjutsu.png", color: "#9b63c7" },
  { id: "FUINJUTSU", name: "Fuinjutsu", icon: "", img: "/assets/icons/footer/fuinjutsu.png", color: "#d6a13d" },
  { id: "KUGUTSU", name: "Kugutsu", icon: "🪆", img: "/assets/icons/kugutsu/marionete.png", color: "#a76545" },
  { id: "TAIJUTSU_PASSIVAS", name: "Taijutsu", icon: "", img: "/assets/icons/footer/taijutsu-geral.png", color: "#d8794f" },
  { id: "ASSASSINATO_NINJA", name: "Assassinato Silencioso", icon: "", img: "/assets/icons/footer/assassinato-ninja.png", color: "#7f9ebf" },
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
  // ---- Konohagakure ----
  { id: "UCHIHA", name: "Uchiha", icon: "🔴", color: "#b83232", clanGate: "uchiha" },
  { id: "NARA", name: "Nara", icon: "🌑", color: "#5c5c7a", clanGate: "nara" },
  { id: "SENJU", name: "Senju", icon: "🌳", color: "#4f8a55", clanGate: "senju" },
  { id: "HYUUGA", name: "Hyuuga", icon: "👁️", color: "#c9d6e3", clanGate: "hyuuga" },
  { id: "LEE", name: "Lee", icon: "", color: "#68a83e", clanGate: "lee" },
  { id: "AKIMICHI", name: "Akimichi", icon: "🍖", color: "#d98e3a", clanGate: "akimichi" },
  { id: "ABURAME", name: "Aburame", icon: "🪲", color: "#6f7a35", clanGate: "aburame" },
  { id: "INUZUKA", name: "Inuzuka", icon: "🐕", color: "#a8562e", clanGate: "inuzuka" },
  { id: "UZUMAKI", name: "Uzumaki", icon: "🌀", color: "#c8482f", clanGate: "uzumaki" },
  { id: "SARUTOBI", name: "Sarutobi", icon: "🐒", color: "#6b8e4e", clanGate: "sarutobi" },
  { id: "HATAKE", name: "Hatake", icon: "⚔️", color: "#a8a8b0", clanGate: "hatake" },
  { id: "YAMANAKA", name: "Yamanaka", icon: "🧠", color: "#c9a6d9", clanGate: "yamanaka" },
  // ---- Sunagakure ----
  { id: "KAMAITACHI", name: "Kamaitachi", icon: "🌪️", color: "#8fae8f", clanGate: "kamaitachi" },
  // ---- Kirigakure ----
  { id: "HOSHIGAKI", name: "Hoshigaki", icon: "🦈", color: "#4a7d8c", clanGate: "hoshigaki" },
  { id: "HOZUKI", name: "Hozuki", icon: "💧", color: "#3a8fbf", clanGate: "hozuki" },
  { id: "KAGUYA", name: "Kaguya", icon: "🦴", color: "#d9d0c1", clanGate: "kaguya" },
  { id: "YUKI", name: "Yuki", icon: "❄️", color: "#a8d8e8", clanGate: "yuki" },
  // ---- Kumogakure ----
  { id: "CHINOIKE", name: "Chinoike", icon: "🩸", color: "#8c2f2f", clanGate: "chinoike" },
  { id: "RAIKAGE", name: "Raikage", icon: "⚡", color: "#f0c419", clanGate: "raikage" },
  // azul eletrico (nao o amarelo de Raio/Raikage): o Yotsuki e' cla de Raio,
  // mas pedido explicito pra diferenciar pelo azul do relampago.
  { id: "YOTSUKI", name: "Yotsuki", icon: "🐝", color: "#4fb8ff", clanGate: "yotsuki" },
  // ---- Iwagakure ----
  { id: "KAMIZURU", name: "Kamizuru", icon: "🐝", color: "#d9a441", clanGate: "kamizuru" },
  { id: "ONOKI", name: "Onoki", icon: "🗿", color: "#8a7a5a", clanGate: "onoki" },
  { id: "BAKUREI", name: "Bakurei", icon: "💥", color: "#c9a227", clanGate: "bakurei" },
];

// Compatibilidade para árvores que acabaram de ganhar arte enquanto o servidor
// de demonstração ainda está com o módulo antigo carregado em memória.
const NODE_IMAGE_FALLBACKS = {
  akimichi_conversao_calorica: "/assets/icons/akimichi/conversao-calorica.png",
  arhat_palmada_colapso: "/assets/icons/punho-arhat/palmada-do-colapso.png",
  arhat_ombro: "/assets/icons/punho-arhat/ombrada.png",
  arhat_joelhada: "/assets/icons/punho-arhat/joelhada.png",
  arhat_palmada_ascendente: "/assets/icons/punho-arhat/palmada-ascendente.png",
  arhat_palma_compressao: "/assets/icons/punho-arhat/palma-de-compressao.png",
  arhat_golpe_rocha: "/assets/icons/punho-arhat/golpe-de-rocha.png",
  tai_arhat_impacto: "/assets/icons/punho-arhat/palma-de-impacto.png",
  tai_arhat_pressao: "/assets/icons/punho-arhat/pressao-esmagadora.png",
  tai_arhat_estabilidade: "/assets/icons/punho-arhat/base-inabalavel.png",
  adamantino_super_peteleco: "/assets/icons/punho-adamantino/super-peteleco.png",
  adamantino_pe_dor_celestial: "/assets/icons/punho-adamantino/pe-da-dor-celestial.png",
  adamantino_impacto_flor_cerejeira: "/assets/icons/punho-adamantino/impacto-da-flor-de-cerejeira.png",
  adamantino_destruicao_pilar: "/assets/icons/punho-adamantino/destruicao-do-pilar-de-pedra.png",
  adamantino_impacto_flor_florescimento: "/assets/icons/punho-adamantino/impacto-da-flor-de-cerejeira-florescimento.png",
  adamantino_cem_forcas: "/assets/icons/punho-adamantino/tecnica-das-cem-forcas.png",
  tai_adamantino_controle: "/assets/icons/punho-adamantino/controle-de-chakra-preciso.png",
  tai_adamantino_ruptura: "/assets/icons/punho-adamantino/ruptura-concentrada.png",
  tai_adamantino_forca: "/assets/icons/punho-adamantino/forca-acumulada.png",
  lee_raiz: "/assets/icons/footer/Lee_Symbol.png",
  lee_folha_furacao: "/assets/icons/lee/furacao-da-folha.png",
  lee_entrada_dinamica: "/assets/icons/lee/entrada-dinamica.png",
  lee_pesos: "/assets/icons/lee/pesos-de-treinamento.png",
  lee_lotus: "/assets/icons/lee/loto-reversa.png",
  lee_condicionamento: "/assets/icons/lee/condicionamento-extremo.png",
  lee_recuperacao: "/assets/icons/lee/recuperacao-heroica.png",
  lee_passos: "/assets/icons/lee/passos-do-furacao.png",
  lee_reflexos: "/assets/icons/lee/reflexos-de-combate.png",
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

const ICON_ASSET_VERSION = "20260813-simbolos-cla";

// Ícones e fundos moram no CDN do Square Blob. O mapa caminho -> URL vem de
// public/asset-manifest.js (gerado por `npm run blob:upload`), carregado antes
// deste arquivo. Caminho sem entrada no manifesto cai de volta pro arquivo
// local: é assim que os SVG e o login.webp continuam sendo servidos pelo site,
// e é o que segura a página de pé se o manifesto ainda não existir.
function assetUrl(path) {
  const map = window.__BLOB_ASSETS;
  return (map && map[path]) || path;
}

// guides-ui.js e ingots.js sao carregados antes deste arquivo e leem
// `window.assetUrl` na hora de desenhar, nao no carregamento — por isso a
// atribuicao aqui embaixo funciona pros dois. Sem ela os dois caiam no
// caminho local e ignoravam o manifesto do Blob, o que so nao aparecia
// porque public/assets tambem existe em disco no ambiente de dev.
window.assetUrl = assetUrl;

function versionedIcon(path) {
  if (!path || !path.startsWith("/assets/icons/")) return path;
  const url = assetUrl(path);
  return `${url}${url.includes("?") ? "&" : "?"}v=${ICON_ASSET_VERSION}`;
}

function nodeImage(node) {
  return versionedIcon(node.img || NODE_IMAGE_FALLBACKS[node.id]);
}

// Símbolos dos clãs na seleção inferior. Mantidos fora dos metadados de cada
// árvore para que árvores sem arquivo continuem usando seu ícone de reserva.
const CLAN_FOOTER_ICONS = {
  // ---- Konohagakure ----
  uchiha: "/assets/icons/footer/Uchiha_Symbol.png",
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
  lee: "/assets/icons/footer/Lee_Symbol.png",
  // ---- Sunagakure ----
  kamaitachi: "/assets/icons/footer/Kamaitachi_Symbol.png",
  // ---- Kirigakure ----
  hoshigaki: "/assets/icons/footer/Hoshigaki_Symbol.png",
  hozuki: "/assets/icons/footer/Hozuki_Symbol.png",
  kaguya: "/assets/icons/footer/Kaguya_Symbol.png",
  yuki: "/assets/icons/footer/Yuki_Symbol.png",
  // ---- Kumogakure ----
  chinoike: "/assets/icons/footer/Chinoike_Symbol.png",
  raikage: "/assets/icons/footer/Raikage_Symbol.png",
  yotsuki: "/assets/icons/footer/yotsuki.png",
  // ---- Iwagakure ----
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
const BG_ASSET_VERSION = "20260806-fuinjutsu";
const ELEMENT_BG = {
  FUNDAMENTOS: `url('/assets/bg/ninjutsu.webp?v=${BG_ASSET_VERSION}')`,
  IRYO_NINJUTSU: `url('/assets/bg/iryo-ninjutsu.webp?v=${BG_ASSET_VERSION}')`,
  BUKIJUTSU: `url('/assets/bg/bukijutsu.webp?v=${BG_ASSET_VERSION}')`,
  GENJUTSU: `url('/assets/bg/genjutsu.webp?v=${BG_ASSET_VERSION}')`,
  FUINJUTSU: `url('/assets/bg/fuinjutsu.webp?v=${BG_ASSET_VERSION}')`,
  KUGUTSU: "linear-gradient(135deg, rgba(66, 35, 26, .92), rgba(142, 75, 43, .72))",
  // taijutsu passiva (arvore central) + os 4 estilos de luta especificos
  TAIJUTSU_PASSIVAS: `url('/assets/bg/taijutsu.webp?v=${BG_ASSET_VERSION}')`,
  TAIJUTSU: `url('/assets/bg/punho-forte.webp?v=${BG_ASSET_VERSION}')`,
  ARHAT: `url('/assets/bg/punho-arhat.webp?v=${BG_ASSET_VERSION}')`,
  ADAMANTINO: `url('/assets/bg/punho-adamantino.webp?v=${BG_ASSET_VERSION}')`,
  TAIJUTSU_AGITACAO: `url('/assets/bg/taijutsu-agitacao.webp?v=${BG_ASSET_VERSION}')`,
  ASSASSINATO_NINJA: `url('/assets/bg/assassinato-silencioso.webp?v=${BG_ASSET_VERSION}')`,
  FOGO: `url('/assets/bg/fogo.webp?v=${BG_ASSET_VERSION}')`,
  AGUA: `url('/assets/bg/agua.webp?v=${BG_ASSET_VERSION}')`,
  VENTO: `url('/assets/bg/vento.webp?v=${BG_ASSET_VERSION}')`,
  TERRA: `url('/assets/bg/terra.webp?v=${BG_ASSET_VERSION}')`,
  RAIO: `url('/assets/bg/raio.webp?v=${BG_ASSET_VERSION}')`,
  // kekkei genkai — antes sem fundo (caíam no "none"), a arte nova cobre todas.
  GELO: `url('/assets/bg/gelo.webp?v=${BG_ASSET_VERSION}')`,
  CRISTAL: `url('/assets/bg/cristal.webp?v=${BG_ASSET_VERSION}')`,
  VAPOR: `url('/assets/bg/vapor.webp?v=${BG_ASSET_VERSION}')`,
  CALOR: `url('/assets/bg/calor.webp?v=${BG_ASSET_VERSION}')`,
  LAVA: `url('/assets/bg/lava.webp?v=${BG_ASSET_VERSION}')`,
  EXPLOSAO: `url('/assets/bg/explosao.webp?v=${BG_ASSET_VERSION}')`,
  POEIRA: `url('/assets/bg/poeira.webp?v=${BG_ASSET_VERSION}')`,
};
const CLAN_BG = `url('${assetUrl("/assets/bg/clas-v2.webp")}?v=${BG_ASSET_VERSION}')`;
const CLAN_BACKGROUNDS = {
  UCHIHA: `url('/assets/bg/uchiha.webp?v=${BG_ASSET_VERSION}')`,
  NARA: `url('/assets/bg/nara.webp?v=${BG_ASSET_VERSION}')`,
  SENJU: `url('/assets/bg/senju.webp?v=${BG_ASSET_VERSION}')`,
  HYUUGA: `url('/assets/bg/hyuuga.webp?v=${BG_ASSET_VERSION}')`,
  LEE: `url('/assets/bg/lee.webp?v=${BG_ASSET_VERSION}')`,
  AKIMICHI: `url('/assets/bg/akimichi.webp?v=${BG_ASSET_VERSION}')`,
  ABURAME: `url('/assets/bg/aburame.webp?v=${BG_ASSET_VERSION}')`,
  INUZUKA: `url('/assets/bg/inuzuka.webp?v=${BG_ASSET_VERSION}')`,
  UZUMAKI: `url('/assets/bg/uzumaki.webp?v=${BG_ASSET_VERSION}')`,
  SARUTOBI: `url('/assets/bg/sarutobi.webp?v=${BG_ASSET_VERSION}')`,
  HATAKE: `url('/assets/bg/hatake.webp?v=${BG_ASSET_VERSION}')`,
  YAMANAKA: `url('/assets/bg/yamanaka.webp?v=${BG_ASSET_VERSION}')`,
  KAMAITACHI: `url('/assets/bg/kamaitachi.webp?v=${BG_ASSET_VERSION}')`,
  HOSHIGAKI: `url('/assets/bg/hoshigaki.webp?v=${BG_ASSET_VERSION}')`,
  HOZUKI: `url('/assets/bg/hozuki.webp?v=${BG_ASSET_VERSION}')`,
  KAGUYA: `url('/assets/bg/kaguya.webp?v=${BG_ASSET_VERSION}')`,
  YUKI: `url('/assets/bg/yuki.webp?v=${BG_ASSET_VERSION}')`,
  CHINOIKE: `url('/assets/bg/chinoike.webp?v=${BG_ASSET_VERSION}')`,
  RAIKAGE: `url('/assets/bg/raikage.webp?v=${BG_ASSET_VERSION}')`,
  YOTSUKI: `url('/assets/bg/yotsuki.webp?v=${BG_ASSET_VERSION}')`,
  KAMIZURU: `url('/assets/bg/kamizuru.webp?v=${BG_ASSET_VERSION}')`,
  ONOKI: `url('/assets/bg/onoki.webp?v=${BG_ASSET_VERSION}')`,
  BAKUREI: `url('/assets/bg/bakurei.webp?v=${BG_ASSET_VERSION}')`,
};
// Troca os caminhos locais acima pelas URLs do CDN de uma vez só, em vez de
// embrulhar as ~48 entradas uma a uma. Quem não estiver no manifesto continua
// apontando pro arquivo local (ver assetUrl).
for (const key of Object.keys(ELEMENT_BG)) {
  ELEMENT_BG[key] = ELEMENT_BG[key].replace(/\/assets\/[^?')]+/, assetUrl);
}
// Glossário de efeitos: destaca o termo na descrição e explica no hover.
// A descrição vem do servidor como texto puro; o realce é feito aqui por regex,
// então basta escrever o nome do efeito na desc que ele vira link explicativo.
const GLOSSARY = [
  { re: "Selo de Contrato", tip: "Selo de Contrato: bloqueia temporariamente tecnicas de invocacao e tecnicas de chakra vinculadas a Bijuu. Dura 2 rodadas." },
  { re: "Inevitável", tip: "Inevitável: este ataque ignora todas as reações defensivas do alvo — Esquiva, Bloqueio e Aparo." },
  { re: "Queimadura(?:s)?", tip: "Queimadura: causa 5 de dano por rodada. Cada acúmulo reduz em 5% o dano dos golpes físicos do alvo (Taijutsu, Bukijutsu e Kenjutsu). Ao juntar 5 acúmulos, causa 20 de dano e os acúmulos zeram." },
  { re: "Sangramento", tip: "Sangramento: causa 5 de dano por rodada, corta pela metade a cura que o alvo recebe e causa mais 6 de dano sempre que ele usa um golpe físico." },
  { re: "Veneno", tip: "Veneno: causa 2 de dano por rodada. Cada acúmulo adicional soma 1 de dano por rodada. A duração chega no máximo a 5 rodadas." },
  // ATENCAO: alternativas da MAIS LONGA para a mais curta — a regex casa a primeira
  // que servir, entao "Atordoa" antes de "atordoado" cortaria a palavra no meio.
  { re: "Atordoamento|Atordoarem|Atordoar|atordoados|atordoado|Atordoam|Atordoa", tip: "Atordoamento: o alvo não pode agir nem se mover no turno. Perde a vez." },
  { re: "Encharcando|Encharcad[oa]s|Encharcad[oa]", tip: "Encharcado: o alvo está molhado. Com Nuvens de Tempestade, jutsus de Raio causam +75% de dano contra ele. Também serve de condutor para acertos em cadeia." },
  { re: "Fumaça", tip: "Fumaça: bloqueia a linha de visão de técnicas à distância quando fica entre o atacante e o alvo. Movimento e ataques corpo a corpo atravessam normalmente." },
  { re: "Barreira", tip: "Barreira: absorve dano antes de descontar da vida. Cada ponto de Barreira absorve 1 de dano e é consumido no processo." },
  { re: "Imobilização|preso(?:s)? ao chão", tip: "Imobilização: o alvo não consegue sair do lugar. Ainda pode atacar." },
  { re: "mais lento(?:s)?|Lentidão", tip: "Lentidão: o movimento do alvo cai pela metade." },
  { re: "Defesa Reduzida|reduzindo a defesa|reduz a defesa", tip: "Defesa Reduzida: o alvo perde 15% de chance de esquivar dos ataques." },
  { re: "não pode(?:m)? ser esquivad[oa](?:s)?", tip: "Não pode ser esquivado: ignora a reação de esquiva do alvo. O ataque sempre acerta." },
  { re: "Ignora Bloqueio e Aparo", tip: "Sem guarda: o alvo ainda pode tentar Esquivar, mas não pode reagir com Bloqueio nem Aparo." },
  { re: "bloque\\w* o Ninjutsu|Bloqueio de Ninjutsu", tip: "Bloqueio de Ninjutsu: o alvo não consegue usar jutsu de categoria Ninjutsu enquanto durar." },
  { re: "Bloqueio de Fuga|Fuga bloqueada|não consegue fugir|sem poder fugir|não conseguem fugir", tip: "Bloqueio de Fuga: o alvo não pode usar a ação de fugir do combate enquanto o efeito durar." },
  { re: "Dreno de Chakra|perde 10% de chakra por turno|perder 10% de chakra por turno", tip: "Dreno de Chakra: remove 10% de chakra do alvo no início de cada turno enquanto durar." },
  { re: "Confuso|Confusão", tip: "Confusão: enquanto durar, o alvo confuso ataca alguém aleatório entre todos os vivos em vez de escolher — pode até acertar o próprio time." },
  { re: "Aceleração|Acelerado", tip: "Aceleração: concede +2 de movimento, +10 pontos percentuais de Esquiva e +25 pontos percentuais de chance de fuga. Quem acertar o portador corpo a corpo sofre 8 de dano." },
  { re: "Desarme", tip: "Desarme: o alvo derruba a arma equipada e precisa recuperá-la antes de voltar a usá-la." },
  // (?! de Cem Forças): "Sobrecarga de Cem Forças" e' o NOME de uma habilidade
  // do Punho Adamantino, nao o efeito — citar ela numa descricao nao deve virar
  // tooltip do efeito. Ver a mesma trava em "Colapso" no fim da lista.
  { re: "Sobrecarga(?! de Cem Forças)", tip: "Sobrecarga: aumenta o dano que o alvo causa por tempo limitado. Cada técnica define a força do aumento e quais categorias entram." },
  // ---- exclusivo do clã Nara ----
  { re: "Vínculo de Sombra", tip: "Vínculo de Sombra: o alvo não pode se mover nem reagir (Esquivar/Bloquear/Aparar) enquanto durar — o corpo dele copia o do usuário. Só uma Esquiva bem-sucedida ANTES do vínculo prender evita o efeito." },
  // ---- exclusivo do clã Hyuuga ----
  // ATENCAO: precisa vir ANTES da entrada "selad[oa]|selar" do Cristal — a
  // regex e' montada na ordem deste array e a primeira alternativa que casar
  // vence, entao "selar os tenketsu" cairia no tooltip do Cristal se ficasse
  // depois.
  { re: "Selo dos Tenketsu|sela(?:r)? os tenketsu|tenketsu selados", tip: "Selo dos Tenketsu: os pontos de chakra do alvo são fechados. Enquanto durar, ele fica impedido de usar Ninjutsu, Genjutsu e Iryō Ninjutsu (inclui técnicas de clã e de selamento, que são Ninjutsu) e de abrir um Portão Interno; um Portão que já esteja aberto permanece assim. Um ninja médico consegue reabrir os tenketsu." },
  // ---- kekkei genkai: Gelo ----
  // ATENCAO: "Congelado" e "congela" precisam vir ANTES da entrada
  // "selad[oa]|selar" do Cristal e das de Lentidão, senao casam errado.
  { re: "Congelamento", tip: "Congelamento: cada acúmulo aumenta em 10% o custo das técnicas do alvo e reduz 1 casa de movimento. Ao juntar 4 acúmulos, aplica Congelado e os acúmulos zeram." },
  { re: "Congelad[oa](?:s)?|congela(?:m)?", tip: "Congelado: o corpo travou no gelo. Por 1 rodada o alvo não usa nenhuma reação defensiva — nem Esquiva, nem Bloqueio, nem Aparo. Ele ainda age normalmente no próprio turno." },
  // ---- kekkei genkai: Cristal ----
  { re: "Cristalizado", tip: "Cristalizado: cada acúmulo reduz 8% da Esquiva e 1 casa de movimento do alvo. Ao juntar 4 acúmulos, aplica Atordoamento por 1 rodada, prende ao chão por 2 rodadas e os acúmulos zeram." },
  { re: "selad[oa](?:s)?|selar", tip: "Selado: o casulo de cristal fechou. O alvo fica Atordoado 1 rodada e preso ao chão por 2." },
  { re: "Prisma", tip: "Prisma: casulo de luz sobre você. Corta 60% do dano de Ninjutsu recebido e devolve 30% do que barrou no atacante. Em troca, você fica imóvel e golpes físicos passam inteiros." },
  // ---- kekkei genkai: Vapor ----
  { re: "Corrosão", tip: "Corrosão: causa 5 de dano por rodada. Cada acúmulo reduz 8 pontos de Barreira do alvo por rodada." },
  // ---- kekkei genkai: Calor ----
  { re: "Desidratação|Desidrata(?:d[oa])?(?:s)?", tip: "Desidratação: cada acúmulo reduz em 10% todo o dano que o alvo causar, de qualquer categoria. Acumula até 3 vezes, chegando a 30%." },
  // ---- kekkei genkai: Lava ----
  { re: "Magma", tip: "Magma: causa 4 de dano por rodada. Ao juntar 4 acúmulos, prende o alvo ao chão por 2 rodadas e os acúmulos zeram." },
  { re: "endureceu|endurecer", tip: "Endureceu: o Magma acumulado fechou. O alvo fica preso no lugar (Imobilização), mas continua podendo agir." },
  // ---- kekkei genkai: Explosão ----
  { re: "Minado", tip: "Minado: quando a duração termina, causa 20 de dano por acúmulo." },
  { re: "defletiu|redireciona(?:r)?", tip: "Explosão Defensiva: contra um projétil (arma arremessada), apara e devolve o golpe inteiro no atacante em vez de só reduzir o dano." },
  // ---- kekkei genkai: Poeira ----
  { re: "Desintegração", tip: "Desintegração: causa 6 de dano por rodada. Cada acúmulo reduz 10 pontos de Barreira do alvo por rodada. Ao juntar 3 acúmulos, zera toda a Barreira restante, aplica Defesa Reduzida por 3 rodadas e os acúmulos zeram." },
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
let currentView = "trees";
let guideCenter = null;
let ingotsPage = null;
let appReady = false;
let hasCharacter = false;
let activeDialog = null;
let dialogReturnFocus = null;

const $ = (id) => document.getElementById(id);

function showDialog(id) {
  const dialog = $(id);
  if (!dialog) return;
  dialogReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  activeDialog = dialog;
  dialog.classList.remove("hidden");
  requestAnimationFrame(() => dialog.querySelector(".modal-card")?.focus());
}

function hideDialog(id) {
  const dialog = $(id);
  if (!dialog) return;
  dialog.classList.add("hidden");
  if (activeDialog === dialog) activeDialog = null;
  const target = dialogReturnFocus;
  dialogReturnFocus = null;
  if (target?.isConnected) target.focus();
}

async function fetchState() {
  const res = await fetch("/api/state", { credentials: "same-origin" });
  if (res.status === 401) return { authenticated: false };
  if (!res.ok) throw new Error(`Estado do personagem indisponível (${res.status})`);
  const nextState = await res.json();
  if (typeof nextState?.authenticated !== "boolean") {
    throw new Error("Resposta inválida do estado do personagem.");
  }
  return nextState;
}

async function fetchGuideCatalog() {
  const res = await fetch("/api/guides/catalog", {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Catálogo de Guias indisponível (${res.status})`);
  const catalog = await res.json();
  const valid = catalog?.schemaVersion === 7
    && Array.isArray(catalog.traits) && catalog.traits.length > 0
    && Array.isArray(catalog.clanGroups) && catalog.clanGroups.some((group) => group.clans?.length)
    && Array.isArray(catalog.items) && catalog.items.length > 0
    && Array.isArray(catalog.commandGroups) && catalog.commandGroups.length > 0;
  if (!valid) throw new Error("Versão incompatível do catálogo de Guias.");
  return catalog;
}

function show(screen) {
  for (const s of ["login", "nochar", "systemError", "app"]) $(s).classList.toggle("hidden", s !== screen);
  $("skipLink")?.classList.toggle("hidden", screen !== "app");
}

function showSystemError(message) {
  $("systemErrorMessage").textContent = message;
  $("systemRetryBtn").onclick = () => location.reload();
  show("systemError");
  requestAnimationFrame(() => $("systemErrorTitle").focus());
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

  // Trait: nome no dossiê, descrição completa no title (o painel é estreito).
  const dsTrait = $("dsTrait");
  dsTrait.textContent = c.trait ? `${c.trait.name} (${c.trait.rarityLabel})` : "Sem trait";
  dsTrait.title = c.trait ? c.trait.description : "";

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
      const face = m.img ? `<img src="${versionedIcon(m.img)}" alt="">` : `<span class="nc-emoji">${m.icon}</span>`;
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
  let runtimeCatalog;
  try {
    state = await fetchState();
  } catch (error) {
    console.error(error);
    return showSystemError("Não foi possível consultar sua sessão e seu personagem. Tente novamente.");
  }
  if (!state.authenticated) return show("login");
  try {
    runtimeCatalog = await fetchGuideCatalog();
  } catch (error) {
    console.error(error);
    return showSystemError("Não foi possível carregar a Central de Guias. Tente novamente.");
  }
  hasCharacter = Boolean(state.hasChar);
  if (!hasCharacter) {
    show("nochar");
    const openGuidesWithoutCharacter = () => {
      show("app");
      $("treesNavBtn").classList.add("hidden");
      $("charName").textContent = "Sem personagem";
      $("charLevel").textContent = "Modo de consulta";
      guideCenter = window.GuideCenter.create({
        root: $("guidesRoot"),
        scrollContainer: $("guidesPage"),
        progress: $("readingProgress"),
        progressBar: $("readingProgressBar"),
        catalog: window.GUIDE_CATALOG,
        runtime: runtimeCatalog,
      });
      ingotsPage = window.IngotsPage.create({ root: $("ingotsRoot"), scrollContainer: $("ingotsPage") });
      appReady = true;
      // Ingots e guias sao consultaveis sem personagem; so' a arvore exige ficha.
      const consultable = location.hash.startsWith("#/guias") || location.hash.startsWith("#/ingots");
      navigate(consultable ? location.hash : "#/guias/primeiros-passos");
    };
    $("nocharGuidesBtn").onclick = openGuidesWithoutCharacter;
    if (location.hash.startsWith("#/guias") || location.hash.startsWith("#/ingots")) openGuidesWithoutCharacter();
    return;
  }
  show("app");
  buildElemBar();
  activeEl = state.char.elements[0] || "FUNDAMENTOS";
  renderTree(activeEl);
  guideCenter = window.GuideCenter.create({
    root: $("guidesRoot"),
    scrollContainer: $("guidesPage"),
    progress: $("readingProgress"),
    progressBar: $("readingProgressBar"),
    catalog: window.GUIDE_CATALOG,
    runtime: runtimeCatalog,
  });
  ingotsPage = window.IngotsPage.create({ root: $("ingotsRoot"), scrollContainer: $("ingotsPage") });
  lastSig = sigOf(state);
  appReady = true;
  handleRoute();
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
  if (currentView === "trees") renderTree(activeEl); // mantém a árvore aberta e atualiza o estado
}

function parsedRoute() {
  const raw = location.hash.replace(/^#\/?/, "");
  const parts = raw.split("/").filter(Boolean);
  if (parts[0] === "ingots") return { view: "ingots", slug: null, section: null };
  if (parts[0] !== "guias") return { view: "trees", slug: null, section: null };
  let slug = null;
  let section = null;
  if (parts[1]) {
    try { slug = decodeURIComponent(parts[1]); }
    catch { slug = parts[1]; }
  }
  if (parts[2]) {
    try { section = decodeURIComponent(parts[2]); }
    catch { section = parts[2]; }
  }
  return { view: "guides", slug, section };
}

// Tres abas hoje (arvores, guias, ingots). A tabela evita o encadeamento de
// booleanos que a versao de duas abas usava: cada aba nova era mais um
// `classList.toggle` pra manter em sincronia, e esquecer um deixava duas
// abas marcadas como ativas ao mesmo tempo.
const VIEW_PANELS = {
  trees: { panel: "treeView", nav: "treesNavBtn" },
  guides: { panel: "guidesPage", nav: "guidesNavBtn" },
  ingots: { panel: "ingotsPage", nav: "ingotsNavBtn" },
};

function setCurrentView(view) {
  currentView = view;
  for (const [id, refs] of Object.entries(VIEW_PANELS)) {
    const isActive = id === view;
    $(refs.panel).classList.toggle("hidden", !isActive);
    const navButton = $(refs.nav);
    navButton.classList.toggle("active", isActive);
    if (isActive) navButton.setAttribute("aria-current", "page");
    else navButton.removeAttribute("aria-current");
  }
  // Pontos e "ver todas" so' fazem sentido sobre a arvore aberta.
  document.querySelector(".topbar-context").classList.toggle("hidden", view !== "trees");
}

function handleRoute() {
  if (!appReady || !guideCenter || !ingotsPage) return;
  const route = parsedRoute();
  if (!hasCharacter && route.view === "trees") {
    navigate("#/guias/primeiros-passos");
    return;
  }
  setCurrentView(route.view);
  if (route.view === "guides") {
    if (route.slug) guideCenter.showGuide(route.slug, route.section);
    else guideCenter.showHome();
    return;
  }
  if (route.view === "ingots") {
    ingotsPage.show();
    return;
  }
  document.title = `${ELEMENTS.find((entry) => entry.id === activeEl)?.name || "Árvores"} — Arquivo Shinobi`;
  renderTree(activeEl);
}

function navigate(hash) {
  if (location.hash === hash) handleRoute();
  else location.hash = hash;
}

const STYLE_TREE_IDS = new Set([
  "ASSASSINATO_NINJA", "TAIJUTSU_AGITACAO",
  "TAIJUTSU", "ARHAT", "ADAMANTINO",
]);

function buildElemBar() {
  const bar = $("elembar");
  bar.innerHTML = "";
  for (const e of ELEMENTS) {
    // So aparece o que o personagem tem. FUNDAMENTOS (Ninjutsu) e' sempre
    // desbloqueado; elemento/kekkei genkai que ele nao possui nem aparece;
    // arvore de cla (clanGate) so aparece pra quem e' daquele cla — OU pra
    // quem ja possui algum no' dela (ex: /admin desbloquear-tudo concede
    // todo no' de todo cla sem trocar o clanId do personagem).
    const unlocked =
      e.id === "FUNDAMENTOS" ||
      e.id === "BUKIJUTSU" || e.id === "IRYO_NINJUTSU" || e.id === "GENJUTSU" || e.id === "FUINJUTSU" || e.id === "KUGUTSU" || e.id === "TAIJUTSU_PASSIVAS" ||
      (STYLE_TREE_IDS.has(e.id)
        ? (state.trees[e.id] || []).some((n) => n.status === "OWNED")
        : e.clanGate
        ? state.char.clanId === e.clanGate || (state.trees[e.id] || []).some((n) => n.status === "OWNED")
        : state.char.elements.includes(e.id));
    if (!unlocked && !showAllTrees) continue;
    const div = document.createElement("button");
    div.type = "button";
    div.className = "elem" + (!unlocked ? " locked" : "");
    div.style.setProperty("--ec", e.color);
    div.style.setProperty("--ecg", glow(e.color));
    const iconImage = versionedIcon(e.img || (e.clanGate ? CLAN_FOOTER_ICONS[e.clanGate] : undefined));
    const eface = iconImage
      ? `<img class="e-img" src="${iconImage}" alt="" loading="lazy">`
      : e.icon;
    div.innerHTML = `<div class="e-ico">${eface}</div><div class="e-name">${e.name}</div>`;
    div.setAttribute("aria-label", `${e.name}${unlocked ? "" : " — somente consulta"}`);
    div.setAttribute("aria-pressed", String(e.id === activeEl));
    div.onclick = () => {
      activeEl = e.id;
      renderTree(e.id);
    };
    div.dataset.el = e.id;
    bar.appendChild(div);
  }
  // Centraliza quando todas as opcoes cabem; ao abrir todas as arvores,
  // habilita o modo rolavel sem deixar itens escondidos nas extremidades.
  requestAnimationFrame(() => bar.classList.toggle("is-overflow", bar.scrollWidth > bar.clientWidth + 1));
}

// Roda do mouse/trackpad tambem controla a barra horizontal, sem exigir
// arrastar a pequena alca do scrollbar.
document.addEventListener("DOMContentLoaded", () => {
  const bar = $("elembar");
  bar?.addEventListener("wheel", (event) => {
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.preventDefault();
    bar.scrollLeft += event.deltaY;
  }, { passive: false });
});

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
  document.querySelectorAll(".elem").forEach((d) => {
    const active = d.dataset.el === elId;
    d.classList.toggle("active", active);
    d.setAttribute("aria-pressed", String(active));
  });
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
  // Normaliza tanto a largura calculada quanto a posicao final. Assim as
  // arvores elementais, kekkei genkai e de cla obedecem a mesma malha.
  const standardCol = (col) => Math.abs(col) >= 0.8 && Math.abs(col) <= 1 ? Math.sign(col) * 1.25 : col;
  const alcance = nodes.reduce((m, n) => Math.max(m, Math.abs(standardCol(n.col))), 0);
  const treeWidth = Math.max(WIDTH, alcance * 2 * COL_GAP + 240);
  wrap.style.width = treeWidth + "px";
  wrap.style.height = height + "px";
  // Árvore mais larga que o palco não pode ser centralizada pelo `margin:auto`,
  // e abriria encostada na esquerda, com a raiz fora do eixo do título. Abre
  // rolada até o meio, mostrando o mesmo tanto dos dois lados.
  const rolagem = document.querySelector(".stage-scroll");
  if (rolagem) rolagem.scrollLeft = Math.max(0, (treeWidth - rolagem.clientWidth) / 2);

  // Toda ramificação lateral usa a mesma distância do Bukijutsu. Alguns
  // arquivos antigos registram a coluna lateral como ±1 ou ±0.8; ambos são
  // a mesma intenção visual e entram na malha padrão ±1.25. Colunas ±0.75
  // (interseções do Bukijutsu) e ±2 (layout especial Senju) permanecem como
  // foram desenhadas.
  const pos = (n) => ({ x: treeWidth / 2 + standardCol(n.col) * COL_GAP, y: TOP_PAD + layoutRow(n) * ROW_GAP });
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
    div.dataset.nodeId = n.id;
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
    list.innerHTML = '<div class="copy-arsenal-empty">Nenhuma técnica copiada ainda. Ative o Sharingan de três tomoe e observe um Ninjutsu elemental ou Taijutsu elegível em combate.</div>';
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
  showDialog("copyArsenalModal");
}

function closeCopyArsenal() {
  hideDialog("copyArsenalModal");
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
  showDialog("modal");
}

function closeModal() {
  hideDialog("modal");
  modalNode = null;
}

async function doBuy() {
  if (!modalNode) return;
  const purchasedNodeId = modalNode.id;
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
      closeModal();
      renderTree(activeEl);
      requestAnimationFrame(() => document.querySelector(`[data-node-id="${CSS.escape(purchasedNodeId)}"]`)?.focus());
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
    // recarrega o estado autoritativo e re-renderiza
    state = await fetchState();
    lastSig = sigOf(state);
    closeModal();
    renderTree(activeEl);
    requestAnimationFrame(() => document.querySelector(`[data-node-id="${CSS.escape(purchasedNodeId)}"]`)?.focus());
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
document.addEventListener("keydown", (event) => {
  if (!activeDialog) return;
  if (event.key === "Escape") {
    event.preventDefault();
    if (activeDialog.id === "modal") closeModal();
    else closeCopyArsenal();
    return;
  }
  if (event.key !== "Tab") return;
  const focusable = [...activeDialog.querySelectorAll(
    'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
  )].filter((element) => !element.classList.contains("hidden"));
  if (!focusable.length) {
    event.preventDefault();
    activeDialog.querySelector(".modal-card")?.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const card = activeDialog.querySelector(".modal-card");
  if (event.shiftKey && (document.activeElement === first || document.activeElement === card)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});
$("logoutBtn").onclick = async () => {
  await fetch("/auth/logout", { method: "POST", credentials: "same-origin" });
  location.reload();
};
$("showAllBtn").onclick = () => {
  showAllTrees = !showAllTrees;
  $("showAllBtn").classList.toggle("active", showAllTrees);
  $("showAllBtn").setAttribute("aria-pressed", String(showAllTrees));
  buildElemBar();
};
$("treesNavBtn").onclick = () => navigate("#/arvores");
$("guidesNavBtn").onclick = () => navigate("#/guias");
$("ingotsNavBtn").onclick = () => navigate("#/ingots");
window.addEventListener("hashchange", handleRoute);

boot();
