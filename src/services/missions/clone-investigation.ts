import {
  ActionRowBuilder,
  ComponentType,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type ChatInputCommandInteraction,
  type Message,
  type StringSelectMenuInteraction,
  type TextBasedChannel,
} from "discord.js";
import { prisma } from "../../db/client.js";
import { ACADEMIA_GENIN_CHANNEL_ID } from "../../data/scenarios/index.js";
import { getMission } from "../../data/missions/index.js";
import { formatPersonaLines, sendAsPersona } from "../discord/persona-webhook.js";
import type { RenderEntity } from "../maps/renderer.js";
import { NpcAiService } from "../npc-ai/npc-ai-service.js";
import { getPersona } from "../npc-ai/personas.js";
import { pausedMissionNotice, sendMissionNotice } from "../../ui/mission-notice-v2.js";
import {
  completeMission,
  buildMissionCompleteEmbed,
  getActiveInstanceByType,
  getInstance,
  markObjective,
  readState,
  setState,
} from "./mission-service.js";

const INSTRUCTOR_KEY = "academy_instructor_yori_clone";
const REAL_KEY = "clone_kenta_door";

const SUSPECTS = [
  {
    key: "clone_kenta_window",
    name: "Kenta perto da janela",
    short: "Janela",
    cell: "B3",
    objectiveId: "entrevistar_janela",
    clue: "Os chinelos estao secos, ele carrega giz azul e insiste que seu lugar e perto da janela.",
  },
  {
    key: REAL_KEY,
    name: "Kenta perto da porta",
    short: "Porta",
    cell: "D8",
    objectiveId: "entrevistar_porta",
    clue: "Ha barro nos chinelos, ele carrega o giz vermelho e aponta corretamente sua carteira perto da porta.",
  },
  {
    key: "clone_kenta_back",
    name: "Kenta no fundo da sala",
    short: "Fundo",
    cell: "E3",
    objectiveId: "entrevistar_fundo",
    clue: "Os chinelos estao molhados e ele tem giz vermelho, mas diz que sua carteira fica no fundo.",
  },
] as const;

export interface CloneInvestigationState {
  stage?: "INTRO" | "INVESTIGATE" | "ACCUSE" | "DONE";
  activeNpc?: string | null;
  introTurns?: number;
  suspectTurns?: Record<string, number>;
  interviewed?: string[];
  running?: boolean;
  mistakes?: number;
}

export interface CloneInvestigationChoice {
  key: string;
  name: string;
}

interface CloneInvestigationContext {
  inst: NonNullable<Awaited<ReturnType<typeof getInstance>>>;
  def: NonNullable<ReturnType<typeof getMission>>;
  ownerCharId: string;
}

function ensureState(raw: string): CloneInvestigationState {
  const state = readState<CloneInvestigationState>(raw);
  state.stage = state.stage ?? "INTRO";
  state.activeNpc = state.activeNpc ?? null;
  state.introTurns = state.introTurns ?? 0;
  state.suspectTurns = state.suspectTurns ?? {};
  state.interviewed = state.interviewed ?? [];
  state.running = state.running ?? false;
  state.mistakes = state.mistakes ?? 0;
  return state;
}

function introTurns(def: CloneInvestigationContext["def"]): number {
  return Number(def.data?.introTurns ?? 3);
}

function suspectTurns(def: CloneInvestigationContext["def"]): number {
  return Number(def.data?.suspectTurns ?? 2);
}

function maxMistakes(def: CloneInvestigationContext["def"]): number {
  return Number(def.data?.maxMistakes ?? 2);
}

function stepTimeout(def: CloneInvestigationContext["def"]): number {
  return Number(def.data?.stepTimeoutMs ?? 60_000);
}

async function findContextByCharId(charId: string): Promise<CloneInvestigationContext | null> {
  const c = await getActiveInstanceByType(charId, "CLONE_INVESTIGATION");
  if (!c) return null;
  return { inst: c.inst, def: c.def, ownerCharId: charId };
}

