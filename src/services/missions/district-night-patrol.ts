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
import { CENTRO_COMERCIAL_CHANNEL_ID } from "../../data/scenarios/index.js";
import { getMission } from "../../data/missions/index.js";
import { getOrCreateCharacter } from "../characters/character-service.js";
import { getActiveSession, startCombat } from "../combat/combat-engine.js";
import { formatPersonaLines, sendAsPersona } from "../discord/persona-webhook.js";
import type { RenderEntity } from "../maps/renderer.js";
import { NpcAiService } from "../npc-ai/npc-ai-service.js";
import { getPersona } from "../npc-ai/personas.js";
import { partyMemberIds } from "../party/party-service.js";
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

const SCOUT_KEY = "district_patrol_scout";
const SCOUT_PERSONA = "district_patrol_scout_konoha";
const activePatrols = new Set<string>();

interface PatrolPoint {
  id: string;
  title: string;
  clue: string;
  correct: string;
  success: string;
  missed: string;
  options: { value: string; label: string; description: string }[];
}

const PATROL_POINTS: PatrolPoint[] = [
  {
    id: "tiles",
    title: "Telhas recem quebradas",
    clue: "Um morador viu uma sombra pousar sobre a loja de tecidos. Ha telhas rachadas e po escuro perto da beirada.",
    correct: "examinar_telhas",
    success: "As telhas mostram pegadas leves indo para o varal dos fundos.",
    missed: "O rastro nas telhas esfriou antes de ser lido.",
    options: [
      { value: "examinar_telhas", label: "Examinar telhas", description: "Procura pegadas, poeira deslocada e direcao do salto." },
      { value: "gritar_rua", label: "Gritar da rua", description: "Pode alertar quem estiver nos telhados." },
      { value: "seguir_aleatorio", label: "Saltar sem rastro", description: "Escolhe um telhado qualquer no escuro." },
    ],
  },
  {
    id: "cloth",
    title: "Varal cortado nos fundos",
    clue: "Um pano preto ficou preso no varal. A corda foi cortada por lamina pequena, como se alguem tivesse passado correndo.",
    correct: "guardar_pano",
    success: "O pano tem cheiro de oleo barato usado em ferramentas de arrombamento.",
    missed: "O vento levou o pano antes que a patrulha preservasse a pista.",
    options: [
      { value: "perseguir_sombra", label: "Perseguir sombra", description: "Corre antes de entender para onde ela foi." },
      { value: "guardar_pano", label: "Guardar pano", description: "Preserva a pista e identifica cheiro, fibra e corte." },
      { value: "chamar_multidao", label: "Chamar moradores", description: "Junta curiosos no local errado." },
    ],
  },
  {
    id: "water",
    title: "Caixa d'agua vibrando",
    clue: "A caixa d'agua vibra com passos recentes. Um fio preso na tampa aponta para a rua das lanternas.",
    correct: "seguir_fio",
    success: "O fio leva ate um sino abafado usado para avisar comparsas.",
    missed: "A vibracao parou e o fio foi recolhido do outro lado.",
    options: [
      { value: "abrir_tampa", label: "Abrir a tampa", description: "Faz barulho e perde o sinal de quem puxou o fio." },
      { value: "seguir_fio", label: "Seguir o fio", description: "Acompanha a linha sem disparar o aviso." },
      { value: "cortar_fio", label: "Cortar o fio", description: "Interrompe a pista antes de revelar o destino." },
    ],
  },
  {
    id: "lanterns",
    title: "Lanternas apagadas",
    clue: "Tres lanternas apagaram ao mesmo tempo. Entre elas, alguem deixou marcas de sola molhada no beiral.",
    correct: "cercar_beiral",
    success: "A rota de fuga foi fechada e o batedor ficou preso no beiral.",
    missed: "O batedor percebeu a demora e preparou uma emboscada antes de aparecer.",
    options: [
      { value: "cercar_beiral", label: "Cercar beiral", description: "Fecha as saidas antes de revelar a patrulha." },
      { value: "acender_lanternas", label: "Acender lanternas", description: "Ilumina o time antes de cercar o suspeito." },
      { value: "descer_rua", label: "Descer para a rua", description: "Entrega a vantagem de altura." },
    ],
  },
];

