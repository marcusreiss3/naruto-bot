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
import { pausedMissionNotice, sendMissionNotice } from "../../ui/mission-notice-v2.js";
import { getOrCreateCharacter, attrsFromRow } from "../characters/character-service.js";
import { getActiveSession, startCombat } from "../combat/combat-engine.js";
import { formatPersonaLines, sendAsPersona } from "../discord/persona-webhook.js";
import type { RenderEntity } from "../maps/renderer.js";
import { NpcAiService } from "../npc-ai/npc-ai-service.js";
import { getPersona } from "../npc-ai/personas.js";
import { partyMemberIds } from "../party/party-service.js";
import { cacheAttrs, gatherPartyPlayers, type StarterChar } from "./combat-party.js";
import {
  completeMission,
  buildMissionCompleteEmbed,
  getActiveInstanceByType,
  getInstance,
  markObjective,
  readState,
  setState,
} from "./mission-service.js";

const ORGANIZER_KEY = "festival_security_sayuri";
const SCOUT_KEY = "festival_fake_vendor";
const LEADER_KEY = "festival_rogue_ninja";

interface PatrolStep {
  id: string;
  title: string;
  clue: string;
  correct: string;
  success: string;
  options: { value: string; label: string; description: string }[];
}

const PATROL_STEPS: PatrolStep[] = [
  {
    id: "fireworks",
    title: "Caixa abandonada perto dos fogos",
    clue: "Uma caixa sem dono esta encostada na barraca de fogos. O corredor ainda esta cheio de visitantes.",
    correct: "isolar",
    success: "O corredor foi isolado e a caixa revelou um selo de transporte falsificado.",
    options: [
      { value: "isolar", label: "Isolar e verificar", description: "Afasta o publico e permite conferir o selo com seguranca." },
      { value: "abrir", label: "Abrir imediatamente", description: "Pode acionar uma armadilha no meio da multidao." },
      { value: "ignorar", label: "Esperar o dono", description: "Deixa uma caixa suspeita ao lado dos fogos." },
    ],
  },
  {
    id: "permit",
    title: "Vendedor com autorizacao estranha",
    clue: "Um vendedor novo apresenta uma licenca com o simbolo da Folha torto e evita olhar para os guardas.",
    correct: "comparar",
    success: "A comparacao com o registro confirma que a licenca e falsa.",
    options: [
      { value: "comparar", label: "Comparar o registro", description: "Confere numero, selo e barraca antes de abordar." },
      { value: "expulsar", label: "Expulsar sem prova", description: "Cria tumulto e pode alertar comparsas." },
      { value: "aceitar", label: "Aceitar a licenca", description: "Ignora sinais claros de falsificacao." },
    ],
  },
  {
    id: "lantern",
    title: "Corda de lanternas cortada",
    clue: "Uma corda foi cortada por lamina. Pegadas seguem para uma barraca fechada, longe do fluxo principal.",
    correct: "seguir",
    success: "A area foi protegida e as pegadas levaram ao falso vendedor.",
    options: [
      { value: "seguir", label: "Proteger e seguir pistas", description: "Evita acidentes e preserva o rastro do sabotador." },
      { value: "religar", label: "Religar as lanternas", description: "Apaga as pegadas antes da investigacao." },
      { value: "correr", label: "Correr atras de qualquer um", description: "Pode causar panico e atingir inocentes." },
    ],
  },
];

export interface FestivalSecurityState {
  stage?:
    | "BRIEFING"
    | "PATROL"
    | "SCOUT_TALK"
    | "THUG_FIGHT"
    | "LEADER_TRAIL"
    | "LEADER_TALK"
    | "LEADER_FIGHT"
    | "RETURN"
    | "DONE";
  activeNpc?: string | null;
  talks?: Record<string, number>;
  running?: boolean;
  patrolStep?: number;
  mistakes?: number;
  combatStarted?: boolean;
  scoutSeen?: boolean;
  leaderSeen?: boolean;
  trailSolved?: boolean;
}

export interface FestivalSecurityChoice {
  key: string;
  name: string;
}

