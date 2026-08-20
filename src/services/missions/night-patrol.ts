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
import { BECO_KONOHA_CHANNEL_ID } from "../../data/scenarios/index.js";
import { getMission } from "../../data/missions/index.js";
import { sendMissionNotice } from "../../ui/mission-notice-v2.js";
import { getOrCreateCharacter, attrsFromRow } from "../characters/character-service.js";
import { getActiveSession, startCombat } from "../combat/combat-engine.js";
import { partyMemberIds } from "../party/party-service.js";
import { NpcAiService } from "../npc-ai/npc-ai-service.js";
import { getPersona } from "../npc-ai/personas.js";
import { sendAsPersona, formatPersonaLines } from "../discord/persona-webhook.js";
import { cacheAttrs, gatherPartyPlayers } from "./combat-party.js";
import {
  buildMissionCompleteEmbed,
  completeMission,
  getActiveInstanceByType,
  getInstance,
  markObjective,
  readState,
  setState,
} from "./mission-service.js";
import type { RenderEntity } from "../maps/renderer.js";

const THUG_KEY = "alley_troublemaker";
const THUG_PERSONA = "alley_troublemaker";
const activePatrolPuzzles = new Set<string>();

interface PatrolClue {
  id: string;
  title: string;
  sound: string;
  correct: string;
  success: string;
  options: { label: string; description: string; value: string }[];
}

const CLUES: PatrolClue[] = [
  {
    id: "civil",
    title: "Barulho atras das caixas",
    sound: "Voce ouve um soluco baixo, passos curtos e alguem prendendo a respiracao atras de caixas vazias.",
    correct: "civil",
    success: "Era um morador assustado tentando se esconder. Voce se anuncia com calma e ele para de tremer.",
    options: [
      { label: "Acalmar civil", description: "Falar baixo, mostrar o protetor e pedir que saia devagar.", value: "civil" },
      { label: "Atacar sombra", description: "Golpear primeiro para impedir fuga.", value: "wrong:attack" },
      { label: "Perseguir correndo", description: "Correr pelo beco sem avisar ninguem.", value: "wrong:chase" },
    ],
  },
  {
    id: "cat",
    title: "Lata derrubada",
    sound: "Uma lata rola pelo chao, seguida de um miado irritado e arranhoes subindo no muro.",
    correct: "cat",
    success: "Era so um gato mexendo no lixo. Voce deixa o animal passar e continua a patrulha.",
    options: [
      { label: "Ignorar gato", description: "Reconhecer o miado e seguir a ronda.", value: "cat" },
      { label: "Chamar reforco", description: "Tratar o som como emboscada confirmada.", value: "wrong:backup" },
      { label: "Arremessar kunai", description: "Tentar acertar a lata antes que algo fuja.", value: "wrong:kunai" },
    ],
  },
  {
    id: "suspect",
    title: "Sombra na fechadura",
    sound: "Perto de uma porta lateral, uma sombra mexe numa fechadura com uma haste de metal e olha para os lados.",
    correct: "suspect",
    success: "Agora sim: e um suspeito. Voce se aproxima sem assustar civis e corta a rota de fuga.",
    options: [
      { label: "Confrontar suspeito", description: "Dar ordem de parada e bloquear a saida.", value: "suspect" },
      { label: "Acalmar civil", description: "Tratar como mais um morador assustado.", value: "wrong:civil" },
      { label: "Virar as costas", description: "Assumir que nao e problema da patrulha.", value: "wrong:leave" },
    ],
  },
];

export interface NightPatrolState {
  stage?: "INVESTIGATING" | "THUG_TALK" | "FIGHT" | "DONE";
  activeNpc?: string | null;
  cluesDone?: number;
  mistakes?: number;
  talkedCivil?: boolean;
  thugIntroduced?: boolean;
  npcTurns?: Record<string, number>;
  combatStarted?: boolean;
}

export interface NightPatrolChoice {
  key: string;
  name: string;
}

