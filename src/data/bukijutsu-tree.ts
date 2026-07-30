import type { SkillNodeDef } from "./element-trees/index.js";

export const BUKIJUTSU_TREE: SkillNodeDef[] = [
  {
    id: "buki_fundamentos", name: "Fundamentos de Bukijutsu", kind: "PASSIVE", icon: "🎯",
    pool: "bukijutsu", cost: 1, branch: "Fundamentos", col: 0, row: 0, requires: [],
    reqLevel: 1, reqPool: 1,
    desc: "O usuário domina os fundamentos das armas ninja. Todo ataque de Bukijutsu causa 15% mais dano, incluindo ações básicas como arremessar Kunai, Shuriken e Senbon.",
  },
  {
    id: "buki_manipulacao_fios", name: "Técnica de Manipulação de Fios", kind: "PASSIVE", icon: "🧵",
    pool: "bukijutsu", cost: 2, branch: "Fios", col: -1.25, row: 1, requires: ["buki_fundamentos"],
    reqLevel: 2, reqPool: 3,
    desc: "Permite usar Fios de Aço Ninja e técnicas com fios. Moinho de Vento, Meteoro Anexado e Câmara de Tortura causam 10% mais dano.",
  },
  {
    id: "buki_arsenal_selado", name: "Arsenal Selado", kind: "PASSIVE", icon: "📜",
    pool: "bukijutsu", cost: 2, branch: "Pergaminhos", col: 0, row: 1, requires: ["buki_fundamentos"],
    reqLevel: 3, reqPool: 3,
    desc: "Permite usar técnicas de convocação com o Pergaminho de Arsenal. Essas técnicas gastam 10% menos chakra ou energia, conforme o recurso utilizado.",
  },
  {
    id: "buki_lamina_chakra", name: "Lâmina de Chakra", kind: "PASSIVE", icon: "🔪",
    pool: "bukijutsu", cost: 2, branch: "Lâmina de Chakra", col: 1.25, row: 1, requires: ["buki_fundamentos"],
    reqLevel: 3, reqPool: 3,
    desc: "Permite equipar, lutar e usar técnicas com Lâminas de Chakra. Seus ataques com essas lâminas ignoram 20% da proteção de Bloqueio e Aparo.",
  },
  {
    id: "buki_moinho", name: "Manipulação do Moinho de Vento de Lâminas Triplas", kind: "JUTSU", rank: "C", icon: "🪃",
    pool: "bukijutsu", cost: 3, branch: "Fios", col: -1.25, row: 2,
    requires: ["buki_manipulacao_fios"], reqLevel: 4, reqPool: 4, grantsAbilityId: "buki_moinho",
    desc: "Kunai e shuriken ligadas a fios distraem o oponente antes que a lâmina retorne por um ângulo inesperado.",
  },
  {
    id: "buki_dragoes_gemeos", name: "Dragões Gêmeos Ascendentes", kind: "JUTSU", rank: "B", icon: "🐉",
    pool: "bukijutsu", cost: 4, branch: "Pergaminhos", col: 0, row: 2,
    requires: ["buki_arsenal_selado"], reqLevel: 7, reqPool: 7,
    grantsAbilityId: "buki_dragoes_gemeos",
    desc: "Dois pergaminhos sobem como dragões de fumaça enquanto o usuário salta entre eles e lança uma barragem de armas.",
  },
  {
    id: "buki_afinidade_lamina", name: "Afinidade na Lâmina", kind: "PASSIVE", icon: "🌈",
    pool: "bukijutsu", cost: 2, branch: "Lâmina de Chakra", col: 1.25, row: 2,
    requires: ["buki_lamina_chakra"], reqLevel: 6, reqPool: 5,
    desc: "Cada natureza básica conhecida aumenta em 10% o dano e em 10% o custo original dos ataques com Lâmina de Chakra. Além disso: Fogo aplica Queimadura por 2 rodadas; Água reduz em 15% o custo das técnicas de lâmina; Vento aumenta o alcance em 1 casa; Raio tem 20% de chance de aplicar Atordoamento por 1 rodada; Terra aplica Defesa reduzida por 1 rodada. Afinidades adicionais acumulam seus benefícios.",
  },
  {
    id: "buki_voo_andorinha", name: "Voo da Andorinha", kind: "JUTSU", rank: "B", icon: "🪽",
    pool: "bukijutsu", cost: 4, branch: "Lâmina de Chakra", col: 1.25, row: 3,
    requires: ["buki_afinidade_lamina"], reqLevel: 10, reqPool: 9, grantsAbilityId: "buki_voo_andorinha",
    desc: "O chakra forma uma extensão cortante além do metal, alcançando o adversário antes que a lâmina física o toque.",
  },
  {
    id: "buki_maestria_arremesso", name: "Maestria de Arremesso", kind: "PASSIVE", icon: "🎯",
    pool: "bukijutsu", cost: 2, branch: "Arremessos", col: 0.75, row: 5,
    requires: ["buki_esfera_explosiva"], reqLevel: 17, reqPool: 17,
    desc: "Aumenta em 1 casa o alcance e em 15% o dano dos ataques de Bukijutsu arremessados ou disparados à distância.",
  },
  {
    id: "buki_resma_explosiva", name: "Resma de Amuletos Explosivos", kind: "PASSIVE", icon: "💥",
    pool: "bukijutsu", cost: 2, branch: "Pergaminhos", col: 0, row: 3,
    requires: ["buki_dragoes_gemeos"], reqLevel: 10, reqPool: 9,
    desc: "Aumenta em 20% o dano da Esfera Explosiva e da Kunai Explosiva arremessada.",
  },
  {
    id: "buki_meteoro_anexado", name: "Meteoro Anexado", kind: "JUTSU", rank: "A", icon: "⛓️",
    pool: "bukijutsu", cost: 6, branch: "Fios", col: -1.25, row: 3,
    requires: ["buki_moinho"], reqLevel: 13, reqPool: 10,
    grantsAbilityId: "buki_meteoro_anexado",
    desc: "Uma corrente invocada envolve o adversário, que é arrastado sob uma barragem de armas e lançado contra o chão.",
  },
  {
    id: "buki_clone_shuriken", name: "Técnica do Clone da Sombra de Shuriken", kind: "JUTSU", rank: "A", icon: "✴️",
    pool: "bukijutsu", cost: 6, branch: "Arremessos", col: 0.75, row: 6,
    requires: ["buki_maestria_arremesso"], reqLevel: 21, reqPool: 23, grantsAbilityId: "buki_clone_shuriken",
    desc: "Uma única shuriken se multiplica em pleno voo e cerca a área com incontáveis cópias.",
  },
  {
    id: "buki_esfera_explosiva", name: "Esfera Explosiva", kind: "JUTSU", rank: "A", icon: "💣",
    pool: "bukijutsu", cost: 6, branch: "Pergaminhos", col: 0, row: 4,
    requires: ["buki_resma_explosiva"], reqLevel: 15, reqPool: 15, grantsAbilityId: "buki_esfera_explosiva",
    desc: "Uma esfera convocada pelo pergaminho explode no impacto e espalha kunai em todas as direções.",
  },
  {
    id: "buki_cadeia_desastre", name: "Cadeia do Desastre Celestial", kind: "JUTSU", rank: "S", icon: "🌠",
    pool: "bukijutsu", cost: 8, branch: "Pergaminhos", col: -0.75, row: 5,
    requires: ["buki_esfera_explosiva"],
    reqLevel: 24, reqPool: 23, grantsAbilityId: "buki_cadeia_desastre",
    desc: "Um grande pergaminho se abre no céu e faz dezenas de armas caírem como uma tempestade sobre toda a área.",
  },
  {
    id: "buki_camara_tortura", name: "Câmara de Tortura", kind: "JUTSU", rank: "S", icon: "⛓️",
    pool: "bukijutsu", cost: 8, branch: "Fios", col: -1.25, row: 4,
    requires: ["buki_meteoro_anexado"],
    reqLevel: 20, reqPool: 20, grantsAbilityId: "buki_camara_tortura",
    desc: "Uma câmara de ferro se fecha ao redor do usuário e do oponente. Correntes capturam os membros da vítima enquanto engrenagens apertam fios de aço progressivamente.",
  },
];
