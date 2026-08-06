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
  fightingStyle: "PUNHO_ADAMANTINO",
  desc,
});

const passiva = (
  id: string, name: string, row: number, requires: string[],
  reqLevel: number, reqPool: number, reqTaijutsu: number, desc: string,
): SkillNodeDef => ({
  id, name, kind: "PASSIVE", icon: "🥋", pool: "iryoNinjutsu", cost: 2,
  branch: "Punho Adamantino", col: -1.25, row, requires, reqLevel, reqPool,
  reqAttribute: { attribute: "taijutsu", value: reqTaijutsu }, fightingStyle: "PUNHO_ADAMANTINO", desc,
});

// Taijutsu de força aprimorada por controle médico de chakra. Os jutsus são
// pagos com Taijutsu mas exigem Iryō; as passivas são o inverso.
//
// A ordem segue a COMPLEXIDADE da técnica, não o poder bruto: o Super Peteleco
// é a raiz porque é literalmente um peteleco — o truque mais simples e mais
// bobo do estilo. A árvore sobe daí até a liberação do selo (Cem Forças).
//
// Tronco central = jutsus (coluna 0). Ramo lateral = as 3 passivas (coluna -1),
// que descem em paralelo e reforçam o tronco.
export const ADAMANTINO_TREE: SkillNodeDef[] = [
  jutsu("adamantino_super_peteleco", "Super Peteleco", "D", 0, [], 2, 2, 2, "O dedo se arma contra o polegar, junta chakra na ponta e solta — um estalo ridículo de perto que atravessa o adversário como um aríete."),
  jutsu("adamantino_pe_dor_celestial", "Pé da Dor Celestial", "C", 1, ["adamantino_super_peteleco"], 8, 8, 6, "O calcanhar desce concentrado num ponto só e o chão cede num raio inteiro em volta do impacto."),
  jutsu("adamantino_impacto_flor_cerejeira", "Impacto da Flor de Cerejeira", "C", 2, ["adamantino_pe_dor_celestial"], 16, 16, 12, "O punho encontra o solo e o chakra guardado sai junto: a terra racha em placas que se levantam em volta do golpe."),
  jutsu("adamantino_destruicao_pilar", "Destruição do Pilar de Pedra", "B", 3, ["adamantino_impacto_flor_cerejeira"], 24, 24, 18, "O usuário arranca um pilar inteiro do chão pela base e o arremessa deitado, varrendo tudo na linha do lançamento."),
  jutsu("adamantino_impacto_flor_florescimento", "Impacto da Flor de Cerejeira: Florescimento", "A", 4, ["adamantino_destruicao_pilar"], 30, 30, 24, "A mesma pancada da Flor de Cerejeira, só que sem economia: o terreno se abre em pétalas de pedra até onde a onda alcança."),
  jutsu("adamantino_cem_forcas", "Técnica das Cem Forças", "S", 5, ["adamantino_impacto_flor_florescimento"], 34, 34, 28, "O losango na testa se abre em linhas escuras que descem pelo corpo: o chakra guardado por anos volta de uma vez para os músculos."),

  passiva("tai_adamantino_controle", "Controle de Chakra Preciso", 1, ["adamantino_super_peteleco"], 12, 12, 14, "Passiva: técnicas do Punho Adamantino gastam 12% menos energia ou chakra."),
  passiva("tai_adamantino_ruptura", "Ruptura Concentrada", 2, ["tai_adamantino_controle"], 22, 22, 24, "Passiva: Impacto da Flor de Cerejeira, Florescimento e Super Peteleco causam 10% mais dano."),
  passiva("tai_adamantino_forca", "Força Acumulada", 3, ["tai_adamantino_ruptura"], 30, 30, 32, "Passiva: seus golpes de Punho Adamantino causam 8% mais dano."),
];
