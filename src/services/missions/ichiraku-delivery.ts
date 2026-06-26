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
import {
  ACADEMIA_GENIN_CHANNEL_ID,
  CENTRO_COMERCIAL_CHANNEL_ID,
  HOSPITAL_KONOHA_CHANNEL_ID,
  MANSAO_HOKAGE_CHANNEL_ID,
} from "../../data/scenarios/index.js";
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

const NPC_KEY = "ayame_ichiraku";
const PERSONA_KEY = "ayame_ichiraku";
const DELIVERY_MARKER = "Ram";
const activeDeliveryPuzzles = new Set<string>();

interface DeliveryOrder {
  id: string;
  objectiveId: string;
  channelId: string;
  recipient: string;
  cell: string;
  item: string;
  clue: string;
}

const ORDERS: DeliveryOrder[] = [
  {
    id: "academia",
    objectiveId: "entregar_academia",
    channelId: ACADEMIA_GENIN_CHANNEL_ID,
    recipient: "Instrutor da Academia",
    cell: "E2",
    item: "lamen miso sem pimenta",
    clue: "pedido para quem ainda vai dar aula depois do intervalo",
  },
  {
    id: "hospital",
    objectiveId: "entregar_hospital",
    channelId: HOSPITAL_KONOHA_CHANNEL_ID,
    recipient: "Equipe do Hospital",
    cell: "C5",
    item: "caldo leve com gengibre",
    clue: "pedido para um turno longo de atendimento medico",
  },
  {
    id: "mansao",
    objectiveId: "entregar_mansao",
    channelId: MANSAO_HOKAGE_CHANNEL_ID,
    recipient: "Secretaria da Mansao",
    cell: "D4",
    item: "lamen grande com ovo extra",
    clue: "pedido para quem esta soterrado em papelada oficial",
  },
];

export interface IchirakuDeliveryState {
  stage?: "INTRO" | "DELIVERING" | "RETURN" | "DONE";
  activeNpc?: string | null;
  talks?: number;
  thanks?: number;
  delivered?: Record<string, boolean>;
  mistakes?: number;
}

export interface IchirakuDeliveryChoice {
  key: string;
  name: string;
}

interface IchirakuDeliveryContext {
  inst: NonNullable<Awaited<ReturnType<typeof getInstance>>>;
  def: NonNullable<ReturnType<typeof getMission>>;
  ownerCharId: string;
}

function ensureState(raw: string): IchirakuDeliveryState {
  const state = readState<IchirakuDeliveryState>(raw);
  state.stage = state.stage ?? "INTRO";
  state.activeNpc = state.activeNpc ?? null;
  state.talks = state.talks ?? 0;
  state.thanks = state.thanks ?? 0;
  state.delivered = state.delivered ?? {};
  state.mistakes = state.mistakes ?? 0;
  return state;
}

function introTurns(def: IchirakuDeliveryContext["def"]): number {
  return Number(def.data?.introTurns ?? 2);
}

function thanksTurns(def: IchirakuDeliveryContext["def"]): number {
  return Number(def.data?.thanksTurns ?? 2);
}

function maxMistakes(def: IchirakuDeliveryContext["def"]): number {
  return Number(def.data?.maxMistakes ?? 3);
}

function stepTimeout(def: IchirakuDeliveryContext["def"]): number {
  return Number(def.data?.stepTimeoutMs ?? 60_000);
}

function deliveredCount(state: IchirakuDeliveryState): number {
  return ORDERS.filter((order) => state.delivered?.[order.id]).length;
}

async function findContextByCharId(charId: string): Promise<IchirakuDeliveryContext | null> {
  const c = await getActiveInstanceByType(charId, "ICHIRAKU_DELIVERY");
  if (!c) return null;
  return { inst: c.inst, def: c.def, ownerCharId: charId };
}

