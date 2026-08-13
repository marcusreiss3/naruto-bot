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
import { pausedMissionNotice, sendMissionNotice } from "../../ui/mission-notice-v2.js";
import { formatPersonaLines, sendAsPersona } from "../discord/persona-webhook.js";
import type { RenderEntity } from "../maps/renderer.js";
import { NpcAiService } from "../npc-ai/npc-ai-service.js";
import { getPersona } from "../npc-ai/personas.js";
import {
  completeMission,
  buildMissionCompleteEmbed,
  getActiveInstanceByType,
  getInstance,
  markObjective,
  readState,
  setState,
} from "./mission-service.js";

const COURIER_KEY = "courier_emi";

const PACKAGES = [
  {
    id: "tubo_academia",
    label: "Tubo estreito com po branco",
    description: "Selo de lousa, lista de chamada e marcas de giz.",
    recipientKey: "delivery_yori",
    recipientName: "Yori Umino",
    channelId: ACADEMIA_GENIN_CHANNEL_ID,
    objectiveId: "entregar_academia",
  },
  {
    id: "envelope_hospital",
    label: "Envelope branco acolchoado",
    description: "Selo medico, referencia a ala leste e controle de gaze.",
    recipientKey: "delivery_haru",
    recipientName: "Haru Nara",
    channelId: HOSPITAL_KONOHA_CHANNEL_ID,
    objectiveId: "entregar_hospital",
  },
  {
    id: "rolo_mercado",
    label: "Pergaminho preso por cordao vermelho",
    description: "Carimbo de barracas, taxas e licencas comerciais.",
    recipientKey: "delivery_sayuri",
    recipientName: "Sayuri Matsu",
    channelId: CENTRO_COMERCIAL_CHANNEL_ID,
    objectiveId: "entregar_mercado",
  },
] as const;

type PackageId = (typeof PACKAGES)[number]["id"];

export interface UrgentDeliveriesState {
  stage?: "BRIEFING" | "DELIVER" | "RETURN" | "DONE";
  activeNpc?: string | null;
  turns?: Record<string, number>;
  delivered?: PackageId[];
  runningFor?: string | null;
  mistakes?: number;
}

export interface UrgentDeliveriesChoice {
  key: string;
  name: string;
}

interface UrgentDeliveriesContext {
  inst: NonNullable<Awaited<ReturnType<typeof getInstance>>>;
  def: NonNullable<ReturnType<typeof getMission>>;
  ownerCharId: string;
}

function ensureState(raw: string): UrgentDeliveriesState {
  const state = readState<UrgentDeliveriesState>(raw);
  state.stage = state.stage ?? "BRIEFING";
  state.activeNpc = state.activeNpc ?? null;
  state.turns = state.turns ?? {};
  state.delivered = state.delivered ?? [];
  state.runningFor = state.runningFor ?? null;
  state.mistakes = state.mistakes ?? 0;
  return state;
}

function briefingTurns(def: UrgentDeliveriesContext["def"]): number {
  return Number(def.data?.briefingTurns ?? 3);
}

function recipientTurns(def: UrgentDeliveriesContext["def"]): number {
  return Number(def.data?.recipientTurns ?? 2);
}

function thanksTurns(def: UrgentDeliveriesContext["def"]): number {
  return Number(def.data?.thanksTurns ?? 2);
}

function maxMistakes(def: UrgentDeliveriesContext["def"]): number {
  return Number(def.data?.maxMistakes ?? 3);
}

function stepTimeout(def: UrgentDeliveriesContext["def"]): number {
  return Number(def.data?.stepTimeoutMs ?? 60_000);
}

async function findContextByCharId(charId: string): Promise<UrgentDeliveriesContext | null> {
  const c = await getActiveInstanceByType(charId, "URGENT_DELIVERIES");
  if (!c) return null;
  return { inst: c.inst, def: c.def, ownerCharId: charId };
}