export interface FestivalSecurityContext {
  inst: NonNullable<Awaited<ReturnType<typeof getInstance>>>;
  def: NonNullable<ReturnType<typeof getMission>>;
  ownerCharId: string;
}

function ensureState(raw: string): FestivalSecurityState {
  const state = readState<FestivalSecurityState>(raw);
  state.stage = state.stage ?? "BRIEFING";
  state.activeNpc = state.activeNpc ?? null;
  state.talks = state.talks ?? {};
  state.running = state.running ?? false;
  state.patrolStep = state.patrolStep ?? 0;
  state.mistakes = state.mistakes ?? 0;
  state.combatStarted = state.combatStarted ?? false;
  state.scoutSeen = state.scoutSeen ?? false;
  state.leaderSeen = state.leaderSeen ?? false;
  state.trailSolved = state.trailSolved ?? false;
  return state;
}

function turns(
  def: FestivalSecurityContext["def"],
  key: "briefingTurns" | "scoutTurns" | "leaderTurns" | "thanksTurns",
  fallback: number,
): number {
  return Number(def.data?.[key] ?? fallback);
}

function maxMistakes(def: FestivalSecurityContext["def"]): number {
  return Number(def.data?.maxMistakes ?? 4);
}

function stepTimeout(def: FestivalSecurityContext["def"]): number {
  return Number(def.data?.stepTimeoutMs ?? 60_000);
}

function weakTemplate(def: FestivalSecurityContext["def"]): string {
  return String(def.data?.weakTemplate ?? "festival_bandit");
}

function leaderTemplate(def: FestivalSecurityContext["def"]): string {
  return String(def.data?.leaderTemplate ?? "festival_rogue_ninja");
}

async function findContextByCharId(charId: string): Promise<FestivalSecurityContext | null> {
  const c = await getActiveInstanceByType(charId, "FESTIVAL_SECURITY");
  if (!c) return null;
  return { inst: c.inst, def: c.def, ownerCharId: charId };
}

