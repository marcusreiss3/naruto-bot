import {
  ComponentType,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Message,
  type TextBasedChannel,
} from "discord.js";
import { prisma } from "../../db/client.js";
import {
  CENTRO_COMERCIAL_CHANNEL_ID,
  CENTRO_COMERCIAL_KIRI_CHANNEL_ID,
  CENTRO_COMERCIAL_SUNA_CHANNEL_ID,
  PRACA_SUNA_CHANNEL_ID,
} from "../../data/scenarios/index.js";
import { getMission } from "../../data/missions/index.js";
import { getOrCreateCharacter, attrsFromRow } from "../characters/character-service.js";
import { getActiveSession, startCombat } from "../combat/combat-engine.js";
import { formatPersonaLines, sendAsPersona } from "../discord/persona-webhook.js";
import type { RenderEntity } from "../maps/renderer.js";
import { NpcAiService } from "../npc-ai/npc-ai-service.js";
import { getPersona } from "../npc-ai/personas.js";
import { partyMemberIds } from "../party/party-service.js";
import { normalizeVillageId, VILLAGE_MANSIONS, VILLAGE_NAMES, type VillageId } from "../village-service.js";
import { v2Edit, v2Public } from "../../ui/economy-components-v2.js";
import { investigationPanel, type InvestigationMemoryView } from "../../ui/mission-investigation-v2.js";
import { pausedMissionNotice, sendMissionNotice } from "../../ui/mission-notice-v2.js";
import { cacheAttrs, gatherPartyPlayers, type StarterChar } from "./combat-party.js";
import {
  canUncoverClue,
  createMemorySequence,
  evaluateMemoryChoice,
  MEMORY_MAX_ATTEMPTS,
  MEMORY_PREPARE_SECONDS,
  MEMORY_WORD_DISPLAY_MS,
  rankBInvestigationMembers,
  RANK_B_PARTY_MAX,
} from "./investigation-party.js";
import {
  completeMission,
  buildMissionCompleteEmbed,
  getActiveMissions,
  getInstance,
  markObjective,
  readState,
  setState,
} from "./mission-service.js";

type YukiStage = "BRIEFING" | "INVESTIGATE" | "FINAL_TALK" | "FIGHT" | "RETURN" | "DONE";
type ClueId = "suna_market" | "kiri_market" | "suna_plaza" | "konoha_market";

const YUKI_MAX_MISTAKES = 2;

interface RegionalNpc {
  key: string;
  name: string;
  persona: string;
  imageFile: string;
  cell: string;
}

interface ClueDef {
  id: ClueId;
  channelId: string;
  objectiveId: string;
  title: string;
  marker: RenderEntity;
  witness: RegionalNpc;
  investigation: InvestigationDef;
}

interface InvestigationDef {
  intro: string;
  memoryWords: [string, string, string, string, string];
  actions: EvidenceAction[];
  conclusionQuestion: string;
  deductions: DeductionOption[];
  correct: string;
  success: string;
}

interface EvidenceAction {
  id: string;
  label: string;
  detail: string;
}

interface DeductionOption {
  id: string;
  label: string;
}

interface InvestigationProgress {
  evidence?: string[];
  lostEvidence?: string[];
  contributors?: Record<string, string>;
  evidenceUsers?: Record<string, string>;
  attemptUsers?: Record<string, string>;
  failedAttempts?: Record<string, number>;
  investigators?: Record<string, string>;
  votes?: Record<string, string>;
  voters?: Record<string, string>;
}

export interface YukiHeirState {
  stage?: YukiStage;
  villageId?: VillageId;
  activeNpc?: string | null;
  talks?: Record<string, number>;
  clues?: Partial<Record<ClueId, boolean>>;
  investigations?: Partial<Record<ClueId, InvestigationProgress>>;
  runningClue?: ClueId | null;
  mistakes?: number;
  combatStarted?: boolean;
  hakuoSeen?: boolean;
}

interface YukiHeirContext {
  inst: NonNullable<Awaited<ReturnType<typeof getInstance>>>;
  def: NonNullable<ReturnType<typeof getMission>>;
  ownerCharId: string;
  villageId: VillageId;
}

const clerkNpc: RegionalNpc = {
  key: "yuki_mission_clerk",
  name: "Oficial de Inteligencia",
  persona: "yuki_mission_clerk",
  imageFile: "npcs/mission-clerk.png",
  cell: "C4",
};

const hakuoNpc: RegionalNpc = {
  key: "yuki_heir_hakuo",
  name: "Hakuo Yuki",
  persona: "yuki_heir_hakuo",
  imageFile: "enemies/yuki-heir-hakuo.png",
  cell: "D5",
};