interface NightPatrolContext {
  inst: NonNullable<Awaited<ReturnType<typeof getInstance>>>;
  def: NonNullable<ReturnType<typeof getMission>>;
  ownerCharId: string;
}

function ensureState(raw: string): NightPatrolState {
  const state = readState<NightPatrolState>(raw);
  state.stage = state.stage ?? "INVESTIGATING";
  state.activeNpc = state.activeNpc ?? null;
  state.cluesDone = state.cluesDone ?? 0;
  state.mistakes = state.mistakes ?? 0;
  state.talkedCivil = state.talkedCivil ?? false;
  state.thugIntroduced = state.thugIntroduced ?? false;
  state.npcTurns = state.npcTurns ?? {};
  state.combatStarted = state.combatStarted ?? false;
  return state;
}

function maxMistakes(def: NightPatrolContext["def"]): number {
  return Number(def.data?.maxMistakes ?? 3);
}

function stepTimeout(def: NightPatrolContext["def"]): number {
  return Number(def.data?.stepTimeoutMs ?? 60_000);
}

function thugTurns(def: NightPatrolContext["def"]): number {
  return Number(def.data?.thugTurns ?? 2);
}

function thugTemplate(def: NightPatrolContext["def"]): string {
  return String(def.data?.thugTemplate ?? "alley_troublemaker");
}

async function findContextByCharId(charId: string): Promise<NightPatrolContext | null> {
  const c = await getActiveInstanceByType(charId, "NIGHT_PATROL");
  if (!c) return null;
  return { inst: c.inst, def: c.def, ownerCharId: charId };
}

export async function resolveNightPatrol(discordId: string, guildId: string): Promise<NightPatrolContext | null> {
  const own = await prisma.userCharacter.findUnique({
    where: { discordId_guildId: { discordId, guildId } },
    select: { id: true },
  });
  if (own) {
    const ctx = await findContextByCharId(own.id);
    if (ctx) return ctx;
  }

  for (const did of await partyMemberIds(guildId, discordId)) {
    if (did === discordId) continue;
    const uc = await prisma.userCharacter.findUnique({
      where: { discordId_guildId: { discordId: did, guildId } },
      select: { id: true },
    });
    if (!uc) continue;
    const ctx = await findContextByCharId(uc.id);
    if (ctx) return ctx;
  }
  return null;
}

export function availableNightPatrolNpcs(state: NightPatrolState, channelId: string): NightPatrolChoice[] {
  if (channelId !== BECO_KONOHA_CHANNEL_ID) return [];
  if ((state.stage ?? "INVESTIGATING") === "THUG_TALK") return [{ key: THUG_KEY, name: "Arruaceiro do Beco" }];
  return [];
}

export async function nightPatrolMapHandle(
  interaction: ChatInputCommandInteraction,
  ctx: NightPatrolContext,
  entities: RenderEntity[],
): Promise<string | null> {
  if (interaction.channelId !== BECO_KONOHA_CHANNEL_ID) return null;
  let state = ensureState(ctx.inst.stateJson);

  if (state.stage === "INVESTIGATING") {
    entities.push(...patrolEntities(state));
    const activeKey = ctx.inst.id;
    if (activePatrolPuzzles.has(activeKey)) {
      return `\nMissao ativa: **${ctx.def.name}** - a investigacao ja esta em andamento no canal.`;
    }
    activePatrolPuzzles.add(activeKey);
    state.stage = "INVESTIGATING";
    await markObjective(ctx.inst.id, "chegar_beco");
    await setState(ctx.inst.id, state);
    void startPatrolPuzzle(interaction.channel, ctx.inst.id, interaction.user.id).finally(() => {
      activePatrolPuzzles.delete(activeKey);
    });
    return `\nMissao ativa: **${ctx.def.name}** - investigue os barulhos no painel enviado no canal.`;
  }

  if (state.stage === "THUG_TALK") {
    entities.push(thugEntity());
    if (!state.thugIntroduced) {
      state.thugIntroduced = true;
      await setState(ctx.inst.id, state);
      await speak(
        interaction.channel,
        "(o ninja encontra o arruaceiro mexendo na porta)",
        "Voce foi pego tentando forcar uma porta no beco. Disfarce mal, fique agressivo e tente intimidar o ninja.",
        0,
      );
    }
    return `\nMissao ativa: **${ctx.def.name}** - confronte o arruaceiro usando \`/interagir npc\`.`;
  }

  if (state.stage === "FIGHT") {
    return `\nMissao ativa: **${ctx.def.name}** - derrote o arruaceiro para encerrar a patrulha.`;
  }
  return null;
}

