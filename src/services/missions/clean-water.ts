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
  FLORESTA_CHANNEL_ID,
  HOSPITAL_KONOHA_CHANNEL_ID,
  ROTA_COMERCIAL_KONOHA_CHANNEL_ID,
} from "../../data/scenarios/index.js";
import { getMission } from "../../data/missions/index.js";
import { sendMissionNotice } from "../../ui/mission-notice-v2.js";
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

const NPC_KEY = "ninja_medico_haru_water";
const PERSONA_KEY = "medical_ninja_haru";
const WATER_MARKER = "Ag";
const activeWaterPuzzles = new Set<string>();

interface WaterSite {
  id: string;
  objectiveId: string;
  channelId: string;
  name: string;
  cell: string;
  guide: string;
  correct: string;
  decoys: string[];
}

const WATER_SITES: WaterSite[] = [
  {
    id: "floresta",
    objectiveId: "coletar_floresta",
    channelId: FLORESTA_CHANNEL_ID,
    name: "Nascente da Floresta",
    cell: "C4",
    guide: "agua corrente, sem cheiro de lodo e com pedras claras no fundo",
    correct: "Agua corrente sobre pedras claras, fria e sem cheiro.",
    decoys: [
      "Poca parada com folhas apodrecidas e cheiro de lodo.",
      "Filete barrento perto de pegadas recentes.",
      "Agua brilhante demais com espuma presa nos cantos.",
    ],
  },
  {
    id: "rota",
    objectiveId: "coletar_rota",
    channelId: ROTA_COMERCIAL_KONOHA_CHANNEL_ID,
    name: "Poco da Rota Comercial",
    cell: "B3",
    guide: "agua de poco protegido, tampa intacta e balde sem residuos",
    correct: "Poco coberto, corda limpa e balde sem manchas.",
    decoys: [
      "Balde com cheiro de oleo perto das carrocas.",
      "Poco aberto com poeira de estrada acumulada na borda.",
      "Barril reaproveitado com gosto forte de metal.",
    ],
  },
];

export interface CleanWaterState {
  stage?: "INTRO" | "COLLECTING" | "RETURN" | "DONE";
  activeNpc?: string | null;
  talks?: number;
  thanks?: number;
  collected?: Record<string, boolean>;
  mistakes?: number;
}

export interface CleanWaterChoice {
  key: string;
  name: string;
}

interface CleanWaterContext {
  inst: NonNullable<Awaited<ReturnType<typeof getInstance>>>;
  def: NonNullable<ReturnType<typeof getMission>>;
  ownerCharId: string;
}

function ensureState(raw: string): CleanWaterState {
  const state = readState<CleanWaterState>(raw);
  state.stage = state.stage ?? "INTRO";
  state.activeNpc = state.activeNpc ?? null;
  state.talks = state.talks ?? 0;
  state.thanks = state.thanks ?? 0;
  state.collected = state.collected ?? {};
  state.mistakes = state.mistakes ?? 0;
  return state;
}

function introTurns(def: CleanWaterContext["def"]): number {
  return Number(def.data?.introTurns ?? 2);
}

function thanksTurns(def: CleanWaterContext["def"]): number {
  return Number(def.data?.thanksTurns ?? 2);
}

function maxMistakes(def: CleanWaterContext["def"]): number {
  return Number(def.data?.maxMistakes ?? 3);
}

function stepTimeout(def: CleanWaterContext["def"]): number {
  return Number(def.data?.stepTimeoutMs ?? 60_000);
}

function collectedCount(state: CleanWaterState): number {
  return WATER_SITES.filter((site) => state.collected?.[site.id]).length;
}

async function findContextByCharId(charId: string): Promise<CleanWaterContext | null> {
  const c = await getActiveInstanceByType(charId, "CLEAN_WATER");
  if (!c) return null;
  return { inst: c.inst, def: c.def, ownerCharId: charId };
}