const CLUES: Record<ClueId, ClueDef> = {
  suna_market: {
    id: "suna_market",
    channelId: CENTRO_COMERCIAL_SUNA_CHANNEL_ID,
    objectiveId: "investigar_vidro_suna",
    title: "Vidro congelado em Suna",
    marker: { cell: "C5", label: "GEL", color: "#74b9ff", kind: "MARKER", name: "Areia vitrificada" },
    witness: {
      key: "yuki_suna_glass_vendor",
      name: "Rasae, vidreira",
      persona: "yuki_suna_glass_vendor",
      imageFile: "npcs/market_vendor_aya.png",
      cell: "C4",
    },
    investigation: {
      intro:
        "A barraca está coberta por gelo, mas a areia sob a camada congelada virou vidro. Frio comum não vitrifica areia: descubram se o calor veio antes do Hyoton ou se a cena foi montada para incriminar Hakuo.",
      memoryWords: ["Calor", "Areia", "Vidro", "Cinza", "Gelo"],
      actions: [
        { id: "thermal_edge", label: "Medir o calor residual", detail: "O centro da barraca ainda guarda calor sob o gelo. Se tudo tivesse sido congelado de uma vez, essa camada quente não existiria." },
        { id: "glass_cut", label: "Analisar o vidro", detail: "Bolhas de ar ficaram presas sob a geada. A ordem é clara: a areia foi aquecida primeiro e congelada depois." },
        { id: "ash_layer", label: "Peneirar as cinzas", detail: "A cinza não parece de incêndio comum. Há traços de combustível de forja portátil, usado para preparar a cena em segredo." },
        { id: "seller_memory", label: "Ouvir Rasae", detail: "Rasae viu um carregador sem bandana deixando uma caixa antes do gelo aparecer. A descrição não combina com Hakuo." },
      ],
      conclusionQuestion: "Qual tese explica melhor a cena?",
      deductions: [
        { id: "ice_first", label: "O Hyoton vitrificou a areia sozinho" },
        { id: "heat_before_ice", label: "A areia foi aquecida antes do gelo" },
        { id: "forge_accident", label: "A forja causou um acidente comum" },
        { id: "sand_trap", label: "Suna forjou a própria cena" },
      ],
      correct: "heat_before_ice",
      success: "A equipe conclui que o calor veio antes do Hyoton. Hakuo pode ter passado pelo local, mas alguém preparou a cena para associar o ataque a ele.",
    },
  },
  kiri_market: {
    id: "kiri_market",
    channelId: CENTRO_COMERCIAL_KIRI_CHANNEL_ID,
    objectiveId: "investigar_espelhos_kiri",
    title: "Mensagem invertida em Kiri",
    marker: { cell: "D4", label: "ESP", color: "#81ecec", kind: "MARKER", name: "Vitrine espelhada" },
    witness: {
      key: "yuki_kiri_mirror_seller",
      name: "Genzo, vendedor de espelhos",
      persona: "yuki_kiri_mirror_seller",
      imageFile: "npcs/merchant.png",
      cell: "D3",
    },
    investigation: {
      intro:
        "A vitrine congelada parece riscada ao acaso, mas o reflexo reorganiza as letras em uma frase. Descubram se a mensagem é ameaça, confissão, pedido de testemunho ou parte de uma armadilha maior.",
      memoryWords: ["Reflexo", "Ângulo", "Vapor", "Mensagem", "Espelho"],
      actions: [
        { id: "left_angle", label: "Ler pelo ângulo esquerdo", detail: "O reflexo forma as palavras 'não enterrem'. A frase está presa dentro do gelo, feita para surgir apenas sob análise cuidadosa." },
        { id: "right_angle", label: "Ler pelo ângulo direito", detail: "O segundo trecho diz 'outro clã'. Os riscos tremem, mais próximos de desespero do que de declaração de guerra." },
        { id: "breath_test", label: "Revelar com vapor", detail: "O vapor quente revela 'em silêncio'. A mensagem completa fica: 'não enterrem outro clã em silêncio'." },
        { id: "shop_log", label: "Conferir o livro da loja", detail: "Genzo vendeu placas de espelho a um intermediário sem bandana. O comprador pediu cortes parecidos com espelhos de gelo e pagou com moedas de várias vilas." },
      ],
      conclusionQuestion: "O que essa mensagem quer provocar?",
      deductions: [
        { id: "revenge_order", label: "Ordenar um ataque contra Kiri" },
        { id: "public_witness", label: "Forçar as vilas a testemunhar" },
        { id: "kiri_confession", label: "Arrancar confissão imediata de Kiri" },
        { id: "merchant_threat", label: "Ameaçar vendedores de espelho" },
      ],
      correct: "public_witness",
      success: "A equipe entende que a mensagem não ordena mortes. Ela tenta obrigar as vilas a encarar o apagamento do Clã Yuki diante de testemunhas.",
    },
  },
  suna_plaza: {
    id: "suna_plaza",
    channelId: PRACA_SUNA_CHANNEL_ID,
    objectiveId: "investigar_fonte_suna",
    title: "Reflexos da fonte",
    marker: { cell: "C5", label: "REF", color: "#00cec9", kind: "MARKER", name: "Fonte congelada" },
    witness: {
      key: "yuki_suna_plaza_guard",
      name: "Settei, guarda da praça",
      persona: "yuki_suna_plaza_guard",
      imageFile: "npcs/mission-clerk.png",
      cell: "D5",
    },
    investigation: {
      intro:
        "A fonte congelou em lâminas de gelo que funcionam como pequenos espelhos. Cada ângulo aponta para uma vila diferente, como se alguém quisesse fabricar suspeitas cruzadas.",
      memoryWords: ["Norte", "Oeste", "Sombra", "Ronda", "Fonte"],
      actions: [
        { id: "north_marker", label: "Examinar o norte", detail: "Desse ponto aparece um selo de Kiri invertido. Ele parece colocado para ser encontrado, não para indicar uma rota real." },
        { id: "west_marker", label: "Examinar o oeste", detail: "O reflexo mostra um carimbo de Konoha, mas não é oficial. É uma imitação boa o bastante para gerar suspeita." },
        { id: "shadow_clock", label: "Marcar a sombra", detail: "Ao meio-dia, a sombra aponta para a própria Suna. O desenho inclui Suna entre os suspeitos, como se ninguém fosse inocente." },
        { id: "guard_route", label: "Checar a ronda", detail: "A guarda foi desviada por um bilhete anônimo minutos antes do congelamento. Alguém preparou a praça sem ser visto." },
      ],
      conclusionQuestion: "Qual é o objetivo desse desenho de reflexos?",
      deductions: [
        { id: "escape_route", label: "Mostrar uma rota de fuga" },
        { id: "weather_fault", label: "Registrar efeito natural do vento" },
        { id: "political_frame", label: "Fazer vilas acusarem umas às outras" },
        { id: "yuki_signature", label: "Assinar um crime do Clã Yuki" },
      ],
      correct: "political_frame",
      success: "A equipe percebe o padrão: os reflexos foram desenhados para criar acusações cruzadas entre vilas.",
    },
  },
  konoha_market: {
    id: "konoha_market",
    channelId: CENTRO_COMERCIAL_CHANNEL_ID,
    objectiveId: "investigar_carga_konoha",
    title: "Guia de carga falsa",
    marker: { cell: "E6", label: "DOC", color: "#0984e3", kind: "MARKER", name: "Caixa de espelhos" },
    witness: {
      key: "yuki_konoha_courier",
      name: "Toma, mensageiro",
      persona: "yuki_konoha_courier",
      imageFile: "npcs/merchant.png",
      cell: "E5",
    },
    investigation: {
      intro:
        "A caixa de espelhos em Konoha veio com documentos perfeitos demais. Se a rota foi fabricada, ela pode revelar quem está usando Hakuo como rosto público da crise.",
      memoryWords: ["Lacre", "Peso", "Rota", "Tinta", "Carga"],
      actions: [
        { id: "seal_check", label: "Comparar lacres", detail: "Os lacres imitam três vilas, mas nenhum possui código interno verdadeiro. São cópias feitas para passar numa inspeção rápida." },
        { id: "weight_check", label: "Pesar a caixa", detail: "A caixa pesa mais que espelhos comuns. Havia placas finas de gelo selado dentro dela, próprias para deixar marcas de Hyoton depois." },
        { id: "route_check", label: "Traçar a rota", detail: "A rota sai de Kiri, passa por Suna e termina em Konoha sem justificativa comercial. O caminho parece construído para espalhar culpa." },
        { id: "ink_check", label: "Testar a tinta", detail: "Os recibos parecem antigos, mas a tinta é recente. Alguém envelheceu os papéis para fingir que a carga era legítima." },
      ],
      conclusionQuestion: "Para qual conclusão a rota falsa aponta?",
      deductions: [
        { id: "konoha_order", label: "Konoha comprou a carga" },
        { id: "suna_smuggling", label: "Suna contrabandeou gelo" },
        { id: "third_party_frame", label: "Um terceiro plantou provas contra Hakuo" },
        { id: "kiri_tax", label: "Kiri falsificou imposto" },
      ],
      correct: "third_party_frame",
      success: "A equipe conclui que a carga foi plantada por alguém sem vila aparente. Hakuo está sendo usado como rosto público da crise.",
    },
  },
};
function ensureState(raw: string): YukiHeirState {
  const state = readState<YukiHeirState>(raw);
  state.stage = state.stage ?? "BRIEFING";
  state.villageId = normalizeVillageId(state.villageId);
  state.activeNpc = state.activeNpc ?? null;
  state.talks = state.talks ?? {};
  state.clues = state.clues ?? {};
  state.investigations = state.investigations ?? {};
  state.runningClue = state.runningClue ?? null;
  state.mistakes = state.mistakes ?? 0;
  state.combatStarted = state.combatStarted ?? false;
  state.hakuoSeen = state.hakuoSeen ?? false;
  return state;
}