function patrolEntities(state: NightPatrolState): RenderEntity[] {
  const index = state.cluesDone ?? 0;
  const cells = ["B4", "D6", "E8"];
  return cells.slice(index, index + 1).map((cell) => ({
    cell,
    name: "Barulho suspeito",
    label: "?",
    color: "#f1c40f",
    kind: "MARKER",
  }));
}

function thugEntity(): RenderEntity {
  return {
    cell: "E8",
    name: "Arruaceiro do Beco",
    label: "Arr",
    color: "#c0392b",
    kind: "NPC",
  };
}

async function speak(
  channel: TextBasedChannel | null,
  playerMessage: string,
  extra: string,
  fallbackIndex: number,
): Promise<void> {
  const text = await NpcAiService.say(THUG_PERSONA, playerMessage, extra, fallbackIndex);
  const persona = getPersona(THUG_PERSONA);
  const sent = await sendAsPersona(channel, {
    key: THUG_PERSONA,
    name: persona?.displayName ?? "Arruaceiro do Beco",
    avatarFile: persona?.avatarFile,
    lines: formatPersonaLines(text),
  });
  if (!sent && channel && "send" in channel) await channel.send(text.slice(0, 1900));
}

export async function interactNightPatrol(interaction: ChatInputCommandInteraction, npcKey: string): Promise<void> {
  const guildId = interaction.guildId ?? "global";
  const ctx = await resolveNightPatrol(interaction.user.id, guildId);
  if (!ctx) {
    await interaction.reply({ content: "Voce (ou sua party) nao tem essa missao ativa.", ephemeral: true });
    return;
  }

  const state = ensureState(ctx.inst.stateJson);
  const choice = availableNightPatrolNpcs(state, interaction.channelId).find((n) => n.key === npcKey);
  if (!choice) {
    await interaction.reply({ content: "Esse NPC nao esta disponivel para essa missao aqui.", ephemeral: true });
    return;
  }
  if (state.activeNpc && state.activeNpc !== npcKey) {
    await interaction.reply({ content: "Ja existe uma conversa de missao em andamento nesse local.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  state.activeNpc = npcKey;
  await setState(ctx.inst.id, state);
  const char = await getOrCreateCharacter(interaction.user.id, guildId, interaction.user.username);
  await runThugDialogue(interaction.channel, interaction.channelId, guildId, ctx, char, "(o ninja bloqueia a saida do arruaceiro)");
  await interaction.editReply(`Voce se aproxima de **${choice.name}**. Continue por mensagens normais no canal.`);
}

export async function continueNightPatrolMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.guildId || message.channelId !== BECO_KONOHA_CHANNEL_ID) return false;
  const ctx = await resolveNightPatrol(message.author.id, message.guildId);
  if (!ctx) return false;
  const state = ensureState(ctx.inst.stateJson);
  if (state.activeNpc !== THUG_KEY) return false;
  if (!availableNightPatrolNpcs(state, message.channelId).some((n) => n.key === THUG_KEY)) return false;

  const char = await getOrCreateCharacter(message.author.id, message.guildId, message.author.username);
  await runThugDialogue(message.channel, message.channelId, message.guildId, ctx, char, message.content || "...");
  return true;
}

async function runThugDialogue(
  channel: TextBasedChannel | null,
  channelId: string,
  guildId: string,
  ctx: NightPatrolContext,
  char: Awaited<ReturnType<typeof getOrCreateCharacter>>,
  playerMessage: string,
): Promise<void> {
  const inst = await getInstance(ctx.inst.id);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "NIGHT_PATROL") return;
  const state = ensureState(inst.stateJson);
  if (state.stage !== "THUG_TALK") return;

  const turn = (state.npcTurns!.thug ?? 0) + 1;
  state.npcTurns!.thug = turn;
  const fight = turn >= thugTurns(def);
  await speak(
    channel,
    playerMessage,
    fight
      ? "Esta e sua ultima fala: pare de fingir, avance para o combate e tente fugir pela forca."
      : "Tente disfarcar, diga que nao fez nada e intimide o ninja, mas ainda nao comece combate.",
    fight ? 1 : 0,
  );

  if (!fight) {
    await setState(inst.id, state);
    return;
  }

  state.stage = "FIGHT";
  state.activeNpc = null;
  state.combatStarted = true;
  await markObjective(inst.id, "confrontar_arruaceiro");
  await setState(inst.id, state);
  await startPatrolCombat(channel, channelId, guildId, char, inst.id, def);
}

