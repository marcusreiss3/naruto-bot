import type {
  ChatInputCommandInteraction,
  Message,
  TextBasedChannel,
} from "discord.js";
import { prisma } from "../../db/client.js";
import { getMission } from "../../data/missions/index.js";
import { getOrCreateCharacter } from "../characters/character-service.js";
import { getActiveSession, startCombat } from "../combat/combat-engine.js";
import { sendAsPersona } from "../discord/persona-webhook.js";
import { getPersona } from "../npc-ai/personas.js";
import { partyMemberIds } from "../party/party-service.js";
import type { RenderEntity } from "../maps/renderer.js";
import { gatherPartyPlayers, cacheAttrs, type StarterChar } from "./combat-party.js";
import {
  buildMissionCompleteEmbed,
  completeMission,
  getActiveEscortInstance,
  getInstance,
  markObjective,
  readState,
  setState,
} from "./mission-service.js";

// ---------------------------------------------------------------------------
// Estado da missão de escolta (rank C). Etapas:
//   MEET        - rota de Konoha: apresentação do comerciante (/interagir npc)
//   LOG_FIGHT   - rota de Konoha: combate contra o tronco que bloqueia a estrada
//   AFTER_LOG   - rota de Konoha: comerciante agradece e manda ir ao deserto
//   TO_DESERT   - aguardando o /mapa no deserto
//   DESERT_TALK - deserto: conversa antes da emboscada
//   BANDIT_FIGHT- deserto: combate contra o bandido do deserto
//   AFTER_BANDIT- deserto: comerciante agradece; depois narra a chegada a Suna
//   DONE        - missão concluída
// ---------------------------------------------------------------------------
export interface EscortState {
  stage?:
    | "MEET"
    | "LOG_FIGHT"
    | "AFTER_LOG"
    | "TO_DESERT"
    | "DESERT_TALK"
    | "BANDIT_FIGHT"
    | "AFTER_BANDIT"
    | "DONE";
  talk?: number; // nº de interações dentro da etapa de diálogo atual
}

const PERSONA_KEY = "cloth_merchant";
const MERCHANT_NAME = "Comerciante de Tecidos";
const KONOHA_SCENARIO = "rota_comercial_konoha";
const DESERT_SCENARIO = "deserto";

// etapas em que se pode conversar com o comerciante (e em qual canal)
const TALK_STAGES = new Set(["MEET", "AFTER_LOG", "DESERT_TALK", "AFTER_BANDIT"]);

// Falas roteirizadas do comerciante por beat (funcionam sem Groq).
const LINES = {
  intro: [
    "- Ah, graças aos céus, os ninjas chegaram! Sou eu quem contratou a escolta.\n**O comerciante se levanta da carroça e cumprimenta vocês.**",
  ],
  meetFiller: [
    "- Estou levando tecidos para Sunagakure — são panos valiosos, dá pra comprar uma casa com eles!\n**Ele dá um tapinha orgulhoso nos fardos cobertos.**",
  ],
  logWarn: [
    "- Esperem! Tem um tronco enorme atravessado na estrada... isso não estava aí antes.\n**O comerciante recua, apontando para o caminho bloqueado.**",
  ],
  logThanks: [
    "- Ufa! Vocês são fortes mesmo. Esse tronco ia atrasar tudo!\n**Ele enxuga o suor, aliviado, e volta para a carroça.**",
  ],
  goDesert: [
    "- Obrigado de novo. Agora é seguir em frente — o caminho corta pelo deserto até Suna.\n**O comerciante puxa as rédeas e aponta para o horizonte de areia.**",
  ],
  desertIntro: [
    "- Que viagem tranquila até aqui, hein? Quase bom demais...\n**O comerciante olha as dunas, um pouco desconfiado.**",
  ],
  desertFiller: [
    "- O sol castiga, mas estamos quase lá. Já sinto o cheiro do mercado de Suna!\n**Ele bebe um gole d'água e sorri nervoso.**",
  ],
  banditAmbush: [
    "- C-cuidado! Um bandido! Eu sabia que era bom demais!\n**O comerciante se esconde atrás da carroça, apavorado.**",
  ],
  banditThanks: [
    "- Vocês... vocês salvaram a minha vida! Eu jamais conseguiria sozinho.\n**O comerciante aperta as mãos de vocês, com os olhos marejados.**",
  ],
  afterBanditFiller: [
    "- Olhem ali na frente... aquelas bandeiras são de Sunagakure!\n**Ele aponta animado para as muralhas que despontam na areia.**",
  ],
};

export interface EscortContext {
  inst: NonNullable<Awaited<ReturnType<typeof getInstance>>>;
  def: NonNullable<ReturnType<typeof getMission>>;
  ownerCharId: string;
}

