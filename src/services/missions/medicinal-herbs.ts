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
} from "../../data/scenarios/index.js";
import { getMission } from "../../data/missions/index.js";
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

const NPC_KEY = "ninja_medico_haru";
const PERSONA_KEY = "medical_ninja_haru";
const HERB_MARKER = "\u{1F33F}";

interface HerbSample {
  id: string;
  name: string;
  clue: string;
  correct: string;
  decoys: string[];
}

const HERBS: HerbSample[] = [
  {
    id: "folha_lunar",
    name: "Folha Lunar",
    clue: "bordas prateadas e cheiro frio, quase mentolado",
    correct: "Folhas verde-escuras com bordas prateadas e cheiro mentolado.",
    decoys: [
      "Folhas largas, sem brilho, com cheiro doce de fruta madura.",
      "Folhas roxas com espinhos pequenos e seiva grudenta.",
      "Capim fino amarelado, seco e sem aroma.",
    ],
  },
  {
    id: "raiz_chakra",
    name: "Raiz de Chakra",
    clue: "raiz azulada com veios que brilham quando recebe chakra",
    correct: "Raiz azulada com veios luminosos pulsando bem fraco.",
    decoys: [
      "Raiz marrom comum, grossa, com cheiro forte de terra molhada.",
      "Raiz vermelha quebradica coberta por pequenas manchas pretas.",
      "Bulbo branco e liso, frio ao toque, sem nenhum brilho.",
    ],
  },
  {
    id: "flor_koho",
    name: "Flor Koho",
    clue: "petalas amarelas com pontinhos vermelhos, usada para baixar febre",
    correct: "Flor amarela pequena com pontinhos vermelhos perto do miolo.",
    decoys: [
      "Flor azul em formato de sino, com perfume muito adocicado.",
      "Flor branca sem miolo aparente, crescendo junto a musgo escuro.",
      "Flor laranja grande, com caule grosso e folhas serrilhadas.",
    ],
  },
];

export interface MedicinalHerbsState {
  stage?: "INTRO" | "TO_FOREST" | "COLLECTING" | "RETURN" | "DONE";
  activeNpc?: string | null;
  talks?: number;
  thanks?: number;
  herbsCollected?: number;
  mistakes?: number;
  running?: boolean;
}

export interface MedicinalHerbsChoice {
  key: string;
  name: string;
}

interface MedicinalHerbsContext {
  inst: NonNullable<Awaited<ReturnType<typeof getInstance>>>;
  def: NonNullable<ReturnType<typeof getMission>>;
  ownerCharId: string;
}

function ensureState(raw: string): MedicinalHerbsState {
  const state = readState<MedicinalHerbsState>(raw);
  state.stage = state.stage ?? "INTRO";
  state.activeNpc = state.activeNpc ?? null;
  state.talks = state.talks ?? 0;
  state.thanks = state.thanks ?? 0;
  state.herbsCollected = state.herbsCollected ?? 0;
  state.mistakes = state.mistakes ?? 0;
  state.running = state.running ?? false;
  return state;
}

function introTurns(def: MedicinalHerbsContext["def"]): number {
  return Number(def.data?.introTurns ?? 3);
}

function thanksTurns(def: MedicinalHerbsContext["def"]): number {
  return Number(def.data?.thanksTurns ?? 2);
}

function neededHerbs(def: MedicinalHerbsContext["def"]): number {
  return Math.min(Number(def.data?.neededHerbs ?? HERBS.length), HERBS.length);
}

function maxMistakes(def: MedicinalHerbsContext["def"]): number {
  return Number(def.data?.maxMistakes ?? 3);
}

function stepTimeout(def: MedicinalHerbsContext["def"]): number {
  return Number(def.data?.stepTimeoutMs ?? 60_000);
}

async function findContextByCharId(charId: string): Promise<MedicinalHerbsContext | null> {
  const c = await getActiveInstanceByType(charId, "MEDICINAL_HERBS");
  if (!c) return null;
  return { inst: c.inst, def: c.def, ownerCharId: charId };
}

export async function resolveMedicinalHerbs(discordId: string, guildId: string): Promise<MedicinalHerbsContext | null> {
  const own = await prisma.userCharacter.findUnique({
    where: { discordId_guildId: { discordId, guildId } },
    select: { id: true },
  });
  return own ? findContextByCharId(own.id) : null;
}

export function availableMedicinalHerbsNpcs(
  state: MedicinalHerbsState,
  channelId: string,
): MedicinalHerbsChoice[] {
  if (channelId !== HOSPITAL_KONOHA_CHANNEL_ID) return [];
  const stage = state.stage ?? "INTRO";
  if (stage === "INTRO") return [{ key: NPC_KEY, name: "Haru Nara (Ninja Medico)" }];
  if (stage === "RETURN") return [{ key: NPC_KEY, name: "Haru Nara (entregar ervas)" }];
  return [];
}

