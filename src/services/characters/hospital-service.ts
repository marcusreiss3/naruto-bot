import { prisma } from "../../db/client.js";
import { EconomyError } from "../economy/errors.js";
import { spendCharacterRyo } from "../economy/character-economy.js";
import { isCharacterInCombat } from "../combat/combat-engine.js";
import {
  HOSPITAL_IWA_CHANNEL_ID,
  HOSPITAL_KIRI_CHANNEL_ID,
  HOSPITAL_KONOHA_CHANNEL_ID,
  HOSPITAL_KUMO_CHANNEL_ID,
  HOSPITAL_SUNA_CHANNEL_ID,
} from "../../data/scenarios/index.js";

export const HOSPITAL_CHANNEL_IDS: ReadonlySet<string> = new Set([
  HOSPITAL_KONOHA_CHANNEL_ID,
  HOSPITAL_SUNA_CHANNEL_ID,
  HOSPITAL_KIRI_CHANNEL_ID,
  HOSPITAL_KUMO_CHANNEL_ID,
  HOSPITAL_IWA_CHANNEL_ID,
]);

export function isHospitalChannel(channelId: string): boolean {
  return HOSPITAL_CHANNEL_IDS.has(channelId);
}

export type TreatmentKind = "basic" | "advanced";

export const TREATMENT_COST: Record<TreatmentKind, number> = {
  basic: 15,
  advanced: 25,
};

export interface TreatmentResult {
  healed: number;
  hpCurrent: number;
  hpMax: number;
}

// Cura paga do hospital: basico soma metade do hpMax (limitado ao maximo),
// avancado cura tudo. Mesma convencao aditiva-com-teto da cura em combate
// (ver applyDamage/heal em combat-engine.ts) — nao "define" a vida, "soma".
export async function treatCharacter(charId: string, kind: TreatmentKind): Promise<TreatmentResult> {
  // Checado fora da transacao: combate acontece em outro canal (o mapa da
  // luta), entao o hospital nao pode confiar em "ha' sessao ativa neste
  // canal" — precisa saber se o PERSONAGEM esta lutando em algum lugar.
  if (await isCharacterInCombat(charId)) {
    throw new EconomyError("Você não pode receber tratamento enquanto está em combate.");
  }
  return prisma.$transaction(async (tx) => {
    const char = await tx.userCharacter.findUniqueOrThrow({ where: { id: charId } });
    if (char.hpCurrent >= char.hpMax) {
      throw new EconomyError("Sua vida já está no máximo.");
    }
    const amount = kind === "basic" ? Math.round(char.hpMax / 2) : char.hpMax - char.hpCurrent;
    const hpCurrent = Math.min(char.hpMax, char.hpCurrent + amount);
    await spendCharacterRyo(tx, {
      charId,
      amount: TREATMENT_COST[kind],
      type: "HOSPITAL_TREATMENT",
      reason: kind === "basic" ? "Tratamento básico no hospital" : "Tratamento avançado no hospital",
      errorMessage: `Você precisa de ${TREATMENT_COST[kind]} Ryō para este tratamento.`,
    });
    await tx.userCharacter.update({ where: { id: charId }, data: { hpCurrent } });
    return { healed: hpCurrent - char.hpCurrent, hpCurrent, hpMax: char.hpMax };
  });
}