export async function resolveIchirakuDelivery(discordId: string, guildId: string): Promise<IchirakuDeliveryContext | null> {
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

export function availableIchirakuDeliveryNpcs(
  state: IchirakuDeliveryState,
  channelId: string,
): IchirakuDeliveryChoice[] {
  if (channelId !== CENTRO_COMERCIAL_CHANNEL_ID) return [];
  const stage = state.stage ?? "INTRO";
  if (stage === "INTRO") return [{ key: NPC_KEY, name: "Ayame Ichiraku" }];
  if (stage === "RETURN") return [{ key: NPC_KEY, name: "Ayame Ichiraku (confirmar entregas)" }];
  return [];
}

export async function ichirakuDeliveryMapHandle(
  interaction: ChatInputCommandInteraction,
  ctx: IchirakuDeliveryContext,
  entities: RenderEntity[],
): Promise<string | null> {
  const channelId = interaction.channelId;
  let state = ensureState(ctx.inst.stateJson);
  const stage = state.stage ?? "INTRO";

  if (channelId === CENTRO_COMERCIAL_CHANNEL_ID) {
    if (stage === "INTRO" || stage === "RETURN") {
      entities.push(ayameEntity());
      return stage === "RETURN"
        ? `\nMissao ativa: **${ctx.def.name}** - confirme as entregas com Ayame usando \`/interagir npc\`.`
        : `\nMissao ativa: **${ctx.def.name}** - fale com Ayame usando \`/interagir npc\`.`;
    }
    if (stage === "DELIVERING") {
      return `\nMissao ativa: **${ctx.def.name}** - entregas feitas: **${deliveredCount(state)}/${ORDERS.length}**. Va aos destinos e use \`/mapa\`.`;
    }
    return null;
  }

  if (stage === "INTRO") {
    return `\nMissao ativa: **${ctx.def.name}** - fale com Ayame no **Centro Comercial** primeiro: <#${CENTRO_COMERCIAL_CHANNEL_ID}>.`;
  }
  if (stage === "RETURN" || stage === "DONE") {
    return `\nMissao ativa: **${ctx.def.name}** - volte ao **Centro Comercial** para confirmar as entregas: <#${CENTRO_COMERCIAL_CHANNEL_ID}>.`;
  }
  if (stage !== "DELIVERING") return null;

  const order = ORDERS.find((o) => o.channelId === channelId);
  if (!order) return null;
  if (state.delivered?.[order.id]) {
    return `\nMissao ativa: **${ctx.def.name}** - pedido deste local ja entregue. Entregas: **${deliveredCount(state)}/${ORDERS.length}**.`;
  }

  entities.push(recipientEntity(order));
  const activeKey = `${ctx.inst.id}:${order.id}`;
  if (activeDeliveryPuzzles.has(activeKey)) {
    return `\nMissao ativa: **${ctx.def.name}** - a entrega deste local ja esta em andamento no canal.`;
  }

  activeDeliveryPuzzles.add(activeKey);
  void startDeliveryPuzzle(interaction.channel, ctx.inst.id, interaction.user.id, order).finally(() => {
    activeDeliveryPuzzles.delete(activeKey);
  });
  return `\nMissao ativa: **${ctx.def.name}** - entregue o pedido certo para **${order.recipient}** no painel enviado no canal.`;
}

function ayameEntity(): RenderEntity {
  return {
    cell: "C4",
    name: "Ayame Ichiraku",
    label: "Aya",
    color: "#e74c3c",
    kind: "NPC",
  };
}

function recipientEntity(order: DeliveryOrder): RenderEntity {
  return {
    cell: order.cell,
    name: order.recipient,
    label: DELIVERY_MARKER,
    color: "#f1c40f",
    kind: "NPC",
  };
}

async function speak(channel: TextBasedChannel | null, message: string, extra: string, fallbackIndex: number): Promise<void> {
  const text = await NpcAiService.say(PERSONA_KEY, message, extra, fallbackIndex);
  const persona = getPersona(PERSONA_KEY);
  const sent = await sendAsPersona(channel, {
    key: PERSONA_KEY,
    name: persona?.displayName ?? "Ayame Ichiraku",
    avatarFile: persona?.avatarFile,
    lines: formatPersonaLines(text),
  });
  if (!sent && channel && "send" in channel) await channel.send(text.slice(0, 1900));
}

export async function interactIchirakuDelivery(interaction: ChatInputCommandInteraction, npcKey: string): Promise<void> {
  const guildId = interaction.guildId ?? "global";
  const ctx = await resolveIchirakuDelivery(interaction.user.id, guildId);
  if (!ctx) {
    await interaction.reply({ content: "Voce (ou sua party) nao tem essa missao ativa.", ephemeral: true });
    return;
  }

  const state = ensureState(ctx.inst.stateJson);
  const choice = availableIchirakuDeliveryNpcs(state, interaction.channelId).find((n) => n.key === npcKey);
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
  await runIchirakuDialogue(interaction.channel, ctx, "(o ninja se aproxima do balcao do Ichiraku)");
  await interaction.editReply(`Voce se aproxima de **${choice.name}**. Continue por mensagens normais no canal.`);
}

export async function continueIchirakuDeliveryMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.guildId || message.channelId !== CENTRO_COMERCIAL_CHANNEL_ID) return false;
  const ctx = await resolveIchirakuDelivery(message.author.id, message.guildId);
  if (!ctx) return false;
  const state = ensureState(ctx.inst.stateJson);
  if (state.activeNpc !== NPC_KEY) return false;
  if (!availableIchirakuDeliveryNpcs(state, message.channelId).some((n) => n.key === NPC_KEY)) return false;
  await runIchirakuDialogue(message.channel, ctx, message.content || "...");
  return true;
}