function ensureState(raw: string): EscortState {
  const s = readState<EscortState>(raw);
  s.stage = s.stage ?? "MEET";
  s.talk = s.talk ?? 0;
  return s;
}

function desertChannelId(def: EscortContext["def"]): string {
  return String(def.data?.desertChannelId ?? "");
}

// Canal esperado para uma etapa de diálogo.
function talkChannelFor(stage: EscortState["stage"], def: EscortContext["def"]): string {
  if (stage === "MEET" || stage === "AFTER_LOG") return def.channelId;
  return desertChannelId(def); // DESERT_TALK / AFTER_BANDIT
}

// Acha a missão de escolta do usuário (própria ou de um membro da party).
export async function resolveEscort(
  discordId: string,
  guildId: string,
): Promise<EscortContext | null> {
  const own = await prisma.userCharacter.findUnique({
    where: { discordId_guildId: { discordId, guildId } },
    select: { id: true },
  });
  if (own) {
    const c = await getActiveEscortInstance(own.id);
    if (c) return { inst: c.inst, def: c.def, ownerCharId: own.id };
  }
  for (const did of await partyMemberIds(guildId, discordId)) {
    if (did === discordId) continue;
    const uc = await prisma.userCharacter.findUnique({
      where: { discordId_guildId: { discordId: did, guildId } },
      select: { id: true },
    });
    if (!uc) continue;
    const c = await getActiveEscortInstance(uc.id);
    if (c) return { inst: c.inst, def: c.def, ownerCharId: uc.id };
  }
  return null;
}

// NPC do comerciante para o autocomplete do /interagir (só durante etapas de fala).
export function availableEscortNpcs(state: EscortState): { name: string; value: string }[] {
  return TALK_STAGES.has(state.stage ?? "MEET")
    ? [{ name: MERCHANT_NAME, value: "comerciante" }]
    : [];
}

// Entidade do comerciante no /mapa.
function merchantEntity(cell: string): RenderEntity {
  return { cell, name: MERCHANT_NAME, label: "Com", color: "#27ae60", kind: "NPC", imageFile: "npcs/cloth-merchant.png" };
}

// ---------------------------------------------------------------------------
// Helpers de envio
// ---------------------------------------------------------------------------
async function merchantSpeak(channel: TextBasedChannel | null, lines: string[]): Promise<void> {
  const persona = getPersona(PERSONA_KEY);
  const ok = await sendAsPersona(channel, {
    key: PERSONA_KEY,
    name: persona?.displayName ?? MERCHANT_NAME,
    avatarFile: persona?.avatarFile,
    lines,
  });
  if (!ok) await sysSend(channel, `🗣️ **${MERCHANT_NAME}:**\n${lines.join("\n")}`);
}

async function sysSend(channel: TextBasedChannel | null, content: string): Promise<void> {
  if (content.trim() && channel && "send" in channel) {
    await channel.send(content.slice(0, 1900));
  }
}

function starterFrom(char: Awaited<ReturnType<typeof getOrCreateCharacter>>): StarterChar {
  return {
    charId: char.id,
    name: char.name,
    hpCurrent: char.hpCurrent,
    hpMax: char.hpMax,
    chakra: char.resources!.chakra,
    energia: char.resources!.energia,
    jutsuIds: char.jutsus.map((j) => j.jutsuId),
    attrs: {
      ninjutsu: char.attributes!.ninjutsu,
      iryo: char.attributes!.iryo,
      taijutsu: char.attributes!.taijutsu,
      genjutsu: char.attributes!.genjutsu,
      kenjutsu: char.attributes!.kenjutsu,
    },
  };
}

// Inicia um combate da escolta (tronco ou bandido) trazendo a party junto.
async function startEscortCombat(
  channel: TextBasedChannel | null,
  channelId: string,
  guildId: string,
  char: Awaited<ReturnType<typeof getOrCreateCharacter>>,
  instanceId: string,
  scenarioId: string,
  templateId: string,
): Promise<void> {
  if (await getActiveSession(channelId)) return; // já há combate ativo aqui
  const { players, attrsById } = await gatherPartyPlayers(channel, guildId, starterFrom(char));
  const session = await startCombat({
    channelId,
    guildId,
    scenarioId,
    players,
    npcs: [{ templateId }],
    missionInstanceId: instanceId,
  });
  await cacheAttrs(session, attrsById);
}