export async function resolveUrgentDeliveries(
  discordId: string,
  guildId: string,
): Promise<UrgentDeliveriesContext | null> {
  const own = await prisma.userCharacter.findUnique({
    where: { discordId_guildId: { discordId, guildId } },
    select: { id: true },
  });
  return own ? findContextByCharId(own.id) : null;
}

export function availableUrgentDeliveriesNpcs(
  state: UrgentDeliveriesState,
  channelId: string,
): UrgentDeliveriesChoice[] {
  if (channelId === MANSAO_HOKAGE_CHANNEL_ID && (state.stage === "BRIEFING" || state.stage === "RETURN")) {
    return [{ key: COURIER_KEY, name: state.stage === "RETURN" ? "Emi Shiranui (relatorio final)" : "Emi Shiranui (mensageira)" }];
  }
  if (state.stage !== "DELIVER") return [];
  const target = PACKAGES.find(
    (pkg) => pkg.channelId === channelId && !(state.delivered ?? []).includes(pkg.id),
  );
  return target ? [{ key: target.recipientKey, name: `${target.recipientName} (receber entrega)` }] : [];
}

export async function urgentDeliveriesMapHandle(
  interaction: ChatInputCommandInteraction,
  ctx: UrgentDeliveriesContext,
  entities: RenderEntity[],
): Promise<string | null> {
  const state = ensureState(ctx.inst.stateJson);
  const choices = availableUrgentDeliveriesNpcs(state, interaction.channelId);
  if (choices.length) {
    entities.push(recipientEntity(choices[0]!.key));
    return `\nMissao ativa: **${ctx.def.name}** - fale com **${choices[0]!.name}** usando \`/interagir npc\`.`;
  }

  if (state.stage === "DELIVER") {
    const remaining = PACKAGES.filter((pkg) => !(state.delivered ?? []).includes(pkg.id));
    return `\nMissao ativa: **${ctx.def.name}** - entregas restantes: **${remaining.length}/3**. Destinos pendentes: ${remaining.map((pkg) => `<#${pkg.channelId}>`).join(", ")}.`;
  }
  if (state.stage === "RETURN") {
    return `\nMissao ativa: **${ctx.def.name}** - volte para a Mansao do Hokage e entregue o relatorio a Emi.`;
  }
  return null;
}

