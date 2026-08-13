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
import { DESERTO_CHANNEL_ID, ROTA_COMERCIAL_KONOHA_CHANNEL_ID } from "../../data/scenarios/index.js";
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
  getActiveMissions,
  getInstance,
  markObjective,
  readState,
  setState,
} from "./mission-service.js";

interface RegionalNpc {
  key: string;
  name: string;
  persona: string;
  imageFile: string;
  cell: string;
}

interface TroupeNpc extends RegionalNpc {
  objectiveId: string;
  fixedClue: string;
}

interface ItinerantFestivalVariant {
  id: string;
  villageName: string;
  routeName: string;
  destinationName: string;
  routeChannelId: string;
  destinationChannelId: string;
  destinationScenarioId: string;
  leader: RegionalNpc;
  artists: TroupeNpc[];
  raider: RegionalNpc;
}

const KONOHA_VARIANT: ItinerantFestivalVariant = {
  id: "KONOHA",
  villageName: "Konoha",
  routeName: "Rota Comercial de Konoha",
  destinationName: "Deserto de Sunagakure",
  routeChannelId: ROTA_COMERCIAL_KONOHA_CHANNEL_ID,
  destinationChannelId: DESERTO_CHANNEL_ID,
  destinationScenarioId: "deserto",
  leader: {
    key: "itinerant_festival_leader_konoha",
    name: "Mirai Kazahana (lider da trupe)",
    persona: "itinerant_festival_leader_konoha",
    imageFile: "npcs/itinerant-troupe-leader.png",
    cell: "C4",
  },
  artists: [
    {
      key: "itinerant_festival_drummer_konoha",
      name: "Taro (tamborista)",
      persona: "itinerant_festival_drummer_konoha",
      imageFile: "npcs/itinerant-drummer.png",
      cell: "B3",
      objectiveId: "ouvir_taro_tamborista",
      fixedClue: "Taro viu o carregador novo perto do eixo da carroca antes do pino soltar.",
    },
    {
      key: "itinerant_festival_puppeteer_konoha",
      name: "Nami (bonequeira)",
      persona: "itinerant_festival_puppeteer_konoha",
      imageFile: "npcs/itinerant-puppeteer.png",
      cell: "D5",
      objectiveId: "ouvir_nami_bonequeira",
      fixedClue: "Nami encontrou oleo de lanterna espalhado perto dos panos de palco, mas nenhum artista usa aquele frasco.",
    },
    {
      key: "itinerant_festival_vendor_konoha",
      name: "Beni (vendedora)",
      persona: "itinerant_festival_vendor_konoha",
      imageFile: "npcs/itinerant-vendor.png",
      cell: "E4",
      objectiveId: "ouvir_beni_vendedora",
      fixedClue: "Beni ouviu o carregador novo assobiar duas vezes para fora da estrada antes da sabotagem.",
    },
  ],
  raider: {
    key: "itinerant_festival_raider_konoha",
    name: "Chefe dos Assaltantes",
    persona: "itinerant_festival_raider_konoha",
    imageFile: "enemies/festival-raider-leader.png",
    cell: "D6",
  },
};

const VARIANTS: Record<string, ItinerantFestivalVariant> = {
  KONOHA: KONOHA_VARIANT,
};

const SUSPECTS = [
  {
    id: "drummer",
    label: "Taro, o tamborista",
    description: "Estava ensaiando quando o eixo soltou.",
  },
  {
    id: "puppeteer",
    label: "Nami, a bonequeira",
    description: "Encontrou oleo perto dos panos de palco.",
  },
  {
    id: "vendor",
    label: "Beni, a vendedora",
    description: "Cuidava das barracas de lembrancas.",
  },
  {
    id: "porter",
    label: "Kaito, o carregador novo",
    description: "Apareceu perto do eixo, do oleo e assobiou para fora da estrada.",
  },
];

export interface ItinerantFestivalState {
  stage?: "BRIEFING" | "ARTISTS" | "ACCUSE" | "TO_DESTINATION" | "RAIDER_TALK" | "FIGHT" | "RETURN" | "DONE";
  activeNpc?: string | null;
  talks?: Record<string, number>;
  heard?: string[];
  running?: boolean;
  raiderSeen?: boolean;
  combatStarted?: boolean;
}