async function runIchirakuDialogue(
  channel: TextBasedChannel | null,
  ctx: IchirakuDeliveryContext,
  playerMessage: string,
): Promise<void> {
  const inst = await getInstance(ctx.inst.id);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "ICHIRAKU_DELIVERY") return;
  const state = ensureState(inst.stateJson);

  if (state.stage === "INTRO") {
    state.talks = (state.talks ?? 0) + 1;
    const done = state.talks >= introTurns(def);
    await speak(
      channel,
      playerMessage,
      done
        ? "Esta e sua ultima fala: entregue tres pedidos quentes e mande o jogador usar /mapa nos destinos: Academia, Hospital e Mansao do Hokage."
        : "Peca ajuda com entregas urgentes do Ichiraku e explique que os pedidos precisam chegar quentes.",
      done ? 1 : 0,
    );
    if (done) {
      state.stage = "DELIVERING";
      state.activeNpc = null;
      await markObjective(inst.id, "falar_ichiraku");
      await setState(inst.id, state);
      if (channel && "send" in channel) {
        await channel.send(
          [
            "Entregas abertas. Use `/mapa` em cada destino para entregar o pedido certo:",
            `- Academia Genin: <#${ACADEMIA_GENIN_CHANNEL_ID}>`,
            `- Hospital de Konoha: <#${HOSPITAL_KONOHA_CHANNEL_ID}>`,
            `- Mansao do Hokage: <#${MANSAO_HOKAGE_CHANNEL_ID}>`,
          ].join("\n"),
        );
      }
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (state.stage === "RETURN") {
    state.thanks = (state.thanks ?? 0) + 1;
    const done = state.thanks >= thanksTurns(def);
    await speak(
      channel,
      playerMessage,
      done
        ? "Esta e sua ultima fala: agradeca porque todos os pedidos chegaram quentes e encerre a entrega."
        : "Receba a confirmacao das entregas e agradeca pelo cuidado com os pedidos.",
      2 + Math.min((state.thanks ?? 1) - 1, 1),
    );
    if (done) {
      state.stage = "DONE";
      state.activeNpc = null;
      await markObjective(inst.id, "voltar_ichiraku");
      await setState(inst.id, state);
      const result = await completeMission(inst.charId, inst.missionId);
      if (result && channel && "send" in channel) {
        await channel.send({ embeds: [buildMissionCompleteEmbed(def.name, result.rewards)] });
      }
      return;
    }
    await setState(inst.id, state);
  }
}

function buildDeliveryEmbed(
  state: IchirakuDeliveryState,
  def: NonNullable<ReturnType<typeof getMission>>,
  order: DeliveryOrder,
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle("Entrega Urgente do Ichiraku")
    .setDescription(
      [
        `Entregas feitas: **${deliveredCount(state)}/${ORDERS.length}**`,
        `Erros: **${state.mistakes ?? 0}/${maxMistakes(def)}**`,
        "",
        `Destino: **${order.recipient}**`,
        `Dica no recibo: ${order.clue}.`,
        "",
        "Escolha o pedido certo antes que o caldo esfrie.",
      ].join("\n"),
    );
}

function buildDeliveryMenu(instanceId: string, order: DeliveryOrder): ActionRowBuilder<StringSelectMenuBuilder> {
  const options = ORDERS.map((o) => ({
    label: o.item,
    description: o.recipient,
    value: o.id === order.id ? order.id : `wrong:${o.id}`,
  })).sort((a, b) => a.label.localeCompare(b.label));

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`ichiraku:${instanceId}:${order.id}`)
      .setPlaceholder("Escolha o pacote de lamen")
      .addOptions(options),
  );
}

