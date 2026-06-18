import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Message,
  type StringSelectMenuInteraction,
  type TextBasedChannel,
} from "discord.js";
import { prisma } from "../../db/client.js";
import { ACADEMIA_GENIN_CHANNEL_ID } from "../../data/scenarios/index.js";
import { getMission } from "../../data/missions/index.js";
import { partyMemberIds } from "../party/party-service.js";
import { NpcAiService } from "../npc-ai/npc-ai-service.js";
import { getPersona } from "../npc-ai/personas.js";
import { sendAsPersona, formatPersonaLines } from "../discord/persona-webhook.js";
import {
  completeMission,
  getActiveInstanceByType,
  getInstance,
  markObjective,
  readState,
  setState,
} from "./mission-service.js";
import type { RenderEntity } from "../maps/renderer.js";

const INSTRUCTOR_KEY = "academy_instructor_yori";

interface DummyRepair {
  id: string;
  name: string;
  cell: string;
  damage: string;
  correct: string;
  tools: { value: string; label: string; description: string }[];
}

const DUMMIES: DummyRepair[] = [
  {
    id: "braco",
    name: "Boneco do Braco Solto",
    cell: "B3",
    damage: "O braco de madeira esta pendurado e a junta perdeu a amarracao.",
    correct: "corda_sisal",
    tools: [
      { value: "corda_sisal", label: "Corda de sisal", description: "Refaz a amarracao da junta sem travar o movimento." },
      { value: "tinta_chakra", label: "Tinta de chakra", description: "Reativa marcas, mas nao segura madeira solta." },
      { value: "tala_bambu", label: "Tala de bambu", description: "Serve para rachadura estrutural, nao para junta solta." },
    ],
  },
  {
    id: "tronco",
    name: "Boneco do Tronco Rachado",
    cell: "C6",
    damage: "O tronco abriu uma rachadura depois de receber golpes de taijutsu.",
    correct: "tala_bambu",
    tools: [
      { value: "fita_pano", label: "Fita de pano", description: "Boa para acabamento, ruim para aguentar impacto." },
      { value: "tala_bambu", label: "Tala e cola de bambu", description: "Fecha a rachadura e devolve resistencia ao tronco." },
      { value: "oleo_dobradiça", label: "Oleo de dobradica", description: "Ajuda pivôs, mas nao conserta rachadura." },
    ],
  },
  {
    id: "selo",
    name: "Boneco do Selo Apagado",
    cell: "E4",
    damage: "O selo de alvo apagou e os alunos nao sabem onde mirar a substituicao.",
    correct: "tinta_chakra",
    tools: [
      { value: "tinta_chakra", label: "Tinta de chakra", description: "Refaz a marca de alvo para o teste de substituicao." },
      { value: "corda_sisal", label: "Corda de sisal", description: "Segura pecas, mas nao redesenha selo." },
      { value: "lixa_fina", label: "Lixa fina", description: "Limpa farpas, mas apaga ainda mais a marca." },
    ],
  },
];

const TEST_ROUNDS = [
  { id: "left", label: "Boneco Esquerdo", prompt: "Yori joga uma almofada pela esquerda. Substitua pelo boneco correto." },
  { id: "middle", label: "Boneco Central", prompt: "Yori aponta para o ataque frontal. Use o boneco que ficou no centro." },
  { id: "right", label: "Boneco Direito", prompt: "Yori simula um golpe pela direita. Troque no ultimo instante." },
] as const;

type TestButton = (typeof TEST_ROUNDS)[number]["id"];

export interface DummySubstitutionState {
  stage?: "INTRO" | "WORKSHOP" | "RETURN" | "DONE";
  activeNpc?: string | null;
  talks?: number;
  thanks?: number;
  running?: boolean;
  mistakes?: number;
  repairStep?: number;
  testStep?: number;
}

export interface DummySubstitutionChoice {
  key: string;
  name: string;
}

interface DummySubstitutionContext {
  inst: NonNullable<Awaited<ReturnType<typeof getInstance>>>;
  def: NonNullable<ReturnType<typeof getMission>>;
  ownerCharId: string;
}

function ensureState(raw: string): DummySubstitutionState {
  const state = readState<DummySubstitutionState>(raw);
  state.stage = state.stage ?? "INTRO";
  state.activeNpc = state.activeNpc ?? null;
  state.talks = state.talks ?? 0;
  state.thanks = state.thanks ?? 0;
  state.running = state.running ?? false;
  state.mistakes = state.mistakes ?? 0;
  state.repairStep = state.repairStep ?? 0;
  state.testStep = state.testStep ?? 0;
  return state;
}

function introTurns(def: DummySubstitutionContext["def"]): number {
  return Number(def.data?.introTurns ?? 3);
}

