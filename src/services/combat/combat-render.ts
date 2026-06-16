import { prisma } from "../../db/client.js";
import { getNpc } from "../../data/index.js";
import { getAppearance } from "../appearance/appearance-service.js";
import { numberSameNames, type SessionFull } from "./combat-engine.js";
import type { RenderEntity } from "../maps/renderer.js";

const PLAYER_COLORS = ["#3498db", "#9b59b6", "#1abc9c", "#f1c40f", "#e67e22"];

// Monta as entidades de render (token + stats) a partir de uma sessão de combate.
// Inclui mortos (aparecem só no painel, com ☠️; sem token no mapa).
export async function buildSessionEntities(
  session: SessionFull,
  guildId: string,
): Promise<RenderEntity[]> {
  const nums = numberSameNames(session.participants);
  const entities: RenderEntity[] = [];
  let playerIdx = -1;
  for (const p of session.participants) {
    const isPlayer = !p.isNpc;
    if (isPlayer) playerIdx++;
    const num = nums.get(p.id);
    const entity: RenderEntity = {
      cell: p.cell,
      label: p.name.slice(0, 3),
      name: p.name,
      color: p.isNpc ? "#c0392b" : PLAYER_COLORS[playerIdx % PLAYER_COLORS.length]!,
      kind: p.isNpc ? "NPC" : "PLAYER",
      badge: num ? String(num) : undefined,
      hp: p.hpCurrent,
      hpMax: p.hpMax,
    };
    if (isPlayer) {
      entity.chakra = p.chakra;
      entity.energia = p.energia;
    }
    if (p.isNpc && p.npcTemplate) {
      entity.imageFile = getNpc(p.npcTemplate)?.image;
    } else if (isPlayer && p.charId) {
      const uc = await prisma.userCharacter.findUnique({
        where: { id: p.charId },
        select: { discordId: true },
      });
      if (uc) {
        const ap = await getAppearance(uc.discordId, guildId);
        if (ap) entity.imageUrl = ap.imageUrl;
      }
    }
    entities.push(entity);
  }
  return entities;
}

// Enxuga os logs de combate p/ o embed (HP/recursos agora aparecem na imagem).
export function condenseLogs(logs: string[]): string {
  const out: string[] = [];
  for (const raw of logs) {
    const l = raw
      .replace(/\s*\(HP\s*-?\d+\/\d+\)/g, "") // HP já está na imagem
      .replace(/\s*\(-\d+%\s*\w+\)/g, "") // custo de recurso já está na imagem
      .trim();
    if (!l) continue;
    if (out[out.length - 1] === l) continue; // remove duplicados consecutivos
    out.push(l);
  }
  return out.join("\n");
}