function originChannel(state: YukiHeirState): string {
  return VILLAGE_MANSIONS[normalizeVillageId(state.villageId)];
}

function clueByChannel(channelId: string): ClueDef | null {
  return Object.values(CLUES).find((clue) => clue.channelId === channelId) ?? null;
}

function allCluesDone(state: YukiHeirState): boolean {
  return Object.keys(CLUES).every((key) => state.clues?.[key as ClueId]);
}

async function findContextByCharId(charId: string, channelId?: string): Promise<YukiHeirContext | null> {
  for (const inst of await getActiveMissions(charId)) {
    const def = getMission(inst.missionId);
    if (!def || def.type !== "YUKI_HEIR") continue;
    const state = ensureState(inst.stateJson);
    const channels = [
      originChannel(state),
      CENTRO_COMERCIAL_SUNA_CHANNEL_ID,
      CENTRO_COMERCIAL_KIRI_CHANNEL_ID,
      PRACA_SUNA_CHANNEL_ID,
      CENTRO_COMERCIAL_CHANNEL_ID,
    ];
    if (channelId && !channels.includes(channelId)) continue;
    return { inst, def, ownerCharId: charId, villageId: normalizeVillageId(state.villageId) };
  }
  return null;
}

export async function resolveYukiHeir(
  discordId: string,
  guildId: string,
  channelId?: string,
): Promise<YukiHeirContext | null> {
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

export function availableYukiHeirNpcs(
  state: YukiHeirState,
  channelId: string,
): { key: string; name: string }[] {
  const current: YukiHeirState = {
    ...state,
    stage: state.stage ?? "BRIEFING",
    clues: state.clues ?? {},
    villageId: normalizeVillageId(state.villageId),
  };
  if (channelId === originChannel(current)) {
    if (current.stage === "BRIEFING") return [{ key: clerkNpc.key, name: clerkNpc.name }];
    if (current.stage === "RETURN") return [{ key: clerkNpc.key, name: `${clerkNpc.name} (relatório)` }];
  }
  if (current.stage === "INVESTIGATE") {
    const clue = clueByChannel(channelId);
    if (clue && !current.clues?.[clue.id]) return [{ key: clue.witness.key, name: clue.witness.name }];
  }
  if (channelId === CENTRO_COMERCIAL_KIRI_CHANNEL_ID && current.stage === "FINAL_TALK") {
    return [{ key: hakuoNpc.key, name: hakuoNpc.name }];
  }
  return [];
}

export async function yukiHeirMapHandle(
  interaction: ChatInputCommandInteraction,
  ctx: YukiHeirContext,
  entities: RenderEntity[],
): Promise<string | null> {
  const state = ensureState(ctx.inst.stateJson);

  if (interaction.channelId === originChannel(state)) {
    if (state.stage === "BRIEFING" || state.stage === "RETURN") {
      entities.push(npcEntity(clerkNpc));
      return state.stage === "BRIEFING"
        ? `\nMissão ativa: **${ctx.def.name}** - fale com o oficial usando \`/interagir npc\`. Origem: **${VILLAGE_NAMES[ctx.villageId]}**.`
        : `\nMissão ativa: **${ctx.def.name}** - entregue o relatório final usando \`/interagir npc\`.`;
    }
    return nextNote(state, ctx.def.name);
  }

  if (state.stage === "INVESTIGATE") {
    const clue = clueByChannel(interaction.channelId);
    if (!clue) return null;
    if (state.clues?.[clue.id]) {
      entities.push({ ...clue.marker, name: `${clue.marker.name} (analisado)`, color: "#2ecc71" });
      return `\nMissão ativa: **${ctx.def.name}** - pista já analisada: **${clue.title}**.`;
    }
    entities.push(clue.marker, npcEntity(clue.witness));
    state.runningClue = clue.id;
    await setState(ctx.inst.id, state);
    void startCluePuzzle(interaction.channel, interaction.guildId ?? "global", ctx.inst.id, clue).catch(() => undefined);
    return `\nMissão ativa: **${ctx.def.name}** - um painel atualizado de investigação foi enviado no canal.`;
  }

  if (interaction.channelId !== CENTRO_COMERCIAL_KIRI_CHANNEL_ID) return nextNote(state, ctx.def.name);
  if (state.stage === "FINAL_TALK") {
    entities.push(
      npcEntity(hakuoNpc),
      { cell: "B5", label: "REF", color: "#74b9ff", kind: "NPC", name: "Refem no espelho" },
      { cell: "E6", label: "REF", color: "#74b9ff", kind: "NPC", name: "Refem no espelho" },
    );
    if (!state.activeNpc) {
      state.activeNpc = hakuoNpc.key;
      state.talks = state.talks ?? {};
      state.talks[hakuoNpc.key] = Math.max(state.talks[hakuoNpc.key] ?? 0, 1);
      await setState(ctx.inst.id, state);
    }
    if (!state.hakuoSeen) {
      state.hakuoSeen = true;
      await setState(ctx.inst.id, state);
      await speak(interaction.channel, hakuoNpc, "(o time encontra os espelhos de gelo)", "Apresente Hakuo cercado por espelhos e reféns vivos, acusando as vilas de apagarem o Clã Yuki.", 0);
    }
    return `\nMissão ativa: **${ctx.def.name}** - confronte Hakuo Yuki usando \`/interagir npc\`.`;
  }
  if (state.stage === "FIGHT") {
    if (!(await getActiveSession(interaction.channelId))) await startYukiCombat(interaction, ctx);
    return `\nMissão ativa: **${ctx.def.name}** - derrote Hakuo e os clones para libertar os reféns.`;
  }
  return nextNote(state, ctx.def.name);
}

function nextNote(state: YukiHeirState, missionName: string): string | null {
  if (state.stage === "INVESTIGATE") {
    return `\nMissão ativa: **${missionName}** - investigue as pistas em <#${CENTRO_COMERCIAL_SUNA_CHANNEL_ID}>, <#${CENTRO_COMERCIAL_KIRI_CHANNEL_ID}>, <#${PRACA_SUNA_CHANNEL_ID}> e <#${CENTRO_COMERCIAL_CHANNEL_ID}>.`;
  }
  if (state.stage === "FINAL_TALK" || state.stage === "FIGHT") {
    return `\nMissão ativa: **${missionName}** - siga para o Centro Comercial de Kirigakure: <#${CENTRO_COMERCIAL_KIRI_CHANNEL_ID}>.`;
  }
  if (state.stage === "RETURN") {
    return `\nMissão ativa: **${missionName}** - volte para a mansão da sua vila: <#${originChannel(state)}>.`;
  }
  return null;
}

function npcEntity(npc: RegionalNpc): RenderEntity {
  return {
    cell: npc.cell,
    name: npc.name,
    label: npc.name.slice(0, 3),
    color: "#74b9ff",
    kind: "NPC",
    imageFile: npc.imageFile,
  };
}

async function speak(channel: TextBasedChannel | null, npc: RegionalNpc, message: string, extra: string, fallbackIndex: number): Promise<void> {
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

export async function interactYukiHeir(interaction: ChatInputCommandInteraction, npcKey: string): Promise<void> {
  const guildId = interaction.guildId ?? "global";
  const ctx = await resolveYukiHeir(interaction.user.id, guildId, interaction.channelId);
  if (!ctx) {
    await interaction.reply({ content: "Você (ou sua party) não tem essa missão ativa.", ephemeral: true });
    return;
  }
  const state = ensureState(ctx.inst.stateJson);
  const choice = availableYukiHeirNpcs(state, interaction.channelId).find((npc) => npc.key === npcKey);
  if (!choice) {
    await interaction.reply({ content: "Esse NPC não está disponível nesta etapa.", ephemeral: true });
    return;
  }

  const clue = Object.values(CLUES).find((candidate) => candidate.witness.key === npcKey);
  if (clue) {
    await interaction.deferReply({ ephemeral: true });
    await speak(interaction.channel, clue.witness, "(o time pede depoimento sobre o gelo)", "Entregue a pista fixa desta testemunha sem resolver a investigação pelos jogadores.", 0);
    await interaction.editReply(`Você ouviu **${choice.name}**. Use o painel de pista no canal ou \`/mapa\` para reabrir a cena.`);
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

export async function continueYukiHeirMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.guildId) return false;
  const ctx = await resolveYukiHeir(message.author.id, message.guildId, message.channelId);
  if (!ctx) return false;
  const state = ensureState(ctx.inst.stateJson);
  if (!state.activeNpc) return false;
  if (!availableYukiHeirNpcs(state, message.channelId).some((npc) => npc.key === state.activeNpc)) return false;
  await runDialogue(message.channel, message.channelId, message.guildId, ctx, state.activeNpc, message.content || "...", message.author);
  return true;
}

async function runDialogue(
  channel: TextBasedChannel | null,
  channelId: string,
  guildId: string,
  ctx: YukiHeirContext,
  npcKey: string,
  playerMessage: string,
  actor: { id: string; username: string },
): Promise<void> {
  const inst = await getInstance(ctx.inst.id);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "YUKI_HEIR") return;
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
        ? "Última fala: mande investigar os quatro locais congelados e avise que acusar Hakuo sem provas pode causar uma crise entre vilas."
        : `Explique que a missão foi retirada por ${VILLAGE_NAMES[ctx.villageId]} e que Hakuo Yuki pode ser agressor, vítima ou isca.`,
      done ? 2 : Math.min(turn - 1, 1),
    );
    if (done) {
      state.stage = "INVESTIGATE";
      state.activeNpc = null;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "receber_dossie_yuki");
      await setState(inst.id, state);
      if (channel && "send" in channel) {
        await sendMissionNotice(channel, {
          kind: "investigacao",
          title: "Quatro cenas foram identificadas",
          description: "Dividam a equipe e analisem cada local antes de formular uma tese sobre Hakuo Yuki.",
          itemsTitle: "Locais da investigação",
          items: [
            `<#${CENTRO_COMERCIAL_SUNA_CHANNEL_ID}> — vidro congelado`,
            `<#${CENTRO_COMERCIAL_KIRI_CHANNEL_ID}> — mensagem invertida`,
            `<#${PRACA_SUNA_CHANNEL_ID}> — reflexos da fonte`,
            `<#${CENTRO_COMERCIAL_CHANNEL_ID}> — carga falsa`,
          ],
          footer: "Entre no canal indicado e use /mapa para abrir a pista.",
        });
      }
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === hakuoNpc.key && state.stage === "FINAL_TALK") {
    const fight = turn >= 3;
    await speak(
      channel,
      hakuoNpc,
      playerMessage,
      fight
        ? "Última fala: Hakuo percebe que foi usado, mas decide proteger os espelhos como prova. Forme clones de gelo e inicie combate."
        : "Reaja às pistas do time com raiva e dúvida. Mostre que Hakuo não queria matar reféns; ele queria forçar um testemunho público.",
      fight ? 2 : Math.min(turn - 1, 1),
    );
    if (fight) {
      state.stage = "FIGHT";
      state.activeNpc = null;
      state.combatStarted = true;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "confrontar_herdeiro_yuki");
      await setState(inst.id, state);
      await startYukiCombatFromActor(channel, channelId, guildId, actor, inst.id, def);
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
        ? "Última fala: registre que Hakuo foi contido, os reféns foram libertados e a manipulação política foi descoberta. Encerre a missão."
        : "Receba o relatório sobre as quatro pistas, Hakuo, os clones e os reféns presos nos espelhos.",
      3 + Math.min(turn - 1, 1),
    );
    if (done) {
      state.stage = "DONE";
      state.activeNpc = null;
      await markObjective(inst.id, "entregar_relatorio_yuki");
      await setState(inst.id, state);
      const result = await completeMission(inst.charId, inst.missionId);
      if (result && channel && "send" in channel) {
        await channel.send({ embeds: [buildMissionCompleteEmbed(def.name, result.rewards)] });
      }
    } else {
      await setState(inst.id, state);
    }
  }
}