export interface ItinerantFestivalChoice {
  key: string;
  name: string;
}

export interface ItinerantFestivalContext {
  inst: NonNullable<Awaited<ReturnType<typeof getInstance>>>;
  def: NonNullable<ReturnType<typeof getMission>>;
  ownerCharId: string;
  variant: ItinerantFestivalVariant;
}

function variantFor(def: NonNullable<ReturnType<typeof getMission>>): ItinerantFestivalVariant {
  return VARIANTS[String(def.data?.variantId ?? "KONOHA")] ?? KONOHA_VARIANT;
}

function ensureState(raw: string): ItinerantFestivalState {
  const state = readState<ItinerantFestivalState>(raw);
  state.stage = state.stage ?? "BRIEFING";
  state.activeNpc = state.activeNpc ?? null;
  state.talks = state.talks ?? {};
  state.heard = state.heard ?? [];
  state.running = state.running ?? false;
  state.raiderSeen = state.raiderSeen ?? false;
  state.combatStarted = state.combatStarted ?? false;
  return state;
}

function turns(
  def: ItinerantFestivalContext["def"],
  key: "briefingTurns" | "artistTurns" | "raiderTurns" | "returnTurns",
  fallback: number,
): number {
  return Number(def.data?.[key] ?? fallback);
}

function stepTimeout(def: ItinerantFestivalContext["def"]): number {
  return Number(def.data?.stepTimeoutMs ?? 60_000);
}

function raiderTemplate(def: ItinerantFestivalContext["def"]): string {
  return String(def.data?.raiderTemplate ?? "festival_route_raider");
}

function leaderTemplate(def: ItinerantFestivalContext["def"]): string {
  return String(def.data?.leaderTemplate ?? "festival_route_raider_leader");
}

async function findContextByCharId(charId: string, channelId?: string): Promise<ItinerantFestivalContext | null> {
  for (const inst of await getActiveMissions(charId)) {
    const def = getMission(inst.missionId);
    if (!def || def.type !== "ITINERANT_FESTIVAL_GUARD") continue;
    const variant = variantFor(def);
    if (channelId && ![variant.routeChannelId, variant.destinationChannelId].includes(channelId)) continue;
    return { inst, def, ownerCharId: charId, variant };
  }
  return null;
}

export async function resolveItinerantFestival(
  discordId: string,
  guildId: string,
  channelId?: string,
): Promise<ItinerantFestivalContext | null> {
  const own = await prisma.userCharacter.findUnique({
    where: { discordId_guildId: { discordId, guildId } },
    select: { id: true },
  });
  if (own) {
    const ctx = await findContextByCharId(own.id, channelId);
    if (ctx) return ctx;
  }
  for (const did of await partyMemberIds(guildId, discordId)) {
    if (did === discordId) continue;
    const uc = await prisma.userCharacter.findUnique({
      where: { discordId_guildId: { discordId: did, guildId } },
      select: { id: true },
    });
    if (!uc) continue;
    const ctx = await findContextByCharId(uc.id, channelId);
    if (ctx) return ctx;
  }
  return null;
}

export function availableItinerantFestivalNpcs(
  state: ItinerantFestivalState,
  channelId: string,
  variant: ItinerantFestivalVariant,
): ItinerantFestivalChoice[] {
  if (channelId === variant.routeChannelId) {
    if (state.stage === "BRIEFING" || state.stage === "RETURN") {
      return [{ key: variant.leader.key, name: state.stage === "RETURN" ? `${variant.leader.name} (relatorio)` : variant.leader.name }];
    }
    if (state.stage === "ARTISTS") {
      if (state.activeNpc) {
        const active = variant.artists.find((artist) => artist.key === state.activeNpc);
        return active ? [{ key: active.key, name: active.name }] : [];
      }
      return variant.artists
        .filter((artist) => !(state.heard ?? []).includes(artist.key))
        .map((artist) => ({ key: artist.key, name: artist.name }));
    }
  }
  if (channelId === variant.destinationChannelId && state.stage === "RAIDER_TALK") {
    return [{ key: variant.raider.key, name: variant.raider.name }];
  }
  return [];
}