// ---------------------------------------------------------------------------
// Núcleo: uma interação com o comerciante (via /interagir ou mensagem normal).
// Conduz a fala e dispara transições/combates conforme a etapa.
// ---------------------------------------------------------------------------
async function escortDialogue(
  channel: TextBasedChannel | null,
  guildId: string,
  ctx: EscortContext,
  char: Awaited<ReturnType<typeof getOrCreateCharacter>>,
): Promise<void> {
  const inst = await getInstance(ctx.inst.id);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "ESCORT") return;
  const state = ensureState(inst.stateJson);
  const data = def.data ?? {};

  state.talk = (state.talk ?? 0) + 1;
  const t = state.talk;

  switch (state.stage) {
    case "MEET": {
      const meetTalks = Number(data.meetTalks ?? 3);
      if (t === 1) {
        await markObjective(inst.id, "encontrar_comerciante");
        await merchantSpeak(channel, LINES.intro);
      }
      if (t >= meetTalks) {
        await merchantSpeak(channel, LINES.logWarn);
        state.stage = "LOG_FIGHT";
        state.talk = 0;
        await setState(inst.id, state);
        await startEscortCombat(
          channel,
          def.channelId,
          guildId,
          char,
          inst.id,
          KONOHA_SCENARIO,
          String(data.logTemplate ?? "tronco"),
        );
        await sysSend(channel, "🪵 **Um tronco enorme bloqueia a estrada!** Movam-se até ele e ataquem com `/jutsu`. Use `/mapa`.");
        return;
      }
      if (t > 1) await merchantSpeak(channel, LINES.meetFiller);
      await setState(inst.id, state);
      return;
    }

    case "AFTER_LOG": {
      const afterLogTalks = Number(data.afterLogTalks ?? 1);
      if (t >= afterLogTalks) {
        await merchantSpeak(channel, LINES.goDesert);
        state.stage = "TO_DESERT";
        state.talk = 0;
        await setState(inst.id, state);
        await sysSend(channel, `🏜️ Sigam para o **Deserto** e usem \`/mapa\` lá: <#${desertChannelId(def)}>`);
        return;
      }
      await setState(inst.id, state);
      return;
    }

    case "DESERT_TALK": {
      const desertTalks = Number(data.desertTalks ?? 3);
      if (t >= desertTalks) {
        await merchantSpeak(channel, LINES.banditAmbush);
        state.stage = "BANDIT_FIGHT";
        state.talk = 0;
        await setState(inst.id, state);
        await startEscortCombat(
          channel,
          desertChannelId(def),
          guildId,
          char,
          inst.id,
          DESERT_SCENARIO,
          String(data.banditTemplate ?? "escort_bandit"),
        );
        await sysSend(channel, "⚔️ **Um bandido do deserto emboscou a caravana!** Protejam o comerciante. Use `/mapa`.");
        return;
      }
      await merchantSpeak(channel, LINES.desertFiller);
      await setState(inst.id, state);
      return;
    }

    case "AFTER_BANDIT": {
      const afterBanditTalks = Number(data.afterBanditTalks ?? 2);
      if (t >= afterBanditTalks) {
        await markObjective(inst.id, "escoltar_suna");
        state.stage = "DONE";
        await setState(inst.id, state);
        await sysSend(
          channel,
          "📜 **A caravana cruza as últimas dunas e chega à rota comercial de Sunagakure.** O comerciante se despede agradecido, com seus tecidos a salvo.",
        );
        const result = await completeMission(inst.charId, inst.missionId);
        if (result && channel && "send" in channel) {
          await channel.send({ embeds: [buildMissionCompleteEmbed(def.name, result.rewards)] });
        }
        return;
      }
      await merchantSpeak(channel, LINES.afterBanditFiller);
      await setState(inst.id, state);
      return;
    }

    default:
      return; // etapa sem diálogo (combate / espera)
  }
}