function progressFor(state: YukiHeirState, clue: ClueDef): Required<InvestigationProgress> {
  state.investigations = state.investigations ?? {};
  const progress = state.investigations[clue.id] ?? {};
  progress.evidence = progress.evidence ?? [];
  progress.lostEvidence = progress.lostEvidence ?? [];
  progress.contributors = progress.contributors ?? {};
  progress.evidenceUsers = progress.evidenceUsers ?? {};
  progress.attemptUsers = progress.attemptUsers ?? { ...progress.evidenceUsers };
  progress.failedAttempts = progress.failedAttempts ?? {};
  progress.investigators = progress.investigators ?? {};
  progress.votes = progress.votes ?? {};
  progress.voters = progress.voters ?? {};
  state.investigations[clue.id] = progress;
  return progress as Required<InvestigationProgress>;
}

function quorumSize(allowed: Set<string>): number {
  return Math.min(2, Math.max(1, allowed.size));
}

function evidenceReady(clue: ClueDef, progress: Required<InvestigationProgress>): boolean {
  return new Set([...progress.evidence, ...progress.lostEvidence]).size >= clue.investigation.actions.length;
}

function voteCounts(progress: Required<InvestigationProgress>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const vote of Object.values(progress.votes)) counts[vote] = (counts[vote] ?? 0) + 1;
  return counts;
}