export async function itinerantFestivalMapHandle(
  interaction: ChatInputCommandInteraction,
  ctx: ItinerantFestivalContext,
  entities: RenderEntity[],
): Promise<string | null> {
  const state = ensureState(ctx.inst.stateJson);
  const { variant } = ctx;

  if (interaction.channelId === variant.routeChannelId) {
    entities.push(...routeEntities(state, variant));
    if (state.stage === "BRIEFING") {
      return `\nMissao ativa: **${ctx.def.name}** - fale com ${variant.leader.name} usando \`/interagir npc\`.`;
    }
    if (state.stage === "ARTISTS") {
      return `\nMissao ativa: **${ctx.def.name}** - ouca os tres artistas com \`/interagir npc\`. Depoimentos: **${state.heard?.length ?? 0}/3**.`;
    }
    if (state.stage === "ACCUSE") {
      if (!state.running) {
        state.running = true;
        await setState(ctx.inst.id, state);
        void startAccusation(interaction.channel, ctx.inst.id, interaction.user.id).catch(() => undefined);
      }
      return `\nMissao ativa: **${ctx.def.name}** - identifique o sabotador no painel enviado no canal.`;
    }
    if (state.stage === "RETURN") {
      return `\nMissao ativa: **${ctx.def.name}** - entregue o relatorio a ${variant.leader.name} usando \`/interagir npc\`.`;
    }
    return nextPlaceNote(ctx, state);
  }

  if (interaction.channelId !== variant.destinationChannelId) return null;
  if (state.stage === "TO_DESTINATION") {
    state.stage = "RAIDER_TALK";
    await markObjective(ctx.inst.id, "chegar_destino_trupe");
    await setState(ctx.inst.id, state);
  }
  if (state.stage === "RAIDER_TALK") {
    entities.push(npcEntity(variant.raider));
    if (!state.raiderSeen) {
      state.raiderSeen = true;
      await setState(ctx.inst.id, state);
      await speak(
        interaction.channel,
        variant.raider,
        "(o time encontra os assaltantes com baus da trupe no caminho do deserto)",
        "Mostre irritacao porque o sabotador foi descoberto e tente intimidar o time antes do combate.",
        0,
      );
    }
    return `\nMissao ativa: **${ctx.def.name}** - confronte o chefe dos assaltantes usando \`/interagir npc\`.`;
  }
  if (state.stage === "FIGHT") {
    entities.push(npcEntity(variant.raider));
    if (!(await getActiveSession(interaction.channelId))) await startItinerantCombat(interaction, ctx);
    return `\nMissao ativa: **${ctx.def.name}** - derrote os assaltantes e recupere os baus da trupe.`;
  }
  return nextPlaceNote(ctx, state);
}

function nextPlaceNote(ctx: ItinerantFestivalContext, state: ItinerantFestivalState): string | null {
  const v = ctx.variant;
  if (state.stage === "TO_DESTINATION" || state.stage === "RAIDER_TALK" || state.stage === "FIGHT") {
    return `\nMissao ativa: **${ctx.def.name}** - escolte a trupe ate ${v.destinationName}: <#${v.destinationChannelId}>.`;
  }
  if (state.stage === "RETURN") return `\nMissao ativa: **${ctx.def.name}** - volte para ${v.routeName}: <#${v.routeChannelId}>.`;
  return null;
}

function routeEntities(state: ItinerantFestivalState, variant: ItinerantFestivalVariant): RenderEntity[] {
  const entities: RenderEntity[] = [
    npcEntity(variant.leader),
    { cell: "C5", label: "\u{1F3AA}", color: "#e67e22", kind: "MARKER", name: "Carroca-palco" },
    { cell: "D4", label: "\u{1F6DE}", color: "#95a5a6", kind: "MARKER", name: "Eixo sabotado" },
    { cell: "E5", label: "\u{1FA94}", color: "#f1c40f", kind: "MARKER", name: "Baus da trupe" },
  ];
  if (["ARTISTS", "ACCUSE"].includes(state.stage ?? "")) entities.push(...variant.artists.map(npcEntity));
  return entities;
}

