// Aprendizado narrativo dos 5 estilos de luta (FIGHTING_STYLES em config/
// enums.ts): um mestre fixo por local no mapa, convite por IA (webhook) com
// botao Aceitar/Recusar, reunir ryo + itens reais de inventario, combate
// final contra o mestre e, ao vencer, setFightingStyle() libera a arvore.
//
// Os 5 MissionDef (mesmo type "MESTRE_ESTILO") ficam em data/missions/index.ts;
// aqui mora so' a logica, espelhando o padrao de purse-thief.ts.
import {
  ButtonStyle,
  ComponentType,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Message,
  type TextBasedChannel,
} from "discord.js";
import { prisma } from "../../db/client.js";
import { getMission } from "../../data/missions/index.js";
import { FIGHTING_STYLE_LABELS } from "../../config/enums.js";
import type { MissionDef } from "../../data/types.js";
import { getItem } from "../../data/items.js";
import {
  attrsFromRow,
  canLearnFightingStyle,
  getOrCreateCharacter,
  setFightingStyle,
} from "../characters/character-service.js";
import { getInventoryQty, removeInventoryItem } from "../characters/inventory.js";
import { spendCharacterRyo } from "../economy/character-economy.js";
import { EconomyError } from "../economy/errors.js";
import { getActiveSession, startCombat } from "../combat/combat-engine.js";
import { NpcAiService } from "../npc-ai/npc-ai-service.js";
import { getPersona } from "../npc-ai/personas.js";
import { sendAsPersona, formatPersonaLines } from "../discord/persona-webhook.js";
import { gatherPartyPlayers, cacheAttrs } from "./combat-party.js";
import {
  assignMission,
  buildMissionCompleteEmbed,
  completeMission,
  getInstance,
  markObjective,
  readState,
  setState,
} from "./mission-service.js";
import type { RenderEntity } from "../maps/renderer.js";
import { dataOf, type MestreEstiloData, type MestreEstiloState } from "./mestre-estilo-types.js";
import {
  acceptedCard,
  closedInviteCard,
  combatStartCard,
  declinedCard,
  inviteCard,
  stillMissingCard,
} from "../../ui/mestre-estilo-container.js";
import { button, buttonRow, v2Public } from "../../ui/economy-components-v2.js";

export { dataOf, type MestreEstiloData, type MestreEstiloState };

interface MasterInfo {
  npcKey: string;
  missionId: string;
  name: string;
  cell: string;
  color: string;
}

// Um mestre por estilo, cada um num local diferente do mapa (ver data/missions/index.ts).
const MASTERS: MasterInfo[] = [
  { npcKey: "mestre_kaen", missionId: "mestre_punho_forte", name: "Kaen", cell: "C5", color: "#c0392b" },
  { npcKey: "mestre_suzu", missionId: "mestre_punho_adamantino", name: "Suzu", cell: "C5", color: "#16a085" },
  { npcKey: "mestre_bantou", missionId: "mestre_punho_arhat", name: "Bantou", cell: "C5", color: "#7f8c8d" },
  { npcKey: "mestre_souta", missionId: "mestre_taijutsu_agitacao", name: "Souta", cell: "C5", color: "#e67e22" },
  { npcKey: "mestre_mizuo", missionId: "mestre_assassinato_silencioso", name: "Mizuo", cell: "C5", color: "#2980b9" },
];
const MASTER_BY_NPC = new Map(MASTERS.map((m) => [m.npcKey, m]));

function masterByChannel(channelId: string): MasterInfo | null {
  for (const m of MASTERS) {
    const def = getMission(m.missionId);
    if (def && dataOf(def).channelId === channelId) return m;
  }
  return null;
}

function ensureState(raw: string): MestreEstiloState {
  const state = readState<MestreEstiloState>(raw);
  state.stage = state.stage ?? "INTRO";
  state.talk = state.talk ?? 0;
  return state;
}

// ---------------- Mapa: mestre sempre visivel no local, ative ou nao a missao ----------------

export function mestreEstiloStaticEntities(channelId: string): RenderEntity[] {
  const master = masterByChannel(channelId);
  if (!master) return [];
  return [
    {
      cell: master.cell,
      name: master.name,
      label: master.name.slice(0, 3),
      color: master.color,
      kind: "NPC",
    },
  ];
}

// ---------------- /interagir: autocomplete ----------------

export interface MestreNpcChoice {
  key: string;
  name: string;
}