export interface DistrictNightPatrolState {
  stage?: "PATROL" | "SCOUT_TALK" | "FIGHT" | "DONE";
  activeNpc?: string | null;
  patrolStep?: number;
  cluesFound?: number;
  cluesLost?: number;
  scoutIntroduced?: boolean;
  talks?: Record<string, number>;
  combatStarted?: boolean;
}

export interface DistrictNightPatrolChoice {
  key: string;
  name: string;
}

interface DistrictNightPatrolContext {
  inst: NonNullable<Awaited<ReturnType<typeof getInstance>>>;
  def: NonNullable<ReturnType<typeof getMission>>;
  ownerCharId: string;
}

function ensureState(raw: string): DistrictNightPatrolState {
  const state = readState<DistrictNightPatrolState>(raw);
  state.stage = state.stage ?? "PATROL";
  state.activeNpc = state.activeNpc ?? null;
  state.patrolStep = state.patrolStep ?? 0;
  state.cluesFound = state.cluesFound ?? 0;
  state.cluesLost = state.cluesLost ?? 0;
  state.scoutIntroduced = state.scoutIntroduced ?? false;
  state.talks = state.talks ?? {};
  state.combatStarted = state.combatStarted ?? false;
  return state;
}

function stepTimeout(def: DistrictNightPatrolContext["def"]): number {
  return Number(def.data?.stepTimeoutMs ?? 75_000);
}

function scoutTurns(def: DistrictNightPatrolContext["def"]): number {
  return Number(def.data?.scoutTurns ?? 2);
}

function weakTemplate(def: DistrictNightPatrolContext["def"]): string {
  return String(def.data?.weakTemplate ?? "district_rooftop_thief");
}

function leaderTemplate(def: DistrictNightPatrolContext["def"]): string {
  return String(def.data?.leaderTemplate ?? "district_rooftop_leader");
}

async function findContextByCharId(charId: string): Promise<DistrictNightPatrolContext | null> {
  const c = await getActiveInstanceByType(charId, "DISTRICT_NIGHT_PATROL");
  if (!c) return null;
  return { inst: c.inst, def: c.def, ownerCharId: charId };
}