function npcEntity(npc: RegionalNpc): RenderEntity {
  return {
    cell: npc.cell,
    name: npc.name,
    label: npc.name.slice(0, 3),
    color: "#d35400",
    kind: "NPC",
    imageFile: npc.imageFile,
  };
}

async function speak(
  channel: TextBasedChannel | null,
  npc: RegionalNpc,
  message: string,
  extra: string,
  fallbackIndex: number,
): Promise<void> {
  const text = await NpcAiService.say(npc.persona, message, extra, fallbackIndex);
  const persona = getPersona(npc.persona);
  const sent = await sendAsPersona(channel, {
    key: npc.persona,
    name: persona?.displayName ?? npc.name,
    avatarFile: persona?.avatarFile,
    lines: formatPersonaLines(text),
  });
  if (!sent && channel && "send" in channel) await channel.send(text.slice(0, 1900));
}

export async function interactItinerantFestival(
  interaction: ChatInputCommandInteraction,
  npcKey: string,
): Promise<void> {
  const guildId = interaction.guildId ?? "global";
  const ctx = await resolveItinerantFestival(interaction.user.id, guildId, interaction.channelId);
  if (!ctx) {
    await interaction.reply({ content: "Voce (ou sua party) nao tem essa missao ativa.", ephemeral: true });
    return;
  }
  const state = ensureState(ctx.inst.stateJson);
  const choice = availableItinerantFestivalNpcs(state, interaction.channelId, ctx.variant).find((npc) => npc.key === npcKey);
  if (!choice) {
    await interaction.reply({ content: "Esse NPC nao esta disponivel nesta etapa.", ephemeral: true });
    return;
  }
  if (state.activeNpc && state.activeNpc !== npcKey) {
    await interaction.reply({ content: "Termine a conversa atual antes de falar com outro NPC.", ephemeral: true });
    return;
  }
  await interaction.deferReply({ ephemeral: true });
  state.activeNpc = npcKey;
  await setState(ctx.inst.id, state);
  await runDialogue(interaction.channel, interaction.channelId, guildId, ctx, npcKey, "(o time inicia a conversa)", interaction.user);
  await interaction.editReply(`Voce se aproxima de **${choice.name}**. Continue por mensagens normais no canal.`);
}

export async function continueItinerantFestivalMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.guildId) return false;
  const ctx = await resolveItinerantFestival(message.author.id, message.guildId, message.channelId);
  if (!ctx) return false;
  const state = ensureState(ctx.inst.stateJson);
  if (!state.activeNpc) return false;
  if (!availableItinerantFestivalNpcs(state, message.channelId, ctx.variant).some((npc) => npc.key === state.activeNpc)) return false;
  await runDialogue(message.channel, message.channelId, message.guildId, ctx, state.activeNpc, message.content || "...", message.author);
  return true;
}

