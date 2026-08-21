import type { Ability } from "../types.js";

// Habilidades que só entram no jutsuIdsJson de uma marionete construída. Não
// são concedidas diretamente ao personagem: o mecanismo instalado é a fonte.
//
// A régua é Bukijutsu: mecanismos ofensivos compartilham a mesma faixa de
// dano-base das armas. A vantagem de Kugutsu vem da carapaça escolhida, da
// preparação e das interações do mecanismo, não de um multiplicador oculto.
const attack = (id: string, name: string, baseDamage: number, range: number, cost: number, description: string, effects: Ability["effects"] = []): Ability => ({
  id, name, category: "KUGUTSU", tier: 1, resource: "chakra", cost, actionType: "COMUM",
  baseDamage, scalingAttribute: "kugutsu", range, shape: "SINGLE_TARGET", effects,
  tags: ["kugutsu", "puppet-attack"], description,
});

export const KUGUTSU_ABILITIES: Ability[] = [
  attack("kugutsu_tiro_mecanismo_destrutivo", "Tiro de Mecanismo Destrutivo", 16, 3, 18, "A marionete dispara kunais escondidas pela boca.", [{ effectId: "BLEED", duration: 2 }]),
  { id: "kugutsu_capturar", name: "Capturar", category: "KUGUTSU", tier: 1, resource: "chakra", cost: 18, actionType: "COMUM", baseDamage: 0, scalingAttribute: "kugutsu", range: 1, shape: "SINGLE_TARGET", effects: [{ effectId: "ROOT", duration: 1 }], tags: ["kugutsu", "puppet-attack"], description: "Compartimentos da marionete se fecham sobre o alvo e o imobilizam." },
  attack("kugutsu_lamina_agulha", "Lâmina Agulha", 16, 2, 22, "Uma agulha venenosa salta da cabeça da marionete.", [{ effectId: "POISON", stacks: 1, duration: 3 }]),
  // Dragões Gêmeos usa área curta; por isso mantém dano-base moderado mesmo
  // sem depender do prêmio antigo de alvo único.
  { id: "kugutsu_ataque_super_arma", name: "Ataque da Super Arma", category: "KUGUTSU", tier: 1, resource: "chakra", cost: 32, actionType: "COMUM", baseDamage: 22, scalingAttribute: "kugutsu", range: 3, shape: "RADIUS", effects: [{ effectId: "POISON", stacks: 1, duration: 3 }], tags: ["kugutsu", "puppet-attack"], description: "A marionete libera uma bomba de veneno em área curta." },
  attack("kugutsu_multiplos_bracos", "Múltiplos Braços", 30, 1, 42, "Braços mecânicos envolvem o alvo e interrompem seus movimentos.", [{ effectId: "STUN", duration: 1, chance: 0.65 }]),
  { id: "kugutsu_escudo_luz_mecanica", name: "Escudo Luz Mecânica", category: "KUGUTSU", tier: 2, resource: "chakra", cost: 12, actionType: "COMUM", range: 0, shape: "SELF", selfEffects: [{ effectId: "SHIELD", stacks: 8, hpPercentStacks: 0.12, duration: 3 }], tags: ["kugutsu", "puppet-defense"], description: "Os braços da marionete se unem e formam uma barreira de chakra." },
  { id: "kugutsu_modificador_aparencia", name: "Modificador de Aparência", category: "KUGUTSU", tier: 2, resource: "chakra", cost: 10, actionType: "REACAO", reactionKind: "DODGE", reactionDodgeBonus: 0.35, range: 0, shape: "SELF", tags: ["kugutsu", "puppet-substitution"], description: "O condutor troca de lugar com sua marionete em um lampejo de fios e madeira." },
  attack("kugutsu_lanca_chamas", "Lança-Chamas", 26, 2, 36, "Um bocal de fogo cospe chamas sobre o alvo.", [{ effectId: "BURN", stacks: 1, duration: 3 }]),
  attack("kugutsu_cauda_escorpiao", "Cauda de Escorpião", 30, 2, 56, "A cauda perfura o alvo com veneno e lâmina.", [{ effectId: "POISON", stacks: 1, duration: 3 }, { effectId: "BLEED", duration: 2 }]),
  { id: "kugutsu_carapaca_resistente", name: "Carapaça Resistente", category: "KUGUTSU", tier: 2, resource: "chakra", cost: 18, actionType: "COMUM", range: 0, shape: "SELF", selfEffects: [{ effectId: "SHIELD", stacks: 7, hpPercentStacks: 0.10, duration: 2, replaceGroup: "kugutsu_carapaca_resistente" }, { effectId: "ROOT", duration: 2 }], tags: ["kugutsu", "puppet-defense"], description: "A marionete sela a estrutura, protegendo quem está dentro por dois turnos." },
  // Os dois exigem duas marionetes e são limitados a um uso por combate;
  // Dama também exige Imobilização e mantém a execução abaixo de 8% de vida.
  { ...attack("kugutsu_dama_ferro", "Dama de Ferro", 38, 1, 66, "Duas marionetes coordenam a execução mecânica de um alvo capturado.", [{ effectId: "BLEED", duration: 3 }]), oncePerCombat: true },
  { ...attack("kugutsu_atacando_ambos_lados", "Atacando de Ambos os Lados", 39, 2, 66, "Duas marionetes atacam em pinça; não há espaço para esquiva."), undodgeable: true, oncePerCombat: true },
];

export const PUPPET_UPGRADE_ABILITY: Record<string, string> = {
  tiro_mecanismo_destrutivo: "kugutsu_tiro_mecanismo_destrutivo",
  capturar: "kugutsu_capturar",
  lamina_agulha: "kugutsu_lamina_agulha",
  ataque_super_arma: "kugutsu_ataque_super_arma",
  multiplos_bracos: "kugutsu_multiplos_bracos",
  escudo_luz_mecanica: "kugutsu_escudo_luz_mecanica",
  modificador_aparencia: "kugutsu_modificador_aparencia",
  lanca_chamas: "kugutsu_lanca_chamas",
  cauda_escorpiao: "kugutsu_cauda_escorpiao",
  carapaca_resistente: "kugutsu_carapaca_resistente",
  dama_ferro: "kugutsu_dama_ferro",
  atacando_ambos_lados: "kugutsu_atacando_ambos_lados",
};