export async function resolveFestivalSecurity(
  discordId: string,
  guildId: string,
): Promise<FestivalSecurityContext | null> {
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

export function availableFestivalSecurityNpcs(
  state: FestivalSecurityState,
  channelId: string,
): FestivalSecurityChoice[] {
  if (channelId !== CENTRO_COMERCIAL_CHANNEL_ID) return [];
  if (state.stage === "BRIEFING") return [{ key: ORGANIZER_KEY, name: "Sayuri Matsu (seguranca)" }];
  if (state.stage === "SCOUT_TALK") return [{ key: SCOUT_KEY, name: "Vendedor suspeito" }];
  if (state.stage === "LEADER_TALK") return [{ key: LEADER_KEY, name: "Ninja infiltrado" }];
  if (state.stage === "RETURN") return [{ key: ORGANIZER_KEY, name: "Sayuri Matsu (relatorio)" }];
  return [];
}

export async function festivalSecurityMapHandle(
  interaction: ChatInputCommandInteraction,
  ctx: FestivalSecurityContext,
  entities: RenderEntity[],
): Promise<string | null> {
  if (interaction.channelId !== CENTRO_COMERCIAL_CHANNEL_ID) return null;
  let state = ensureState(ctx.inst.stateJson);
  if (state.stage === "DONE") return null;
  entities.push(...festivalEntities(state));

  if (state.stage === "BRIEFING") {
    return `\nMissao ativa: **${ctx.def.name}** - fale com Sayuri usando \`/interagir npc\`.`;
  }
  if (state.stage === "PATROL") {
    if (state.running) {
      return `\nMissao ativa: **${ctx.def.name}** - a patrulha de seguranca ja esta aberta no canal.`;
    }
    state.running = true;
    await setState(ctx.inst.id, state);
    void startPatrol(interaction.channel, ctx.inst.id, interaction.user.id).catch(() => undefined);
    return `\nMissao ativa: **${ctx.def.name}** - verifique os pontos suspeitos no painel de patrulha.`;
  }
  if (state.stage === "SCOUT_TALK") {
    if (!state.scoutSeen) {
      state.scoutSeen = true;
      await setState(ctx.inst.id, state);
      await speak(
        interaction.channel,
        SCOUT_KEY,
        "(o falso vendedor percebe a patrulha chegando)",
        "Tente parecer um vendedor comum, mas demonstre nervosismo com a licenca falsa e a caixa abandonada.",
        0,
      );
    }
    return `\nMissao ativa: **${ctx.def.name}** - interrogue o vendedor suspeito com \`/interagir npc\`.`;
  }
  if (state.stage === "THUG_FIGHT") {
    await retryCombatIfNeeded(interaction, ctx, state, "THUG");
    return `\nMissao ativa: **${ctx.def.name}** - derrote os dois bandidos infiltrados no festival.`;
  }
  if (state.stage === "LEADER_TRAIL") {
    if (state.running) {
      return `\nMissao ativa: **${ctx.def.name}** - compare as pistas deixadas pelos bandidos no painel.`;
    }
    state.running = true;
    await setState(ctx.inst.id, state);
    void startLeaderTrail(interaction.channel, ctx.inst.id, interaction.user.id).catch(() => undefined);
    return `\nMissao ativa: **${ctx.def.name}** - descubra onde o mandante esta escondido.`;
  }
  if (state.stage === "LEADER_TALK") {
    if (!state.leaderSeen) {
      state.leaderSeen = true;
      await setState(ctx.inst.id, state);
      await speak(
        interaction.channel,
        LEADER_KEY,
        "(o time encontra o ninja infiltrado sob as lanternas azuis)",
        "Voce foi localizado como mandante da sabotagem. Ameace encerrar o festival, mas ainda nao ataque.",
        0,
      );
    }
    return `\nMissao ativa: **${ctx.def.name}** - confronte o ninja infiltrado usando \`/interagir npc\`.`;
  }
  if (state.stage === "LEADER_FIGHT") {
    await retryCombatIfNeeded(interaction, ctx, state, "LEADER");
    return `\nMissao ativa: **${ctx.def.name}** - derrote o ninja que comandou o ataque.`;
  }
  if (state.stage === "RETURN") {
    return `\nMissao ativa: **${ctx.def.name}** - entregue o relatorio final a Sayuri com \`/interagir npc\`.`;
  }
  return null;
}

function festivalEntities(state: FestivalSecurityState): RenderEntity[] {
  const entities: RenderEntity[] = [
    {
      cell: "C4",
      name: "Sayuri Matsu",
      label: "Say",
      color: "#f39c12",
      kind: "NPC",
      imageFile: "npcs/festival-organizer.png",
    },
    { cell: "B2", label: "\u{1F4E6}", color: "#e67e22", kind: "MARKER" },
    { cell: "D6", label: "\u{1F3EA}", color: "#3498db", kind: "MARKER" },
    { cell: "E8", label: "\u{1F3EE}", color: "#f1c40f", kind: "MARKER" },
  ];
  if (state.stage === "SCOUT_TALK") {
    entities.push({
      cell: "D6",
      name: "Vendedor suspeito",
      label: "Sus",
      color: "#c0392b",
      kind: "NPC",
      imageFile: "enemies/festival-bandit.png",
    });
  }
  if (state.stage === "LEADER_TALK") {
    entities.push({
      cell: "E8",
      name: "Ninja infiltrado",
      label: "Nin",
      color: "#8e44ad",
      kind: "NPC",
      imageFile: "enemies/festival-rogue-ninja.png",
    });
  }
  return entities;
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

export async function interactFestivalSecurity(
  interaction: ChatInputCommandInteraction,
  npcKey: string,
): Promise<void> {
  const guildId = interaction.guildId ?? "global";
  const ctx = await resolveFestivalSecurity(interaction.user.id, guildId);
  if (!ctx) {
    await interaction.reply({ content: "Voce (ou sua party) nao tem essa missao ativa.", ephemeral: true });
    return;
  }
  const state = ensureState(ctx.inst.stateJson);
  const choice = availableFestivalSecurityNpcs(state, interaction.channelId).find((npc) => npc.key === npcKey);
  if (!choice) {
    await interaction.reply({ content: "Esse NPC nao esta disponivel nesta etapa.", ephemeral: true });
    return;
  }
  if (state.activeNpc && state.activeNpc !== npcKey) {
    await interaction.reply({ content: "Ja existe uma conversa da missao em andamento.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  state.activeNpc = npcKey;
  await setState(ctx.inst.id, state);
  await runDialogue(interaction.channel, interaction.channelId, guildId, ctx, npcKey, "(o time inicia a conversa)", interaction.user);
  await interaction.editReply(`Voce se aproxima de **${choice.name}**. Continue por mensagens normais no canal.`);
}

export async function continueFestivalSecurityMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.guildId || message.channelId !== CENTRO_COMERCIAL_CHANNEL_ID) return false;
  const ctx = await resolveFestivalSecurity(message.author.id, message.guildId);
  if (!ctx) return false;
  const state = ensureState(ctx.inst.stateJson);
  if (!state.activeNpc) return false;
  if (!availableFestivalSecurityNpcs(state, message.channelId).some((npc) => npc.key === state.activeNpc)) return false;
  await runDialogue(message.channel, message.channelId, message.guildId, ctx, state.activeNpc, message.content || "...", message.author);
  return true;
}

async function runDialogue(
  channel: TextBasedChannel | null,
  channelId: string,
  guildId: string,
  ctx: FestivalSecurityContext,
  npcKey: string,
  playerMessage: string,
  actor: { id: string; username: string },
): Promise<void> {
  const inst = await getInstance(ctx.inst.id);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "FESTIVAL_SECURITY") return;
  const state = ensureState(inst.stateJson);
  const turn = (state.talks?.[npcKey] ?? 0) + 1;
  state.talks![npcKey] = turn;

  if (npcKey === ORGANIZER_KEY && state.stage === "BRIEFING") {
    const done = turn >= turns(def, "briefingTurns", 3);
    await speak(
      channel,
      ORGANIZER_KEY,
      playerMessage,
      done
        ? "Ultima fala: explique que o time deve usar /mapa para patrulhar caixas, licencas e lanternas sem causar panico."
        : "Explique que o festival recebeu ameacas e que a seguranca deve observar sinais de sabotagem entre os visitantes.",
      done ? 2 : Math.min(turn - 1, 1),
    );
    if (done) {
      state.stage = "PATROL";
      state.activeNpc = null;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "receber_briefing");
      await setState(inst.id, state);
      if (channel && "send" in channel) await channel.send("Use `/mapa` para iniciar a patrulha do festival.");
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === SCOUT_KEY && state.stage === "SCOUT_TALK") {
    const fight = turn >= turns(def, "scoutTurns", 3);
    await speak(
      channel,
      SCOUT_KEY,
      playerMessage,
      fight
        ? "Ultima fala: perceba que foi descoberto, assobie para chamar outro bandido e avance para o combate."
        : "Desconverse sobre a licenca falsa, a caixa e a corda cortada. Deixe escapar que nao conhece os comerciantes locais.",
      fight ? 2 : Math.min(turn - 1, 1),
    );
    if (fight) {
      state.stage = "THUG_FIGHT";
      state.activeNpc = null;
      state.combatStarted = true;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "desmascarar_infiltrado");
      await setState(inst.id, state);
      await startFestivalCombat(channel, channelId, guildId, actor, inst.id, def, "THUG");
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === LEADER_KEY && state.stage === "LEADER_TALK") {
    const fight = turn >= turns(def, "leaderTurns", 3);
    await speak(
      channel,
      LEADER_KEY,
      playerMessage,
      fight
        ? "Ultima fala: admita que comandou a sabotagem, diga que derrubara o festival e inicie o combate."
        : "Fale como um ninja mercenario confiante. Confirme aos poucos que os dois bandidos trabalhavam para voce.",
      fight ? 2 : Math.min(turn - 1, 1),
    );
    if (fight) {
      state.stage = "LEADER_FIGHT";
      state.activeNpc = null;
      state.combatStarted = true;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "confrontar_mandante");
      await setState(inst.id, state);
      await startFestivalCombat(channel, channelId, guildId, actor, inst.id, def, "LEADER");
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === ORGANIZER_KEY && state.stage === "RETURN") {
    const done = turn >= turns(def, "thanksTurns", 2);
    await speak(
      channel,
      ORGANIZER_KEY,
      playerMessage,
      done
        ? "Ultima fala: confirme que o festival esta seguro, agradeca ao time e encerre a missao."
        : "Receba o relatorio sobre os dois bandidos e o ninja mandante, aliviada por nenhum civil ter sido ferido.",
      3 + Math.min(turn - 1, 1),
    );
    if (done) {
      state.stage = "DONE";
      state.activeNpc = null;
      await markObjective(inst.id, "proteger_festival");
      await setState(inst.id, state);
      const result = await completeMission(inst.charId, inst.missionId);
      if (result && channel && "send" in channel) {
        await channel.send(buildMissionCompleteEmbed(def.name, result));
      }
      return;
    }
    await setState(inst.id, state);
  }
}

function patrolEmbed(state: FestivalSecurityState, def: FestivalSecurityContext["def"], result?: string): EmbedBuilder {
  const step = PATROL_STEPS[state.patrolStep ?? 0];
  return new EmbedBuilder()
    .setColor(0xf39c12)
    .setTitle("Patrulha de Seguranca do Festival")
    .setDescription(
      [
        `Pontos verificados: **${state.patrolStep ?? 0}/${PATROL_STEPS.length}**`,
        `Erros: **${state.mistakes ?? 0}/${maxMistakes(def)}**`,
        "",
        result ?? "",
        step ? `**${step.title}:** ${step.clue}` : "Todos os pontos foram verificados.",
        "",
        step ? "Escolha uma resposta que preserve as provas e proteja os visitantes." : "",
      ].filter(Boolean).join("\n"),
    );
}

function patrolMenu(instanceId: string, state: FestivalSecurityState): ActionRowBuilder<StringSelectMenuBuilder> {
  const step = PATROL_STEPS[state.patrolStep ?? 0]!;
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`festival-security:patrol:${instanceId}:${(state.patrolStep ?? 0) + 1}`)
      .setPlaceholder(step.title)
      .addOptions(step.options.map((option) => ({
        label: option.label,
        description: option.description.slice(0, 100),
        value: option.value,
      }))),
  );
}