export async function medicinalHerbsMapHandle(
  interaction: ChatInputCommandInteraction,
  ctx: MedicinalHerbsContext,
  entities: RenderEntity[],
): Promise<string | null> {
  const channelId = interaction.channelId;
  let state = ensureState(ctx.inst.stateJson);
  const stage = state.stage ?? "INTRO";

  if (channelId === HOSPITAL_KONOHA_CHANNEL_ID) {
    if (stage === "INTRO" || stage === "RETURN") {
      entities.push(medicEntity());
      return stage === "RETURN"
        ? `\nMissao ativa: **${ctx.def.name}** - entregue as ervas para Haru com \`/interagir npc\`.`
        : `\nMissao ativa: **${ctx.def.name}** - fale com Haru Nara usando \`/interagir npc\`.`;
    }
    if (stage === "TO_FOREST" || stage === "COLLECTING") {
      return `\nMissao ativa: **${ctx.def.name}** - va para a **Floresta** e use \`/mapa\`: <#${FLORESTA_CHANNEL_ID}>.`;
    }
    return null;
  }

  if (channelId !== FLORESTA_CHANNEL_ID) return null;
  if (stage === "INTRO") {
    return `\nMissao ativa: **${ctx.def.name}** - fale com Haru no **Hospital de Konoha** primeiro: <#${HOSPITAL_KONOHA_CHANNEL_ID}>.`;
  }
  if (stage === "RETURN" || stage === "DONE") {
    return `\nMissao ativa: **${ctx.def.name}** - volte ao **Hospital de Konoha** para entregar as ervas: <#${HOSPITAL_KONOHA_CHANNEL_ID}>.`;
  }

  entities.push(...herbEntities());
  if (state.running) {
    return `\nMissao ativa: **${ctx.def.name}** - a coleta de ervas ja esta em andamento no canal.`;
  }

  state.stage = "COLLECTING";
  state.running = true;
  state.mistakes = 0;
  await setState(ctx.inst.id, state);
  void startHerbPuzzle(interaction.channel, ctx.inst.id, interaction.user.id).catch(() => undefined);
  return `\nMissao ativa: **${ctx.def.name}** - identifique as ervas pelo guia de campo no puzzle enviado no canal.`;
}

function medicEntity(): RenderEntity {
  return {
    cell: "C3",
    name: "Haru Nara",
    label: "Har",
    color: "#1abc9c",
    kind: "NPC",
    imageFile: "npcs/medical-ninja-haru.png",
  };
}

function herbEntities(): RenderEntity[] {
  return [
    { cell: "B4", label: HERB_MARKER, color: "#2ecc71", kind: "MARKER" },
    { cell: "D7", label: HERB_MARKER, color: "#2ecc71", kind: "MARKER" },
    { cell: "E3", label: HERB_MARKER, color: "#2ecc71", kind: "MARKER" },
  ];
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

export async function interactMedicinalHerbs(interaction: ChatInputCommandInteraction, npcKey: string): Promise<void> {
  const guildId = interaction.guildId ?? "global";
  const ctx = await resolveMedicinalHerbs(interaction.user.id, guildId);
  if (!ctx) {
    await interaction.reply({ content: "Voce nao tem essa missao ativa.", ephemeral: true });
    return;
  }

  const state = ensureState(ctx.inst.stateJson);
  const choice = availableMedicinalHerbsNpcs(state, interaction.channelId).find((n) => n.key === npcKey);
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
  await runMedicDialogue(interaction.channel, ctx, "(o ninja se aproxima da bancada medica)");
  await interaction.editReply(`Voce se aproxima de **${choice.name}**. Continue por mensagens normais no canal.`);
}

export async function continueMedicinalHerbsMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.guildId || message.channelId !== HOSPITAL_KONOHA_CHANNEL_ID) return false;
  const ctx = await resolveMedicinalHerbs(message.author.id, message.guildId);
  if (!ctx) return false;
  const state = ensureState(ctx.inst.stateJson);
  if (state.activeNpc !== NPC_KEY) return false;
  if (!availableMedicinalHerbsNpcs(state, message.channelId).some((n) => n.key === NPC_KEY)) return false;
  await runMedicDialogue(message.channel, ctx, message.content || "...");
  return true;
}

