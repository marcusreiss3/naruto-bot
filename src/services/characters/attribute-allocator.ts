// Distribuicao de pontos de atributo: logica pura (rascunho) + persistencia.
// A UI de Discord vive em commands/atributos.ts.
import { prisma } from "../../db/client.js";
import { BALANCE } from "../../config/balance.js";
import { ATTRIBUTES, ATTRIBUTE_LABELS, type Attribute } from "../../config/enums.js";
import { ATTRIBUTES_SEM_EFEITO } from "../combat/combat-math.js";
import { refreshDerived, autoUnlockJutsus } from "./character-service.js";

// Rascunho: quanto o jogador alocou em cada atributo, ainda sem gravar.
export type Draft = Partial<Record<Attribute, number>>;

export interface AllocState {
  // valores atuais no banco
  current: Record<Attribute, number>;
  // pontos nulos disponiveis
  pool: number;
  draft: Draft;
}

export function draftTotal(draft: Draft): number {
  return Object.values(draft).reduce((a, b) => a + (b ?? 0), 0);
}

export function pointsLeft(s: AllocState): number {
  return s.pool - draftTotal(s.draft);
}

// Valor final de um atributo = banco + rascunho.
export function valueOf(s: AllocState, attr: Attribute): number {
  return s.current[attr] + (s.draft[attr] ?? 0);
}

// Quanto ainda cabe num atributo, considerando pool e teto.
export function roomFor(s: AllocState, attr: Attribute): number {
  const byPool = pointsLeft(s);
  if (BALANCE.attributeCap <= 0) return byPool;
  return Math.max(0, Math.min(byPool, BALANCE.attributeCap - valueOf(s, attr)));
}

// Soma `n` pontos ao rascunho, limitado pelo que cabe. Retorna quanto entrou.
export function addToDraft(s: AllocState, attr: Attribute, n: number): number {
  const room = roomFor(s, attr);
  const applied = Math.max(0, Math.min(n, room));
  if (applied > 0) s.draft[attr] = (s.draft[attr] ?? 0) + applied;
  return applied;
}

export function clearDraft(s: AllocState): void {
  s.draft = {};
}

export function attrHasNoEffect(attr: Attribute): boolean {
  return ATTRIBUTES_SEM_EFEITO.includes(attr);
}

export interface CommitResult {
  spent: number;
  // jutsus liberados pelos novos valores de atributo
  unlocked: string[];
}

// Grava o rascunho. Debita o pool e soma nos atributos numa transacao, para
// nao existir estado onde o ponto sai do pool sem entrar no atributo.
export async function commitDraft(charId: string, draft: Draft): Promise<CommitResult> {
  const spent = draftTotal(draft);
  if (spent <= 0) return { spent: 0, unlocked: [] };

  const char = await prisma.userCharacter.findUnique({
    where: { id: charId },
    select: { attributePoints: true },
  });
  if (!char) throw new Error("Personagem nao encontrado.");
  // revalida contra o banco: o rascunho vive em memoria e pode estar velho
  if (spent > char.attributePoints) {
    throw new Error(`Pontos insuficientes (tem ${char.attributePoints}, tentou gastar ${spent}).`);
  }

  const incs: Record<string, { increment: number }> = {};
  for (const [attr, n] of Object.entries(draft)) {
    if (n && n > 0) incs[attr] = { increment: n };
  }

  await prisma.$transaction([
    prisma.userCharacter.update({
      where: { id: charId },
      data: { attributePoints: { decrement: spent } },
    }),
    prisma.characterAttributes.update({ where: { charId }, data: incs }),
  ]);

  // taijutsu muda hpMax
  await refreshDerived(charId);
  // atributo maior pode cumprir requisito de jutsu novo
  const unlocked = await autoUnlockJutsus(charId);
  return { spent, unlocked };
}

export async function loadAllocState(charId: string): Promise<AllocState | null> {
  const char = await prisma.userCharacter.findUnique({
    where: { id: charId },
    include: { attributes: true },
  });
  if (!char || !char.attributes) return null;
  const current = {} as Record<Attribute, number>;
  for (const a of ATTRIBUTES) {
    current[a] = (char.attributes as unknown as Record<string, number>)[a] ?? 1;
  }
  return { current, pool: char.attributePoints, draft: {} };
}

// Reseta todos os atributos para 1 e devolve os pontos gastos ao pool.
// Usado pelo /admin respec. O total devolvido e o que foi investido acima da
// base, nao o que o nivel deu — assim admin somando ponto na mao nao some.
export async function respec(charId: string): Promise<number> {
  const state = await loadAllocState(charId);
  if (!state) throw new Error("Personagem nao encontrado.");
  const invested = ATTRIBUTES.reduce((acc, a) => acc + (state.current[a] - 1), 0);

  const reset: Record<string, number> = {};
  for (const a of ATTRIBUTES) reset[a] = 1;

  await prisma.$transaction([
    prisma.characterAttributes.update({ where: { charId }, data: reset }),
    prisma.userCharacter.update({
      where: { id: charId },
      data: { attributePoints: { increment: invested } },
    }),
  ]);
  await refreshDerived(charId);
  return invested;
}

// Linha de exibicao de um atributo: "Ninjutsu  8 (+2)  ⚠️ sem efeito"
export function attrLine(s: AllocState, attr: Attribute): string {
  const base = s.current[attr];
  const add = s.draft[attr] ?? 0;
  const label = ATTRIBUTE_LABELS[attr];
  const delta = add > 0 ? ` **+${add}** → ${base + add}` : "";
  const warn = attrHasNoEffect(attr) ? "  ⚠️ sem efeito ainda" : "";
  return `${label}: ${base}${delta}${warn}`;
}