// ---------------------------------------------------------------------------
// /interagir npc (comerciante)
// ---------------------------------------------------------------------------
export async function interactEscort(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId ?? "global";
  const ctx = await resolveEscort(interaction.user.id, guildId);
  if (!ctx) {
    await interaction.reply({ content: "❌ Você (ou sua party) não tem a missão de escolta ativa.", ephemeral: true });
    return;
  }
  const state = ensureState(ctx.inst.stateJson);
  if (!TALK_STAGES.has(state.stage ?? "MEET")) {
    const hint =
      state.stage === "LOG_FIGHT" || state.stage === "BANDIT_FIGHT"
        ? "O combate está rolando — use `/mapa` e `/jutsu`."
        : state.stage === "TO_DESERT"
          ? `Sigam para o **Deserto** e usem \`/mapa\` lá: <#${desertChannelId(ctx.def)}>`
          : "Não há nada para conversar agora.";
    await interaction.reply({ content: `❌ ${hint}`, ephemeral: true });
    return;
  }
  const expected = talkChannelFor(state.stage, ctx.def);
  if (interaction.channelId !== expected) {
    await interaction.reply({ content: `❌ O comerciante está em <#${expected}>.`, ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const char = await getOrCreateCharacter(interaction.user.id, guildId, interaction.user.username);
  await escortDialogue(interaction.channel, guildId, ctx, char);
  await interaction.editReply(
    `💬 Você conversa com **${MERCHANT_NAME}**. Continue pelas mensagens normais no canal.`,
  );
}

// ---------------------------------------------------------------------------
// Mensagem normal no canal continua a conversa. Retorna true se tratou.
// ---------------------------------------------------------------------------
export async function continueEscortMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.guildId) return false;
  const ctx = await resolveEscort(message.author.id, message.guildId);
  if (!ctx) return false;
  const state = ensureState(ctx.inst.stateJson);
  if (!TALK_STAGES.has(state.stage ?? "MEET")) return false;
  if (message.channelId !== talkChannelFor(state.stage, ctx.def)) return false;
  const char = await getOrCreateCharacter(message.author.id, message.guildId, message.author.username);
  await escortDialogue(message.channel, message.guildId, ctx, char);
  return true;
}

// ---------------------------------------------------------------------------
// Integração com /mapa. Retorna a nota de missão (ou null se o canal não faz
// parte da escolta). Pode empilhar a entidade do comerciante e disparar a
// transição de chegada ao deserto.
// ---------------------------------------------------------------------------
export async function escortMapHandle(
  interaction: ChatInputCommandInteraction,
  ctx: EscortContext,
  channelId: string,
  entities: RenderEntity[],
): Promise<string | null> {
  const state = ensureState(ctx.inst.stateJson);
  const stage = state.stage ?? "MEET";
  const name = ctx.def.name;
  const desertId = desertChannelId(ctx.def);

  if (channelId === ctx.def.channelId) {
    // rota comercial de Konoha
    if (stage === "MEET") {
      entities.push(merchantEntity("B7"));
      return `\n🎯 **${name}** — fale com o comerciante usando \`/interagir npc\`.`;
    }
    if (stage === "AFTER_LOG") {
      entities.push(merchantEntity("B7"));
      return `\n🎯 **${name}** — fale com o comerciante (\`/interagir npc\`) para seguir viagem.`;
    }
    if (stage === "LOG_FIGHT") return `\n🎯 **${name}** — o tronco bloqueia a estrada! Use \`/mapa\` e \`/jutsu\`.`;
    return `\n🎯 **${name}** — sigam para o **Deserto**: <#${desertId}>`;
  }

  if (channelId === desertId) {
    // deserto
    if (stage === "TO_DESERT") {
      // chegada ao deserto: libera a conversa e o comerciante comenta a viagem
      await markObjective(ctx.inst.id, "chegar_deserto");
      state.stage = "DESERT_TALK";
      state.talk = 0;
      await setState(ctx.inst.id, state);
      entities.push(merchantEntity("C8"));
      await merchantSpeak(interaction.channel, LINES.desertIntro);
      return `\n🎯 **${name}** — vocês chegaram ao deserto. Fale com o comerciante (\`/interagir npc\`).`;
    }
    if (stage === "DESERT_TALK") {
      entities.push(merchantEntity("C8"));
      return `\n🎯 **${name}** — converse com o comerciante (\`/interagir npc\`).`;
    }
    if (stage === "AFTER_BANDIT") {
      entities.push(merchantEntity("C8"));
      return `\n🎯 **${name}** — fale com o comerciante (\`/interagir npc\`).`;
    }
    if (stage === "BANDIT_FIGHT") return `\n🎯 **${name}** — o bandido ataca! Use \`/mapa\` e \`/jutsu\`.`;
    if (stage === "DONE") return `\n🎯 **${name}** — escolta concluída. 🎉`;
    return `\n🎯 **${name}** — ainda não é hora de cruzar o deserto.`;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Vitória num combate da escolta: avança a etapa (não conclui a missão).
// Chamado por mission-runtime.onCombatEnded.
// ---------------------------------------------------------------------------
export async function onEscortCombatWon(
  interaction: ChatInputCommandInteraction,
  instanceId: string,
): Promise<void> {
  const inst = await getInstance(instanceId);
  if (!inst) return;
  const state = ensureState(inst.stateJson);

  if (state.stage === "LOG_FIGHT") {
    await markObjective(inst.id, "derrotar_tronco");
    state.stage = "AFTER_LOG";
    state.talk = 0;
    await setState(inst.id, state);
    await merchantSpeak(interaction.channel, LINES.logThanks);
    await interaction.followUp("🎯 Fale com o comerciante (`/interagir npc`) para continuar a viagem.");
    return;
  }

  if (state.stage === "BANDIT_FIGHT") {
    await markObjective(inst.id, "derrotar_bandido");
    state.stage = "AFTER_BANDIT";
    state.talk = 0;
    await setState(inst.id, state);
    await merchantSpeak(interaction.channel, LINES.banditThanks);
    await interaction.followUp("🎯 Fale com o comerciante (`/interagir npc`) para encerrar a escolta.");
    return;
  }
}
