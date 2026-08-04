import type { SkillNodeDef } from "./element-trees/index.js";

const passive = (
  id: string, name: string, pool: SkillNodeDef["pool"], col: number, row: number,
  requires: string[], reqLevel: number, reqPool: number, desc: string,
): SkillNodeDef => ({
  id, name, kind: "PASSIVE", icon: "🥷", pool, cost: 2, branch: "Assassinato Ninja",
  col, row, requires, reqLevel, reqPool, desc, requiresVillage: "KIRI",
});

const mist: SkillNodeDef = {
  id: "tai_ocultacao_nevoa", name: "Técnica de Ocultação da Névoa", kind: "JUTSU", rank: "B", icon: "🌫️",
  pool: "ninjutsu", cost: 4, branch: "Assassinato Ninja", col: 0, row: 0, requires: [], reqLevel: 12, reqPool: 12,
  grantsAbilityId: "tai_ocultacao_nevoa", requiresVillage: "KIRI",
  desc: "Cria uma névoa densa em volta do usuário por 2 rodadas: ela bloqueia a visão, reduz a Defesa dos inimigos pegos na área e prepara ataques surpresa.",
};

// Doutrina de Kirigakure: inicia escondendo o campo, progride para o abate
// de Taijutsu e abre uma segunda saída para assassinato de Kenjutsu.
export const ASSASSINATO_NINJA_TREE: SkillNodeDef[] = [
  mist,
  passive("tai_nevoa_primeiro_golpe", "Primeiro Golpe", "ninjutsu", 0, 1, ["tai_ocultacao_nevoa"], 16, 16, "Passiva: o primeiro ataque de Taijutsu contra cada inimigo no combate causa 15% mais dano."),
  passive("tai_nevoa_ponto_cego", "Ponto Cego", "ninjutsu", -0.45, 2, ["tai_nevoa_primeiro_golpe"], 22, 22, "Passiva: seus ataques de Taijutsu contra inimigos com Defesa Reduzida causam 12% mais dano e cortam 12% da redução de Bloqueio/Aparo."),
  passive("tai_nevoa_ofuscante", "Névoa Ofuscante", "ninjutsu", 0, 3, ["tai_nevoa_ponto_cego"], 28, 28, "Passiva: enquanto houver uma Cortina de Neblina no campo, seus Taijutsus causam 10% mais dano."),
  passive("tai_nevoa_danca", "Dança da Névoa", "ninjutsu", -0.45, 4, ["tai_nevoa_ofuscante"], 34, 34, "Passiva: ao acertar Taijutsu enquanto houver névoa no campo, você recebe Aceleração até o fim da próxima rodada."),
  passive("tai_nevoa_marca", "Marca do Alvo", "ninjutsu", 0, 5, ["tai_nevoa_danca"], 40, 40, "Passiva: seu primeiro acerto de Taijutsu em cada inimigo o Marca por 3 rodadas; seus próximos Taijutsus contra ele causam 10% mais dano."),
  passive("tai_nevoa_misericordia", "Golpe de Misericórdia", "ninjutsu", -0.45, 6, ["tai_nevoa_marca"], 46, 46, "Passiva: seus Taijutsus causam 18% mais dano contra inimigos abaixo de 20% da vida."),
  passive("tai_nevoa_saque", "Saque Relâmpago", "kenjutsu", 1.2, 4, ["tai_nevoa_ofuscante"], 30, 30, "Passiva: você recebe +1 de prioridade no início do combate e seu primeiro ataque de Kenjutsu causa 14% mais dano."),
  passive("tai_nevoa_corte", "Corte Decisivo", "kenjutsu", 1.2, 5, ["tai_nevoa_saque"], 40, 40, "Passiva: após passar uma rodada sem atacar, seu próximo ataque de Kenjutsu causa 18% mais dano e corta 18% da redução de Bloqueio/Aparo."),
];
