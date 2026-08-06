// Camada de apresentacao do combate: monta o embed do turno e os botoes.
// Fica separado do combate-engine (estado/DB) e do combate.ts (comandos) pra
// que o visual possa mudar sem encostar em regra de jogo.
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import { displayName, numberSameNames, type SessionFull } from "./combat-engine.js";
import { condenseLogs } from "./combat-render.js";

type Participant = SessionFull["participants"][number];

// Fase do turno — define cor, rodape e quais botoes aparecem.
// MOVIMENTO: ainda pode se deslocar. ACAO: movimento fechado, resta comum/bonus.
// NPC: quem age e' IA. NEUTRO: fora de turno de jogador (fim de combate etc).
export type TurnPhase = "MOVIMENTO" | "ACAO" | "NPC" | "NEUTRO";

const COLORS: Record<TurnPhase, number> = {
  MOVIMENTO: 0x5865f2,
  ACAO: 0x57f287,
  NPC: 0xed4245,
  NEUTRO: 0x4e5058,
};

const FOOTERS: Record<TurnPhase, string> = {
  MOVIMENTO: "Use as setas para se deslocar · ✅ encerra o deslocamento e libera as ações",
  ACAO: "Use /jutsu para agir · o turno passa sozinho quando as ações acabarem",
  NPC: "Turno controlado pelo bot",
  NEUTRO: "",
};

export function turnPhase(active: Participant | null): TurnPhase {
  if (!active) return "NEUTRO";
  if (active.isNpc && !active.controlledById) return "NPC";
  return active.actedMove ? "ACAO" : "MOVIMENTO";
}

// "2 de 3 células" enquanto pode andar; "Concluído" depois de fechar o passo.
function movementStatus(active: Participant, budget: number, used: number): string {
  if (active.actedMove) return "Concluído";
  const left = Math.max(0, budget - used);
  return `${left} de ${budget} célula${budget === 1 ? "" : "s"}`;
}

export function buildCombatEmbed(opts: {
  session: SessionFull;
  active: Participant | null;
  logs: string[];
  phase: TurnPhase;
  moveBudget?: number;
  moveUsed?: number;
}): EmbedBuilder {
  const { session, active, logs, phase } = opts;
  const embed = new EmbedBuilder()
    .setColor(COLORS[phase])
    .setImage("attachment://combate.png");

  if (active) {
    const who = phase === "NPC" ? `Turno de ${active.name}` : `Vez de ${active.name}`;
    embed.setTitle(`${who} · Rodada ${session.round}`);
  } else {
    embed.setTitle(`Rodada ${session.round}`);
  }

  const log = condenseLogs(logs).slice(0, 3500);
  if (log) embed.setDescription(log);

  // Painel de economia de acao — so faz sentido no turno de um jogador.
  if (active && phase !== "NPC" && phase !== "NEUTRO") {
    embed.addFields(
      {
        name: "Movimento",
        value: movementStatus(active, opts.moveBudget ?? 0, opts.moveUsed ?? 0),
        inline: true,
      },
      { name: "Ação comum", value: active.actedCommon ? "Usada" : "Disponível", inline: true },
      { name: "Ação bônus", value: active.actedBonus ? "Usada" : "Disponível", inline: true },
    );
  }

  if (FOOTERS[phase]) embed.setFooter({ text: FOOTERS[phase] });
  return embed;
}

// ---------------------------------------------------------------------------
// Painel de status (vida/chakra/energia)
// ---------------------------------------------------------------------------

// Barra de texto — monoespacada, alinha sozinha dentro do bloco de codigo.
function textBar(value: number, max: number, width = 10): string {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const filled = Math.round(pct * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

// Vida/chakra/energia de todo mundo, num embed separado para cair ABAIXO da
// imagem: dentro de um mesmo embed os fields sempre renderizam acima dela.
// Bloco de codigo porque a fonte monoespacada e' o que mantem as colunas
// alinhadas — o painel saiu de dentro do PNG e virou texto.
export function buildStatusEmbed(session: SessionFull): EmbedBuilder | null {
  const roster = session.participants.filter((p) => p.hpMax > 0);
  if (!roster.length) return null;

  const nums = numberSameNames(session.participants);
  const rows = roster.map((p) => {
    const name = displayName(p.name, nums.get(p.id)).slice(0, 14).padEnd(14);
    const dead = p.hpCurrent <= 0;
    if (dead) {
      return `${name} ${textBar(0, p.hpMax)} ${String(0).padStart(3)}/${String(p.hpMax).padEnd(3)} derrotado`;
    }
    const hp = `${String(p.hpCurrent).padStart(3)}/${String(p.hpMax).padEnd(3)}`;
    let line = `${name} ${textBar(p.hpCurrent, p.hpMax)} ${hp}`;
    // chakra/energia so' existem para jogador — NPC nao gasta recurso
    if (!p.isNpc) {
      line += `  CK ${String(Math.round(p.chakra)).padStart(3)}  EN ${String(Math.round(p.energia)).padStart(3)}`;
    }
    return line;
  });

  return new EmbedBuilder()
    .setColor(0x4e5058)
    .setDescription(["```", ...rows, "```"].join("\n").slice(0, 4000));
}

// ---------------------------------------------------------------------------
// Botoes
// ---------------------------------------------------------------------------

// D-pad de 8 direcoes: a distancia do grid e' Chebyshev (utils/grid.ts), entao
// a diagonal custa o mesmo que a reta — deixar so' as 4 retas escondia metade
// dos movimentos legais do jogador.
const DIRS: { id: string; label: string; row: number }[] = [
  { id: "noroeste", label: "↖", row: 0 },
  { id: "cima", label: "↑", row: 0 },
  { id: "nordeste", label: "↗", row: 0 },
  { id: "esquerda", label: "←", row: 1 },
  { id: "direita", label: "→", row: 1 },
  { id: "sudoeste", label: "↙", row: 2 },
  { id: "baixo", label: "↓", row: 2 },
  { id: "sudeste", label: "↘", row: 2 },
];

function dirButton(id: string, label: string, disabled: boolean): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(`combate:movimento:${id}`)
    .setLabel(label)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled);
}

// Grade 3x3 com o check no centro: ele fecha o deslocamento e passa pra fase
// de acao. Fora da fase de movimento nao ha botao nenhum — as acoes saem por
// /jutsu e o turno passa sozinho quando elas acabam (ou por /combate fim-turno
// pra quem quiser sair antes).
export function combatRows(opts: {
  phase: TurnPhase;
  stepsLeft: number;
}): ActionRowBuilder<ButtonBuilder>[] {
  if (opts.phase !== "MOVIMENTO") return [];
  const blocked = opts.stepsLeft <= 0;
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let r = 0; r < 3; r++) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (const d of DIRS.filter((x) => x.row === r)) {
      row.addComponents(dirButton(d.id, d.label, blocked));
    }
    // centro da grade: encerra o movimento e libera comum/bonus
    if (r === 1) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId("combate:movimento:concluir")
          .setEmoji("✅")
          .setStyle(ButtonStyle.Success),
      );
      // reordena para ↖ ↑ ↗ / ← ✅ → / ↙ ↓ ↘
      const comps = row.components;
      row.setComponents(comps[0]!, comps[2]!, comps[1]!);
    }
    rows.push(row);
  }
  return rows;
}