function thanksTurns(def: DummySubstitutionContext["def"]): number {
  return Number(def.data?.thanksTurns ?? 2);
}

function maxMistakes(def: DummySubstitutionContext["def"]): number {
  return Number(def.data?.maxMistakes ?? 4);
}

function stepTimeout(def: DummySubstitutionContext["def"]): number {
  return Number(def.data?.stepTimeoutMs ?? 60_000);
}

async function findContextByCharId(charId: string): Promise<DummySubstitutionContext | null> {
  const c = await getActiveInstanceByType(charId, "DUMMY_SUBSTITUTION");
  if (!c) return null;
  return { inst: c.inst, def: c.def, ownerCharId: charId };
}

export async function resolveDummySubstitution(discordId: string, guildId: string): Promise<DummySubstitutionContext | null> {
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

export function availableDummySubstitutionNpcs(
  state: DummySubstitutionState,
  channelId: string,
): DummySubstitutionChoice[] {
  if (channelId !== ACADEMIA_GENIN_CHANNEL_ID) return [];
  if (state.stage === "INTRO") return [{ key: INSTRUCTOR_KEY, name: "Yori Umino (instrutor)" }];
  if (state.stage === "RETURN") return [{ key: INSTRUCTOR_KEY, name: "Yori Umino (confirmar teste)" }];
  return [];
}

export async function dummySubstitutionMapHandle(
  interaction: ChatInputCommandInteraction,
  ctx: DummySubstitutionContext,
  entities: RenderEntity[],
): Promise<string | null> {
  if (interaction.channelId !== ACADEMIA_GENIN_CHANNEL_ID) return null;
  let state = ensureState(ctx.inst.stateJson);
  if (state.stage === "DONE") return null;

  entities.push(instructorEntity(), ...dummyEntities(state));
  if (state.stage === "INTRO") {
    return `\nMissao ativa: **${ctx.def.name}** - fale com Yori usando \`/interagir npc\`.`;
  }
  if (state.stage === "RETURN") {
    return `\nMissao ativa: **${ctx.def.name}** - confirme o resultado com Yori usando \`/interagir npc\`.`;
  }
  if (state.running) {
    return `\nMissao ativa: **${ctx.def.name}** - a oficina dos bonecos ja esta em andamento no canal.`;
  }

  state.running = true;
  state.mistakes = 0;
  state.repairStep = 0;
  state.testStep = 0;
  await setState(ctx.inst.id, state);
  void startDummyWorkshop(interaction.channel, ctx.inst.id, interaction.user.id).catch(() => undefined);
  return `\nMissao ativa: **${ctx.def.name}** - conserte os bonecos e teste a substituicao no painel enviado no canal.`;
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

function dummyEntities(state: DummySubstitutionState): RenderEntity[] {
  return DUMMIES.map((dummy, index) => ({
    cell: dummy.cell,
    name: dummy.name,
    label: "Bon",
    color: (state.repairStep ?? 0) > index ? "#2ecc71" : "#c0392b",
    kind: "NPC",
    imageFile: "npcs/training-dummy.png",
    badge: (state.repairStep ?? 0) > index ? "OK" : "!",
  }));
}

async function speak(channel: TextBasedChannel | null, message: string, extra: string, fallbackIndex: number): Promise<void> {
  const text = await NpcAiService.say(INSTRUCTOR_KEY, message, extra, fallbackIndex);
  const persona = getPersona(INSTRUCTOR_KEY);
  const sent = await sendAsPersona(channel, {
    key: INSTRUCTOR_KEY,
    name: persona?.displayName ?? "Yori Umino",
    avatarFile: persona?.avatarFile,
    lines: formatPersonaLines(text),
  });
  if (!sent && channel && "send" in channel) await channel.send(text.slice(0, 1900));
}

export async function interactDummySubstitution(interaction: ChatInputCommandInteraction, npcKey: string): Promise<void> {
  const guildId = interaction.guildId ?? "global";
  const ctx = await resolveDummySubstitution(interaction.user.id, guildId);
  if (!ctx) {
    await interaction.reply({ content: "Voce (ou sua party) nao tem essa missao ativa.", ephemeral: true });
    return;
  }
  const state = ensureState(ctx.inst.stateJson);
  const choice = availableDummySubstitutionNpcs(state, interaction.channelId).find((n) => n.key === npcKey);
  if (!choice) {
    await interaction.reply({ content: "Esse NPC nao esta disponivel para essa missao aqui.", ephemeral: true });
    return;
  }
  if (state.activeNpc && state.activeNpc !== npcKey) {
    await interaction.reply({ content: "Ja existe uma conversa de missao em andamento.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  state.activeNpc = npcKey;
  await setState(ctx.inst.id, state);
  await runDummyDialogue(interaction.channel, ctx, "(o ninja se aproxima dos bonecos danificados)");
  await interaction.editReply(`Voce se aproxima de **${choice.name}**. Continue por mensagens normais no canal.`);
}

export async function continueDummySubstitutionMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.guildId || message.channelId !== ACADEMIA_GENIN_CHANNEL_ID) return false;
  const ctx = await resolveDummySubstitution(message.author.id, message.guildId);
  if (!ctx) return false;
  const state = ensureState(ctx.inst.stateJson);
  if (state.activeNpc !== INSTRUCTOR_KEY) return false;
  if (!availableDummySubstitutionNpcs(state, message.channelId).some((n) => n.key === INSTRUCTOR_KEY)) return false;
  await runDummyDialogue(message.channel, ctx, message.content || "...");
  return true;
}

async function runDummyDialogue(
  channel: TextBasedChannel | null,
  ctx: DummySubstitutionContext,
  playerMessage: string,
): Promise<void> {
  const inst = await getInstance(ctx.inst.id);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "DUMMY_SUBSTITUTION") return;
  const state = ensureState(inst.stateJson);

  if (state.stage === "INTRO") {
    state.talks = (state.talks ?? 0) + 1;
    const done = state.talks >= introTurns(def);
    await speak(
      channel,
      playerMessage,
      done
        ? "Esta e sua ultima fala: explique que o jogador deve usar /mapa para consertar os bonecos e testar substituicao basica."
        : "Explique os danos dos bonecos e transforme a manutencao em uma aula curta.",
      done ? 2 : Math.min((state.talks ?? 1) - 1, 1),
    );
    if (done) {
      state.stage = "WORKSHOP";
      state.activeNpc = null;
      await markObjective(inst.id, "falar_instrutor");
      await setState(inst.id, state);
      if (channel && "send" in channel) await channel.send("Use `/mapa` para abrir a oficina dos bonecos.");
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
        ? "Esta e sua ultima fala: confirme que os bonecos foram aprovados para aulas basicas e agradeca."
        : "Avalie os bonecos reparados e agradeca pelo teste de substituicao.",
      3 + Math.min((state.thanks ?? 1) - 1, 1),
    );
    if (done) {
      state.stage = "DONE";
      state.activeNpc = null;
      await markObjective(inst.id, "confirmar_treino");
      await setState(inst.id, state);
      const result = await completeMission(inst.charId, inst.missionId);
      if (result && channel && "send" in channel) {
        const items = result.rewards.items?.map((i) => i.name).join(", ");
        await channel.send(
          `Missao concluida: **${def.name}**!\nRecompensas: ${result.rewards.xp} XP, ${result.rewards.ryo} ryo${items ? `, ${items}` : ""}.`,
        );
      }
      return;
    }
    await setState(inst.id, state);
  }
}

function buildRepairEmbed(state: DummySubstitutionState, def: NonNullable<ReturnType<typeof getMission>>): EmbedBuilder {
  const dummy = DUMMIES[state.repairStep ?? 0];
  return new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle("Oficina da Academia - Reparo dos Bonecos")
    .setDescription(
      [
        `Bonecos reparados: **${state.repairStep ?? 0}/${DUMMIES.length}**`,
        `Erros: **${state.mistakes ?? 0}/${maxMistakes(def)}**`,
        "",
        dummy ? `**${dummy.name}:** ${dummy.damage}` : "Todos os bonecos foram reparados.",
        "",
        "Escolha a ferramenta certa para este dano.",
      ].join("\n"),
    );
}

function buildRepairMenu(instanceId: string, state: DummySubstitutionState): ActionRowBuilder<StringSelectMenuBuilder> {
  const index = state.repairStep ?? 0;
  const dummy = DUMMIES[index]!;
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`dummy:repair:${instanceId}:${index + 1}`)
      .setPlaceholder(`Reparar ${dummy.name}`)
      .addOptions(dummy.tools.map((tool) => ({
        label: tool.label,
        description: tool.description.slice(0, 100),
        value: tool.value,
      }))),
  );
}

