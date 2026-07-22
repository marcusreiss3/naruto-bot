import type { ChatInputCommandInteraction, Message, TextBasedChannel } from "discord.js";
import { prisma } from "../../db/client.js";
import {
  BECO_KONOHA_CHANNEL_ID,
  CENTRO_COMERCIAL_CHANNEL_ID,
  HOSPITAL_KONOHA_CHANNEL_ID,
  MANSAO_HOKAGE_CHANNEL_ID,
  ROTA_COMERCIAL_KONOHA_CHANNEL_ID,
} from "../../data/scenarios/index.js";
import { getMission } from "../../data/missions/index.js";
import { getOrCreateCharacter, attrsFromRow } from "../characters/character-service.js";
import { getActiveSession, startCombat } from "../combat/combat-engine.js";
import { formatPersonaLines, sendAsPersona } from "../discord/persona-webhook.js";
import type { RenderEntity } from "../maps/renderer.js";
import { NpcAiService } from "../npc-ai/npc-ai-service.js";
import { getPersona } from "../npc-ai/personas.js";
import { partyMemberIds } from "../party/party-service.js";
import { cacheAttrs, gatherPartyPlayers, type StarterChar } from "./combat-party.js";
import {
  buildMissionCompleteEmbed,
  completeMission,
  getActiveMissions,
  getInstance,
  markObjective,
  readState,
  setState,
} from "./mission-service.js";

type EliteMaskStage =
  | "BRIEFING"
  | "ALLEY_TALK"
  | "ALLEY_FIGHT"
  | "MARKET_TALK"
  | "MARKET_FIGHT"
  | "HOSPITAL_TALK"
  | "HOSPITAL_FIGHT"
  | "ROUTE_TALK"
  | "ROUTE_FIGHT"
  | "FINAL_TALK"
  | "FINAL_FIGHT"
  | "RETURN"
  | "DONE";

interface MissionNpc {
  key: string;
  name: string;
  persona: string;
  imageFile: string;
  cell: string;
}

export interface EliteMaskState {
  stage?: EliteMaskStage;
  activeNpc?: string | null;
  talks?: Record<string, number>;
  combatStarted?: boolean;
  seen?: Partial<Record<EliteMaskStage, boolean>>;
}

interface EliteMaskContext {
  inst: NonNullable<Awaited<ReturnType<typeof getInstance>>>;
  def: NonNullable<ReturnType<typeof getMission>>;
  ownerCharId: string;
}

const clerkNpc: MissionNpc = {
  key: "elite_mask_clerk",
  name: "Chika Nara",
  persona: "elite_mask_clerk",
  imageFile: "npcs/mission-clerk.png",
  cell: "C4",
};

const alleyNpc: MissionNpc = {
  key: "elite_mask_alley_witness",
  name: "Iori",
  persona: "elite_mask_alley_witness",
  imageFile: "npcs/alley-witness.png",
  cell: "D4",
};

const marketNpc: MissionNpc = {
  key: "elite_mask_market_vendor",
  name: "Minae",
  persona: "elite_mask_market_vendor",
  imageFile: "npcs/market_vendor_hina.png",
  cell: "E4",
};

const hospitalNpc: MissionNpc = {
  key: "elite_mask_hospital_nurse",
  name: "Enfermeira Natsumi",
  persona: "elite_mask_hospital_nurse",
  imageFile: "npcs/medical-shiori.png",
  cell: "C4",
};

const routeNpc: MissionNpc = {
  key: "elite_mask_route_scout",
  name: "Mensageiro Ferido",
  persona: "elite_mask_route_scout",
  imageFile: "npcs/merchant.png",
  cell: "D3",
};

const bossNpc: MissionNpc = {
  key: "elite_mask_boss",
  name: "Ninja de Elite Mascarado",
  persona: "elite_mask_boss",
  imageFile: "enemies/elite-mask-boss.png",
  cell: "D5",
};