async function runDialogue(
  channel: TextBasedChannel | null,
  channelId: string,
  guildId: string,
  ctx: ItinerantFestivalContext,
  npcKey: string,
  playerMessage: string,
  actor: { id: string; username: string },
): Promise<void> {
  const inst = await getInstance(ctx.inst.id);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "ITINERANT_FESTIVAL_GUARD") return;
  const state = ensureState(inst.stateJson);
  const turn = (state.talks?.[npcKey] ?? 0) + 1;
  state.talks![npcKey] = turn;

  if (npcKey === ctx.variant.leader.key && state.stage === "BRIEFING") {
    const done = turn >= turns(def, "briefingTurns", 3);
    await speak(
      channel,
      ctx.variant.leader,
      playerMessage,
      done
        ? "Ultima fala: explique que a carroca foi sabotada e mande o time ouvir Taro, Nami e Beni antes de acusar alguem."
        : "Apresente a trupe itinerante, diga que ela viaja entre vilas e que alguem sabotou a carroca antes da partida.",
      done ? 2 : Math.min(turn - 1, 1),
    );
    if (done) {
      state.stage = "ARTISTS";
      state.activeNpc = null;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "receber_pedido_trupe");
      await setState(inst.id, state);
      await sendMissionNotice(channel, {
        kind: "investigacao",
        title: "Sabotagem na trupe",
        description: "Três artistas presenciaram partes diferentes do incidente.",
        items: ["Use `/mapa` para localizar os artistas.", "Ouça cada depoimento com `/interagir npc`."],
        itemsTitle: "Como investigar",
      });
      return;
    }
    await setState(inst.id, state);
    return;
  }

  const artist = ctx.variant.artists.find((entry) => entry.key === npcKey);
  if (artist && state.stage === "ARTISTS") {
    const done = turn >= turns(def, "artistTurns", 2);
    await speak(
      channel,
      artist,
      playerMessage,
      done
        ? `Ultima fala: revele claramente este fato fixo: ${artist.fixedClue}`
        : "Fale como artista preocupado com a viagem e com medo de acusar alguem da trupe sem prova.",
      done ? 1 : 0,
    );
    if (done) {
      state.heard = [...new Set([...(state.heard ?? []), npcKey])];
      state.activeNpc = null;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, artist.objectiveId);
      if (state.heard.length >= ctx.variant.artists.length) {
        state.stage = "ACCUSE";
        await sendMissionNotice(channel, {
          kind: "descoberta",
          title: "Depoimentos reunidos",
          description: "As três versões já podem ser comparadas para separar contradições de fatos.",
          items: ["Use `/mapa` para revisar as provas e identificar o sabotador."],
          itemsTitle: "Próximo passo",
        });
      }
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === ctx.variant.raider.key && state.stage === "RAIDER_TALK") {
    const fight = turn >= turns(def, "raiderTurns", 3);
    await speak(
      channel,
      ctx.variant.raider,
      playerMessage,
      fight
        ? "Ultima fala: admita que o carregador novo era informante, diga que ficara com os baus e inicie combate."
        : "Tente intimidar o time e justificar a emboscada contra a trupe itinerante.",
      fight ? 2 : Math.min(turn - 1, 1),
    );
    if (fight) {
      state.stage = "FIGHT";
      state.activeNpc = null;
      state.combatStarted = true;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "confrontar_assaltantes");
      await setState(inst.id, state);
      await startItinerantCombatFromActor(channel, channelId, guildId, actor, inst.id, def, ctx.variant);
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === ctx.variant.leader.key && state.stage === "RETURN") {
    const done = turn >= turns(def, "returnTurns", 2);
    await speak(
      channel,
      ctx.variant.leader,
      playerMessage,
      done
        ? "Ultima fala: confirme que a trupe pode seguir viagem, agradeca ao time e encerre a missao."
        : "Receba o relatorio sobre a sabotagem, o carregador infiltrado e os baus recuperados.",
      3 + Math.min(turn - 1, 1),
    );
    if (done) {
      state.stage = "DONE";
      state.activeNpc = null;
      await markObjective(inst.id, "entregar_relatorio_trupe");
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

function accusationEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle("Quem sabotou a trupe?")
    .setDescription(
      [
        "Acusar um artista inocente vai criar tumulto e encerrar a protecao.",
        "",
        "- O eixo foi mexido antes da partida.",
        "- O oleo usado nao pertencia aos artistas.",
        "- Alguem assobiou para fora da estrada antes da sabotagem.",
      ].join("\n"),
    );
}

function accusationMenu(instanceId: string): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`itinerant-festival:accuse:${instanceId}`)
      .setPlaceholder("Escolher o sabotador")
      .addOptions(SUSPECTS.map((suspect) => ({
        label: suspect.label,
        description: suspect.description,
        value: suspect.id,
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
  if (!def || def.type !== "ITINERANT_FESTIVAL_GUARD") return;
  const variant = variantFor(def);
  const msg = await channel.send({ embeds: [accusationEmbed()], components: [accusationMenu(instanceId)] });

  try {
    const pick = (await msg.awaitMessageComponent({
      componentType: ComponentType.StringSelect,
      time: stepTimeout(def),
      filter: (i: StringSelectMenuInteraction) =>
        i.user.id === actorDiscordId && i.customId === `itinerant-festival:accuse:${instanceId}`,
    })) as StringSelectMenuInteraction;

    if (pick.values[0] !== "porter") {
      await prisma.missionInstance.update({ where: { id: instanceId }, data: { status: "FAILED" } });
      await pick.update({
        embeds: [
          new EmbedBuilder()
            .setColor(0xc0392b)
            .setTitle("Acusacao errada")
            .setDescription("A acusacao contra um artista inocente causou tumulto e o verdadeiro sabotador fugiu com os assaltantes."),
        ],
        components: [],
      });
      return;
    }

    const state = ensureState((await getInstance(instanceId))?.stateJson ?? inst.stateJson);
    state.stage = "TO_DESTINATION";
    state.running = false;
    await markObjective(instanceId, "identificar_sabotador");
    await setState(instanceId, state);
    await pick.update({
      embeds: [
        new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle("Sabotador identificado")
          .setDescription(
            `Kaito, o carregador novo, abandona o disfarce e foge pela estrada. A trupe precisa seguir ate ${variant.destinationName}: <#${variant.destinationChannelId}>.`,
          ),
      ],
      components: [],
    });
  } catch {
    const state = ensureState((await getInstance(instanceId))?.stateJson ?? inst.stateJson);
    state.running = false;
    await setState(instanceId, state);
    await msg.edit({ components: [] }).catch(() => undefined);
    await sendMissionNotice(channel, pausedMissionNotice("O tempo para registrar a acusação terminou.", "Use /mapa para revisar as pistas da trupe."));
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

async function startItinerantCombatFromActor(
  channel: TextBasedChannel | null,
  channelId: string,
  guildId: string,
  actor: { id: string; username: string },
  instanceId: string,
  def: ItinerantFestivalContext["def"],
  variant: ItinerantFestivalVariant,
): Promise<void> {
  if (await getActiveSession(channelId)) return;
  const char = await getOrCreateCharacter(actor.id, guildId, actor.username);
  const { players, attrsById } = await gatherPartyPlayers(channel, guildId, starterFrom(char));
  const session = await startCombat({
    channelId,
    guildId,
    scenarioId: variant.destinationScenarioId,
    players,
    npcs: [
      { templateId: leaderTemplate(def) },
      { templateId: raiderTemplate(def) },
      { templateId: raiderTemplate(def) },
    ],
    missionInstanceId: instanceId,
  });
  await cacheAttrs(session, attrsById);
  if (channel && "send" in channel) {
    await channel.send(
      `Os assaltantes cercam os baus da trupe! ${players.length} ninja(s) entram no combate. Use \`/mapa\`.`,
    );
  }
}

async function startItinerantCombat(
  interaction: ChatInputCommandInteraction,
  ctx: ItinerantFestivalContext,
): Promise<void> {
  await startItinerantCombatFromActor(
    interaction.channel,
    interaction.channelId,
    interaction.guildId ?? "global",
    interaction.user,
    ctx.inst.id,
    ctx.def,
    ctx.variant,
  );
}

export async function onItinerantFestivalCombatWon(
  interaction: ChatInputCommandInteraction,
  instanceId: string,
): Promise<void> {
  const inst = await getInstance(instanceId);
  if (!inst || inst.status !== "ACTIVE") return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "ITINERANT_FESTIVAL_GUARD") return;
  const state = ensureState(inst.stateJson);
  const variant = variantFor(def);
  state.stage = "RETURN";
  state.combatStarted = false;
  state.activeNpc = null;
  await markObjective(inst.id, "derrotar_assaltantes");
  await setState(inst.id, state);
  await interaction.followUp(
    `Os baus foram recuperados e a rota ficou segura. Volte para ${variant.routeName}: <#${variant.routeChannelId}>.`,
  );
}

export function itinerantFestivalVariantIds(): string[] {
  return Object.keys(VARIANTS);
}