export async function resolveDistrictNightPatrol(
  discordId: string,
  guildId: string,
): Promise<DistrictNightPatrolContext | null> {
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

export function availableDistrictNightPatrolNpcs(
  state: DistrictNightPatrolState,
  channelId: string,
): DistrictNightPatrolChoice[] {
  if (channelId !== CENTRO_COMERCIAL_CHANNEL_ID) return [];
  if ((state.stage ?? "PATROL") === "SCOUT_TALK") return [{ key: SCOUT_KEY, name: "Batedor dos Telhados" }];
  return [];
}

export async function districtNightPatrolMapHandle(
  interaction: ChatInputCommandInteraction,
  ctx: DistrictNightPatrolContext,
  entities: RenderEntity[],
): Promise<string | null> {
  if (interaction.channelId !== CENTRO_COMERCIAL_CHANNEL_ID) return null;
  let state = ensureState(ctx.inst.stateJson);

  if (state.stage === "PATROL") {
    entities.push(...patrolEntities(state));
    const key = ctx.inst.id;
    if (activePatrols.has(key)) {
      return `\nMissao ativa: **${ctx.def.name}** - a patrulha dos telhados ja esta em andamento no canal.`;
    }

    activePatrols.add(key);
    await markObjective(ctx.inst.id, "chegar_distrito");
    await setState(ctx.inst.id, state);
    void startPatrolPanel(interaction.channel, ctx.inst.id, interaction.user.id, interaction.guildId ?? "global").finally(() => {
      activePatrols.delete(key);
    });
    return `\nMissao ativa: **${ctx.def.name}** - escolha os pontos de investigacao no painel enviado no canal.`;
  }

  if (state.stage === "SCOUT_TALK") {
    entities.push(scoutEntity(state));
    if (!state.scoutIntroduced) {
      state.scoutIntroduced = true;
      await setState(ctx.inst.id, state);
      await speak(
        interaction.channel,
        "(a patrulha fecha a rota de fuga no beiral)",
        "Voce foi cercado no telhado. Tente ganhar tempo, negue ser criminoso e ameace assobiar para seus comparsas.",
        0,
      );
    }
    return `\nMissao ativa: **${ctx.def.name}** - use \`/interagir npc\` para confrontar o **Batedor dos Telhados**.`;
  }

  if (state.stage === "FIGHT") {
    return `\nMissao ativa: **${ctx.def.name}** - sobreviva a emboscada e derrote os criminosos.`;
  }

  return null;
}

function patrolEntities(state: DistrictNightPatrolState): RenderEntity[] {
  const cells = ["B3", "C7", "D5", "E8"];
  const index = Math.min(state.patrolStep ?? 0, cells.length - 1);
  return [{
    cell: cells[index]!,
    name: "Sombra no telhado",
    label: "?",
    color: "#9b59b6",
    kind: "MARKER",
  }];
}

function scoutEntity(state: DistrictNightPatrolState): RenderEntity {
  return {
    cell: (state.cluesLost ?? 0) >= 2 ? "E8" : "D5",
    name: "Batedor dos Telhados",
    label: "Bat",
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
  const text = await NpcAiService.say(SCOUT_PERSONA, playerMessage, extra, fallbackIndex);
  const persona = getPersona(SCOUT_PERSONA);
  const sent = await sendAsPersona(channel, {
    key: SCOUT_PERSONA,
    name: persona?.displayName ?? "Batedor dos Telhados",
    avatarFile: persona?.avatarFile,
    lines: formatPersonaLines(text),
  });
  if (!sent && channel && "send" in channel) await channel.send(text.slice(0, 1900));
}

export async function interactDistrictNightPatrol(
  interaction: ChatInputCommandInteraction,
  npcKey: string,
): Promise<void> {
  const guildId = interaction.guildId ?? "global";
  const ctx = await resolveDistrictNightPatrol(interaction.user.id, guildId);
  if (!ctx) {
    await interaction.reply({ content: "Voce (ou sua party) nao tem essa missao ativa.", ephemeral: true });
    return;
  }

  const state = ensureState(ctx.inst.stateJson);
  const choice = availableDistrictNightPatrolNpcs(state, interaction.channelId).find((npc) => npc.key === npcKey);
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
  await runScoutDialogue(interaction.channel, interaction.channelId, guildId, ctx, char, "(o ninja manda o batedor parar)");
  await interaction.editReply(`Voce confronta **${choice.name}**. Continue por mensagens normais no canal.`);
}

export async function continueDistrictNightPatrolMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.guildId || message.channelId !== CENTRO_COMERCIAL_CHANNEL_ID) return false;
  const ctx = await resolveDistrictNightPatrol(message.author.id, message.guildId);
  if (!ctx) return false;
  const state = ensureState(ctx.inst.stateJson);
  if (state.activeNpc !== SCOUT_KEY) return false;
  if (!availableDistrictNightPatrolNpcs(state, message.channelId).some((npc) => npc.key === SCOUT_KEY)) return false;

  const char = await getOrCreateCharacter(message.author.id, message.guildId, message.author.username);
  await runScoutDialogue(message.channel, message.channelId, message.guildId, ctx, char, message.content || "...");
  return true;
}

async function runScoutDialogue(
  channel: TextBasedChannel | null,
  channelId: string,
  guildId: string,
  ctx: DistrictNightPatrolContext,
  char: Awaited<ReturnType<typeof getOrCreateCharacter>>,
  playerMessage: string,
): Promise<void> {
  const inst = await getInstance(ctx.inst.id);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "DISTRICT_NIGHT_PATROL") return;
  const state = ensureState(inst.stateJson);
  if (state.stage !== "SCOUT_TALK") return;

  const turn = (state.talks!.scout ?? 0) + 1;
  state.talks!.scout = turn;
  const fight = turn >= scoutTurns(def);
  await speak(
    channel,
    playerMessage,
    fight
      ? "Ultima fala: revele que os comparsas ja cercaram a rua, assobie e inicie a emboscada."
      : "Negue envolvimento, tente parecer so um morador assustado e provoque o time sem iniciar combate ainda.",
    fight ? 2 : 1,
  );

  if (!fight) {
    await setState(inst.id, state);
    return;
  }

  state.stage = "FIGHT";
  state.activeNpc = null;
  state.combatStarted = true;
  await markObjective(inst.id, "confrontar_batedor");
  await setState(inst.id, state);
  await startPatrolCombat(channel, channelId, guildId, char, inst.id, def, state);
}