function consensusPick(progress: Required<InvestigationProgress>, quorum: number): string | null {
  const counts = voteCounts(progress);
  return Object.entries(counts).find(([, count]) => count >= quorum)?.[0] ?? null;
}

function cluePanel(
  instanceId: string,
  state: YukiHeirState,
  clue: ClueDef,
  members: string[],
  page: number,
  result?: string,
  disabled = false,
  memory?: InvestigationMemoryView,
) {
  const progress = progressFor(state, clue);
  const quorum = quorumSize(new Set(members));
  const ready = evidenceReady(clue, progress);
  const consensus = consensusPick(progress, quorum);
  return investigationPanel({
    prefix: "yuki-invest",
    instanceId,
    clueId: clue.id,
    title: clue.title,
    intro: clue.investigation.intro,
    actions: clue.investigation.actions,
    deductions: clue.investigation.deductions,
    question: clue.investigation.conclusionQuestion,
    evidence: progress.evidence,
    lostEvidence: progress.lostEvidence,
    evidenceUsers: progress.evidenceUsers,
    attemptUsers: progress.attemptUsers,
    failedAttempts: progress.failedAttempts,
    contributors: progress.contributors,
    votes: progress.votes,
    voters: progress.voters,
    members,
    completedCases: Object.values(state.clues ?? {}).filter(Boolean).length,
    totalCases: Object.keys(CLUES).length,
    mistakes: state.mistakes ?? 0,
    maxMistakes: YUKI_MAX_MISTAKES,
    ready,
    consensus,
    page,
    memory,
    result,
    disabled,
  });
}