async function startPatrol(
  channel: TextBasedChannel | null,
  instanceId: string,
  actorDiscordId: string,
): Promise<void> {
  if (!channel || !("send" in channel)) return;
  const inst = await getInstance(instanceId);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "FESTIVAL_SECURITY") return;
  let state = ensureState(inst.stateJson);
  const msg = await channel.send({
    embeds: [patrolEmbed(state, def)],
    components: [patrolMenu(instanceId, state)],
  });

  while ((state.patrolStep ?? 0) < PATROL_STEPS.length) {
    const index = state.patrolStep ?? 0;
    const step = PATROL_STEPS[index]!;
    try {
      const pick = (await msg.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        time: stepTimeout(def),
        filter: (i: StringSelectMenuInteraction) =>
          i.user.id === actorDiscordId &&
          i.customId === `festival-security:patrol:${instanceId}:${index + 1}`,
      })) as StringSelectMenuInteraction;

      let result: string;
      if (pick.values[0] === step.correct) {
        state.patrolStep = index + 1;
        result = `**Correto:** ${step.success}`;
      } else {
        state.mistakes = (state.mistakes ?? 0) + 1;
        result = "**Alerta:** a escolha causaria panico, perderia provas ou colocaria visitantes em risco.";
      }

      if ((state.mistakes ?? 0) >= maxMistakes(def)) {
        await failFestivalSecurity(instanceId, msg, "Erros demais na patrulha permitiram que os infiltrados causassem panico no festival.");
        return;
      }

      await setState(instanceId, state);
      const done = (state.patrolStep ?? 0) >= PATROL_STEPS.length;
      await pick.update({
        embeds: [patrolEmbed(state, def, result)],
        components: done ? [] : [patrolMenu(instanceId, state)],
      });
      if (done) break;
    } catch {
      state.running = false;
      await setState(instanceId, state);
      await msg.edit({ components: [] }).catch(() => undefined);
      await sendMissionNotice(channel, pausedMissionNotice("A sessão de patrulha do festival expirou."));
      return;
    }
  }

  state.stage = "SCOUT_TALK";
  state.running = false;
  await markObjective(instanceId, "patrulhar_festival");
  await setState(instanceId, state);
  await msg.edit({
    embeds: [
      new EmbedBuilder()
        .setColor(0xe67e22)
        .setTitle("Infiltrado localizado")
        .setDescription("As tres pistas levam a um falso vendedor numa barraca fechada. Use `/mapa` e depois `/interagir npc`."),
    ],
    components: [],
  });
}

