import type { SkillNodeDef } from "./element-trees/index.js";

const jutsu = (
  id: string,
  name: string,
  rank: NonNullable<SkillNodeDef["rank"]>,
  row: number,
  requires: string[],
  reqLevel: number,
  reqTaijutsu: number,
  reqIryo: number,
  desc: string,
  col = 0,
): SkillNodeDef => ({
  id,
  name,
  kind: "JUTSU",
  rank,
  icon: "✊",
  pool: "taijutsu",
  cost: rank === "D" ? 1 : rank === "C" ? 3 : rank === "B" ? 4 : rank === "A" ? 6 : 10,
  branch: "Punho Adamantino",
  col,
  row,
  requires,
  reqLevel,
  reqPool: reqTaijutsu,
  reqAttribute: { attribute: "iryoNinjutsu", value: reqIryo },
  grantsAbilityId: id,
  desc,
});

// Taijutsu de força aprimorada por controle médico de chakra. Os nós são
// pagos com Taijutsu, mas cada etapa também exige domínio de Iryō Ninjutsu.
export const ADAMANTINO_TREE: SkillNodeDef[] = [
  jutsu("adamantino_pe_dor_celestial", "Pé da Dor Celestial", "C", 0, [], 10, 10, 8, "Calcanhar concentrado que cria uma cratera e pode Atordoar em área."),
  jutsu("adamantino_impacto_flor_cerejeira", "Impacto da Flor de Cerejeira", "C", 1, ["adamantino_pe_dor_celestial"], 16, 16, 12, "Impacto de chakra que fratura o terreno e reduz a Defesa em área."),
  jutsu("adamantino_impacto_flor_florescimento", "Impacto da Flor de Cerejeira: Florescimento", "B", 2, ["adamantino_impacto_flor_cerejeira"], 24, 24, 18, "Versão ampliada do impacto, com área maior e controle mais forte."),
  jutsu("adamantino_cem_forcas", "Técnica das Cem Forças", "S", 3, ["adamantino_impacto_flor_florescimento"], 30, 30, 28, "Libera o chakra armazenado e fortalece o dano físico por 3 rodadas."),
  jutsu("adamantino_destruicao_pilar", "Destruição do Pilar de Pedra", "B", 3, ["adamantino_impacto_flor_florescimento"], 28, 28, 20, "Arranca e arremessa um pilar de pedra em linha, com grande força.", 1),
  jutsu("adamantino_super_peteleco", "Super Peteleco", "A", 4, ["adamantino_destruicao_pilar"], 34, 34, 24, "Peteleco de precisão com força esmagadora e alcance curto.", 1),
];