// Mostra o mestre do canal atual se: ja' existe conversa ativa com ele, OU o
// jogador ainda pode comecar (canLearnFightingStyle). Diferente do padrao das
// outras ~40 missoes (que so' aparecem com instancia ja ativa), aqui a
// primeira conversa E' o que cria a instancia.
export async function availableMestreEstiloNpcs(
  discordId: string,
  guildId: string,
  channelId: string,
): Promise<MestreNpcChoice[]> {
  const master = masterByChannel(channelId);
  if (!master) return [];
  const char = await prisma.userCharacter.findUnique({
    where: { discordId_guildId: { discordId, guildId } },
    select: { id: true },
  });
  if (!char) return [];

  const active = await prisma.missionInstance.findFirst({
    where: { charId: char.id, missionId: master.missionId, status: "ACTIVE" },
    select: { id: true },
  });
  if (active) return [{ key: master.npcKey, name: master.name }];

  const def = getMission(master.missionId);
  if (!def) return [];
  const perm = await canLearnFightingStyle(char.id, dataOf(def).style);
  return perm.ok ? [{ key: master.npcKey, name: master.name }] : [];
}

// ---------------- /interagir: conversa ----------------

export async function interactMestreEstilo(
  interaction: ChatInputCommandInteraction,
  npcKey: string,
): Promise<void> {
  const master = MASTER_BY_NPC.get(npcKey);
  const def = master ? getMission(master.missionId) : undefined;
  if (!master || !def) {
    await interaction.reply({ content: "Esse mestre não está disponível.", ephemeral: true });
    return;
  }
  const data = dataOf(def);
  if (interaction.channelId !== data.channelId) {
    await interaction.reply({ content: `Fale com ${master.name} no local certo do mapa.`, ephemeral: true });
    return;
  }

  const guildId = interaction.guildId ?? "global";
  const char = await getOrCreateCharacter(interaction.user.id, guildId, interaction.user.username);

  let inst = await prisma.missionInstance.findFirst({
    where: { charId: char.id, missionId: master.missionId, status: "ACTIVE" },
  });

  if (!inst) {
    const perm = await canLearnFightingStyle(char.id, data.style);
    if (!perm.ok) {
      await interaction.reply({ content: perm.error ?? "Você não pode aprender esse estilo agora.", ephemeral: true });
      return;
    }
    const assigned = await assignMission(char.id, master.missionId, { stage: "INTRO", talk: 0 });
    if (!assigned.ok) {
      await interaction.reply({ content: assigned.error ?? "Não foi possível começar essa conversa.", ephemeral: true });
      return;
    }
    inst = await prisma.missionInstance.findFirst({
      where: { charId: char.id, missionId: master.missionId, status: "ACTIVE" },
    });
  }
  if (!inst) return;

  await interaction.deferReply({ ephemeral: true });
  await runDialogue({
    channel: interaction.channel,
    channelId: interaction.channelId,
    guildId,
    instanceId: inst.id,
    master,
    def,
    data,
    charId: char.id,
    discordId: interaction.user.id,
    username: interaction.user.username,
    playerMessage: "(o ninja se aproxima para conversar)",
  });
  await interaction.editReply(`Você se aproxima de **${master.name}**. Pode continuar por mensagens normais no canal.`);
}

export async function continueMestreEstiloMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.guildId) return false;
  const master = masterByChannel(message.channelId);
  if (!master) return false;

  const char = await prisma.userCharacter.findUnique({
    where: { discordId_guildId: { discordId: message.author.id, guildId: message.guildId } },
    select: { id: true },
  });
  if (!char) return false;

  const inst = await prisma.missionInstance.findFirst({
    where: { charId: char.id, missionId: master.missionId, status: "ACTIVE" },
  });
  if (!inst) return false;
  const state = ensureState(inst.stateJson);
  // GATHER nao evolui por bate-papo livre: so' o /interagir confere os itens.
  if (state.stage === "GATHER") return false;

  const def = getMission(master.missionId);
  if (!def) return false;

  await runDialogue({
    channel: message.channel,
    channelId: message.channelId,
    guildId: message.guildId,
    instanceId: inst.id,
    master,
    def,
    data: dataOf(def),
    charId: char.id,
    discordId: message.author.id,
    username: message.author.username,
    playerMessage: message.content || "...",
  });
  return true;
}

interface DialogueCtx {
  channel: TextBasedChannel | null;
  channelId: string;
  guildId: string;
  instanceId: string;
  master: MasterInfo;
  def: MissionDef;
  data: MestreEstiloData;
  charId: string;
  discordId: string;
  username: string;
  playerMessage: string;
}

async function runDialogue(o: DialogueCtx): Promise<void> {
  const inst = await getInstance(o.instanceId);
  if (!inst || inst.status !== "ACTIVE") return;
  const state = ensureState(inst.stateJson);

  if (state.stage === "INTRO") return handleIntroTurn(o, state);
  if (state.stage === "GATHER") return handleGatherCheck(o, state);
  if (state.stage === "CHALLENGE") return handleChallengeTurn(o, state);
}