async function runMedicDialogue(
  channel: TextBasedChannel | null,
  ctx: MedicinalHerbsContext,
  playerMessage: string,
): Promise<void> {
  const inst = await getInstance(ctx.inst.id);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "MEDICINAL_HERBS") return;
  const state = ensureState(inst.stateJson);

  if (state.stage === "INTRO") {
    state.talks = (state.talks ?? 0) + 1;
    const done = state.talks >= introTurns(def);
    await speak(
      channel,
      playerMessage,
      done
        ? `Esta e sua ultima fala: envie o jogador para a Floresta (<#${FLORESTA_CHANNEL_ID}>) para coletar tres ervas pelo guia de campo.`
        : "Peca ajuda e explique aos poucos a coleta de ervas, sem encerrar ainda.",
      done ? 2 : Math.min((state.talks ?? 1) - 1, 1),
    );
    if (done) {
      state.stage = "TO_FOREST";
      state.activeNpc = null;
      await markObjective(inst.id, "falar_medico");
      await setState(inst.id, state);
      if (channel && "send" in channel) {
        await channel.send(`Va para a **Floresta** e use \`/mapa\` para procurar as ervas: <#${FLORESTA_CHANNEL_ID}>.`);
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
        ? "Esta e sua ultima fala: agradeca pelas ervas e encerre dizendo que os remedios serao preparados imediatamente."
        : "Agradeca pelas ervas corretas e demonstre alivio pelo hospital.",
      3 + Math.min((state.thanks ?? 1) - 1, 1),
    );
    if (done) {
      state.stage = "DONE";
      state.activeNpc = null;
      await markObjective(inst.id, "entregar_ervas");
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

function buildHerbEmbed(
  state: MedicinalHerbsState,
  def: NonNullable<ReturnType<typeof getMission>>,
): EmbedBuilder {
  const total = neededHerbs(def);
  const current = HERBS[state.herbsCollected ?? 0];
  return new EmbedBuilder()
    .setColor(0x27ae60)
    .setTitle("Coleta de Ervas Medicinais")
    .setDescription(
      [
        `Ervas coletadas: **${state.herbsCollected ?? 0}/${total}**`,
        `Erros: **${state.mistakes ?? 0}/${maxMistakes(def)}**`,
        "",
        current
          ? `**Guia de Campo - ${current.name}:** procure uma planta com ${current.clue}.`
          : "Todas as ervas certas foram coletadas.",
        "",
        "Escolha a amostra que combina com a descricao antes que voce perca o rastro dela.",
      ].join("\n"),
    );
}

function buildHerbMenu(instanceId: string, state: MedicinalHerbsState): ActionRowBuilder<StringSelectMenuBuilder> {
  const index = state.herbsCollected ?? 0;
  const herb = HERBS[index]!;
  const options = [herb.correct, ...herb.decoys]
    .map((description, i) => ({ description, value: i === 0 ? herb.id : `${herb.id}:decoy:${i}` }))
    .sort((a, b) => a.description.localeCompare(b.description));
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`herbs:${instanceId}:${index + 1}`)
      .setPlaceholder(`Identificar ${herb.name}`)
      .addOptions(
        options.map((o, i) => ({
          label: `Amostra ${i + 1}`,
          description: o.description.slice(0, 100),
          value: o.value,
        })),
      ),
  );
}

async function startHerbPuzzle(
  channel: TextBasedChannel | null,
  instanceId: string,
  actorDiscordId: string,
): Promise<void> {
  if (!channel || !("send" in channel)) return;
  const inst = await getInstance(instanceId);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "MEDICINAL_HERBS") return;

  let state = ensureState(inst.stateJson);
  let msg = await channel.send({ embeds: [buildHerbEmbed(state, def)], components: [buildHerbMenu(instanceId, state)] });

  while ((state.herbsCollected ?? 0) < neededHerbs(def)) {
    const round = (state.herbsCollected ?? 0) + 1;
    const expected = HERBS[state.herbsCollected ?? 0]!;
    try {
      const pick = (await msg.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        time: stepTimeout(def),
        filter: (i: StringSelectMenuInteraction) =>
          i.user.id === actorDiscordId && i.customId === `herbs:${instanceId}:${round}`,
      })) as StringSelectMenuInteraction;

      const value = pick.values[0]!;
      if (value === expected.id) {
        state.herbsCollected = (state.herbsCollected ?? 0) + 1;
      } else {
        state.mistakes = (state.mistakes ?? 0) + 1;
      }

      if ((state.mistakes ?? 0) >= maxMistakes(def)) {
        await failHerbsMission(instanceId, msg, "Ervas erradas demais foram colhidas. Haru nao consegue usar esse lote.");
        return;
      }

      await setState(instanceId, state);
      const done = (state.herbsCollected ?? 0) >= neededHerbs(def);
      await pick.update({
        embeds: [buildHerbEmbed(state, def)],
        components: done ? [] : [buildHerbMenu(instanceId, state)],
      });
      if (done) break;
    } catch {
      await failHerbsMission(instanceId, msg, "Tempo esgotado. As pistas na trilha se perderam antes da coleta terminar.");
      return;
    }
  }

  state.stage = "RETURN";
  state.running = false;
  await markObjective(instanceId, "coletar_ervas");
  await setState(instanceId, state);
  await msg.edit({
    embeds: [
      EmbedBuilder.from(buildHerbEmbed(state, def)).setDescription(
        "As tres ervas foram identificadas e guardadas no estojo medicinal.\n\nVolte ao **Hospital de Konoha** e entregue para Haru.",
      ),
    ],
    components: [],
  });
  await channel.send(`Ervas coletadas. Volte ao **Hospital de Konoha** e use \`/interagir npc\`: <#${HOSPITAL_KONOHA_CHANNEL_ID}>.`);
}

async function failHerbsMission(instanceId: string, msg: Message, reason: string): Promise<void> {
  await prisma.missionInstance.update({ where: { id: instanceId }, data: { status: "FAILED" } });
  await msg.edit({
    embeds: [new EmbedBuilder().setColor(0xc0392b).setTitle("Coleta comprometida").setDescription(reason)],
    components: [],
  }).catch(() => undefined);
}
