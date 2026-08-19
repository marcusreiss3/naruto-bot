// Tipos e leitura de dados de MESTRE_ESTILO, isolados num arquivo a parte
// (sem nenhuma dependencia de UI ou de mestre-estilo.ts) pra que
// ui/mestre-estilo-container.ts possa importa-los sem criar import
// circular com o servico que, por sua vez, importa os cartoes da UI.
import type { FightingStyle } from "../../config/enums.js";
import type { MissionDef } from "../../data/types.js";

export interface MestreEstiloState {
  stage?: "INTRO" | "GATHER" | "CHALLENGE";
  talk?: number;
}

export interface MestreEstiloData {
  style: FightingStyle;
  channelId: string;
  scenarioId: string;
  costRyo: number;
  costItems: { itemId: string; qty: number }[];
  introTurns: number;
  challengeTurns: number;
}

export function dataOf(def: MissionDef): MestreEstiloData {
  return def.data as unknown as MestreEstiloData;
}