async function speak(o: DialogueCtx, extra: string, fallbackIndex: number): Promise<void> {
  const text = await NpcAiService.say(o.master.npcKey, o.playerMessage, extra, fallbackIndex);
  const persona = getPersona(o.master.npcKey);
  const sent = await sendAsPersona(o.channel, {
    key: o.master.npcKey,
    name: persona?.displayName ?? o.master.name,
    avatarFile: persona?.avatarFile,
    lines: formatPersonaLines(text),
  });
  if (!sent && o.channel && "send" in o.channel) {
    await o.channel.send(text.slice(0, 1900));
  }
}

// ---------------- INTRO: conversa ate' o convite formal ----------------

async function handleIntroTurn(o: DialogueCtx, state: MestreEstiloState): Promise<void> {
  const turn = (state.talk ?? 0) + 1;
  state.talk = turn;
  const introTurns = o.data.introTurns;
  const done = turn >= introTurns;

  await speak(
    o,
    done
      ? "Esta e sua ultima fala antes do convite formal: encerre convidando o jogador pra ser seu aluno."
      : "Converse naturalmente sobre o seu estilo de luta e o que ele exige, mas ainda nao convide formalmente.",
    done ? 2 : Math.min(turn - 1, 1),
  );
  await setState(o.instanceId, state);
  if (!done) return;
  if (!o.channel || !("send" in o.channel)) return;

  // Convite formal vira um carta zinho a parte (nao anexado na fala do
  // webhook): titulo curto + os 2 botoes, cabe sem rolar a tela.
  const buttons = buttonRow(
    button({ id: `mestre:aceitar:${o.instanceId}`, label: "Aceitar", style: ButtonStyle.Success, emojiKey: "sucesso" }),
    button({ id: `mestre:recusar:${o.instanceId}`, label: "Recusar", style: ButtonStyle.Danger, emojiKey: "erro" }),
  );
  const inviteMsg = await o.channel.send(v2Public(inviteCard(o.master.name, FIGHTING_STYLE_LABELS[o.data.style], buttons)));
  void awaitInviteResponse(o, inviteMsg).catch(() => undefined);
}

async function awaitInviteResponse(o: DialogueCtx, inviteMsg: Message): Promise<void> {
  let click: ButtonInteraction;
  try {
    click = (await inviteMsg.awaitMessageComponent({
      componentType: ComponentType.Button,
      time: 10 * 60 * 1000,
      filter: (i) => i.user.id === o.discordId && i.customId.startsWith(`mestre:`) && i.customId.endsWith(`:${o.instanceId}`),
    })) as ButtonInteraction;
  } catch {
    return; // ninguem clicou a tempo — a instancia fica ACTIVE em INTRO, o jogador pode voltar a falar
  }

  const styleLabel = FIGHTING_STYLE_LABELS[o.data.style];
  const accepted = click.customId.startsWith("mestre:aceitar:");
  if (!accepted) {
    await prisma.missionInstance.update({ where: { id: o.instanceId }, data: { status: "FAILED" } });
    await click.update(v2Public(closedInviteCard(o.master.name, styleLabel)));
    if (o.channel && "send" in o.channel) {
      await o.channel.send(v2Public(declinedCard(o.master.name)));
    }
    return;
  }

  const perm = await canLearnFightingStyle(o.charId, o.data.style);
  if (!perm.ok) {
    await click.update(v2Public(closedInviteCard(o.master.name, styleLabel)));
    await click.followUp({ content: perm.error ?? "Você não pode mais aprender esse estilo.", ephemeral: true });
    return;
  }

  await markObjective(o.instanceId, "aceitar_convite");
  const state = ensureState((await getInstance(o.instanceId))!.stateJson);
  state.stage = "GATHER";
  await setState(o.instanceId, state);
  await click.update(v2Public(closedInviteCard(o.master.name, styleLabel)));

  if (o.channel && "send" in o.channel) {
    await o.channel.send(v2Public(await acceptedCard(o.master.name, o.def, o.charId)));
  }
}

// ---------------- GATHER: confere ryo + itens, consome quando completo ----------------