export async function resolveCloneInvestigation(
  discordId: string,
  guildId: string,
): Promise<CloneInvestigationContext | null> {
  const own = await prisma.userCharacter.findUnique({
    where: { discordId_guildId: { discordId, guildId } },
    select: { id: true },
  });
  return own ? findContextByCharId(own.id) : null;
}

export function availableCloneInvestigationNpcs(
  state: CloneInvestigationState,
  channelId: string,
): CloneInvestigationChoice[] {
  if (channelId !== ACADEMIA_GENIN_CHANNEL_ID) return [];
  if (state.stage === "INTRO") return [{ key: INSTRUCTOR_KEY, name: "Yori Umino (clones)" }];
  if (state.stage !== "INVESTIGATE") return [];
  if (state.activeNpc) {
    const active = SUSPECTS.find((suspect) => suspect.key === state.activeNpc);
    return active ? [{ key: active.key, name: active.name }] : [];
  }
  return SUSPECTS
    .filter((suspect) => !(state.interviewed ?? []).includes(suspect.key))
    .map((suspect) => ({ key: suspect.key, name: suspect.name }));
}

export async function cloneInvestigationMapHandle(
  interaction: ChatInputCommandInteraction,
  ctx: CloneInvestigationContext,
  entities: RenderEntity[],
): Promise<string | null> {
  if (interaction.channelId !== ACADEMIA_GENIN_CHANNEL_ID) return null;
  let state = ensureState(ctx.inst.stateJson);
  if (state.stage === "DONE") return null;

  if (state.stage === "INTRO") entities.push(instructorEntity());
  entities.push(...suspectEntities(state));

  if (state.stage === "INTRO") {
    return `\nMissao ativa: **${ctx.def.name}** - fale com Yori usando \`/interagir npc\`.`;
  }
  if (state.stage === "INVESTIGATE") {
    return `\nMissao ativa: **${ctx.def.name}** - entreviste as tres versoes de Kenta com \`/interagir npc\`. Entrevistas: **${state.interviewed?.length ?? 0}/3**.`;
  }
  if (state.running) {
    return `\nMissao ativa: **${ctx.def.name}** - a acusacao ja esta aberta no canal.`;
  }

  state.running = true;
  await setState(ctx.inst.id, state);
  void startAccusation(interaction.channel, ctx.inst.id, interaction.user.id).catch(() => undefined);
  return `\nMissao ativa: **${ctx.def.name}** - compare as provas e identifique o Kenta verdadeiro no painel.`;
}

function instructorEntity(): RenderEntity {
  return {
    cell: "C3",
    name: "Yori Umino",
    label: "Yor",
    color: "#3498db",
    kind: "NPC",
    imageFile: "npcs/academy-instructor-yori.png",
  };
}

function suspectEntities(state: CloneInvestigationState): RenderEntity[] {
  return SUSPECTS.map((suspect) => ({
    cell: suspect.cell,
    name: suspect.name,
    label: "Ken",
    color: (state.interviewed ?? []).includes(suspect.key) ? "#f1c40f" : "#9b59b6",
    kind: "NPC",
    imageFile: "npcs/genin-kenta.png",
    badge: (state.interviewed ?? []).includes(suspect.key) ? "?" : "!",
  }));
}

async function speak(
  channel: TextBasedChannel | null,
  personaKey: string,
  message: string,
  extra: string,
  fallbackIndex: number,
): Promise<void> {
  const text = await NpcAiService.say(personaKey, message, extra, fallbackIndex);
  const persona = getPersona(personaKey);
  const sent = await sendAsPersona(channel, {
    key: personaKey,
    name: persona?.displayName ?? "NPC",
    avatarFile: persona?.avatarFile,
    lines: formatPersonaLines(text),
  });
  if (!sent && channel && "send" in channel) await channel.send(text.slice(0, 1900));
}

