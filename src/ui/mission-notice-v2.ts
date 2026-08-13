import type { TextBasedChannel } from "discord.js";
import {
  divider,
  economyContainer,
  listBlock,
  text,
  titleBlock,
  v2Public,
  type AccentName,
  type ContainerChild,
  type TopLevel,
} from "./economy-components-v2.js";

export type MissionNoticeKind = "objetivo" | "investigacao" | "descoberta" | "pausa" | "perigo" | "falha";

export interface MissionNoticeInput {
  kind: MissionNoticeKind;
  title: string;
  description: string;
  items?: string[];
  itemsTitle?: string;
  footer?: string;
}

const APPEARANCE: Record<MissionNoticeKind, { emoji: string; accent: AccentName }> = {
  objetivo: { emoji: "🧭", accent: "vila" },
  investigacao: { emoji: "🔎", accent: "vila" },
  descoberta: { emoji: "🧩", accent: "cofre" },
  pausa: { emoji: "⏳", accent: "aviso" },
  perigo: { emoji: "⚔️", accent: "obras" },
  falha: { emoji: "❌", accent: "erro" },
};

export function missionNotice(input: MissionNoticeInput): TopLevel[] {
  const appearance = APPEARANCE[input.kind];
  const children: ContainerChild[] = [
    titleBlock(appearance.emoji, input.title),
    text(input.description),
  ];
  if (input.items?.length) {
    children.push(
      divider(),
      listBlock(input.itemsTitle ?? "Próximos passos", input.items.map((item) => `• ${item}`), "Nenhum."),
    );
  }
  if (input.footer) children.push(text(`-# ${input.footer}`));
  return [economyContainer(appearance.accent, children)];
}

export function missionNoticePayload(input: MissionNoticeInput) {
  return v2Public(missionNotice(input));
}

export async function sendMissionNotice(
  channel: TextBasedChannel | null,
  input: MissionNoticeInput,
): Promise<void> {
  if (!channel || !("send" in channel)) return;
  await channel.send(missionNoticePayload(input));
}

export function pausedMissionNotice(description: string, footer = "Use /mapa para retomar esta etapa."): MissionNoticeInput {
  return { kind: "pausa", title: "Etapa pausada", description, footer };
}

export function discoveryMissionNotice(title: string, description: string, next?: string): MissionNoticeInput {
  return {
    kind: "descoberta",
    title,
    description,
    ...(next ? { items: [next], itemsTitle: "Próximo passo" } : {}),
  };
}