async function handleGatherCheck(o: DialogueCtx, state: MestreEstiloState): Promise<void> {
  const missing: string[] = [];
  for (const it of o.data.costItems) {
    const qty = await getInventoryQty(prisma, o.charId, it.itemId);
    if (qty < it.qty) missing.push(`${it.qty - qty}x ${getItem(it.itemId)?.name ?? it.itemId}`);
  }
  const char = await prisma.userCharacter.findUnique({ where: { id: o.charId }, select: { ryo: true } });
  const missingRyo = Math.max(0, o.data.costRyo - (char?.ryo ?? 0));
  if (missingRyo > 0) missing.push(`${missingRyo} ryo`);

  if (missing.length > 0) {
    await speak(o, `O jogador ainda não trouxe tudo. Cobre educadamente, mencionando que falta: ${missing.join(", ")}.`, 2);
    if (o.channel && "send" in o.channel) {
      await o.channel.send(v2Public(await stillMissingCard(o.def, o.charId)));
    }
    return;
  }

  try {
    await prisma.$transaction(async (tx) => {
      for (const it of o.data.costItems) {
        await removeInventoryItem(tx, o.charId, it.itemId, it.qty);
      }
      await spendCharacterRyo(tx, {
        charId: o.charId,
        amount: o.data.costRyo,
        type: "MESTRE_ESTILO_PAGAMENTO",
        reason: `Pagamento a ${o.master.name} (${o.def.name})`,
      });
    });
  } catch (err) {
    if (err instanceof EconomyError) {
      await speak(o, `O jogador tentou entregar, mas faltou algo no último instante: ${err.message}`, 2);
      return;
    }
    throw err;
  }

  await markObjective(o.instanceId, "reunir_recursos");
  state.stage = "CHALLENGE";
  state.talk = 0;
  await setState(o.instanceId, state);
  await handleChallengeTurn(o, state);
}

// ---------------- CHALLENGE: ultimas falas ate' o combate ----------------

async function handleChallengeTurn(o: DialogueCtx, state: MestreEstiloState): Promise<void> {
  if (await getActiveSession(o.channelId)) {
    if (o.channel && "send" in o.channel) await o.channel.send("O combate já está em andamento. Use `/mapa`.");
    return;
  }

  const turn = (state.talk ?? 0) + 1;
  state.talk = turn;
  const challengeTurns = o.data.challengeTurns;
  const done = turn >= challengeTurns;

  await speak(
    o,
    done
      ? "Esta e sua ultima fala: chame o jogador pro combate final agora, sem mais rodeios."
      : "Reaja a entrega do que foi pedido, elogiando a disposicao do aluno, mas ainda nao inicie o combate.",
    done ? 5 : Math.min(3 + turn - 1, 4),
  );
  await setState(o.instanceId, state);
  if (!done) return;

  await startMasterCombat(o);
}

async function startMasterCombat(o: DialogueCtx): Promise<void> {
  const char = await getOrCreateCharacter(o.discordId, o.guildId, o.username);
  const { players, attrsById } = await gatherPartyPlayers(o.channel, o.guildId, {
    charId: char.id,
    name: char.name,
    level: char.level,
    hpCurrent: char.hpCurrent,
    hpMax: char.hpMax,
    chakra: char.resources?.chakra ?? 100,
    energia: char.resources?.energia ?? 100,
    jutsuIds: char.jutsus.map((j) => j.jutsuId),
    attrs: attrsFromRow(char.attributes ?? {}),
  });

  const session = await startCombat({
    channelId: o.channelId,
    guildId: o.guildId,
    scenarioId: o.data.scenarioId,
    players,
    npcs: [{ templateId: o.master.npcKey }],
    missionInstanceId: o.instanceId,
  });
  await cacheAttrs(session, attrsById);
  if (o.channel && "send" in o.channel) {
    await o.channel.send(v2Public(combatStartCard(o.master.name)));
  }
}

// ---------------- Vitoria: chamado por mission-runtime.ts em onCombatEnded ----------------

export async function onMestreEstiloCombatWon(
  interaction: ChatInputCommandInteraction,
  instanceId: string,
): Promise<void> {
  const inst = await getInstance(instanceId);
  if (!inst || inst.status !== "ACTIVE") return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "MESTRE_ESTILO") return;
  const data = dataOf(def);
  const master = MASTERS.find((m) => m.missionId === def.id);

  await markObjective(inst.id, "vencer_mestre");
  await setFightingStyle(inst.charId, data.style);
  const result = await completeMission(inst.charId, inst.missionId);
  if (result) {
    await interaction.followUp({
      content: `🥋 **${master?.name ?? "O mestre"}** reconhece seu esforço — você aprendeu **${FIGHTING_STYLE_LABELS[data.style]}**! O estilo já aparece no seu \`/perfil\` e a árvore está liberada no site.`,
    });
    // Components V2 nao pode conviver no mesmo payload com `content` — vai
    // como mensagem separada.
    await interaction.followUp(buildMissionCompleteEmbed(def.name, result));
  }
}