function buildTestEmbed(
  state: DummySubstitutionState,
  def: NonNullable<ReturnType<typeof getMission>>,
  body: string,
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle("Teste Basico de Substituicao")
    .setDescription(
      [
        body,
        "",
        `Acertos no teste: **${state.testStep ?? 0}/${TEST_ROUNDS.length}**`,
        `Erros totais: **${state.mistakes ?? 0}/${maxMistakes(def)}**`,
      ].join("\n"),
    );
}

function buildTestButtons(instanceId: string, step: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`dummy:test:${instanceId}:${step}:left`)
      .setLabel("Esquerdo")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`dummy:test:${instanceId}:${step}:middle`)
      .setLabel("Central")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`dummy:test:${instanceId}:${step}:right`)
      .setLabel("Direito")
      .setStyle(ButtonStyle.Secondary),
  );
}

async function startDummyWorkshop(
  channel: TextBasedChannel | null,
  instanceId: string,
  actorDiscordId: string,
): Promise<void> {
  if (!channel || !("send" in channel)) return;
  const inst = await getInstance(instanceId);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "DUMMY_SUBSTITUTION") return;

  let state = ensureState(inst.stateJson);
  const msg = await channel.send({ embeds: [buildRepairEmbed(state, def)], components: [buildRepairMenu(instanceId, state)] });

  while ((state.repairStep ?? 0) < DUMMIES.length) {
    const step = (state.repairStep ?? 0) + 1;
    const dummy = DUMMIES[state.repairStep ?? 0]!;
    try {
      const pick = (await msg.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        time: stepTimeout(def),
        filter: (i: StringSelectMenuInteraction) =>
          i.user.id === actorDiscordId && i.customId === `dummy:repair:${instanceId}:${step}`,
      })) as StringSelectMenuInteraction;

      if (pick.values[0] === dummy.correct) state.repairStep = step;
      else state.mistakes = (state.mistakes ?? 0) + 1;

      if ((state.mistakes ?? 0) >= maxMistakes(def)) {
        await failDummyMission(instanceId, msg, "Erros demais nos reparos. Os bonecos ficaram inseguros para aula.");
        return;
      }

      await setState(instanceId, state);
      const done = (state.repairStep ?? 0) >= DUMMIES.length;
      await pick.update({
        embeds: [buildRepairEmbed(state, def)],
        components: done ? [] : [buildRepairMenu(instanceId, state)],
      });
      if (done) break;
    } catch {
      await failDummyMission(instanceId, msg, "Tempo esgotado. A aula com os bonecos precisou ser cancelada.");
      return;
    }
  }

  await markObjective(instanceId, "consertar_bonecos");
  await msg.edit({
    embeds: [buildTestEmbed(state, def, TEST_ROUNDS[0]!.prompt)],
    components: [buildTestButtons(instanceId, 1)],
  });

  while ((state.testStep ?? 0) < TEST_ROUNDS.length) {
    const step = (state.testStep ?? 0) + 1;
    const round = TEST_ROUNDS[step - 1]!;
    try {
      const btn = (await msg.awaitMessageComponent({
        componentType: ComponentType.Button,
        time: stepTimeout(def),
        filter: (i: ButtonInteraction) =>
          i.user.id === actorDiscordId && i.customId.startsWith(`dummy:test:${instanceId}:${step}:`),
      })) as ButtonInteraction;
      const value = btn.customId.split(":").at(-1) as TestButton;

      if (value === round.id) state.testStep = step;
      else state.mistakes = (state.mistakes ?? 0) + 1;

      if ((state.mistakes ?? 0) >= maxMistakes(def)) {
        await failDummyMission(instanceId, msg, "O teste falhou vezes demais. Os bonecos ainda nao servem para substituicao.");
        return;
      }

      await setState(instanceId, state);
      const done = (state.testStep ?? 0) >= TEST_ROUNDS.length;
      const next = TEST_ROUNDS[state.testStep ?? 0];
      await btn.update({
        embeds: [
          buildTestEmbed(
            state,
            def,
            done
              ? "Os tres bonecos resistiram ao teste de substituicao."
              : value === round.id
                ? next!.prompt
                : "O boneco errado rangeu e quase tombou. Yori reposiciona a turma para tentar de novo.",
          ),
        ],
        components: done ? [] : [buildTestButtons(instanceId, (state.testStep ?? 0) + 1)],
      });
      if (done) break;
    } catch {
      await failDummyMission(instanceId, msg, "Tempo esgotado. A janela do teste pratico acabou.");
      return;
    }
  }

  state.stage = "RETURN";
  state.running = false;
  await markObjective(instanceId, "testar_substituicao");
  await setState(instanceId, state);
  await msg.edit({
    embeds: [
      new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle("Bonecos aprovados")
        .setDescription("Os reparos seguraram e o teste de substituicao funcionou. Fale com **Yori Umino** usando `/interagir npc`."),
    ],
    components: [],
  });
}

async function failDummyMission(instanceId: string, msg: Message, reason: string): Promise<void> {
  await prisma.missionInstance.update({ where: { id: instanceId }, data: { status: "FAILED" } });
  await msg.edit({
    embeds: [new EmbedBuilder().setColor(0xc0392b).setTitle("Treino cancelado").setDescription(reason)],
    components: [],
  }).catch(() => undefined);
}
