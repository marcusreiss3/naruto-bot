import { EFFECT_LABELS, type EffectId, type TerrainKind } from "../../config/enums.js";
import { BALANCE } from "../../config/balance.js";
import type { Ability, AppliedEffect } from "../../data/types.js";
import { getItem } from "../../data/items.js";
import { getAbility } from "../../data/index.js";
import { defaultDurationFor } from "../combat/effects.js";

// O nome de exibicao de cada efeito vem de EFFECT_LABELS (config/enums.ts),
// fonte unica. Antes existia uma copia manual aqui e as duas divergiram:
// FLEE_LOCK aparecia como "Bloqueio de Fuga" no glossario e "Fuga bloqueada"
// nas habilidades, e DEFENSE_DOWN trocava a caixa do R.
const EFFECT_NAMES = EFFECT_LABELS;

// Efeitos em que a QUANTIDADE de acumulos muda alguma coisa no motor — so'
// esses citam acumulo no texto. Sangramento fica FORA de proposito: as tres
// mecanicas dele (dano por turno, corte de cura, extra no golpe fisico) leem
// apenas "esta ativo?", nunca a contagem (ver effects.ts).
const STACK_EFFECTS = new Set<EffectId>([
  "BURN",
  "POISON",
  "CRYSTALLIZED",
  "FROZEN",
  "CORROSION",
  "DEHYDRATION",
  "MAGMA",
  "MINADO",
  "DISINTEGRATION",
]);

function rounds(value: number): string {
  return `${value} ${value === 1 ? "rodada" : "rodadas"}`;
}

function effectText(effect: AppliedEffect): string {
  const name = EFFECT_NAMES[effect.effectId];
  const chance = effect.chance ?? 1;
  const prefix = chance < 1 ? `${Math.round(chance * 100)}% de chance de aplicar` : "Aplica";
  const duration = effect.duration ?? defaultDurationFor(effect.effectId);
  const durationText = ` por ${rounds(duration)}`;
  const stacks = effect.stacks ?? 1;

  if (effect.effectId === "SHIELD") {
    // Barreira escala com a vida de quem recebe (ver hpPercentStacks em
    // types.ts): o `stacks` e' so' o piso fixo, o resto sai do hpMax.
    const pct = effect.hpPercentStacks
      ? ` + ${Math.round(effect.hpPercentStacks * 100)}% da vida máxima`
      : "";
    return `Concede Barreira de ${stacks} pontos${pct}${durationText}.`;
  }
  if (effect.effectId === "EMPOWERED") {
    const multiplier = stacks > 1
      ? stacks
      : 1 + (BALANCE.effects.EMPOWERED.dmgMultBonus ?? 0.6);
    const bonus = Math.round((multiplier - 1) * 100);
    const scope = effect.empoweredScope === "taijutsu"
      ? "nos seus Taijutsus"
      : effect.empoweredScope === "ninjutsu"
        ? "nos seus Ninjutsus"
        : effect.empoweredScope === "physical"
          ? "nos seus Taijutsus e Kenjutsus"
          : effect.empoweredScope === "clan"
            ? "nas técnicas do próprio clã"
            : "em todo o dano causado";
    return `${prefix} ${name}: +${bonus}% de dano ${scope}${durationText}.`;
  }

  const stackText = STACK_EFFECTS.has(effect.effectId)
    ? `${stacks} ${stacks === 1 ? "acúmulo" : "acúmulos"} de `
    : "";
  return `${prefix} ${stackText}${name}${durationText}.`;
}

function terrainName(kind: TerrainKind): string {
  const names: Record<TerrainKind, string> = {
    FIRE: "chamas",
    WATER: "água",
    OBSTACLE: "obstáculo",
    SMOKE: "fumaça",
    SWAMP: "pântano",
  };
  return names[kind];
}

// Lista em portugues corrente: "A", "A e B", "A, B e C". Virgula ate o
// penultimo item e conjuncao so' antes do ultimo — sem isso, uma lista de tres
// vira "A e B e C".
function listar(itens: readonly string[], conjuncao = "e"): string {
  if (itens.length <= 1) return itens[0] ?? "";
  return `${itens.slice(0, -1).join(", ")} ${conjuncao} ${itens[itens.length - 1]}`;
}