async function startPatrolCombat(
  channel: TextBasedChannel | null,
  channelId: string,
  guildId: string,
  char: Awaited<ReturnType<typeof getOrCreateCharacter>>,
  instanceId: string,
  def: NonNullable<ReturnType<typeof getMission>>,
  state: DistrictNightPatrolState,
): Promise<void> {
  if (await getActiveSession(channelId)) {
    if (channel && "send" in channel) await channel.send("O combate ja esta em andamento. Use `/mapa`.");
    return;
  }

  const { players, attrsById } = await gatherPartyPlayers(channel, guildId, {
    charId: char.id,
    name: char.name,
    hpCurrent: char.hpCurrent,
    hpMax: char.hpMax,
    chakra: char.resources?.chakra ?? 100,
    energia: char.resources?.energia ?? 100,
    jutsuIds: char.jutsus.map((j: { jutsuId: string }) => j.jutsuId),
    attrs: {
      ninjutsu: char.attributes?.ninjutsu ?? 1,
      iryo: char.attributes?.iryo ?? 1,
      taijutsu: char.attributes?.taijutsu ?? 1,
      genjutsu: char.attributes?.genjutsu ?? 1,
      kenjutsu: char.attributes?.kenjutsu ?? 1,
    },
  });

  const weakCount = (state.cluesLost ?? 0) >= 2 ? 3 : 2;
  const session = await startCombat({
    channelId,
    guildId,
    scenarioId: "centro_comercial",
    players,
    npcs: [
      { templateId: leaderTemplate(def) },
      ...Array.from({ length: weakCount }, () => ({ templateId: weakTemplate(def) })),
    ],
    missionInstanceId: instanceId,
  });
  await cacheAttrs(session, attrsById);

  if (channel && "send" in channel) {
    const clueText = (state.cluesLost ?? 0) >= 2
      ? "Como muitas pistas foram perdidas, os criminosos chegaram melhor posicionados."
      : "As pistas preservadas impediram a emboscada perfeita.";
    await channel.send(
      `Emboscada iniciada contra os **Criminosos dos Telhados**! ${clueText} ${players.length} ninja(s) na luta. Use \`/mapa\`.`,
    );
  }
}

function patrolEmbed(
  state: DistrictNightPatrolState,
  def: NonNullable<ReturnType<typeof getMission>>,
  footer?: string,
): EmbedBuilder {
  const point = PATROL_POINTS[state.patrolStep ?? 0];
  const embed = new EmbedBuilder()
    .setColor(0x2c3e50)
    .setTitle("Patrulha Noturna no Distrito")
    .setDescription(
      [
        `Pontos verificados: **${state.patrolStep ?? 0}/${PATROL_POINTS.length}**`,
        `Pistas preservadas: **${state.cluesFound ?? 0}**`,
        `Pistas perdidas: **${state.cluesLost ?? 0}**`,
        "",
        point ? `**${point.title}:** ${point.clue}` : "A patrulha fechou o cerco nos telhados.",
        "",
        `Escolha uma abordagem. Se demorar mais de ${Math.round(stepTimeout(def) / 1000)}s, a pista esfria.`,
      ].join("\n"),
    );
  if (footer) embed.setFooter({ text: footer });
  return embed;
}

function patrolMenu(instanceId: string, state: DistrictNightPatrolState): ActionRowBuilder<StringSelectMenuBuilder> {
  const point = PATROL_POINTS[state.patrolStep ?? 0]!;
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`districtpatrol:${instanceId}:${(state.patrolStep ?? 0) + 1}`)
      .setPlaceholder("Escolha a abordagem da patrulha")
      .addOptions(point.options),
  );
}