export async function interactCloneInvestigation(
  interaction: ChatInputCommandInteraction,
  npcKey: string,
): Promise<void> {
  const guildId = interaction.guildId ?? "global";
  const ctx = await resolveCloneInvestigation(interaction.user.id, guildId);
  if (!ctx) {
    await interaction.reply({ content: "Voce nao tem essa missao ativa.", ephemeral: true });
    return;
  }
  const state = ensureState(ctx.inst.stateJson);
  const choice = availableCloneInvestigationNpcs(state, interaction.channelId).find((npc) => npc.key === npcKey);
  if (!choice) {
    await interaction.reply({ content: "Esse NPC nao esta disponivel para essa etapa.", ephemeral: true });
    return;
  }
  if (state.activeNpc && state.activeNpc !== npcKey) {
    await interaction.reply({ content: "Termine a entrevista atual antes de falar com outro Kenta.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  state.activeNpc = npcKey;
  await setState(ctx.inst.id, state);
  await runDialogue(interaction.channel, ctx, npcKey, "(o ninja inicia a investigacao)");
  await interaction.editReply(`Voce se aproxima de **${choice.name}**. Continue por mensagens normais no canal.`);
}

export async function continueCloneInvestigationMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.guildId || message.channelId !== ACADEMIA_GENIN_CHANNEL_ID) return false;
  const ctx = await resolveCloneInvestigation(message.author.id, message.guildId);
  if (!ctx) return false;
  const state = ensureState(ctx.inst.stateJson);
  if (!state.activeNpc) return false;
  if (!availableCloneInvestigationNpcs(state, message.channelId).some((npc) => npc.key === state.activeNpc)) return false;
  await runDialogue(message.channel, ctx, state.activeNpc, message.content || "...");
  return true;
}

async function runDialogue(
  channel: TextBasedChannel | null,
  ctx: CloneInvestigationContext,
  npcKey: string,
  playerMessage: string,
): Promise<void> {
  const inst = await getInstance(ctx.inst.id);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "CLONE_INVESTIGATION") return;
  const state = ensureState(inst.stateJson);

  if (npcKey === INSTRUCTOR_KEY && state.stage === "INTRO") {
    state.introTurns = (state.introTurns ?? 0) + 1;
    const done = state.introTurns >= introTurns(def);
    await speak(
      channel,
      INSTRUCTOR_KEY,
      playerMessage,
      done
        ? "Ultima fala: explique as tres provas objetivas. O Kenta verdadeiro voltou do patio com barro nos chinelos, recebeu giz vermelho e senta perto da porta. Mande entrevistar os tres com /interagir npc."
        : "Explique que Kenta usou clones para fugir da arrumacao e que acusar sem comparar as provas seria injusto.",
      done ? 2 : Math.min((state.introTurns ?? 1) - 1, 1),
    );
    if (done) {
      state.stage = "INVESTIGATE";
      state.activeNpc = null;
      await markObjective(inst.id, "falar_instrutor");
      await setState(inst.id, state);
      if (channel && "send" in channel) {
        await sendMissionNotice(channel, {
          kind: "investigacao",
          title: "Provas fornecidas por Yori",
          description: "O Kenta verdadeiro pode ser identificado por três características verificáveis.",
          itemsTitle: "Características",
          items: ["Barro nos chinelos", "Giz vermelho", "Carteira perto da porta"],
          footer: "Entreviste os três suspeitos usando /interagir npc.",
        });
      }
      return;
    }
    await setState(inst.id, state);
    return;
  }

  const suspect = SUSPECTS.find((entry) => entry.key === npcKey);
  if (!suspect || state.stage !== "INVESTIGATE") return;
  const turn = (state.suspectTurns?.[npcKey] ?? 0) + 1;
  state.suspectTurns![npcKey] = turn;
  const done = turn >= suspectTurns(def);
  await speak(
    channel,
    npcKey,
    playerMessage,
    done
      ? `Ultima fala: revele sem ambiguidade estes detalhes observaveis: ${suspect.clue}`
      : "Responda como Kenta, um pouco nervoso, sem revelar todos os detalhes ainda.",
    done ? 1 : 0,
  );

  if (done) {
    state.interviewed = [...new Set([...(state.interviewed ?? []), npcKey])];
    state.activeNpc = null;
    await markObjective(inst.id, suspect.objectiveId);
    if (state.interviewed.length === SUSPECTS.length) {
      state.stage = "ACCUSE";
      if (channel && "send" in channel) {
        await sendMissionNotice(channel, {
          kind: "descoberta",
          title: "Entrevistas concluídas",
          description: "Os três relatos estão disponíveis para comparação.",
          items: ["Use `/mapa` para revisar as provas e identificar o Kenta verdadeiro."],
          itemsTitle: "Próximo passo",
        });
      }
    }
  }
  await setState(inst.id, state);
}