export async function resolveCleanWater(discordId: string, guildId: string): Promise<CleanWaterContext | null> {
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

export function availableCleanWaterNpcs(state: CleanWaterState, channelId: string): CleanWaterChoice[] {
  if (channelId !== HOSPITAL_KONOHA_CHANNEL_ID) return [];
  const stage = state.stage ?? "INTRO";
  if (stage === "INTRO") return [{ key: NPC_KEY, name: "Haru Nara (agua limpa)" }];
  if (stage === "RETURN") return [{ key: NPC_KEY, name: "Haru Nara (entregar agua)" }];
  return [];
}

export async function cleanWaterMapHandle(
  interaction: ChatInputCommandInteraction,
  ctx: CleanWaterContext,
  entities: RenderEntity[],
): Promise<string | null> {
  const channelId = interaction.channelId;
  let state = ensureState(ctx.inst.stateJson);
  const stage = state.stage ?? "INTRO";

  if (channelId === HOSPITAL_KONOHA_CHANNEL_ID) {
    if (stage === "INTRO" || stage === "RETURN") {
      entities.push(haruEntity());
      return stage === "RETURN"
        ? `\nMissao ativa: **${ctx.def.name}** - entregue as amostras para Haru usando \`/interagir npc\`.`
        : `\nMissao ativa: **${ctx.def.name}** - fale com Haru usando \`/interagir npc\`.`;
    }
    if (stage === "COLLECTING") {
      return `\nMissao ativa: **${ctx.def.name}** - colete agua limpa na **Floresta** e na **Rota Comercial** usando \`/mapa\`. Amostras: **${collectedCount(state)}/${WATER_SITES.length}**.`;
    }
    return null;
  }

  if (stage === "INTRO") {
    return `\nMissao ativa: **${ctx.def.name}** - fale com Haru no **Hospital de Konoha** primeiro: <#${HOSPITAL_KONOHA_CHANNEL_ID}>.`;
  }
  if (stage === "RETURN" || stage === "DONE") {
    return `\nMissao ativa: **${ctx.def.name}** - volte ao **Hospital de Konoha** para entregar as amostras: <#${HOSPITAL_KONOHA_CHANNEL_ID}>.`;
  }
  if (stage !== "COLLECTING") return null;

  const site = WATER_SITES.find((s) => s.channelId === channelId);
  if (!site) return null;
  if (state.collected?.[site.id]) {
    return `\nMissao ativa: **${ctx.def.name}** - a amostra deste local ja foi coletada. Amostras: **${collectedCount(state)}/${WATER_SITES.length}**.`;
  }

  entities.push(waterEntity(site));
  const activeKey = `${ctx.inst.id}:${site.id}`;
  if (activeWaterPuzzles.has(activeKey)) {
    return `\nMissao ativa: **${ctx.def.name}** - a analise deste ponto ja esta em andamento no canal.`;
  }

  activeWaterPuzzles.add(activeKey);
  void startWaterPuzzle(interaction.channel, ctx.inst.id, interaction.user.id, site).finally(() => {
    activeWaterPuzzles.delete(activeKey);
  });
  return `\nMissao ativa: **${ctx.def.name}** - analise o ponto de coleta no painel enviado no canal.`;
}

function haruEntity(): RenderEntity {
  return {
    cell: "C3",
    name: "Haru Nara",
    label: "Har",
    color: "#1abc9c",
    kind: "NPC",
    imageFile: "npcs/medical-ninja-haru.png",
  };
}

function waterEntity(site: WaterSite): RenderEntity {
  return {
    cell: site.cell,
    name: site.name,
    label: WATER_MARKER,
    color: "#3498db",
    kind: "MARKER",
  };
}

async function speak(channel: TextBasedChannel | null, message: string, extra: string, fallbackIndex: number): Promise<void> {
  const text = await NpcAiService.say(PERSONA_KEY, message, extra, fallbackIndex);
  const persona = getPersona(PERSONA_KEY);
  const sent = await sendAsPersona(channel, {
    key: PERSONA_KEY,
    name: persona?.displayName ?? "Haru Nara",
    avatarFile: persona?.avatarFile,
    lines: formatPersonaLines(text),
  });
  if (!sent && channel && "send" in channel) await channel.send(text.slice(0, 1900));
}

export async function interactCleanWater(interaction: ChatInputCommandInteraction, npcKey: string): Promise<void> {
  const guildId = interaction.guildId ?? "global";
  const ctx = await resolveCleanWater(interaction.user.id, guildId);
  if (!ctx) {
    await interaction.reply({ content: "Voce (ou sua party) nao tem essa missao ativa.", ephemeral: true });
    return;
  }

  const state = ensureState(ctx.inst.stateJson);
  const choice = availableCleanWaterNpcs(state, interaction.channelId).find((n) => n.key === npcKey);
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
  await runWaterDialogue(interaction.channel, ctx, "(o ninja se aproxima da bancada de amostras)");
  await interaction.editReply(`Voce se aproxima de **${choice.name}**. Continue por mensagens normais no canal.`);
}

export async function continueCleanWaterMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.guildId || message.channelId !== HOSPITAL_KONOHA_CHANNEL_ID) return false;
  const ctx = await resolveCleanWater(message.author.id, message.guildId);
  if (!ctx) return false;
  const state = ensureState(ctx.inst.stateJson);
  if (state.activeNpc !== NPC_KEY) return false;
  if (!availableCleanWaterNpcs(state, message.channelId).some((n) => n.key === NPC_KEY)) return false;
  await runWaterDialogue(message.channel, ctx, message.content || "...");
  return true;
}