const STAGE_CHANNELS: Partial<Record<EliteMaskStage, string>> = {
  BRIEFING: MANSAO_HOKAGE_CHANNEL_ID,
  ALLEY_TALK: BECO_KONOHA_CHANNEL_ID,
  ALLEY_FIGHT: BECO_KONOHA_CHANNEL_ID,
  MARKET_TALK: CENTRO_COMERCIAL_CHANNEL_ID,
  MARKET_FIGHT: CENTRO_COMERCIAL_CHANNEL_ID,
  HOSPITAL_TALK: HOSPITAL_KONOHA_CHANNEL_ID,
  HOSPITAL_FIGHT: HOSPITAL_KONOHA_CHANNEL_ID,
  ROUTE_TALK: ROTA_COMERCIAL_KONOHA_CHANNEL_ID,
  ROUTE_FIGHT: ROTA_COMERCIAL_KONOHA_CHANNEL_ID,
  FINAL_TALK: BECO_KONOHA_CHANNEL_ID,
  FINAL_FIGHT: BECO_KONOHA_CHANNEL_ID,
  RETURN: MANSAO_HOKAGE_CHANNEL_ID,
};

const MISSION_CHANNELS = new Set([
  MANSAO_HOKAGE_CHANNEL_ID,
  BECO_KONOHA_CHANNEL_ID,
  CENTRO_COMERCIAL_CHANNEL_ID,
  HOSPITAL_KONOHA_CHANNEL_ID,
  ROTA_COMERCIAL_KONOHA_CHANNEL_ID,
]);

function ensureState(raw: string): EliteMaskState {
  const state = readState<EliteMaskState>(raw);
  state.stage = state.stage ?? "BRIEFING";
  state.activeNpc = state.activeNpc ?? null;
  state.talks = state.talks ?? {};
  state.combatStarted = state.combatStarted ?? false;
  state.seen = state.seen ?? {};
  return state;
}

async function findContextByCharId(charId: string, channelId?: string): Promise<EliteMaskContext | null> {
  for (const inst of await getActiveMissions(charId)) {
    const def = getMission(inst.missionId);
    if (!def || def.type !== "ELITE_MASK") continue;
    if (channelId && !MISSION_CHANNELS.has(channelId)) continue;
    return { inst, def, ownerCharId: charId };
  }
  return null;
}

