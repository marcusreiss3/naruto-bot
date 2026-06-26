import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Message,
  type TextBasedChannel,
} from "discord.js";
import { prisma } from "../../db/client.js";
import { CENTRO_COMERCIAL_CHANNEL_ID } from "../../data/scenarios/index.js";
import { getMission } from "../../data/missions/index.js";
import { partyMemberIds } from "../party/party-service.js";
import { NpcAiService } from "../npc-ai/npc-ai-service.js";
import { getPersona } from "../npc-ai/personas.js";
import { sendAsPersona, formatPersonaLines } from "../discord/persona-webhook.js";
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

const NPC_KEY = "comerciante_bolinhos";
const PERSONA_KEY = "dango_merchant";

export interface DangoRushState {
  stage?: "INTRO" | "COOKING" | "DONE";
  activeNpc?: string | null;
  talks?: number;
  cooked?: number;
  minigameRunning?: boolean;
}

export interface DangoRushChoice {
  key: string;
  name: string;
}

interface DangoRushContext {
  inst: NonNullable<Awaited<ReturnType<typeof getInstance>>>;
  def: NonNullable<ReturnType<typeof getMission>>;
  ownerCharId: string;
}

function ensureState(raw: string): DangoRushState {
  const state = readState<DangoRushState>(raw);
  state.stage = state.stage ?? "INTRO";
  state.activeNpc = state.activeNpc ?? null;
  state.talks = state.talks ?? 0;
  state.cooked = state.cooked ?? 0;
  state.minigameRunning = state.minigameRunning ?? false;
  return state;
}

function explainTurns(def: DangoRushContext["def"]): number {
  return Number(def.data?.explainTurns ?? 3);
}

function cookingRounds(def: DangoRushContext["def"]): number {
  return Number(def.data?.cookingRounds ?? 3);
}

function buttonDelay(def: DangoRushContext["def"]): number {
  return Number(def.data?.buttonDelayMs ?? 2400);
}