// Resumo voltado ao jogador e derivado dos mesmos dados usados pela engine.
// Chance, duracao, acumulos e limitacoes nao ficam desatualizados.
export function buildMechanicsSummary(ability: Ability): string {
  const parts: string[] = [];
  if (ability.additionalActionType) {
    const labels = { COMUM: "ação comum", BONUS: "ação bônus", MOVIMENTO: "ação de movimento" } as const;
    parts.push(`Também consome ${labels[ability.additionalActionType]}.`);
  }

  if (ability.actionType === "REACAO" && ability.reactionKind === "BLOCK") {
    parts.push("Reação de Bloqueio.");
  } else if (ability.actionType === "REACAO" && ability.reactionKind === "PARRY") {
    parts.push("Reação de Aparo.");
  }

  if (ability.unblockable) parts.push("É Inevitável.");
  else {
    if (ability.undodgeable) parts.push("Não pode ser esquivado.");
    if (ability.unguardable) parts.push("Ignora Bloqueio e Aparo.");
  }

  for (const effect of ability.effects ?? []) {
    parts.push(effectText(effect));
    if (effect.onExpire) {
      parts.push(`Quando ${EFFECT_NAMES[effect.effectId]} termina: ${effectText(effect.onExpire)}`);
    }
  }
  // selfEffects sempre vao pro proprio usuario, mesmo em golpe que mira o
  // inimigo (ex: a Barreira da Parede de Terra) — o texto precisa deixar
  // claro em QUEM cai, senao parece mais um efeito aplicado no alvo.
  for (const effect of ability.selfEffects ?? []) {
    parts.push(`No próprio usuário: ${effectText(effect).replace(/^Concede /, "concede ")}`);
  }

  if (ability.requiresTargetEffect?.length) {
    const required = ability.requiresTargetEffect.map((effect) => EFFECT_NAMES[effect]);
    parts.push(`Exige que o alvo esteja sob ${listar(required, "ou")}.`);
  }

  if (ability.cleanses?.length) {
    parts.push(`Remove ${listar(ability.cleanses.map((effect) => EFFECT_NAMES[effect]))}.`);
  }
  if (ability.reduceEffectDuration?.length) {
    const itens = ability.reduceEffectDuration.map(({ effectId, turns }) => `${turns} turno(s) de ${EFFECT_NAMES[effectId]}`);
    parts.push(`Reduz ${listar(itens)}.`);
  }
  if (ability.restoreResource) {
    const resource = ability.restoreResource.resource === "chakra" ? "chakra" : "energia";
    parts.push(`Restaura ${ability.restoreResource.amount}% de ${resource} do alvo.`);
  }

  if (ability.push) {
    const cells = Math.abs(ability.push);
    parts.push(`${ability.push > 0 ? "Empurra" : "Puxa"} o alvo ${cells} ${cells === 1 ? "casa" : "casas"}.`);
  }
  if (ability.terrain) {
    const duration = ability.terrain.duration ?? BALANCE.terrain.defaultDuration;
    parts.push(`Cria terreno de ${terrainName(ability.terrain.kind)} por ${rounds(duration)}.`);
  }
  if (ability.clearsTerrain) parts.push(`Remove terreno de ${terrainName(ability.clearsTerrain)}.`);
  if (ability.oncePerCombat) parts.push("Pode ser usada somente uma vez por combate.");
  if (ability.requiresStorm) {
    parts.push(
      "Exige ao menos uma área de chamas ainda ativa no campo para formar a tempestade, ou a passiva Nuvens de Tempestade.",
    );
  }
  if (ability.id === "uchiha_sharingan_3_tomoe") {
    parts.push("Aprende permanentemente Ninjutsus de Fogo, Água, Vento, Terra e Raio, além dos jutsus ativos de Punho Forte, Arhat e Adamantino observados em combate. Não copia passivas.");
    parts.push("Não copia técnicas exclusivas de clã.");
    parts.push("Não copia Kekkei Genkai.");
    parts.push("Não copia transformações, como os Portões Internos e a Técnica das Cem Forças: o olho lê os selos, mas não entrega o corpo condicionado por anos que a técnica exige.");
    parts.push("Não copia Kinjutsu. Uma técnica proibida não se resume aos selos de mão: exige requisitos fundamentais que só ver não concede.");
    parts.push("A cópia exige afinidade com o elemento, além do nível e Ninjutsu ou Taijutsu mínimos da técnica.");
  }
  if (ability.requiresPet) {
    if (ability.requirements?.clanId === "inuzuka") parts.push("Exige o cão ninja do usuário vivo no campo.");
    else if (ability.requirements?.clanId === "hatake") parts.push("Exige ao menos um cão ninja do usuário vivo no campo.");
    else parts.push("Exige a criatura companheira do usuário viva no campo.");
  }
  if (ability.requiresActiveDoujutsu) parts.push(`Exige ${ability.requiresActiveDoujutsu.label} ativo.`);
  if (ability.pierceObstacles) parts.push("Atravessa obstáculos e não precisa de linha de visão livre.");
  if (ability.chainWetTargets) {
    parts.push("Exige um alvo Encharcado e salta para os demais alvos Encharcados.");
  }
  if (ability.summon) {
    const count = ability.summon.count ?? 1;
    parts.push(`Invoca ${count} ${count === 1 ? "aliado" : "aliados"} no campo.`);
    if (ability.summon.onHit) {
      const duration = ability.summon.onHit.duration ?? defaultDurationFor(ability.summon.onHit.effectId);
      parts.push(
        `Ao ser atingida, a invocação aplica ${EFFECT_NAMES[ability.summon.onHit.effectId]} por ${rounds(duration)}.`,
      );
    }
    if (ability.summon.onDeath) {
      const duration = ability.summon.onDeath.duration ?? defaultDurationFor(ability.summon.onDeath.effectId);
      const amount = ability.summon.onDeath.stacks;
      const hpPct = ability.summon.onDeath.hpPercentStacks;
      const effectText = ability.summon.onDeath.effectId === "SHIELD" && amount !== undefined
        ? `${EFFECT_NAMES[ability.summon.onDeath.effectId]} de ${amount} pontos${hpPct ? ` + ${Math.round(hpPct * 100)}% da vida máxima` : ""}`
        : EFFECT_NAMES[ability.summon.onDeath.effectId];
      parts.push(
        `Ao morrer, a invocação aplica ${effectText} por ${rounds(duration)} em um raio de ${ability.summon.onDeath.radius} casas.`,
      );
    }
  }
  if (ability.teamBuff) {
    parts.push(`Afeta até ${ability.teamBuffMax ?? 1} integrantes do time, contando o usuário.`);
  }
  if (ability.mindTransfer) {
    const max = ability.mindTransferMax ?? 1;
    parts.push(`Transfere a mente para até ${max} ${max === 1 ? "alvo" : "alvos"}.`);
    parts.push(
      `Não pode invadir um alvo que esteja ${BALANCE.yamanaka.maxUpwardLevelGap + 1} ou mais níveis acima do usuário.`,
    );
    parts.push("O corpo original do usuário fica imóvel e vulnerável durante o controle.");
    parts.push(
      `Os golpes realizados pelo corpo controlado causam ${Math.round(BALANCE.yamanaka.pilotedDamageMult * 100)}% do dano normal.`,
    );
    parts.push("O dano sofrido pelo corpo controlado também atinge o corpo original do usuário.");
    if (ability.mindTransferTurns) {
      parts.push(`O controle dura ${rounds(ability.mindTransferTurns)} e não permite teste de resistência.`);
    } else {
      parts.push(`Manter o controle consome ${BALANCE.yamanaka.upkeepPerTurn}% de chakra por rodada.`);
      parts.push(
        `No início do próprio turno, o alvo tenta expulsar o usuário: a chance começa em 50%, muda ${Math.round(BALANCE.yamanaka.resistBasePerNinjutsuDiff * 100)} pontos percentuais por ponto de diferença entre os Ninjutsus e fica entre ${Math.round(BALANCE.yamanaka.resistMinChance * 100)}% e ${Math.round(BALANCE.yamanaka.resistMaxChance * 100)}%.`,
      );
      parts.push("O controle termina se o alvo resistir ou se o usuário não puder pagar a manutenção.");
    }
  }
  if (ability.trapField) {
    parts.push(
      `Prende inimigos em um raio de ${ability.trapField.radius} casas com ${EFFECT_NAMES[ability.trapField.effectId]} por ${rounds(ability.trapField.duration)}.`,
    );
  }
  if (ability.reactionDodgeBonus) {
    parts.push(`Como reação, concede +${Math.round(ability.reactionDodgeBonus * 100)}% de chance de Esquiva.`);
  }
  if (ability.reflectsProjectiles) parts.push("Ao Aparar um projétil, devolve o golpe ao atacante.");

  const itemPhrase = (entries: NonNullable<Ability["requiredItems"]>): string =>
    entries
      .map((requirement) => `${requirement.amount}x ${getItem(requirement.itemId)?.name ?? requirement.itemId}`)
      .join(entries.length > 1 ? " e " : "");
  const consumedItems = (ability.requiredItems ?? []).filter((entry) => entry.consume);
  const exhaustedItems = (ability.requiredItems ?? []).filter((entry) => entry.exhaustToItemId);
  const retainedItems = (ability.requiredItems ?? []).filter((entry) => !entry.consume && !entry.exhaustToItemId);
  if (consumedItems.length) parts.push(`Consome ${itemPhrase(consumedItems)}.`);
  if (exhaustedItems.length) parts.push(`Gasta ${itemPhrase(exhaustedItems)}; restaure-o para usar novamente.`);
  if (retainedItems.length) parts.push(`Exige ${itemPhrase(retainedItems)}.`);
  if (ability.equippedItemIds?.length) {
    const names = ability.equippedItemIds.map((id) => getItem(id)?.name ?? id);
    parts.push(`Exige ${names.join(" ou ")} equipada.`);
  }

  if (ability.toggleRules) {
    const rules = ability.toggleRules;
    parts.push(`Pode ser ativado e desativado com ${rules.command}.`);
    parts.push(`Enquanto ativo, concede +${Math.round(rules.dodgeBonus * 100)}% de chance de Esquiva.`);
    parts.push(`Consome ${rules.upkeepPerTurn}% de chakra por rodada.`);
    if (rules.cloneDodgeReduction !== undefined) {
      parts.push(
        `Reduz em ${Math.round(rules.cloneDodgeReduction * 100)}% o bônus de Esquiva que o alvo recebe de clones e substituições ao reagir aos seus ataques.`,
      );
    }
    if (rules.disablesWithoutResource) parts.push("É desativado automaticamente quando o chakra acaba.");
  }

  if (ability.gateRules) {
    const rules = ability.gateRules;
    parts.push(rules.gate === 8
      ? `Uma vez ativado com ${rules.command}, permanece aberto até sua morte.`
      : `Pode ser ativado e desativado com ${rules.command}.`);
    parts.push(`Enquanto aberto, aumenta em ${Math.round((rules.taijutsuDamageMult - 1) * 100)}% o dano de Taijutsu.`);
    parts.push(`Causa ${rules.selfDamagePerTurn} de dano ao usuário no início de cada turno.`);
    if (rules.energyRecoveryPerTurn) parts.push(`Recupera ${rules.energyRecoveryPerTurn}% de energia por turno.`);
  }
  if (ability.requiresActiveGate) parts.push(`Exige o Portão ${ability.requiresActiveGate} aberto.`);
  if (ability.requiresActiveEffectFromAbilityId) {
    const mode = getAbility(ability.requiresActiveEffectFromAbilityId);
    parts.push(`Exige ${mode?.name ?? "o modo correspondente"} ativo.`);
  }

  return parts.join(" ");
}

