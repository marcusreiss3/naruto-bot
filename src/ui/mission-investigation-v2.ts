import { ButtonStyle } from "discord.js";
import {
  button,
  buttonRow,
  divider,
  economyContainer,
  listBlock,
  noticeBlock,
  text,
  titleBlock,
  type TopLevel,
} from "./economy-components-v2.js";
import { clueCountsByUser, investigationClueQuota } from "../services/missions/investigation-party.js";

export interface InvestigationActionView {
  id: string;
  label: string;
  detail: string;
}

export interface InvestigationDeductionView {
  id: string;
  label: string;
}

export interface InvestigationMemoryView {
  ownerId: string;
  actionId: string;
  phase: "prepare" | "memorize" | "repeat";
  words: string[];
  sequence: number[];
  position: number;
  countdown?: number;
  displayPosition?: number;
}

export interface InvestigationPanelInput {
  prefix: string;
  instanceId: string;
  clueId: string;
  title: string;
  intro: string;
  actions: InvestigationActionView[];
  deductions: InvestigationDeductionView[];
  question: string;
  evidence: string[];
  lostEvidence: string[];
  evidenceUsers: Record<string, string>;
  attemptUsers: Record<string, string>;
  failedAttempts: Record<string, number>;
  contributors: Record<string, string>;
  votes: Record<string, string>;
  voters: Record<string, string>;
  members: string[];
  completedCases: number;
  totalCases: number;
  mistakes: number;
  maxMistakes: number;
  ready: boolean;
  consensus: string | null;
  page: number;
  memory?: InvestigationMemoryView;
  result?: string;
  disabled?: boolean;
}