async function allowedDiscordIds(instanceId: string, guildId: string): Promise<Set<string>> {
  const inst = await getInstance(instanceId);
  if (!inst) return new Set();
  const owner = await prisma.userCharacter.findUnique({ where: { id: inst.charId }, select: { discordId: true } });
  if (!owner) return new Set();
  return new Set(rankBInvestigationMembers(await partyMemberIds(guildId, owner.discordId)));
}

async function startCluePuzzle(channel: TextBasedChannel | null, guildId: string, instanceId: string, clue: ClueDef): Promise<void> {
  if (!channel || !("send" in channel)) return;
  const inst = await getInstance(instanceId);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "YUKI_HEIR") return;
  let state = ensureState(inst.stateJson);
  const allowed = await allowedDiscordIds(instanceId, guildId);
  const members = [...allowed];
  let page = 0;
  let memory: InvestigationMemoryView | undefined;
  progressFor(state, clue);
  const msg = await channel.send(v2Public(cluePanel(instanceId, state, clue, members, page)));
  const deadline = Date.now() + 300_000;
  try {
    while (Date.now() < deadline) {
      const btn = (await msg.awaitMessageComponent({
        componentType: ComponentType.Button,
        time: Math.max(1_000, deadline - Date.now()),
        filter: (i: ButtonInteraction) =>
          allowed.has(i.user.id) && i.customId.startsWith(`yuki-invest:${instanceId}:${clue.id}:`),
      })) as ButtonInteraction;
      const [, , , actionKind, pick] = btn.customId.split(":");
      if (!actionKind || !pick) {
          await btn.reply({ content: "Ação de investigação inválida.", ephemeral: true });
        continue;
      }
      state = ensureState((await getInstance(instanceId))?.stateJson ?? "{}");
      const progress = progressFor(state, clue);
      let result: string | undefined;

      if (actionKind === "memory") {
        if (!memory || memory.phase !== "repeat") {
          await btn.reply({ content: "Não há um desafio aguardando resposta.", ephemeral: true });
          continue;
        }
        if (btn.user.id !== memory.ownerId) {
          await btn.reply({ content: `Este desafio pertence a <@${memory.ownerId}>.`, ephemeral: true });
          continue;
        }
        const selected = Number(pick);
        if (!Number.isInteger(selected) || selected < 0 || selected >= memory.words.length) {
          await btn.reply({ content: "Palavra inválida.", ephemeral: true });
          continue;
        }
        const actionId = memory.actionId;
        const actionNumber = clue.investigation.actions.findIndex((candidate) => candidate.id === actionId) + 1;
        const memoryResult = evaluateMemoryChoice(memory.sequence, memory.position, selected);
        if (memoryResult === "wrong") {
          const failures = (progress.failedAttempts[actionId] ?? 0) + 1;
          progress.failedAttempts[actionId] = failures;
          memory = undefined;
          if (failures >= MEMORY_MAX_ATTEMPTS) {
            progress.lostEvidence.push(actionId);
            progress.attemptUsers[actionId] = btn.user.id;
            progress.contributors[actionId] = btn.user.username;
            progress.investigators[btn.user.id] = btn.user.username;
            progress.votes = {};
            progress.voters = {};
            result = `❌ **${btn.user.username}** errou pela segunda vez. A pista ${actionNumber} foi perdida.`;
            if (evidenceReady(clue, progress)) page = clue.investigation.actions.length;
          } else {
            result = `⚠️ **${btn.user.username}** errou a sequência da pista ${actionNumber}. Ainda resta uma tentativa.`;
          }
          await setState(instanceId, state);
          await btn.update(v2Edit(cluePanel(instanceId, state, clue, members, page, result)));
          continue;
        }
        memory.position += 1;
        if (memoryResult === "next") {
          await btn.update(v2Edit(cluePanel(instanceId, state, clue, members, page, undefined, false, memory)));
          continue;
        }
        progress.evidence.push(actionId);
        progress.evidenceUsers[actionId] = btn.user.id;
        progress.attemptUsers[actionId] = btn.user.id;
        progress.contributors[actionId] = btn.user.username;
        progress.investigators[btn.user.id] = btn.user.username;
        progress.votes = {};
        progress.voters = {};
        memory = undefined;
        result = `**${btn.user.username}** repetiu a sequência e desvendou a pista ${actionNumber}.`;
        if (evidenceReady(clue, progress)) page = clue.investigation.actions.length;
        await setState(instanceId, state);
        await btn.update(v2Edit(cluePanel(instanceId, state, clue, members, page, result)));
        continue;
      }

      if (actionKind === "page") {
        const requestedPage = Number(pick);
        if (!Number.isInteger(requestedPage) || requestedPage < 0 || requestedPage > clue.investigation.actions.length) {
          await btn.reply({ content: "Página de investigação inválida.", ephemeral: true });
          continue;
        }
        page = requestedPage;
        await btn.update(v2Edit(cluePanel(instanceId, state, clue, members, page)));
        continue;
      }

      if (actionKind === "evidence") {
        const action = clue.investigation.actions.find((candidate) => candidate.id === pick);
        if (!action) {
          await btn.reply({ content: "Essa evidência não existe nesta cena.", ephemeral: true });
          continue;
        }
        if (progress.evidence.includes(pick) || progress.lostEvidence.includes(pick)) {
          await btn.reply({ content: "Essa pista já foi concluída. Escolha outra página.", ephemeral: true });
          continue;
        }
        const permission = canUncoverClue(btn.user.id, members, progress.attemptUsers, clue.investigation.actions.length);
        if (!permission.ok) {
          await btn.reply({ content: permission.reason, ephemeral: true });
          continue;
        }
        const challenge: InvestigationMemoryView = {
          ownerId: btn.user.id,
          actionId: pick,
          phase: "prepare",
          words: [...clue.investigation.memoryWords],
          sequence: createMemorySequence(clue.investigation.memoryWords.length),
          position: 0,
          countdown: MEMORY_PREPARE_SECONDS,
          displayPosition: 0,
        };
        memory = challenge;
        await btn.update(v2Edit(cluePanel(instanceId, state, clue, members, page, undefined, false, challenge)));
        for (let count = MEMORY_PREPARE_SECONDS - 1; count >= 1; count -= 1) {
          await new Promise<void>((resolve) => setTimeout(resolve, 1_000));
          challenge.countdown = count;
          await msg.edit(v2Edit(cluePanel(instanceId, state, clue, members, page, undefined, false, challenge)));
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 1_000));
        challenge.phase = "memorize";
        for (let position = 0; position < challenge.sequence.length; position += 1) {
          challenge.displayPosition = position;
          await msg.edit(v2Edit(cluePanel(instanceId, state, clue, members, page, undefined, false, challenge)));
          await new Promise<void>((resolve) => setTimeout(resolve, MEMORY_WORD_DISPLAY_MS));
        }
        challenge.phase = "repeat";
        await msg.edit(v2Edit(cluePanel(instanceId, state, clue, members, page, undefined, false, challenge)));
        continue;
      }

      if (actionKind === "clear") {
        delete progress.votes[btn.user.id];
        delete progress.voters[btn.user.id];
        result = `**${btn.user.username}** limpou o próprio voto.`;
        await setState(instanceId, state);
        await btn.update(v2Edit(cluePanel(instanceId, state, clue, members, page, result)));
        continue;
      }

      if (actionKind === "submit") {
        const consensus = consensusPick(progress, quorumSize(allowed));
        if (!consensus) {
          await btn.reply({ content: "Ainda não há consenso. Em party com 2+ pessoas, pelo menos dois membros precisam votar na mesma tese.", ephemeral: true });
          continue;
        }
        if (consensus === clue.investigation.correct) {
          state.clues![clue.id] = true;
          state.runningClue = null;
          result = `**Tese enviada e confirmada.** ${clue.investigation.success}`;
          await markObjective(instanceId, clue.objectiveId);
          if (allCluesDone(state)) {
            state.stage = "FINAL_TALK";
            await markObjective(instanceId, "decifrar_padrao_yuki");
            result += `\n\nAs quatro pistas apontam para uma armadilha política. Confronte Hakuo no Centro Comercial de Kirigakure: <#${CENTRO_COMERCIAL_KIRI_CHANNEL_ID}>.`;
          }
          await setState(instanceId, state);
          await btn.update(v2Edit(cluePanel(instanceId, state, clue, members, page, result, true)));
          return;
        }

        state.mistakes = (state.mistakes ?? 0) + 1;
        progress.votes = {};
        progress.voters = {};
        result = "**Tese enviada, mas rejeitada pelos fatos.** A conclusão não fecha com o quadro; revisem os votos antes de enviar de novo.";
        if ((state.mistakes ?? 0) >= YUKI_MAX_MISTAKES) {
          state.runningClue = null;
          await prisma.missionInstance.update({ where: { id: instanceId }, data: { status: "FAILED", stateJson: JSON.stringify(state) } });
          await btn.update(v2Edit(cluePanel(instanceId, state, clue, members, page, "❌ Caso perdido: erros demais destruíram as pistas e a facção por trás de Hakuo sumiu.", true)));
          return;
        }
        await setState(instanceId, state);
        await btn.update(v2Edit(cluePanel(instanceId, state, clue, members, page, result)));
        continue;
      }

      if (actionKind !== "deduce") {
        await btn.reply({ content: "Ação de investigação inválida.", ephemeral: true });
        continue;
      }
      const progressReady = evidenceReady(clue, progress);
      if (!progressReady) {
        await btn.reply({ content: "Ainda faltam evidências ou participação da equipe para fechar uma tese.", ephemeral: true });
        continue;
      }
      progress.votes[btn.user.id] = pick;
      progress.voters[btn.user.id] = btn.user.username;
      const consensus = consensusPick(progress, quorumSize(allowed));
      result = consensus
        ? `**${btn.user.username}** votou. Há consenso; use **Enviar tese** para registrar a resposta final.`
        : `**${btn.user.username}** votou. A equipe ainda precisa chegar ao mesmo entendimento.`;
      await setState(instanceId, state);
      await btn.update(v2Edit(cluePanel(instanceId, state, clue, members, page, result)));
    }
  } catch {
    state.runningClue = null;
    await setState(instanceId, state);
    await msg.edit(v2Edit(cluePanel(instanceId, state, clue, members, page, "A cena esfriou, mas o quadro foi preservado.", true))).catch(() => undefined);
    await sendMissionNotice(channel, pausedMissionNotice("O painel foi preservado, mas esta sessão de análise expirou."));
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

async function startYukiCombatFromActor(
  channel: TextBasedChannel | null,
  channelId: string,
  guildId: string,
  actor: { id: string; username: string },
  instanceId: string,
  def: YukiHeirContext["def"],
): Promise<void> {
  if (await getActiveSession(channelId)) return;
  const char = await getOrCreateCharacter(actor.id, guildId, actor.username);
  const party = await gatherPartyPlayers(channel, guildId, starterFrom(char));
  const players = party.players.slice(0, RANK_B_PARTY_MAX);
  const session = await startCombat({
    channelId,
    guildId,
    scenarioId: String(def.data?.finalScenarioId ?? "yuki_mirror_field"),
    players,
    npcs: [
      { templateId: String(def.data?.bossTemplate ?? "yuki_heir_hakuo") },
      ...Array.from({ length: Number(def.data?.cloneCount ?? 2) }, () => ({ templateId: String(def.data?.cloneTemplate ?? "yuki_ice_clone") })),
    ],
    missionInstanceId: instanceId,
  });
  await cacheAttrs(session, party.attrsById);
  if (channel && "send" in channel) {
    await channel.send(`Hakuo ergue espelhos de gelo e dois clones surgem na névoa. ${players.length} ninja(s) entram no combate. Use \`/mapa\`.`);
  }
}

async function startYukiCombat(interaction: ChatInputCommandInteraction, ctx: YukiHeirContext): Promise<void> {
  await startYukiCombatFromActor(
    interaction.channel,
    interaction.channelId,
    interaction.guildId ?? "global",
    interaction.user,
    ctx.inst.id,
    ctx.def,
  );
}

export async function onYukiHeirCombatWon(interaction: ChatInputCommandInteraction, instanceId: string): Promise<void> {
  const inst = await getInstance(instanceId);
  if (!inst || inst.status !== "ACTIVE") return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "YUKI_HEIR") return;
  const state = ensureState(inst.stateJson);
  state.stage = "RETURN";
  state.combatStarted = false;
  state.activeNpc = null;
  await markObjective(inst.id, "derrotar_herdeiro_yuki");
  await markObjective(inst.id, "libertar_refens_espelhos");
  await setState(inst.id, state);
  await interaction.followUp(`Hakuo foi contido e os reféns foram libertados dos espelhos. Volte para a mansão da sua vila: <#${originChannel(state)}>.`);
}