function buttonWindow(def: DangoRushContext["def"]): number {
  return Number(def.data?.buttonWindowMs ?? 3000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function findContextByCharId(charId: string): Promise<DangoRushContext | null> {
  const c = await getActiveInstanceByType(charId, "DANGO_RUSH");
  if (!c) return null;
  return { inst: c.inst, def: c.def, ownerCharId: charId };
}

export async function resolveDangoRush(discordId: string, guildId: string): Promise<DangoRushContext | null> {
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

export function availableDangoRushNpcs(state: DangoRushState, channelId: string): DangoRushChoice[] {
  if (channelId !== CENTRO_COMERCIAL_CHANNEL_ID) return [];
  if ((state.stage ?? "INTRO") !== "INTRO") return [];
  return [{ key: NPC_KEY, name: "Comerciante de Bolinhos" }];
}

export async function dangoRushMapHandle(
  interaction: ChatInputCommandInteraction,
  ctx: DangoRushContext,
  entities: RenderEntity[],
): Promise<string | null> {
  if (interaction.channelId !== CENTRO_COMERCIAL_CHANNEL_ID) return null;
  const state = ensureState(ctx.inst.stateJson);
  if (state.stage === "DONE") return null;
  entities.push(merchantEntity());
  await setState(ctx.inst.id, state);
  if (state.stage === "COOKING") {
    return `\nMissao ativa: **${ctx.def.name}** - bolinhos preparados: **${state.cooked}/${cookingRounds(ctx.def)}**.`;
  }
  return `\nMissao ativa: **${ctx.def.name}** - fale com o comerciante de bolinhos usando \`/interagir npc\`.`;
}

function merchantEntity(): RenderEntity {
  return {
    cell: "C4",
    name: "Comerciante de Bolinhos",
    label: "Bol",
    color: "#e67e22",
    kind: "NPC",
    imageFile: "npcs/dango-merchant.png",
  };
}

async function speak(channel: TextBasedChannel | null, message: string, extra: string, fallbackIndex: number): Promise<void> {
  const text = await NpcAiService.say(PERSONA_KEY, message, extra, fallbackIndex);
  const persona = getPersona(PERSONA_KEY);
  const sent = await sendAsPersona(channel, {
    key: PERSONA_KEY,
    name: persona?.displayName ?? "Comerciante de Bolinhos",
    avatarFile: persona?.avatarFile,
    lines: formatPersonaLines(text),
  });
  if (!sent && channel && "send" in channel) await channel.send(text.slice(0, 1900));
}

export async function interactDangoRush(interaction: ChatInputCommandInteraction, npcKey: string): Promise<void> {
  const guildId = interaction.guildId ?? "global";
  const ctx = await resolveDangoRush(interaction.user.id, guildId);
  if (!ctx) {
    await interaction.reply({ content: "Voce (ou sua party) nao tem essa missao ativa.", ephemeral: true });
    return;
  }
  if (interaction.channelId !== CENTRO_COMERCIAL_CHANNEL_ID || npcKey !== NPC_KEY) {
    await interaction.reply({ content: "Esse NPC nao esta disponivel para essa missao aqui.", ephemeral: true });
    return;
  }
  const state = ensureState(ctx.inst.stateJson);
  if (state.stage !== "INTRO") {
    await interaction.reply({ content: "A explicacao ja terminou. Foque nos bolinhos!", ephemeral: true });
    return;
  }
  if (state.activeNpc && state.activeNpc !== NPC_KEY) {
    await interaction.reply({ content: "Ja existe uma conversa de missao em andamento nesse local.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  state.activeNpc = NPC_KEY;
  await setState(ctx.inst.id, state);
  await runDangoDialogue(interaction.channel, ctx, interaction.user.id, "(o ninja se aproxima do balcao)");
  await interaction.editReply("Voce se aproxima do **Comerciante de Bolinhos**. Continue por mensagens normais no canal.");
}

export async function continueDangoRushMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.guildId || message.channelId !== CENTRO_COMERCIAL_CHANNEL_ID) return false;
  const ctx = await resolveDangoRush(message.author.id, message.guildId);
  if (!ctx) return false;
  const state = ensureState(ctx.inst.stateJson);
  if (state.stage !== "INTRO" || state.activeNpc !== NPC_KEY) return false;
  await runDangoDialogue(message.channel, ctx, message.author.id, message.content || "...");
  return true;
}

async function runDangoDialogue(
  channel: TextBasedChannel | null,
  ctx: DangoRushContext,
  actorDiscordId: string,
  playerMessage: string,
): Promise<void> {
  const inst = await getInstance(ctx.inst.id);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "DANGO_RUSH") return;
  const state = ensureState(inst.stateJson);
  if (state.minigameRunning) return;

  state.talks = (state.talks ?? 0) + 1;
  const ready = state.talks >= explainTurns(def);
  await speak(
    channel,
    playerMessage,
    ready
      ? "Esta e sua ultima explicacao: diga que os bolinhos precisam ser virados quando o sinal aparecer e que o jogador tera poucos segundos para apertar."
      : "Explique o horario de pico e ensine aos poucos como preparar os bolinhos, sem comecar o desafio ainda.",
    ready ? 2 : Math.min((state.talks ?? 1) - 1, 1),
  );

  if (!ready) {
    await setState(inst.id, state);
    return;
  }

  state.stage = "COOKING";
  state.activeNpc = null;
  state.minigameRunning = true;
  await markObjective(inst.id, "falar_comerciante");
  await setState(inst.id, state);
  await startCookingChallenge(channel, inst.id, actorDiscordId);
}

async function startCookingChallenge(
  channel: TextBasedChannel | null,
  instanceId: string,
  actorDiscordId: string,
): Promise<void> {
  const inst = await getInstance(instanceId);
  if (!inst || !channel || !("send" in channel)) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "DANGO_RUSH") return;

  let state = ensureState(inst.stateJson);
  const total = cookingRounds(def);
  for (let round = (state.cooked ?? 0) + 1; round <= total; round++) {
    const embed = new EmbedBuilder()
      .setColor(0xe67e22)
      .setTitle(`Bolinhos - leva ${round}/${total}`)
      .setDescription("A massa esta na chapa. Aguarde o ponto certo...");
    const msg = await channel.send({ embeds: [embed] });

    await sleep(buttonDelay(def));

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`dango:${instanceId}:${round}`)
        .setLabel("Virar bolinho!")
        .setStyle(ButtonStyle.Success),
    );
    const readyEmbed = EmbedBuilder.from(embed).setDescription("Agora! Vire os bolinhos antes que queimem!");
    await msg.edit({ embeds: [readyEmbed], components: [row] });

    try {
      const btn = (await msg.awaitMessageComponent({
        componentType: ComponentType.Button,
        time: buttonWindow(def),
        filter: (i: ButtonInteraction) => i.user.id === actorDiscordId && i.customId === `dango:${instanceId}:${round}`,
      })) as ButtonInteraction;

      state = ensureState((await getInstance(instanceId))?.stateJson ?? "{}");
      state.cooked = round;
      await markObjective(instanceId, ["preparar_primeira_leva", "preparar_segunda_leva", "preparar_terceira_leva"][round - 1]!);
      await setState(instanceId, state);
      await btn.update({
        embeds: [EmbedBuilder.from(readyEmbed).setDescription(`Leva ${round}/${total} no ponto certo!`)],
        components: [],
      });
    } catch {
      await failDangoMission(instanceId, channel, msg, round);
      return;
    }
  }

  state = ensureState((await getInstance(instanceId))?.stateJson ?? "{}");
  state.stage = "DONE";
  state.minigameRunning = false;
  await setState(instanceId, state);
  await speak(channel, "(os bolinhos ficaram prontos)", "Agradeca ao ninja: as tres levas ficaram prontas no horario de pico.", 3);
  const result = await completeMission(inst.charId, inst.missionId);
  if (result) {
    await channel.send({ embeds: [buildMissionCompleteEmbed(def.name, result.rewards)] });
  }
}

async function failDangoMission(
  instanceId: string,
  channel: TextBasedChannel,
  msg: Message,
  round: number,
): Promise<void> {
  await prisma.missionInstance.update({ where: { id: instanceId }, data: { status: "FAILED" } });
  await msg.edit({
    embeds: [
      new EmbedBuilder()
        .setColor(0xc0392b)
        .setTitle(`Bolinhos - leva ${round}`)
        .setDescription("Tempo perdido. A leva queimou."),
    ],
    components: [],
  }).catch(() => undefined);
  if ("send" in channel) {
    await channel.send("Missao falhou: os bolinhos queimaram no horario de pico. Peca a um admin para reatribuir se quiser tentar de novo.");
  }
}
