import type { Attribute, Element } from "../../config/enums.js";
import type { Ability } from "../../data/types.js";

export interface RequirementContext {
  level: number;
  attrs: Record<Attribute, number>;
  elements: Element[];
  clanId: string | null;
}

// Verifica se um personagem cumpre os requisitos de uma ability. (puro, sem DB)
export function meetsRequirements(ability: Ability, ctx: RequirementContext): boolean {
  const req = ability.requirements;
  if (!req) return true;
  if (req.level && ctx.level < req.level) return false;
  if (req.element && !ctx.elements.includes(req.element)) return false;
  if (req.clanId && ctx.clanId !== req.clanId) return false;
  if (req.attributes) {
    for (const [k, v] of Object.entries(req.attributes)) {
      if (ctx.attrs[k as Attribute] < (v ?? 0)) return false;
    }
  }
  if (req.anyAttribute) {
    const alternatives = Object.entries(req.anyAttribute);
    if (
      alternatives.length > 0 &&
      !alternatives.some(([k, v]) => ctx.attrs[k as Attribute] >= (v ?? 0))
    ) {
      return false;
    }
  }
  return true;
}