async function startPatrolCombat(
  channel: TextBasedChannel | null,
  channelId: string,
  guildId: string,
  char: Awaited<ReturnType<typeof getOrCreateCharacter>>,
  instanceId: string,
  def: NonNullable<ReturnType<typeof getMission>>,
): Promise<void> {
  if (await getActiveSession(channelId)) {
    if (channel && "send" in channel) await channel.send("O combate ja esta em andamento. Use `/mapa`.");
    return;
  }

  const { players, attrsById } = await gatherPartyPlayers(channel, guildId, {
    charId: char.id,
    name: char.name,
    level: char.level,
    hpCurrent: char.hpCurrent,
    hpMax: char.hpMax,
    chakra: char.resources?.chakra ?? 100,
    energia: char.resources?.energia ?? 100,
    jutsuIds: char.jutsus.map((j: { jutsuId: string }) => j.jutsuId),
    attrs: attrsFromRow(char.attributes ?? {}),
  });

  const session = await startCombat({
    channelId,
    guildId,
    scenarioId: "beco_konoha",
    players,
    npcs: [{ templateId: thugTemplate(def) }],
    missionInstanceId: instanceId,
  });
  await cacheAttrs(session, attrsById);
  if (channel && "send" in channel) {
    await channel.send(`Combate iniciado contra o **Arruaceiro do Beco**! ${players.length} ninja(s) na luta. Use \`/mapa\`.`);
  }
}

function buildPatrolEmbed(state: NightPatrolState, def: NonNullable<ReturnType<typeof getMission>>): EmbedBuilder {
  const clue = CLUES[state.cluesDone ?? 0];
  return new EmbedBuilder()
    .setColor(0x34495e)
    .setTitle("Patrulha Noturna no Beco")
    .setDescription(
      [
        `Pistas avaliadas: **${state.cluesDone ?? 0}/${CLUES.length}**`,
        `Erros: **${state.mistakes ?? 0}/${maxMistakes(def)}**`,
        "",
        clue ? `**${clue.title}:** ${clue.sound}` : "Todos os barulhos foram avaliados.",
        "",
        "Escolha a abordagem correta para manter a patrulha sob controle.",
      ].join("\n"),
    );
}

function buildPatrolMenu(instanceId: string, state: NightPatrolState): ActionRowBuilder<StringSelectMenuBuilder> {
  const index = state.cluesDone ?? 0;
  const clue = CLUES[index]!;
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`nightpatrol:${instanceId}:${index + 1}`)
      .setPlaceholder("Escolha a abordagem")
      .addOptions(clue.options),
  );
}