function trailEmbed(state: FestivalSecurityState, def: FestivalSecurityContext["def"]): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x8e44ad)
    .setTitle("Onde esta o mandante?")
    .setDescription(
      [
        "Os dois bandidos carregavam um bilhete rasgado:",
        "",
        "- O mandante observa a saida leste.",
        "- Ele evita barracas com fogo aberto.",
        "- O ponto de encontro fica sob lanternas azuis.",
        "",
        "Compare as pistas com as areas do festival.",
        `Erros: **${state.mistakes ?? 0}/${maxMistakes(def)}**`,
      ].join("\n"),
    );
}

function trailMenu(instanceId: string): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`festival-security:trail:${instanceId}`)
      .setPlaceholder("Localizar o mandante")
      .addOptions([
        {
          label: "Torre de lanternas azuis",
          description: "Fica no lado leste e oferece visao da saida.",
          value: "blue_lanterns",
        },
        {
          label: "Barraca de yakisoba",
          description: "Fica no centro e usa fogo aberto.",
          value: "food_stall",
        },
        {
          label: "Deposito de premios",
          description: "Fica no lado oeste, sem visao da saida leste.",
          value: "prize_storage",
        },
      ]),
  );
}

async function startLeaderTrail(
  channel: TextBasedChannel | null,
  instanceId: string,
  actorDiscordId: string,
): Promise<void> {
  if (!channel || !("send" in channel)) return;
  const inst = await getInstance(instanceId);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "FESTIVAL_SECURITY") return;
  let state = ensureState(inst.stateJson);
  const msg = await channel.send({
    embeds: [trailEmbed(state, def)],
    components: [trailMenu(instanceId)],
  });

  while (state.stage === "LEADER_TRAIL") {
    try {
      const pick = (await msg.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        time: stepTimeout(def),
        filter: (i: StringSelectMenuInteraction) =>
          i.user.id === actorDiscordId && i.customId === `festival-security:trail:${instanceId}`,
      })) as StringSelectMenuInteraction;

      if (pick.values[0] !== "blue_lanterns") {
        state.mistakes = (state.mistakes ?? 0) + 1;
        if ((state.mistakes ?? 0) >= maxMistakes(def)) {
          await failFestivalSecurity(instanceId, msg, "A busca demorou demais e o ninja mandante iniciou a sabotagem no meio da multidao.");
          return;
        }
        await setState(instanceId, state);
        await pick.update({ embeds: [trailEmbed(state, def)], components: [trailMenu(instanceId)] });
        continue;
      }

      state.stage = "LEADER_TALK";
      state.running = false;
      state.trailSolved = true;
      await markObjective(instanceId, "localizar_mandante");
      await setState(instanceId, state);
      await pick.update({
        embeds: [
          new EmbedBuilder()
            .setColor(0x2ecc71)
            .setTitle("Mandante encontrado")
            .setDescription("As pistas apontam para a torre de lanternas azuis, perto da saida leste. Use `/mapa` para confronta-lo."),
        ],
        components: [],
      });
      return;
    } catch {
      state.running = false;
      await setState(instanceId, state);
      await msg.edit({ components: [] }).catch(() => undefined);
      await sendMissionNotice(channel, pausedMissionNotice("A sessão de busca pelas pistas expirou."));
      return;
    }
  }
}