async function startPatrolPanel(
  channel: TextBasedChannel | null,
  instanceId: string,
  actorDiscordId: string,
  guildId: string,
): Promise<void> {
  if (!channel || !("send" in channel)) return;
  const inst = await getInstance(instanceId);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "DISTRICT_NIGHT_PATROL") return;

  const allowed = new Set([actorDiscordId, ...(await partyMemberIds(guildId, actorDiscordId))]);
  let state = ensureState(inst.stateJson);
  let msg = await channel.send({ embeds: [patrolEmbed(state, def)], components: [patrolMenu(instanceId, state)] });

  while ((state.patrolStep ?? 0) < PATROL_POINTS.length) {
    const round = (state.patrolStep ?? 0) + 1;
    const point = PATROL_POINTS[state.patrolStep ?? 0]!;
    try {
      const pick = (await msg.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        time: stepTimeout(def),
        filter: (i: StringSelectMenuInteraction) =>
          allowed.has(i.user.id) && i.customId === `districtpatrol:${instanceId}:${round}`,
      })) as StringSelectMenuInteraction;

      state = ensureState((await getInstance(instanceId))?.stateJson ?? "{}");
      const correct = pick.values[0] === point.correct;
      if (correct) state.cluesFound = (state.cluesFound ?? 0) + 1;
      else state.cluesLost = (state.cluesLost ?? 0) + 1;
      state.patrolStep = (state.patrolStep ?? 0) + 1;

      const done = (state.patrolStep ?? 0) >= PATROL_POINTS.length;
      if (done) {
        state.stage = "SCOUT_TALK";
        await markObjective(instanceId, "patrulhar_telhados");
        await setState(instanceId, state);
        await pick.update({
          embeds: [
            new EmbedBuilder()
              .setColor(0x8e44ad)
              .setTitle("Batedor localizado")
              .setDescription(
                [
                  `Pistas preservadas: **${state.cluesFound ?? 0}**`,
                  `Pistas perdidas: **${state.cluesLost ?? 0}**`,
                  "",
                  "A patrulha fechou o cerco nos telhados do Centro Comercial.",
                  "Use `/mapa` para ver o batedor e `/interagir npc` para confronta-lo.",
                ].join("\n"),
              ),
          ],
          components: [],
        });
        break;
      }

      await setState(instanceId, state);
      await pick.update({
        embeds: [patrolEmbed(state, def, correct ? point.success : point.missed)],
        components: [patrolMenu(instanceId, state)],
      });
    } catch {
      state = ensureState((await getInstance(instanceId))?.stateJson ?? "{}");
      state.cluesLost = (state.cluesLost ?? 0) + 1;
      state.patrolStep = (state.patrolStep ?? 0) + 1;

      const done = (state.patrolStep ?? 0) >= PATROL_POINTS.length;
      if (done) {
        state.stage = "SCOUT_TALK";
        await markObjective(instanceId, "patrulhar_telhados");
        await setState(instanceId, state);
        await msg.edit({
          embeds: [
            new EmbedBuilder()
              .setColor(0x8e44ad)
              .setTitle("Batedor localizado tarde demais")
              .setDescription(
                "Algumas pistas esfriaram, mas a patrulha ainda conseguiu cercar um batedor nos telhados.\n\nUse `/mapa` e depois `/interagir npc`.",
              ),
          ],
          components: [],
        }).catch(() => undefined);
        break;
      }

      await setState(instanceId, state);
      await msg.edit({
        embeds: [patrolEmbed(state, def, point.missed)],
        components: [patrolMenu(instanceId, state)],
      }).catch(() => undefined);
    }
  }

  await channel.send("Patrulha concluida. Use `/mapa` no **Centro Comercial** para localizar o batedor nos telhados.");
}

export async function onDistrictNightPatrolCombatWon(
  interaction: ChatInputCommandInteraction,
  instanceId: string,
): Promise<void> {
  const inst = await getInstance(instanceId);
  if (!inst || inst.status !== "ACTIVE") return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "DISTRICT_NIGHT_PATROL") return;

  const state = ensureState(inst.stateJson);
  state.stage = "DONE";
  state.activeNpc = null;
  state.combatStarted = false;
  await markObjective(inst.id, "derrotar_quadrilha");
  await setState(inst.id, state);

  const result = await completeMission(inst.charId, inst.missionId);
  if (result) {
    await interaction.followUp({ embeds: [buildMissionCompleteEmbed(def.name, result.rewards)] });
  }
}
