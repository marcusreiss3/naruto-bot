// Glossario de efeitos para a pagina "Equipamentos e ações básicas" do site.
// Os numeros sao lidos de BALANCE.effects, entao a pagina nao desatualiza
// quando alguem rebalanceia um efeito — mesma regra do buildMechanicsSummary.
import { BALANCE } from "../../config/balance.js";
import { EFFECT_IDS, EFFECT_LABELS, type EffectId } from "../../config/enums.js";

const E = BALANCE.effects;

const pct = (value: number): string => `${Math.round(value * 100)}%`;

// Agrupamento so' para exibicao — nao existe no motor.
const GROUPS = {
  DANO: "Dano contínuo",
  CONTROLE: "Controle",
  APOIO: "Apoio e defesa",
  MARCADOR: "Marcadores e preparo",
  CLA: "Exclusivos de clã",
  KKG: "Kekkei Genkai",
} as const;

type Group = (typeof GROUPS)[keyof typeof GROUPS];

const ENTRIES: Record<EffectId, { group: Group; text: string }> = {
  BURN: {
    group: GROUPS.DANO,
    text: `Causa ${E.BURN.dmgPerTurn} de dano por rodada. Cada acúmulo reduz em ${pct(E.BURN.taijutsuDmgReductionPerStack)} o dano dos golpes físicos do alvo (Taijutsu, Bukijutsu e Kenjutsu). Ao juntar ${E.BURN.explodeAtStacks} acúmulos, causa ${E.BURN.explodeDmg} de dano e os acúmulos zeram.`,
  },
  POISON: {
    group: GROUPS.DANO,
    text: `Causa ${E.POISON.baseDmg} de dano por rodada. Cada acúmulo adicional soma ${E.POISON.dmgPerStack} de dano por rodada. A duração chega no máximo a ${E.POISON.maxDuration} rodadas.`,
  },
  BLEED: {
    group: GROUPS.DANO,
    text: `Causa ${E.BLEED.dmgPerTurn} de dano por rodada, corta pela metade a cura que o alvo recebe e causa mais ${E.BLEED.extraOnTaiKen} de dano sempre que ele usa um golpe físico.`,
  },
  STUN: {
    group: GROUPS.CONTROLE,
    text: "O alvo perde a vez: não age nem se move enquanto durar.",
  },
  SLOW: {
    group: GROUPS.CONTROLE,
    text: `O alcance de movimento do alvo cai para ${pct(E.SLOW.moveFactor)}.`,
  },
  ROOT: {
    group: GROUPS.CONTROLE,
    text: "O alvo fica preso ao chão: não se move, mas continua podendo agir.",
  },
  CONFUSION: {
    group: GROUPS.CONTROLE,
    text: "O alvo ataca alguém aleatório entre todos os vivos em vez de escolher — pode acertar o próprio time.",
  },
  DISARM: {
    group: GROUPS.CONTROLE,
    text: "O alvo derruba a arma equipada no mapa e precisa recuperá-la antes de voltar a usá-la.",
  },
  DEFENSE_DOWN: {
    group: GROUPS.CONTROLE,
    text: `O alvo perde ${pct(E.DEFENSE_DOWN.dodgeReduction)} de chance de Esquiva.`,
  },
  FLEE_LOCK: {
    group: GROUPS.CONTROLE,
    text: "O alvo não consegue usar a ação de fugir do combate.",
  },
  NINJUTSU_BLOCK: {
    group: GROUPS.CONTROLE,
    text: "O alvo não consegue usar técnicas da categoria Ninjutsu.",
  },
  CHAKRA_DRAIN: {
    group: GROUPS.CONTROLE,
    text: `Remove ${E.CHAKRA_DRAIN.chakraPerTurn}% do chakra do alvo no início de cada turno.`,
  },
  CONTRACT_SEAL: {
    group: GROUPS.CONTROLE,
    text: "Bloqueia técnicas de invocação e o chakra vinculado a Bijuu por contrato.",
  },
  SHIELD: {
    group: GROUPS.APOIO,
    text: "Absorve dano antes de descontar da vida. Cada ponto de Barreira absorve 1 de dano e é consumido no processo.",
  },
  HASTE: {
    group: GROUPS.APOIO,
    text: `+${E.HASTE.moveBonus} de movimento, +${pct(E.HASTE.dodgeBonus)} de Esquiva e +${pct(E.HASTE.fleeChanceBonus)} de chance de fuga. Quem acertar o portador corpo a corpo sofre ${E.HASTE.contactDamage} de dano.`,
  },
  EMPOWERED: {
    group: GROUPS.APOIO,
    text: "Aumenta o dano que o alvo causa por tempo limitado. Cada técnica define a força do aumento e quais categorias entram.",
  },
  WET: {
    group: GROUPS.MARCADOR,
    text: "Marcador sem dano próprio. Abre o dano extra de Água e Raio contra o alvo e serve de condutor para acertos em cadeia.",
  },
  MARKED: {
    group: GROUPS.MARCADOR,
    text: "O alvo fica marcado para execução ou perseguição por técnicas que exigem a marca.",
  },
  SHADOW_BOUND: {
    group: GROUPS.CLA,
    text: "O corpo do alvo copia o do usuário — ele fica impedido de se mover e de reagir (Esquivar, Bloquear ou Aparar). Só uma Esquiva bem-sucedida antes do vínculo prender evita o efeito.",
  },
  TENKETSU_SEAL: {
    group: GROUPS.CLA,
    text: "Os pontos de chakra do alvo são fechados. Enquanto durar, ele fica impedido de usar Ninjutsu, Genjutsu e Iryō Ninjutsu — o que inclui técnicas de clã e de selamento, que são Ninjutsu — e de abrir um Portão Interno; um Portão que já esteja aberto permanece assim. Um ninja médico consegue reabrir os tenketsu.",
  },
  FROZEN: {
    group: GROUPS.KKG,
    text: `Cada acúmulo aumenta em ${pct(E.FROZEN.costPenaltyPerStack)} o custo das técnicas do alvo e reduz ${E.FROZEN.movePenaltyPerStack} casa de movimento. Ao juntar ${E.FROZEN.freezeAtStacks} acúmulos, aplica Congelado e os acúmulos zeram.`,
  },
  FROZEN_SOLID: {
    group: GROUPS.KKG,
    text: `O corpo travou. Enquanto durar (${E.FROZEN.freezeDuration} rodada), o alvo não consegue usar nenhuma reação defensiva — nem Esquiva, nem Bloqueio, nem Aparo. Ele ainda age normalmente no próprio turno.`,
  },
  CRYSTALLIZED: {
    group: GROUPS.KKG,
    text: `Cada acúmulo reduz ${pct(E.CRYSTALLIZED.dodgePenaltyPerStack)} da Esquiva e ${E.CRYSTALLIZED.movePenaltyPerStack} casa de movimento do alvo. Ao juntar ${E.CRYSTALLIZED.sealAtStacks} acúmulos, aplica Atordoamento por ${E.CRYSTALLIZED.sealStunDuration} rodada, prende ao chão por ${E.CRYSTALLIZED.sealRootDuration} rodadas e os acúmulos zeram.`,
  },
  PRISM: {
    group: GROUPS.KKG,
    text: `Casulo que corta ${pct(E.PRISM.ninjutsuDamageReduction)} do dano de Ninjutsu recebido e devolve ${pct(E.PRISM.reflectFraction)} do que barrou. Em troca, o portador fica imóvel e golpes físicos passam inteiros.`,
  },
  CORROSION: {
    group: GROUPS.KKG,
    text: `Causa ${E.CORROSION.dmgPerTurn} de dano por rodada. Cada acúmulo reduz ${E.CORROSION.shieldCorrodePerStack} pontos de Barreira do alvo por rodada.`,
  },
  DEHYDRATION: {
    group: GROUPS.KKG,
    text: `Cada acúmulo reduz em ${pct(E.DEHYDRATION.dmgReductionPerStack)} todo o dano que o alvo causar, de qualquer categoria. Acumula até ${E.DEHYDRATION.maxStacks} vezes, chegando a ${pct(E.DEHYDRATION.dmgReductionPerStack * E.DEHYDRATION.maxStacks)}.`,
  },
  MAGMA: {
    group: GROUPS.KKG,
    text: `Causa ${E.MAGMA.dmgPerTurn} de dano por rodada. Ao juntar ${E.MAGMA.hardenAtStacks} acúmulos, prende o alvo ao chão por ${E.MAGMA.hardenRootDuration} rodadas e os acúmulos zeram.`,
  },
  MINADO: {
    group: GROUPS.KKG,
    text: `Quando a duração termina, causa ${E.MINADO.explodeDamagePerStack} de dano por acúmulo.`,
  },
  DISINTEGRATION: {
    group: GROUPS.KKG,
    text: `Causa ${E.DISINTEGRATION.dmgPerTurn} de dano por rodada. Cada acúmulo reduz ${E.DISINTEGRATION.shieldCorrodePerStack} pontos de Barreira do alvo por rodada. Ao juntar ${E.DISINTEGRATION.collapseAtStacks} acúmulos, zera toda a Barreira restante, aplica Defesa Reduzida por ${E.DISINTEGRATION.collapseDefenseDownDuration} rodadas e os acúmulos zeram.`,
  },
};

export interface EffectCatalogGroup {
  title: string;
  effects: { id: EffectId; label: string; description: string }[];
}

// Ordem dos grupos = ordem de leitura na pagina (do mais comum ao mais nichado).
const GROUP_ORDER: Group[] = [
  GROUPS.DANO,
  GROUPS.CONTROLE,
  GROUPS.APOIO,
  GROUPS.MARCADOR,
  GROUPS.CLA,
  GROUPS.KKG,
];

export function buildEffectCatalog(): EffectCatalogGroup[] {
  return GROUP_ORDER.map((title) => ({
    title,
    // EFFECT_IDS como fonte da ordem dentro do grupo: efeito novo no enum
    // aparece aqui sozinho (e o Record acima forca alguem a descrever ele).
    effects: EFFECT_IDS.filter((id) => ENTRIES[id].group === title).map((id) => ({
      id,
      label: EFFECT_LABELS[id],
      description: ENTRIES[id].text,
    })),
  }));
}