function starterFrom(char: Awaited<ReturnType<typeof getOrCreateCharacter>>): StarterChar {
  return {
    charId: char.id,
    name: char.name,
    level: char.level,
    hpCurrent: char.hpCurrent,
    hpMax: char.hpMax,
    chakra: char.resources?.chakra ?? 100,
    energia: char.resources?.energia ?? 100,
    jutsuIds: char.jutsus.map((j: { jutsuId: string }) => j.jutsuId),
    attrs: attrsFromRow(char.attributes ?? {}),
  };
}

async function startFestivalCombat(
  channel: TextBasedChannel | null,
  channelId: string,
  guildId: string,
  actor: { id: string; username: string },
  instanceId: string,
  def: FestivalSecurityContext["def"],
  wave: "THUG" | "LEADER",
): Promise<void> {
  if (await getActiveSession(channelId)) return;
  const char = await getOrCreateCharacter(actor.id, guildId, actor.username);
  const { players, attrsById } = await gatherPartyPlayers(channel, guildId, starterFrom(char));
  const npcs = wave === "THUG"
    ? [{ templateId: weakTemplate(def) }, { templateId: weakTemplate(def) }]
    : [{ templateId: leaderTemplate(def) }];
  const session = await startCombat({
    channelId,
    guildId,
    scenarioId: "centro_comercial",
    players,
    npcs,
    missionInstanceId: instanceId,
  });
  await cacheAttrs(session, attrsById);
  if (channel && "send" in channel) {
    await channel.send(
      wave === "THUG"
        ? `Dois bandidos largam os disfarces e atacam! ${players.length} ninja(s) na luta. Use \`/mapa\`.`
        : `O ninja infiltrado inicia o confronto final! ${players.length} ninja(s) na luta. Use \`/mapa\`.`,
    );
  }
}