async function runWaterDialogue(
  channel: TextBasedChannel | null,
  ctx: CleanWaterContext,
  playerMessage: string,
): Promise<void> {
  const inst = await getInstance(ctx.inst.id);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "CLEAN_WATER") return;
  const state = ensureState(inst.stateJson);

  if (state.stage === "INTRO") {
    state.talks = (state.talks ?? 0) + 1;
    const done = state.talks >= introTurns(def);
    await speak(
      channel,
      playerMessage,
      done
        ? `Esta e sua ultima fala: mande o jogador analisar agua limpa na Floresta (<#${FLORESTA_CHANNEL_ID}>) e na Rota Comercial (<#${ROTA_COMERCIAL_KONOHA_CHANNEL_ID}>) usando /mapa.`
        : "Peca ajuda para coletar agua limpa para o hospital e explique que a escolha depende de pistas de pureza.",
      done ? 2 : Math.min((state.talks ?? 1) - 1, 1),
    );
    if (done) {
      state.stage = "COLLECTING";
      state.activeNpc = null;
      await markObjective(inst.id, "falar_haru");
      await setState(inst.id, state);
      if (channel && "send" in channel) {
        await sendMissionNotice(channel, {
          kind: "investigacao",
          title: "Dois pontos de coleta",
          description: "Compare as amostras dos dois locais e descarte qualquer fonte contaminada.",
          itemsTitle: "Locais para análise",
          items: [
            `**Floresta** — <#${FLORESTA_CHANNEL_ID}>`,
            `**Rota Comercial** — <#${ROTA_COMERCIAL_KONOHA_CHANNEL_ID}>`,
          ],
          footer: "Entre em cada canal e use /mapa para analisar a água.",
        });
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
        ? "Esta e sua ultima fala: agradeca pelas amostras limpas e diga que o hospital pode preparar os materiais com seguranca."
        : "Confira as amostras e agradeca pelo cuidado em evitar agua contaminada.",
      3 + Math.min((state.thanks ?? 1) - 1, 1),
    );
    if (done) {
      state.stage = "DONE";
      state.activeNpc = null;
      await markObjective(inst.id, "entregar_agua");
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

function buildWaterEmbed(
  state: CleanWaterState,
  def: NonNullable<ReturnType<typeof getMission>>,
  site: WaterSite,
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle("Analise de Agua Limpa")
    .setDescription(
      [
        `Amostras limpas: **${collectedCount(state)}/${WATER_SITES.length}**`,
        `Erros: **${state.mistakes ?? 0}/${maxMistakes(def)}**`,
        "",
        `Ponto: **${site.name}**`,
        `Guia de Haru: procure ${site.guide}.`,
        "",
        "Escolha a amostra segura para o hospital.",
      ].join("\n"),
    );
}

function buildWaterMenu(instanceId: string, site: WaterSite): ActionRowBuilder<StringSelectMenuBuilder> {
  const options = [site.correct, ...site.decoys]
    .map((description, i) => ({ description, value: i === 0 ? site.id : `${site.id}:dirty:${i}` }))
    .sort((a, b) => a.description.localeCompare(b.description));

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`water:${instanceId}:${site.id}`)
      .setPlaceholder("Escolha a amostra")
      .addOptions(
        options.map((o, i) => ({
          label: `Amostra ${i + 1}`,
          description: o.description.slice(0, 100),
          value: o.value,
        })),
      ),
  );
}

async function startWaterPuzzle(
  channel: TextBasedChannel | null,
  instanceId: string,
  actorDiscordId: string,
  site: WaterSite,
): Promise<void> {
  if (!channel || !("send" in channel)) return;
  const inst = await getInstance(instanceId);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "CLEAN_WATER") return;

  let state = ensureState(inst.stateJson);
  const msg = await channel.send({ embeds: [buildWaterEmbed(state, def, site)], components: [buildWaterMenu(instanceId, site)] });

  while (!state.collected?.[site.id]) {
    try {
      const pick = (await msg.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        time: stepTimeout(def),
        filter: (i: StringSelectMenuInteraction) =>
          i.user.id === actorDiscordId && i.customId === `water:${instanceId}:${site.id}`,
      })) as StringSelectMenuInteraction;

      state = ensureState((await getInstance(instanceId))?.stateJson ?? "{}");
      const value = pick.values[0]!;
      if (value === site.id) {
        state.collected![site.id] = true;
        await markObjective(instanceId, site.objectiveId);
      } else {
        state.mistakes = (state.mistakes ?? 0) + 1;
      }

      if ((state.mistakes ?? 0) >= maxMistakes(def)) {
        await failWaterMission(instanceId, msg, "Amostras contaminadas demais foram separadas. Haru nao consegue usar esse lote.");
        return;
      }

      const allDone = collectedCount(state) >= WATER_SITES.length;
      if (allDone) state.stage = "RETURN";
      await setState(instanceId, state);
      await pick.update({
        embeds: [
          state.collected?.[site.id]
            ? EmbedBuilder.from(buildWaterEmbed(state, def, site)).setDescription(
                allDone
                  ? "Amostra limpa lacrada.\n\nTodas as amostras seguras foram coletadas. Volte ao **Hospital de Konoha** e fale com Haru."
                  : `Amostra limpa lacrada.\n\nAmostras limpas: **${collectedCount(state)}/${WATER_SITES.length}**.`,
              )
            : buildWaterEmbed(state, def, site),
        ],
        components: state.collected?.[site.id] ? [] : [buildWaterMenu(instanceId, site)],
      });
      if (state.collected?.[site.id]) break;
    } catch {
      await failWaterMission(instanceId, msg, "Tempo esgotado. A amostra ficou exposta e nao serve mais para uso medico.");
      return;
    }
  }

  if (collectedCount(state) >= WATER_SITES.length) {
    await sendMissionNotice(channel, {
      kind: "descoberta",
      title: "Amostras limpas coletadas",
      description: "A água aprovada já pode ser entregue ao hospital.",
      items: [`**Hospital de Konoha** — <#${HOSPITAL_KONOHA_CHANNEL_ID}>`],
      itemsTitle: "Destino da entrega",
      footer: "Use /interagir npc para concluir a entrega.",
    });
  }
}

async function failWaterMission(instanceId: string, msg: Message, reason: string): Promise<void> {
  await prisma.missionInstance.update({ where: { id: instanceId }, data: { status: "FAILED" } });
  await msg.edit({
    embeds: [new EmbedBuilder().setColor(0xc0392b).setTitle("Coleta contaminada").setDescription(reason)],
    components: [],
  }).catch(() => undefined);
}