export function investigationPanel(input: InvestigationPanelInput): TopLevel[] {
  const page = Math.max(0, Math.min(input.actions.length, input.page));
  const thesisPage = page === input.actions.length;
  const quota = investigationClueQuota(input.actions.length, input.members.length);
  const counts = clueCountsByUser(input.members, input.attemptUsers);
  const attempted = new Set([...input.evidence, ...input.lostEvidence]);
  const pageName = thesisPage ? "Página de conclusão" : `Pista ${page + 1} de ${input.actions.length}`;
  const progressLine = `Casos ${input.completedCases}/${input.totalCases} • Analisadas ${attempted.size}/${input.actions.length} • Obtidas ${input.evidence.length} • Erros ${input.mistakes}/${input.maxMistakes}`;
  const children = [
    titleBlock("🕵️", `Investigação — ${input.title}`, `${pageName} • ${progressLine}`),
    divider(),
    buttonRow(
      ...input.actions.map((action, index) =>
        button({
          id: `${input.prefix}:${input.instanceId}:${input.clueId}:page:${index}`,
          label: `${input.evidence.includes(action.id) ? "✓ " : input.lostEvidence.includes(action.id) ? "✕ " : ""}Pista ${index + 1}`,
          style: index === page ? ButtonStyle.Primary : ButtonStyle.Secondary,
          disabled: input.disabled || Boolean(input.memory) || index === page,
        }),
      ),
      button({
        id: `${input.prefix}:${input.instanceId}:${input.clueId}:page:${input.actions.length}`,
        label: "Tese",
        style: thesisPage ? ButtonStyle.Primary : ButtonStyle.Secondary,
        disabled: input.disabled || Boolean(input.memory) || thesisPage,
      }),
    ),
  ];

  if (input.memory) {
    const displayedWordIndex = input.memory.sequence[input.memory.displayPosition ?? 0];
    const displayedWord = input.memory.words[displayedWordIndex ?? -1] ?? "?";
    children.push(
      text(input.memory.phase === "prepare"
        ? `## ⏳ Prepare-se para memorizar\n# ${input.memory.countdown ?? 3}`
        : input.memory.phase === "memorize"
          ? `## 🧠 Memorize — palavra ${(input.memory.displayPosition ?? 0) + 1}/${input.memory.sequence.length}\n# ✨ \`${displayedWord}\``
          : `## 🔐 Repita a sequência\nPressione as palavras na ordem mostrada. Progresso: **${input.memory.position}/${input.memory.sequence.length}**.`),
      input.memory.phase === "prepare"
        ? noticeBlock("aviso", `A primeira palavra aparecerá após a contagem. Desafio de <@${input.memory.ownerId}>.`)
        : input.memory.phase === "memorize"
          ? noticeBlock("aviso", "Observe com atenção: somente uma palavra aparece por vez.")
          : noticeBlock("bloqueio", `Você tem duas tentativas por pista. Somente <@${input.memory.ownerId}> pode responder.`),
    );
    if (input.memory.phase === "repeat") {
      children.push(buttonRow(...input.memory.words.map((word, index) => button({
        id: `${input.prefix}:${input.instanceId}:${input.clueId}:memory:${index}`,
        label: word,
        style: ButtonStyle.Primary,
        disabled: input.disabled,
      }))));
    }
  } else if (!thesisPage) {
    const action = input.actions[page]!;
    const discovered = input.evidence.includes(action.id);
    const lost = input.lostEvidence.includes(action.id);
    const failures = input.failedAttempts[action.id] ?? 0;
    const authorId = input.evidenceUsers[action.id];
    children.push(
      text(`## 🔎 ${action.label}\n${discovered ? action.detail : lost ? "Os detalhes desta pista foram perdidos durante a análise." : input.intro}`),
      discovered
        ? noticeBlock("sucesso", `Pista desvendada${authorId ? ` por <@${authorId}>` : ""}.`)
        : lost
          ? noticeBlock("erro", "Pista perdida. Ela não pode ser investigada novamente.")
        : failures > 0
          ? noticeBlock("aviso", "Primeira tentativa falhou. Resta uma última tentativa para recuperar esta pista.")
        : noticeBlock("aviso", "Os detalhes permanecem ocultos até um ninja analisar esta pista."),
      buttonRow(
        button({
          id: `${input.prefix}:${input.instanceId}:${input.clueId}:evidence:${action.id}`,
          label: discovered ? "Pista desvendada" : lost ? "Pista perdida" : failures > 0 ? "Tentar novamente" : "Iniciar desafio",
          style: ButtonStyle.Success,
          disabled: input.disabled || discovered || lost,
        }),
      ),
    );
  } else {
    const voteCounts: Record<string, number> = {};
    for (const vote of Object.values(input.votes)) voteCounts[vote] = (voteCounts[vote] ?? 0) + 1;
    children.push(
      text(`## 📌 ${input.question}`),
      input.ready
        ? listBlock(
            "Votos da equipe",
            input.deductions.map((choice) => {
              const voters = Object.entries(input.votes)
                .filter(([, vote]) => vote === choice.id)
                .map(([id]) => `<@${id}>`);
              return `**${choice.label}** — ${voteCounts[choice.id] ?? 0} voto(s)${voters.length ? ` (${voters.join(", ")})` : ""}`;
            }),
            "Nenhum voto.",
          )
        : noticeBlock("bloqueio", `Concluam as ${input.actions.length} tentativas de análise antes de formular a tese.`),
      buttonRow(
        ...input.deductions.map((choice) =>
          button({
            id: `${input.prefix}:${input.instanceId}:${input.clueId}:deduce:${choice.id}`,
            label: choice.label.slice(0, 80),
            style: ButtonStyle.Primary,
            disabled: input.disabled || !input.ready,
          }),
        ),
      ),
      buttonRow(
        button({
          id: `${input.prefix}:${input.instanceId}:${input.clueId}:submit:case`,
          label: "Enviar tese",
          style: ButtonStyle.Success,
          disabled: input.disabled || !input.ready || !input.consensus,
        }),
        button({
          id: `${input.prefix}:${input.instanceId}:${input.clueId}:clear:vote`,
          label: "Limpar meu voto",
          disabled: input.disabled || !input.ready,
        }),
      ),
    );
  }

  children.push(
    divider(),
    text([
      `**👥 Divisão da party — máximo ${quota} pista(s) por ninja**`,
      ...(input.members.length
        ? input.members.map((id) => `<@${id}> — **${counts[id] ?? 0}/${quota}**`)
        : ["-# Nenhum participante."]),
      "-# Party Rank B: no máximo 4 ninjas. Todos participam antes de alguém assumir uma pista extra.",
    ].join("\n")),
  );
  if (input.result) {
    const kind = input.result.startsWith("❌") ? "erro" : input.result.startsWith("⚠️") ? "aviso" : "sucesso";
    children.push(noticeBlock(kind, input.result.replace(/^[❌⚠️]\s*/u, "")));
  }
  return [economyContainer(input.mistakes >= input.maxMistakes ? "erro" : "vila", children)];
}