const MECHANICAL_SENTENCE =
  /(?:\d+\s*%|\d+\s*(?:rodada|turno|casa|acúmulo|ponto)|chance de|aplica |concede |remove |restaura |empurra |puxa |exige |pode ser usada|não pode ser|ignora |é inevitável|dano|barreira|alcance|custo)/i;

// A descrição do modal é ambientação. Os dados jogáveis ficam exclusivamente
// em "Efeitos e regras", gerados diretamente da Ability.
export function buildVisualDescription(description: string, authoredVisual?: string): string {
  if (authoredVisual) return authoredVisual;
  const sentences = description.trim().split(/(?<=[.!?])\s+/);
  const visual: string[] = [];

  for (const original of sentences) {
    let sentence = original.trim();
    if (!sentence) continue;

    const colon = sentence.indexOf(":");
    if (colon > 0 && MECHANICAL_SENTENCE.test(sentence.slice(colon + 1))) {
      sentence = `${sentence.slice(0, colon).trim()}.`;
    }
    const dash = sentence.indexOf("—");
    if (dash > 0 && MECHANICAL_SENTENCE.test(sentence.slice(dash + 1))) {
      sentence = `${sentence.slice(0, dash).trim()}.`;
    }

    sentence = sentence.replace(
      /,\s*(?:com \d+%|aplicando|causando|concedendo|empurrando|puxando|arremessando|lançando|e aplica|e causa|e concede|e empurra|e puxa|e arremessa|e lança)\b.*$/i,
      ".",
    );
    // "arremessa/lança/atordoa/reduz" faltavam aqui: sem eles, uma frase como
    // "Palma voltada para cima que arremessa o alvo 4 casas" passava inteira
    // pro jogador e repetia o que ja' aparece em "Efeitos e regras".
    sentence = sentence.replace(
      /\s+que (?:empurra|puxa|aplica|causa|concede|arremessa|lança|atordoa|reduz)\b.*$/i,
      ".",
    );
    sentence = sentence.replace(/\s+por \d+\s+(?:rodada|rodadas|turno|turnos)\b/gi, "");

    if (!MECHANICAL_SENTENCE.test(sentence)) visual.push(sentence);
  }

  if (visual.length) return visual.join(" ");

  // Textos antigos inteiramente mecânicos ainda recebem uma legenda curta,
  // sem repetir números ou regras no bloco narrativo.
  const title = description.split(/[:.!?]/, 1)[0]?.trim();
  return title ? `${title}.` : "Uma técnica ninja executada com precisão.";
}

export { EFFECT_NAMES };
