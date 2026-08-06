import type { SkillNodeDef } from "./element-trees/index.js";

const passive = (
  id: string, name: string, pool: SkillNodeDef["pool"], col: number, row: number,
  requires: string[], reqLevel: number, reqPool: number, desc: string,
): SkillNodeDef => ({
  id, name, kind: "PASSIVE", icon: "🥷", pool, cost: 2, branch: "Assassinato Silencioso",
  col, row, requires, reqLevel, reqPool, desc, requiresVillage: "KIRI", fightingStyle: "ASSASSINATO_SILENCIOSO",
});

const mist: SkillNodeDef = {
  id: "tai_ocultacao_nevoa", name: "Técnica de Ocultação da Névoa", kind: "JUTSU", rank: "B", icon: "🌫️",
  pool: "taijutsu", cost: 4, branch: "Assassinato Silencioso", col: 0, row: 0, requires: [], reqLevel: 12, reqPool: 12,
  element: "AGUA", grantsAbilityId: "tai_ocultacao_nevoa", requiresVillage: "KIRI", fightingStyle: "ASSASSINATO_SILENCIOSO",
  desc: "Cria uma névoa densa em volta do usuário por 2 rodadas: ela bloqueia a visão, reduz a Defesa dos inimigos pegos na área e prepara ataques surpresa.",
};

// Doutrina de Kirigakure: UM tronco reto (a base) e só no fim dele a árvore
// se abre em 3 caminhos — não 4 ramos saindo já da raiz.
export const ASSASSINATO_NINJA_TREE: SkillNodeDef[] = [
  // Base: tronco único, reto, na coluna 0. Kiri e' vila de espadachins —
  // todo buff "de Taijutsu" abaixo vale igual pra Kenjutsu (ver crossCategory
  // em element-trees/passives.ts). Só o Caminho da Lâmina é kenjutsu-only.
  mist,
  passive("tai_nevoa_primeiro_golpe", "Primeiro Golpe", "taijutsu", 0, 1, ["tai_ocultacao_nevoa"], 16, 16, "Passiva: seus ataques de Taijutsu ou Kenjutsu causam 8% mais dano; o primeiro golpe em cada inimigo no combate causa mais 15%."),
  passive("tai_nevoa_ponto_cego", "Ponto Cego", "taijutsu", 0, 2, ["tai_nevoa_primeiro_golpe"], 22, 22, "Passiva: seus ataques de Taijutsu ou Kenjutsu causam 7% mais dano e cortam 12% da redução de Bloqueio/Aparo; contra inimigos com Defesa Reduzida, mais 12% de dano."),

  // Daqui em diante, 3 caminhos — todos saem de Ponto Cego, fim do tronco.
  // Caminho da Névoa: explora a névoa em si.
  passive("tai_nevoa_ofuscante", "Névoa Ofuscante", "taijutsu", -1.25, 3, ["tai_nevoa_ponto_cego"], 28, 28, "Passiva: enquanto houver uma Cortina de Neblina no campo, seus ataques de Taijutsu ou Kenjutsu causam 10% mais dano."),
  passive("tai_nevoa_danca", "Dança da Névoa", "taijutsu", -1.25, 4, ["tai_nevoa_ofuscante"], 34, 34, "Passiva: ao acertar com Taijutsu ou Kenjutsu enquanto houver névoa no campo, você recebe Aceleração até o fim da próxima rodada."),

  // Caminho do Executor: foca em marcar e finalizar o alvo.
  passive("tai_nevoa_marca", "Marca do Alvo", "taijutsu", 0, 3, ["tai_nevoa_ponto_cego"], 40, 40, "Passiva: seu primeiro acerto de Taijutsu ou Kenjutsu em cada inimigo o Marca por 3 rodadas; seus próximos ataques de Taijutsu ou Kenjutsu contra ele causam 10% mais dano."),
  passive("tai_nevoa_misericordia", "Golpe de Misericórdia", "taijutsu", 0, 4, ["tai_nevoa_marca"], 46, 46, "Passiva: seus ataques de Taijutsu ou Kenjutsu causam 6% mais dano; contra inimigos abaixo de 20% da vida, mais 18%."),

  // Caminho da Lâmina: segunda saída, paga com Kenjutsu.
  passive("tai_nevoa_saque", "Saque Relâmpago", "kenjutsu", 1.25, 3, ["tai_nevoa_ponto_cego"], 30, 30, "Passiva: você recebe +1 de prioridade no início do combate e seu primeiro ataque de Kenjutsu causa 14% mais dano."),
  passive("tai_nevoa_corte", "Corte Decisivo", "kenjutsu", 1.25, 4, ["tai_nevoa_saque"], 40, 40, "Passiva: após passar uma rodada sem atacar, seu próximo ataque de Kenjutsu causa 18% mais dano e corta 18% da redução de Bloqueio/Aparo."),
];