function recipientEntity(key: string): RenderEntity {
  if (key === COURIER_KEY) {
    return {
      cell: "C3",
      name: "Emi Shiranui",
      label: "Emi",
      color: "#3498db",
      kind: "NPC",
      imageFile: "npcs/courier-emi.png",
    };
  }
  if (key === "delivery_yori") {
    return {
      cell: "C3",
      name: "Yori Umino",
      label: "Yor",
      color: "#3498db",
      kind: "NPC",
      imageFile: "npcs/academy-instructor-yori.png",
    };
  }
  if (key === "delivery_haru") {
    return {
      cell: "C3",
      name: "Haru Nara",
      label: "Har",
      color: "#2ecc71",
      kind: "NPC",
      imageFile: "npcs/medical-ninja-haru.png",
    };
  }
  return {
    cell: "D6",
    name: "Sayuri Matsu",
    label: "Say",
    color: "#f39c12",
    kind: "NPC",
    imageFile: "npcs/festival-organizer.png",
  };
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

export async function interactUrgentDeliveries(
  interaction: ChatInputCommandInteraction,
  npcKey: string,
): Promise<void> {
  const guildId = interaction.guildId ?? "global";
  const ctx = await resolveUrgentDeliveries(interaction.user.id, guildId);
  if (!ctx) {
    await interaction.reply({ content: "Voce nao tem essa missao ativa.", ephemeral: true });
    return;
  }
  const state = ensureState(ctx.inst.stateJson);
  const choice = availableUrgentDeliveriesNpcs(state, interaction.channelId).find((npc) => npc.key === npcKey);
  if (!choice) {
    await interaction.reply({ content: "Esse NPC nao esta esperando uma entrega sua agora.", ephemeral: true });
    return;
  }
  if (state.runningFor) {
    await interaction.reply({ content: "Ja existe uma entrega aguardando sua escolha no canal.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  state.activeNpc = npcKey;
  await setState(ctx.inst.id, state);
  await runDialogue(interaction.channel, ctx, npcKey, "(o ninja apresenta a bolsa de entregas)", interaction.user.id);
  await interaction.editReply(`Voce se aproxima de **${choice.name}**. Continue por mensagens normais no canal.`);
}

export async function continueUrgentDeliveriesMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.guildId) return false;
  const ctx = await resolveUrgentDeliveries(message.author.id, message.guildId);
  if (!ctx) return false;
  const state = ensureState(ctx.inst.stateJson);
  if (!state.activeNpc) return false;
  if (!availableUrgentDeliveriesNpcs(state, message.channelId).some((npc) => npc.key === state.activeNpc)) return false;
  await runDialogue(message.channel, ctx, state.activeNpc, message.content || "...", message.author.id);
  return true;
}

async function runDialogue(
  channel: TextBasedChannel | null,
  ctx: UrgentDeliveriesContext,
  npcKey: string,
  playerMessage: string,
  actorDiscordId: string,
): Promise<void> {
  const inst = await getInstance(ctx.inst.id);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "URGENT_DELIVERIES") return;
  const state = ensureState(inst.stateJson);
  const turn = (state.turns?.[npcKey] ?? 0) + 1;
  state.turns![npcKey] = turn;

  if (npcKey === COURIER_KEY && state.stage === "BRIEFING") {
    const done = turn >= briefingTurns(def);
    await speak(
      channel,
      COURIER_KEY,
      playerMessage,
      done
        ? "Ultima fala: descreva claramente os tres pacotes e mande o jogador visitar Academia, Hospital e Centro Comercial usando /mapa."
        : "Explique que os nomes borraram na chuva, mas os selos e o conteudo permitem deduzir cada destino.",
      done ? 2 : Math.min(turn - 1, 1),
    );
    if (done) {
      state.stage = "DELIVER";
      state.activeNpc = null;
      await markObjective(inst.id, "receber_encomendas");
      await setState(inst.id, state);
      if (channel && "send" in channel) {
        await channel.send(
          [
            "**Pacotes recebidos:**",
            ...PACKAGES.map((pkg) => `- **${pkg.label}:** ${pkg.description}`),
            "",
            `Destinos: <#${ACADEMIA_GENIN_CHANNEL_ID}>, <#${HOSPITAL_KONOHA_CHANNEL_ID}> e <#${CENTRO_COMERCIAL_CHANNEL_ID}>.`,
          ].join("\n"),
        );
      }
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === COURIER_KEY && state.stage === "RETURN") {
    const done = turn >= thanksTurns(def);
    await speak(
      channel,
      COURIER_KEY,
      playerMessage,
      done
        ? "Ultima fala: confirme que todas as entregas foram registradas corretamente e agradeca."
        : "Confira o comprovante das tres entregas e elogie o cuidado do jogador.",
      3 + Math.min(turn - 1, 1),
    );
    if (done) {
      state.stage = "DONE";
      state.activeNpc = null;
      await markObjective(inst.id, "entregar_relatorio");
      await setState(inst.id, state);
      const result = await completeMission(inst.charId, inst.missionId);
      if (result && channel && "send" in channel) {
        await channel.send({ embeds: [buildMissionCompleteEmbed(def.name, result.rewards)] });
      }
      return;
    }
    await setState(inst.id, state);
    return;
  }

  const target = PACKAGES.find((pkg) => pkg.recipientKey === npcKey);
  if (!target || state.stage !== "DELIVER") return;
  const done = turn >= recipientTurns(def);
  await speak(
    channel,
    npcKey,
    playerMessage,
    done
      ? `Ultima fala antes da escolha: diga exatamente o que voce espera receber, sem citar o id interno. Pista: ${target.description}`
      : "Cumprimente o mensageiro e explique brevemente por que o documento esperado e urgente.",
    done ? 1 : 0,
  );
  if (!done) {
    await setState(inst.id, state);
    return;
  }

  state.activeNpc = null;
  state.runningFor = npcKey;
  await setState(inst.id, state);
  void startPackageChoice(channel, inst.id, npcKey, target.id, actorDiscordId).catch(() => undefined);
}

function packageEmbed(state: UrgentDeliveriesState, recipientName: string, def: UrgentDeliveriesContext["def"]): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle(`Entrega para ${recipientName}`)
    .setDescription(
      [
        "Escolha o pacote que combina com o destino e com o pedido do destinatario.",
        "",
        `Entregas concluidas: **${state.delivered?.length ?? 0}/3**`,
        `Erros: **${state.mistakes ?? 0}/${maxMistakes(def)}**`,
      ].join("\n"),
    );
}

function packageMenu(instanceId: string, state: UrgentDeliveriesState): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`deliveries:package:${instanceId}`)
      .setPlaceholder("Escolha o pacote")
      .addOptions(
        PACKAGES
          .filter((pkg) => !(state.delivered ?? []).includes(pkg.id))
          .map((pkg) => ({
            label: pkg.label,
            description: pkg.description.slice(0, 100),
            value: pkg.id,
          })),
      ),
  );
}