async function startPatrolPuzzle(
  channel: TextBasedChannel | null,
  instanceId: string,
  actorDiscordId: string,
): Promise<void> {
  if (!channel || !("send" in channel)) return;
  const inst = await getInstance(instanceId);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "NIGHT_PATROL") return;

  let state = ensureState(inst.stateJson);
  let msg = await channel.send({ embeds: [buildPatrolEmbed(state, def)], components: [buildPatrolMenu(instanceId, state)] });

  while ((state.cluesDone ?? 0) < CLUES.length) {
    const round = (state.cluesDone ?? 0) + 1;
    const clue = CLUES[state.cluesDone ?? 0]!;
    try {
      const pick = (await msg.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        time: stepTimeout(def),
        filter: (i: StringSelectMenuInteraction) =>
          i.user.id === actorDiscordId && i.customId === `nightpatrol:${instanceId}:${round}`,
      })) as StringSelectMenuInteraction;

      const value = pick.values[0]!;
      state = ensureState((await getInstance(instanceId))?.stateJson ?? "{}");
      if (value === clue.correct) {
        state.cluesDone = (state.cluesDone ?? 0) + 1;
        if (clue.id === "civil") {
          state.talkedCivil = true;
          await markObjective(instanceId, "acalmar_civil");
        }
      } else {
        state.mistakes = (state.mistakes ?? 0) + 1;
      }

      if ((state.mistakes ?? 0) >= maxMistakes(def)) {
        await failNightPatrolMission(instanceId, msg, "A patrulha fez barulho demais e o suspeito escapou pelo beco.");
        return;
      }

      const done = (state.cluesDone ?? 0) >= CLUES.length;
      if (done) {
        state.stage = "THUG_TALK";
        await markObjective(instanceId, "investigar_barulhos");
      }
      await setState(instanceId, state);
      await pick.update({
        embeds: [
          done
            ? EmbedBuilder.from(buildPatrolEmbed(state, def)).setDescription(
                "Os barulhos foram avaliados: civil acalmado, alarme falso ignorado e suspeito localizado.\n\nUse `/interagir npc` para confrontar o **Arruaceiro do Beco**.",
              )
            : EmbedBuilder.from(buildPatrolEmbed(state, def)).setFooter({ text: value === clue.correct ? clue.success : "Abordagem errada. Reavalie antes de continuar." }),
        ],
        components: done ? [] : [buildPatrolMenu(instanceId, state)],
      });
      if (done) break;
    } catch {
      await failNightPatrolMission(instanceId, msg, "Tempo esgotado. A movimentacao no beco sumiu antes da patrulha agir.");
      return;
    }
  }

  await sendMissionNotice(channel, {
    kind: "descoberta",
    title: "Suspeito localizado",
    description: "As pistas da patrulha convergem para um arruaceiro escondido no Beco de Konoha.",
    items: ["Use `/interagir npc` para confrontá-lo."],
    itemsTitle: "Próximo passo",
  });
}

async function failNightPatrolMission(instanceId: string, msg: Message, reason: string): Promise<void> {
  await prisma.missionInstance.update({ where: { id: instanceId }, data: { status: "FAILED" } });
  await msg.edit({
    embeds: [new EmbedBuilder().setColor(0xc0392b).setTitle("Patrulha comprometida").setDescription(reason)],
    components: [],
  }).catch(() => undefined);
}

export async function onNightPatrolCombatWon(
  interaction: ChatInputCommandInteraction,
  instanceId: string,
): Promise<void> {
  const inst = await getInstance(instanceId);
  if (!inst || inst.status !== "ACTIVE") return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "NIGHT_PATROL") return;

  const state = ensureState(inst.stateJson);
  state.stage = "DONE";
  state.activeNpc = null;
  state.combatStarted = false;
  await markObjective(inst.id, "derrotar_arruaceiro");
  await setState(inst.id, state);

  const result = await completeMission(inst.charId, inst.missionId);
  if (result) {
    await interaction.followUp(buildMissionCompleteEmbed(def.name, result));
  }
}
