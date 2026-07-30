import type { EffectId, TerrainKind } from "../../config/enums.js";
import { BALANCE } from "../../config/balance.js";
import type { Ability, AppliedEffect } from "../../data/types.js";
import { getItem } from "../../data/items.js";
import { defaultDurationFor } from "../combat/effects.js";

const EFFECT_NAMES: Record<EffectId, string> = {
  BURN: "Queimadura",
  POISON: "Veneno",
  BLEED: "Sangramento",
  STUN: "Atordoamento",
  SLOW: "Lentidão",
  DISARM: "Desarme",
  CONFUSION: "Confusão",
  ROOT: "Imobilização",
  NINJUTSU_BLOCK: "Bloqueio de Ninjutsu",
  DEFENSE_DOWN: "Defesa reduzida",
  FLEE_LOCK: "Fuga bloqueada",
  WET: "Encharcado",
  SHIELD: "Barreira",
  CHAKRA_DRAIN: "Dreno de Chakra",
  HASTE: "Aceleração",
  EMPOWERED: "Sobrecarga",
  SHADOW_BOUND: "Vínculo de Sombra",
  CRYSTALLIZED: "Cristalizado",
  PRISM: "Prisma",
  CORROSION: "Corrosão",
  DEHYDRATION: "Desidratação",
  MAGMA: "Magma",
  MINADO: "Minado",
};

const STACK_EFFECTS = new Set<EffectId>([
  "BURN",
  "POISON",
  "BLEED",
  "CRYSTALLIZED",
  "CORROSION",
  "DEHYDRATION",
  "MAGMA",
  "MINADO",
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
    return `Concede Barreira de ${stacks} pontos${durationText}.`;
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

// Resumo voltado ao jogador e derivado dos mesmos dados usados pela engine.
// Chance, duracao, acumulos e limitacoes nao ficam desatualizados.
export function buildMechanicsSummary(ability: Ability): string {
  const parts: string[] = [];

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

  if (ability.cleanses?.length) {
    parts.push(`Remove ${ability.cleanses.map((effect) => EFFECT_NAMES[effect]).join(", ")}.`);
  }
  if (ability.reduceEffectDuration?.length) {
    parts.push(`Reduz ${ability.reduceEffectDuration.map(({ effectId, turns }) => `${turns} turno(s) de ${EFFECT_NAMES[effectId]}`).join(" e ")}.`);
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
    parts.push("Aprende permanentemente cada Ninjutsu elemental elegível observado em combate.");
    parts.push("Não copia técnicas exclusivas de clã.");
    parts.push("Não copia Gelo nem Madeira.");
    parts.push("A cópia exige afinidade com o elemento, além do nível e Ninjutsu mínimos da técnica.");
  }
  if (ability.requiresPet) parts.push("Exige a invocação do usuário viva no campo.");
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
      parts.push(
        `Ao morrer, a invocação aplica ${EFFECT_NAMES[ability.summon.onDeath.effectId]} por ${rounds(duration)} em um raio de ${ability.summon.onDeath.radius} casas.`,
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
        `Reduz em ${Math.round(rules.cloneDodgeReduction * 100)}% o bônus de Esquiva concedido por clones e substituições.`,
      );
    }
    if (rules.disablesWithoutResource) parts.push("É desativado automaticamente quando o chakra acaba.");
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
      /,\s*(?:com \d+%|aplicando|causando|concedendo|empurrando|puxando|e aplica|e causa|e concede|e empurra|e puxa)\b.*$/i,
      ".",
    );
    sentence = sentence.replace(/\s+que (?:empurra|puxa|aplica|causa|concede)\b.*$/i, ".");
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