export async function resolveEliteMask(
  discordId: string,
  guildId: string,
  channelId?: string,
): Promise<EliteMaskContext | null> {
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

export function availableEliteMaskNpcs(state: EliteMaskState, channelId: string): { key: string; name: string }[] {
  const current = ensureState(JSON.stringify(state));
  if (channelId === MANSAO_HOKAGE_CHANNEL_ID) {
    if (current.stage === "BRIEFING") return [{ key: clerkNpc.key, name: `${clerkNpc.name} (dossiê)` }];
    if (current.stage === "RETURN") return [{ key: clerkNpc.key, name: `${clerkNpc.name} (relatório)` }];
  }
  if (channelId === BECO_KONOHA_CHANNEL_ID) {
    if (current.stage === "ALLEY_TALK") return [{ key: alleyNpc.key, name: alleyNpc.name }];
    if (current.stage === "FINAL_TALK") return [{ key: bossNpc.key, name: bossNpc.name }];
  }
  if (channelId === CENTRO_COMERCIAL_CHANNEL_ID && current.stage === "MARKET_TALK") {
    return [{ key: marketNpc.key, name: marketNpc.name }];
  }
  if (channelId === HOSPITAL_KONOHA_CHANNEL_ID && current.stage === "HOSPITAL_TALK") {
    return [{ key: hospitalNpc.key, name: hospitalNpc.name }];
  }
  if (channelId === ROTA_COMERCIAL_KONOHA_CHANNEL_ID && current.stage === "ROUTE_TALK") {
    return [{ key: routeNpc.key, name: routeNpc.name }];
  }
  return [];
}

export async function eliteMaskMapHandle(
  interaction: ChatInputCommandInteraction,
  ctx: EliteMaskContext,
  entities: RenderEntity[],
): Promise<string | null> {
  const state = ensureState(ctx.inst.stateJson);
  entities.push(...entitiesForStage(state, interaction.channelId));

  if (state.stage?.endsWith("_FIGHT")) {
    if (STAGE_CHANNELS[state.stage] === interaction.channelId) {
      await retryCombatIfNeeded(interaction, ctx, state);
      return fightNote(ctx.def.name, state.stage);
    }
    return nextNote(ctx.def.name, state);
  }

  if (availableEliteMaskNpcs(state, interaction.channelId).length > 0) {
    return `\nMissão ativa: **${ctx.def.name}** - fale com o NPC usando \`/interagir npc\`.`;
  }

  return nextNote(ctx.def.name, state);
}

function entitiesForStage(state: EliteMaskState, channelId: string): RenderEntity[] {
  if (channelId === MANSAO_HOKAGE_CHANNEL_ID && (state.stage === "BRIEFING" || state.stage === "RETURN")) {
    return [npcEntity(clerkNpc)];
  }
  if (channelId === BECO_KONOHA_CHANNEL_ID) {
    if (state.stage === "ALLEY_TALK") return [npcEntity(alleyNpc)];
    if (state.stage === "FINAL_TALK") {
      return [
        npcEntity(bossNpc),
        { cell: "C5", label: "CIN", color: "#7f8c8d", kind: "MARKER", name: "Cinzas frias" },
      ];
    }
  }
  if (channelId === CENTRO_COMERCIAL_CHANNEL_ID && state.stage === "MARKET_TALK") return [npcEntity(marketNpc)];
  if (channelId === HOSPITAL_KONOHA_CHANNEL_ID && state.stage === "HOSPITAL_TALK") return [npcEntity(hospitalNpc)];
  if (channelId === ROTA_COMERCIAL_KONOHA_CHANNEL_ID && state.stage === "ROUTE_TALK") {
    return [npcEntity(routeNpc), { cell: "E4", label: "DOC", color: "#f1c40f", kind: "MARKER", name: "Tubo lacrado" }];
  }
  return [];
}

function npcEntity(npc: MissionNpc): RenderEntity {
  return {
    cell: npc.cell,
    name: npc.name,
    label: npc.name.slice(0, 3),
    color: "#8e44ad",
    kind: "NPC",
    imageFile: npc.imageFile,
  };
}

function nextNote(missionName: string, state: EliteMaskState): string | null {
  const channelId = STAGE_CHANNELS[state.stage ?? "BRIEFING"];
  if (!channelId) return null;
  return `\nMissão ativa: **${missionName}** - próxima etapa em <#${channelId}>.`;
}

function fightNote(missionName: string, stage: EliteMaskStage): string {
  const text: Record<string, string> = {
    ALLEY_FIGHT: "proteja Iori e derrote o silenciador.",
    MARKET_FIGHT: "impeça a queima do livro de vendas.",
    HOSPITAL_FIGHT: "proteja a ficha médica e derrote o selador infiltrado.",
    ROUTE_FIGHT: "derrube o executor antes que ele destrua a lista.",
    FINAL_FIGHT: "derrote o Ninja de Elite mascarado e seus clones de cinzas.",
  };
  return `\nMissão ativa: **${missionName}** - ${text[stage] ?? "combate em andamento"}`;
}

async function speak(channel: TextBasedChannel | null, npc: MissionNpc, message: string, extra: string, fallbackIndex: number): Promise<void> {
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

export async function interactEliteMask(interaction: ChatInputCommandInteraction, npcKey: string): Promise<void> {
  const guildId = interaction.guildId ?? "global";
  const ctx = await resolveEliteMask(interaction.user.id, guildId, interaction.channelId);
  if (!ctx) {
    await interaction.reply({ content: "Você (ou sua party) não tem essa missão ativa.", ephemeral: true });
    return;
  }
  const state = ensureState(ctx.inst.stateJson);
  const choice = availableEliteMaskNpcs(state, interaction.channelId).find((npc) => npc.key === npcKey);
  if (!choice) {
    await interaction.reply({ content: "Esse NPC não está disponível nesta etapa.", ephemeral: true });
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
  await interaction.editReply(`Você se aproxima de **${choice.name}**. Continue por mensagens normais no canal.`);
}

export async function continueEliteMaskMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.guildId) return false;
  const ctx = await resolveEliteMask(message.author.id, message.guildId, message.channelId);
  if (!ctx) return false;
  const state = ensureState(ctx.inst.stateJson);
  if (!state.activeNpc) return false;
  if (!availableEliteMaskNpcs(state, message.channelId).some((npc) => npc.key === state.activeNpc)) return false;
  await runDialogue(message.channel, message.channelId, message.guildId, ctx, state.activeNpc, message.content || "...", message.author);
  return true;
}

async function runDialogue(
  channel: TextBasedChannel | null,
  channelId: string,
  guildId: string,
  ctx: EliteMaskContext,
  npcKey: string,
  playerMessage: string,
  actor: { id: string; username: string },
): Promise<void> {
  const inst = await getInstance(ctx.inst.id);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "ELITE_MASK") return;
  const state = ensureState(inst.stateJson);
  const turn = (state.talks?.[npcKey] ?? 0) + 1;
  state.talks![npcKey] = turn;

  if (npcKey === clerkNpc.key && state.stage === "BRIEFING") {
    const done = turn >= 3;
    await speak(
      channel,
      clerkNpc,
      playerMessage,
      done
        ? "Última fala: entregue a ordem rank B e mande o time ao Beco de Konoha ouvir Iori, a testemunha que viu o mascarado salvar uma criança."
        : "Explique o caso da máscara de cinzas, as execuções e a suspeita de que os arquivos oficiais foram apagados.",
      done ? 2 : Math.min(turn - 1, 1),
    );
    if (done) {
      state.stage = "ALLEY_TALK";
      state.activeNpc = null;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "receber_dossie_mascara");
      await setState(inst.id, state);
      await sendLine(channel, `Siga para o **Beco de Konoha**: <#${BECO_KONOHA_CHANNEL_ID}>.`);
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === alleyNpc.key && state.stage === "ALLEY_TALK") {
    const done = turn >= 3;
    await speak(
      channel,
      alleyNpc,
      playerMessage,
      done
        ? "Última fala: revele que o mascarado salvou uma criança enviada ao Hospital. Em seguida, perceba o silenciador chegando para matar a testemunha."
        : "Conte que viu o mascarado matar um cobrador, mas também salvar uma criança antes da execução.",
      done ? 1 : 0,
    );
    if (done) {
      state.stage = "ALLEY_FIGHT";
      state.activeNpc = null;
      state.combatStarted = true;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "ouvir_testemunha_beco");
      await setState(inst.id, state);
      await startEliteMaskCombat(channel, channelId, guildId, actor, inst.id, def, "ALLEY_FIGHT");
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === marketNpc.key && state.stage === "MARKET_TALK") {
    const done = turn >= 3;
    await speak(
      channel,
      marketNpc,
      playerMessage,
      done
        ? "Última fala: explique que o mascarado comprou material médico para manter uma criança viva. Cobradores invadem para queimar o livro de vendas."
        : "Mostre o livro de vendas e explique os remédios comprados pelo mascarado.",
      done ? 1 : 0,
    );
    if (done) {
      state.stage = "MARKET_FIGHT";
      state.activeNpc = null;
      state.combatStarted = true;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "ouvir_vendedora_mercado");
      await setState(inst.id, state);
      await startEliteMaskCombat(channel, channelId, guildId, actor, inst.id, def, "MARKET_FIGHT");
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === hospitalNpc.key && state.stage === "HOSPITAL_TALK") {
    const done = turn >= 3;
    await speak(
      channel,
      hospitalNpc,
      playerMessage,
      done
        ? "Última fala: revele que a ficha da criança prova uma rede de mortes falsas. Um selador infiltrado aciona um selo para tomar o documento."
        : "Mostre a ficha da criança e explique o número antigo marcado no pulso.",
      done ? 1 : 0,
    );
    if (done) {
      state.stage = "HOSPITAL_FIGHT";
      state.activeNpc = null;
      state.combatStarted = true;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "proteger_enfermeira_hospital");
      await setState(inst.id, state);
      await startEliteMaskCombat(channel, channelId, guildId, actor, inst.id, def, "HOSPITAL_FIGHT");
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === routeNpc.key && state.stage === "ROUTE_TALK") {
    const done = turn >= 3;
    await speak(
      channel,
      routeNpc,
      playerMessage,
      done
        ? "Última fala: entregue a lista de nomes e diga que o mascarado tentou denunciar antes de ser declarado assassino. O executor aparece."
        : "Explique que a lista estava sendo levada para fora porque os canais internos foram bloqueados.",
      done ? 1 : 0,
    );
    if (done) {
      state.stage = "ROUTE_FIGHT";
      state.activeNpc = null;
      state.combatStarted = true;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "interceptar_mensageiro_rota");
      await setState(inst.id, state);
      await startEliteMaskCombat(channel, channelId, guildId, actor, inst.id, def, "ROUTE_FIGHT");
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === bossNpc.key && state.stage === "FINAL_TALK") {
    const done = turn >= 3;
    await speak(
      channel,
      bossNpc,
      playerMessage,
      done
        ? "Última fala: aceite que o time tem a lista, mas inicie combate para testar se eles conseguem levar a verdade ao Hokage."
        : "Reaja às informações do time, explique que denunciou a rede e que passou a executar criminosos depois de ser silenciado.",
      done ? 2 : Math.min(turn - 1, 1),
    );
    if (done) {
      state.stage = "FINAL_FIGHT";
      state.activeNpc = null;
      state.combatStarted = true;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "confrontar_ninja_elite");
      await setState(inst.id, state);
      await startEliteMaskCombat(channel, channelId, guildId, actor, inst.id, def, "FINAL_FIGHT");
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === clerkNpc.key && state.stage === "RETURN") {
    const done = turn >= 2;
    await speak(
      channel,
      clerkNpc,
      playerMessage,
      done
        ? "Última fala: aceite a lista, confirme que o relatório seguirá ao Hokage e encerre a missão."
        : "Receba o relatório sobre Iori, Minae, Natsumi, o mensageiro, a lista de nomes e o mascarado.",
      3 + Math.min(turn - 1, 1),
    );
    if (done) {
      state.stage = "DONE";
      state.activeNpc = null;
      await markObjective(inst.id, "entregar_relatorio_mascara");
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

function starterFrom(char: Awaited<ReturnType<typeof getOrCreateCharacter>>): StarterChar {
  return {
    charId: char.id,
    name: char.name,
    hpCurrent: char.hpCurrent,
    hpMax: char.hpMax,
    chakra: char.resources?.chakra ?? 100,
    energia: char.resources?.energia ?? 100,
    jutsuIds: char.jutsus.map((j: { jutsuId: string }) => j.jutsuId),
    attrs: attrsFromRow(char.attributes ?? {}),
  };
}

async function startEliteMaskCombat(
  channel: TextBasedChannel | null,
  channelId: string,
  guildId: string,
  actor: { id: string; username: string },
  instanceId: string,
  def: EliteMaskContext["def"],
  stage: EliteMaskStage,
): Promise<void> {
  if (await getActiveSession(channelId)) return;
  const char = await getOrCreateCharacter(actor.id, guildId, actor.username);
  const { players, attrsById } = await gatherPartyPlayers(channel, guildId, starterFrom(char));
  const session = await startCombat({
    channelId,
    guildId,
    scenarioId: scenarioFor(stage),
    players,
    npcs: npcsForStage(def, stage),
    missionInstanceId: instanceId,
  });
  await cacheAttrs(session, attrsById);
  await sendLine(channel, combatStartText(stage, players.length));
}

function scenarioFor(stage: EliteMaskStage): string {
  if (stage === "MARKET_FIGHT") return "centro_comercial";
  if (stage === "HOSPITAL_FIGHT") return "hospital_konoha";
  if (stage === "ROUTE_FIGHT") return "rota_comercial_konoha";
  return "beco_konoha";
}

function npcsForStage(def: EliteMaskContext["def"], stage: EliteMaskStage): { templateId: string }[] {
  if (stage === "ALLEY_FIGHT") return [{ templateId: String(def.data?.silencerTemplate ?? "elite_mask_silencer") }];
  if (stage === "MARKET_FIGHT") {
    return Array.from({ length: 2 }, () => ({ templateId: String(def.data?.collectorTemplate ?? "elite_mask_collector") }));
  }
  if (stage === "HOSPITAL_FIGHT") return [{ templateId: String(def.data?.sealNinjaTemplate ?? "elite_mask_seal_ninja") }];
  if (stage === "ROUTE_FIGHT") return [{ templateId: String(def.data?.executorTemplate ?? "elite_mask_executor") }];
  return [
    { templateId: String(def.data?.bossTemplate ?? "elite_mask_boss") },
    ...Array.from({ length: Number(def.data?.cloneCount ?? 2) }, () => ({
      templateId: String(def.data?.cloneTemplate ?? "elite_mask_clone"),
    })),
  ];
}

function combatStartText(stage: EliteMaskStage, playerCount: number): string {
  const text: Record<string, string> = {
    ALLEY_FIGHT: "Um silenciador salta das sombras para matar a testemunha.",
    MARKET_FIGHT: "Dois cobradores derrubam óleo sobre o livro de vendas e partem para cima.",
    HOSPITAL_FIGHT: "Um selador infiltrado trava as portas do corredor e tenta tomar a ficha médica.",
    ROUTE_FIGHT: "O executor da rede aparece para destruir a lista de nomes.",
    FINAL_FIGHT: "O Ninja de Elite mascarado chama clones de cinzas e entra em posição de combate.",
  };
  return `${text[stage] ?? "A emboscada começa."} ${playerCount} ninja(s) entram no combate. Use \`/mapa\`.`;
}

async function retryCombatIfNeeded(
  interaction: ChatInputCommandInteraction,
  ctx: EliteMaskContext,
  state: EliteMaskState,
): Promise<void> {
  if (await getActiveSession(interaction.channelId)) return;
  const stage = state.stage;
  if (!stage?.endsWith("_FIGHT")) return;
  state.combatStarted = true;
  await setState(ctx.inst.id, state);
  await startEliteMaskCombat(interaction.channel, interaction.channelId, interaction.guildId ?? "global", interaction.user, ctx.inst.id, ctx.def, stage);
}

export async function onEliteMaskCombatWon(interaction: ChatInputCommandInteraction, instanceId: string): Promise<void> {
  const inst = await getInstance(instanceId);
  if (!inst || inst.status !== "ACTIVE") return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "ELITE_MASK") return;
  const state = ensureState(inst.stateJson);

  if (state.stage === "ALLEY_FIGHT") {
    state.stage = "MARKET_TALK";
    await markObjective(inst.id, "derrotar_silenciador_beco");
    await setAfterFight(interaction, inst.id, state, "Iori sobreviveu. A criança salva pelo mascarado foi tratada com remédios comprados no Centro Comercial: <#1516183249712582657>.");
    return;
  }
  if (state.stage === "MARKET_FIGHT") {
    state.stage = "HOSPITAL_TALK";
    await markObjective(inst.id, "derrotar_cobradores_mercado");
    await setAfterFight(interaction, inst.id, state, "O livro de vendas foi salvo. As compras apontam para uma criança com ficha escondida no Hospital de Konoha: <#1516825458765987980>.");
    return;
  }
  if (state.stage === "HOSPITAL_FIGHT") {
    state.stage = "ROUTE_TALK";
    await markObjective(inst.id, "derrotar_selador_hospital");
    await setAfterFight(interaction, inst.id, state, "A ficha médica prova que mortes foram falsificadas. Um mensageiro tenta levar uma lista de nomes pela Rota Comercial: <#1516425270481915995>.");
    return;
  }
  if (state.stage === "ROUTE_FIGHT") {
    state.stage = "FINAL_TALK";
    await markObjective(inst.id, "derrotar_executor_rota");
    await setAfterFight(interaction, inst.id, state, "A lista foi recuperada. O Ninja de Elite mascarado espera no Beco de Konoha para decidir se entrega a verdade: <#1516452197976772679>.");
    return;
  }
  if (state.stage === "FINAL_FIGHT") {
    state.stage = "RETURN";
    await markObjective(inst.id, "capturar_ninja_elite");
    await setAfterFight(interaction, inst.id, state, "O mascarado caiu e a lista de nomes está intacta. Volte à Mansão do Hokage para entregar o relatório: <#1516470677962494084>.");
  }
}

async function setAfterFight(
  interaction: ChatInputCommandInteraction,
  instanceId: string,
  state: EliteMaskState,
  message: string,
): Promise<void> {
  state.combatStarted = false;
  state.activeNpc = null;
  await setState(instanceId, state);
  await interaction.followUp(message);
}

async function sendLine(channel: TextBasedChannel | null, text: string): Promise<void> {
  if (channel && "send" in channel) await channel.send(text);
}