async function retryCombatIfNeeded(
  interaction: ChatInputCommandInteraction,
  ctx: FestivalSecurityContext,
  state: FestivalSecurityState,
  wave: "THUG" | "LEADER",
): Promise<void> {
  if (await getActiveSession(interaction.channelId)) return;
  state.combatStarted = true;
  await setState(ctx.inst.id, state);
  await startFestivalCombat(
    interaction.channel,
    interaction.channelId,
    interaction.guildId ?? "global",
    interaction.user,
    ctx.inst.id,
    ctx.def,
    wave,
  );
}

async function failFestivalSecurity(instanceId: string, msg: Message, reason: string): Promise<void> {
  await prisma.missionInstance.update({ where: { id: instanceId }, data: { status: "FAILED" } });
  await msg.edit({
    embeds: [new EmbedBuilder().setColor(0xc0392b).setTitle("Seguranca comprometida").setDescription(reason)],
    components: [],
  }).catch(() => undefined);
}

export async function onFestivalSecurityCombatWon(
  interaction: ChatInputCommandInteraction,
  instanceId: string,
): Promise<void> {
  const inst = await getInstance(instanceId);
  if (!inst || inst.status !== "ACTIVE") return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "FESTIVAL_SECURITY") return;
  const state = ensureState(inst.stateJson);

  if (state.stage === "THUG_FIGHT") {
    state.stage = "LEADER_TRAIL";
    state.combatStarted = false;
    state.running = false;
    await markObjective(inst.id, "derrotar_bandidos");
    await setState(inst.id, state);
    await interaction.followUp(
      "Os dois bandidos foram derrotados. Um bilhete rasgado revela pistas sobre o mandante. Use `/mapa` para investigar.",
    );
    return;
  }

  if (state.stage === "LEADER_FIGHT") {
    state.stage = "RETURN";
    state.combatStarted = false;
    state.activeNpc = null;
    await markObjective(inst.id, "derrotar_mandante");
    await setState(inst.id, state);
    await interaction.followUp(
      "O ninja mandante foi derrotado e o festival esta seguro. Fale com **Sayuri Matsu** usando `/interagir npc`.",
    );
  }
}