async function startDeliveryPuzzle(
  channel: TextBasedChannel | null,
  instanceId: string,
  actorDiscordId: string,
  order: DeliveryOrder,
): Promise<void> {
  if (!channel || !("send" in channel)) return;
  const inst = await getInstance(instanceId);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "ICHIRAKU_DELIVERY") return;

  let state = ensureState(inst.stateJson);
  const msg = await channel.send({
    embeds: [buildDeliveryEmbed(state, def, order)],
    components: [buildDeliveryMenu(instanceId, order)],
  });

  while (!state.delivered?.[order.id]) {
    try {
      const pick = (await msg.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        time: stepTimeout(def),
        filter: (i: StringSelectMenuInteraction) =>
          i.user.id === actorDiscordId && i.customId === `ichiraku:${instanceId}:${order.id}`,
      })) as StringSelectMenuInteraction;

      state = ensureState((await getInstance(instanceId))?.stateJson ?? "{}");
      const value = pick.values[0]!;
      if (value === order.id) {
        state.delivered![order.id] = true;
        await markObjective(instanceId, order.objectiveId);
      } else {
        state.mistakes = (state.mistakes ?? 0) + 1;
      }

      if ((state.mistakes ?? 0) >= maxMistakes(def)) {
        await failIchirakuMission(instanceId, msg, "Pedidos errados demais foram entregues. O Ichiraku precisou refazer tudo.");
        return;
      }

      const allDone = deliveredCount(state) >= ORDERS.length;
      if (allDone) state.stage = "RETURN";
      await setState(instanceId, state);
      await pick.update({
        embeds: [
          state.delivered?.[order.id]
            ? EmbedBuilder.from(buildDeliveryEmbed(state, def, order)).setDescription(
                allDone
                  ? "Pedido entregue quente.\n\nTodas as entregas foram feitas. Volte ao **Centro Comercial** e fale com Ayame."
                  : `Pedido entregue quente.\n\nEntregas feitas: **${deliveredCount(state)}/${ORDERS.length}**.`,
              )
            : buildDeliveryEmbed(state, def, order),
        ],
        components: state.delivered?.[order.id] ? [] : [buildDeliveryMenu(instanceId, order)],
      });
      if (state.delivered?.[order.id]) break;
    } catch {
      await failIchirakuMission(instanceId, msg, "Tempo esgotado. O pedido esfriou antes da entrega.");
      return;
    }
  }

  if (deliveredCount(state) >= ORDERS.length) {
    await channel.send(`Todas as entregas foram feitas. Volte ao **Centro Comercial** e use \`/interagir npc\`: <#${CENTRO_COMERCIAL_CHANNEL_ID}>.`);
  }
}

async function failIchirakuMission(instanceId: string, msg: Message, reason: string): Promise<void> {
  await prisma.missionInstance.update({ where: { id: instanceId }, data: { status: "FAILED" } });
  await msg.edit({
    embeds: [new EmbedBuilder().setColor(0xc0392b).setTitle("Entrega atrasada").setDescription(reason)],
    components: [],
  }).catch(() => undefined);
}