async function startPackageChoice(
  channel: TextBasedChannel | null,
  instanceId: string,
  recipientKey: string,
  expectedPackage: PackageId,
  actorDiscordId: string,
): Promise<void> {
  if (!channel || !("send" in channel)) return;
  const inst = await getInstance(instanceId);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "URGENT_DELIVERIES") return;
  let state = ensureState(inst.stateJson);
  const target = PACKAGES.find((pkg) => pkg.recipientKey === recipientKey)!;
  const msg = await channel.send({
    embeds: [packageEmbed(state, target.recipientName, def)],
    components: [packageMenu(instanceId, state)],
  });

  while (state.runningFor === recipientKey) {
    try {
      const pick = (await msg.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        time: stepTimeout(def),
        filter: (i: StringSelectMenuInteraction) =>
          i.user.id === actorDiscordId && i.customId === `deliveries:package:${instanceId}`,
      })) as StringSelectMenuInteraction;

      if (pick.values[0] !== expectedPackage) {
        state.mistakes = (state.mistakes ?? 0) + 1;
        if ((state.mistakes ?? 0) >= maxMistakes(def)) {
          await prisma.missionInstance.update({ where: { id: instanceId }, data: { status: "FAILED" } });
          await pick.update({
            embeds: [
              new EmbedBuilder()
                .setColor(0xc0392b)
                .setTitle("Entregas comprometidas")
                .setDescription("Pacotes errados demais foram apresentados e os prazos oficiais expiraram."),
            ],
            components: [],
          });
          return;
        }
        await setState(instanceId, state);
        await pick.update({
          embeds: [packageEmbed(state, target.recipientName, def)],
          components: [packageMenu(instanceId, state)],
        });
        continue;
      }

      state.delivered = [...new Set([...(state.delivered ?? []), expectedPackage])];
      state.runningFor = null;
      state.turns![recipientKey] = 0;
      await markObjective(instanceId, target.objectiveId);
      if (state.delivered.length === PACKAGES.length) state.stage = "RETURN";
      await setState(instanceId, state);
      await pick.update({
        embeds: [
          new EmbedBuilder()
            .setColor(0x2ecc71)
            .setTitle("Entrega correta")
            .setDescription(
              state.stage === "RETURN"
                ? "Os tres pacotes foram entregues. Volte para a Mansao do Hokage e apresente o relatorio a Emi."
                : `Pacote entregue a ${target.recipientName}. Restam ${PACKAGES.length - state.delivered.length} entregas.`,
            ),
        ],
        components: [],
      });
      return;
    } catch {
      state.runningFor = null;
      await setState(instanceId, state);
      await msg.edit({ components: [] }).catch(() => undefined);
      await sendMissionNotice(channel, pausedMissionNotice("O tempo para escolher o pacote terminou.", "Use /interagir npc com o destinatário para tentar novamente."));
      return;
    }
  }
}