function accusationEmbed(state: CloneInvestigationState, def: CloneInvestigationContext["def"]): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x8e44ad)
    .setTitle("Qual Kenta e o verdadeiro?")
    .setDescription(
      [
        "**Provas confirmadas por Yori:**",
        "- O verdadeiro voltou do patio e tem barro nos chinelos.",
        "- Ele recebeu um bastao de giz vermelho.",
        "- Sua carteira fica perto da porta.",
        "",
        "**Relatos observados:**",
        ...SUSPECTS.map((suspect) => `- **${suspect.name}:** ${suspect.clue}`),
        "",
        `Acusacoes erradas: **${state.mistakes ?? 0}/${maxMistakes(def)}**`,
      ].join("\n"),
    );
}

function accusationMenu(instanceId: string): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`clone:accuse:${instanceId}`)
      .setPlaceholder("Escolha o Kenta verdadeiro")
      .addOptions(SUSPECTS.map((suspect) => ({
        label: suspect.name,
        description: `Posicao: ${suspect.short}`,
        value: suspect.key,
      }))),
  );
}

async function startAccusation(
  channel: TextBasedChannel | null,
  instanceId: string,
  actorDiscordId: string,
): Promise<void> {
  if (!channel || !("send" in channel)) return;
  const inst = await getInstance(instanceId);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "CLONE_INVESTIGATION") return;

  let state = ensureState(inst.stateJson);
  const msg = await channel.send({
    embeds: [accusationEmbed(state, def)],
    components: [accusationMenu(instanceId)],
  });

  while (state.stage === "ACCUSE") {
    try {
      const pick = (await msg.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        time: stepTimeout(def),
        filter: (i: StringSelectMenuInteraction) =>
          i.user.id === actorDiscordId && i.customId === `clone:accuse:${instanceId}`,
      })) as StringSelectMenuInteraction;

      if (pick.values[0] !== REAL_KEY) {
        state.mistakes = (state.mistakes ?? 0) + 1;
        if ((state.mistakes ?? 0) >= maxMistakes(def)) {
          await prisma.missionInstance.update({ where: { id: instanceId }, data: { status: "FAILED" } });
          await pick.update({
            embeds: [
              new EmbedBuilder()
                .setColor(0xc0392b)
                .setTitle("<:investigation:1523544296379383949> Investigacao encerrada")
                .setDescription("Acusacoes erradas demais fizeram os clones se dispersarem antes da identificacao."),
            ],
            components: [],
          });
          return;
        }
        await setState(instanceId, state);
        await pick.update({ embeds: [accusationEmbed(state, def)], components: [accusationMenu(instanceId)] });
        continue;
      }

      state.stage = "DONE";
      state.running = false;
      await markObjective(instanceId, "identificar_kenta");
      await setState(instanceId, state);
      await pick.update({
        embeds: [
          new EmbedBuilder()
            .setColor(0x2ecc71)
            .setTitle("<:investigation_check:1523545905255547001> Kenta verdadeiro identificado")
            .setDescription("As tres provas apontam para o Kenta perto da porta. Ele desfaz os clones e aceita ajudar na arrumacao."),
        ],
        components: [],
      });
      await speak(
        channel,
        REAL_KEY,
        "(o ninja apresenta as tres provas)",
        "Admita que voce criou os clones para fugir da arrumacao, desfaca a tecnica e aceite ajudar. Seja envergonhado, sem combate.",
        2,
      );
      const result = await completeMission(inst.charId, inst.missionId);
      if (result) {
        await channel.send(buildMissionCompleteEmbed(def.name, result));
      }
      return;
    } catch {
      state.running = false;
      await setState(instanceId, state);
      await msg.edit({ components: [] }).catch(() => undefined);
      await sendMissionNotice(channel, pausedMissionNotice("O tempo para registrar a acusação terminou."));
      return;
    }
  }
}
