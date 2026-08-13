import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Message,
  type TextBasedChannel,
} from "discord.js";
import { prisma } from "../../db/client.js";
import {
  BECO_KONOHA_CHANNEL_ID,
  FLORESTA_CHANNEL_ID,
  MANSAO_HOKAGE_CHANNEL_ID,
} from "../../data/scenarios/index.js";
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

interface InterceptedCodeVariant {
  id: string;
  villageName: string;
  administrationName: string;
  alleyName: string;
  forestName: string;
  administrationChannelId: string;
  alleyChannelId: string;
  forestChannelId: string;
  forestScenarioId: string;
  cryptanalyst: RegionalNpc;
  contact: RegionalNpc;
  leader: RegionalNpc;
}

const KONOHA_VARIANT: InterceptedCodeVariant = {
  id: "KONOHA",
  villageName: "Konoha",
  administrationName: "Mansao do Hokage",
  alleyName: "Beco de Konoha",
  forestName: "Floresta",
  administrationChannelId: MANSAO_HOKAGE_CHANNEL_ID,
  alleyChannelId: BECO_KONOHA_CHANNEL_ID,
  forestChannelId: FLORESTA_CHANNEL_ID,
  forestScenarioId: "floresta",
  cryptanalyst: {
    key: "intercepted_code_cryptanalyst_konoha",
    name: "Shiori Nara (criptanalista)",
    persona: "intercepted_code_cryptanalyst_konoha",
    imageFile: "npcs/cryptanalyst-shiori.png",
    cell: "C3",
  },
  contact: {
    key: "intercepted_code_contact_konoha",
    name: "Contato Suspeito",
    persona: "intercepted_code_contact_konoha",
    imageFile: "enemies/cipher-contact.png",
    cell: "D5",
  },
  leader: {
    key: "intercepted_code_leader_konoha",
    name: "Chefe do Encontro",
    persona: "intercepted_code_leader_konoha",
    imageFile: "enemies/cipher-criminal-leader.png",
    cell: "D6",
  },
};

const VARIANTS: Record<string, InterceptedCodeVariant> = {
  KONOHA: KONOHA_VARIANT,
};

const CIPHER_SLOTS = [
  ["ENTREGA", "ENCONTRO", "PATRULHA", "FUGA"],
  ["NA FLORESTA", "NO BECO", "NA ROTA", "NO MERCADO"],
  ["SENHA CHUVA", "SENHA LANTERNA", "SENHA CINZAS", "SENHA FERRO"],
  ["AO AMANHECER", "MEIA-NOITE", "AO ANOITECER", "ANTES DO SINO"],
];
const CIPHER_CORRECT = [1, 1, 1, 2];
const CIPHER_TEXT = [
  "`HQFRQWUR`",
  "`QR EHFR`",
  "`VHQKD ODQWHUQD`",
  "`DR DQRLWHFHU`",
].join(" ");

export interface InterceptedCodeState {
  stage?: "BRIEFING" | "DECIPHER" | "CONTACT" | "LEADER_TALK" | "FIGHT" | "RETURN" | "DONE";
  activeNpc?: string | null;
  talks?: Record<string, number>;
  running?: boolean;
  cipherChoices?: number[];
  mistakes?: number;
  combatStarted?: boolean;
  leaderSeen?: boolean;
}

export interface InterceptedCodeChoice {
  key: string;
  name: string;
}

export interface InterceptedCodeContext {
  inst: NonNullable<Awaited<ReturnType<typeof getInstance>>>;
  def: NonNullable<ReturnType<typeof getMission>>;
  ownerCharId: string;
  variant: InterceptedCodeVariant;
}

function variantFor(def: NonNullable<ReturnType<typeof getMission>>): InterceptedCodeVariant {
  return VARIANTS[String(def.data?.variantId ?? "KONOHA")] ?? KONOHA_VARIANT;
}

function ensureState(raw: string): InterceptedCodeState {
  const state = readState<InterceptedCodeState>(raw);
  state.stage = state.stage ?? "BRIEFING";
  state.activeNpc = state.activeNpc ?? null;
  state.talks = state.talks ?? {};
  state.running = state.running ?? false;
  state.cipherChoices = normalizeChoices(state.cipherChoices);
  state.mistakes = state.mistakes ?? 0;
  state.combatStarted = state.combatStarted ?? false;
  state.leaderSeen = state.leaderSeen ?? false;
  return state;
}

function normalizeChoices(choices?: number[]): number[] {
  return CIPHER_SLOTS.map((options, index) => {
    const value = choices?.[index] ?? 0;
    return ((value % options.length) + options.length) % options.length;
  });
}

function turns(
  def: InterceptedCodeContext["def"],
  key: "briefingTurns" | "contactTurns" | "leaderTurns" | "returnTurns",
  fallback: number,
): number {
  return Number(def.data?.[key] ?? fallback);
}

function maxMistakes(def: InterceptedCodeContext["def"]): number {
  return Number(def.data?.maxMistakes ?? 4);
}

function stepTimeout(def: InterceptedCodeContext["def"]): number {
  return Number(def.data?.stepTimeoutMs ?? 90_000);
}

function gruntTemplate(def: InterceptedCodeContext["def"]): string {
  return String(def.data?.gruntTemplate ?? "cipher_criminal");
}

function leaderTemplate(def: InterceptedCodeContext["def"]): string {
  return String(def.data?.leaderTemplate ?? "cipher_criminal_leader");
}

async function findContextByCharId(charId: string, channelId?: string): Promise<InterceptedCodeContext | null> {
  for (const inst of await getActiveMissions(charId)) {
    const def = getMission(inst.missionId);
    if (!def || def.type !== "INTERCEPTED_CODE") continue;
    const variant = variantFor(def);
    const channels = [
      variant.administrationChannelId,
      variant.alleyChannelId,
      variant.forestChannelId,
    ];
    if (channelId && !channels.includes(channelId)) continue;
    return { inst, def, ownerCharId: charId, variant };
  }
  return null;
}

export async function resolveInterceptedCode(
  discordId: string,
  guildId: string,
  channelId?: string,
): Promise<InterceptedCodeContext | null> {
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

export function availableInterceptedCodeNpcs(
  state: InterceptedCodeState,
  channelId: string,
  variant: InterceptedCodeVariant,
): InterceptedCodeChoice[] {
  if (channelId === variant.administrationChannelId) {
    if (state.stage === "BRIEFING") return [{ key: variant.cryptanalyst.key, name: variant.cryptanalyst.name }];
    if (state.stage === "RETURN") return [{ key: variant.cryptanalyst.key, name: `${variant.cryptanalyst.name} (relatorio)` }];
  }
  if (channelId === variant.alleyChannelId && state.stage === "CONTACT") {
    return [{ key: variant.contact.key, name: variant.contact.name }];
  }
  if (channelId === variant.forestChannelId && state.stage === "LEADER_TALK") {
    return [{ key: variant.leader.key, name: variant.leader.name }];
  }
  return [];
}

export async function interceptedCodeMapHandle(
  interaction: ChatInputCommandInteraction,
  ctx: InterceptedCodeContext,
  entities: RenderEntity[],
): Promise<string | null> {
  const state = ensureState(ctx.inst.stateJson);
  const { variant } = ctx;

  if (interaction.channelId === variant.administrationChannelId) {
    if (state.stage === "BRIEFING" || state.stage === "RETURN") {
      entities.push(npcEntity(variant.cryptanalyst));
      return state.stage === "BRIEFING"
        ? `\nMissao ativa: **${ctx.def.name}** - fale com ${variant.cryptanalyst.name} usando \`/interagir npc\`.`
        : `\nMissao ativa: **${ctx.def.name}** - entregue o relatorio final usando \`/interagir npc\`.`;
    }
    if (state.stage === "DECIPHER") {
      entities.push(cipherEntity());
      if (!state.running) {
        state.running = true;
        await setState(ctx.inst.id, state);
        void startCipherPuzzle(interaction.channel, ctx.inst.id, interaction.user.id).catch(() => undefined);
      }
      return `\nMissao ativa: **${ctx.def.name}** - ajuste as partes da mensagem no painel enviado no canal.`;
    }
    return nextPlaceNote(ctx, state);
  }

  if (interaction.channelId === variant.alleyChannelId) {
    if (state.stage === "CONTACT") {
      entities.push(npcEntity(variant.contact));
      return `\nMissao ativa: **${ctx.def.name}** - use a senha decifrada e fale com o contato usando \`/interagir npc\`.`;
    }
    return nextPlaceNote(ctx, state);
  }

  if (interaction.channelId !== variant.forestChannelId) return null;
  if (state.stage === "LEADER_TALK") {
    entities.push(npcEntity(variant.leader));
    if (!state.leaderSeen) {
      state.leaderSeen = true;
      await setState(ctx.inst.id, state);
      await speak(
        interaction.channel,
        variant.leader,
        "(o time chega na clareira onde o encontro criminoso esta acontecendo)",
        "Mostre surpresa por terem decifrado a mensagem e tente descobrir quem vazou o codigo.",
        0,
      );
    }
    return `\nMissao ativa: **${ctx.def.name}** - confronte o chefe do encontro usando \`/interagir npc\`.`;
  }
  if (state.stage === "FIGHT") {
    if (!(await getActiveSession(interaction.channelId))) await startInterceptedCodeCombat(interaction, ctx);
    return `\nMissao ativa: **${ctx.def.name}** - impeça o encontro criminoso derrotando o chefe e os comparsas.`;
  }
  return nextPlaceNote(ctx, state);
}

function nextPlaceNote(ctx: InterceptedCodeContext, state: InterceptedCodeState): string | null {
  const v = ctx.variant;
  if (state.stage === "DECIPHER") return `\nMissao ativa: **${ctx.def.name}** - volte para ${v.administrationName}: <#${v.administrationChannelId}>.`;
  if (state.stage === "CONTACT") return `\nMissao ativa: **${ctx.def.name}** - siga para ${v.alleyName}: <#${v.alleyChannelId}>.`;
  if (state.stage === "LEADER_TALK" || state.stage === "FIGHT") {
    return `\nMissao ativa: **${ctx.def.name}** - siga para ${v.forestName}: <#${v.forestChannelId}>.`;
  }
  if (state.stage === "RETURN") return `\nMissao ativa: **${ctx.def.name}** - volte para ${v.administrationName}: <#${v.administrationChannelId}>.`;
  return null;
}

function npcEntity(npc: RegionalNpc): RenderEntity {
  return {
    cell: npc.cell,
    name: npc.name,
    label: npc.name.slice(0, 3),
    color: "#34495e",
    kind: "NPC",
    imageFile: npc.imageFile,
  };
}

function cipherEntity(): RenderEntity {
  return { cell: "D4", label: "\u{1F4DC}", color: "#8e44ad", kind: "MARKER", name: "Mensagem cifrada" };
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

export async function interactInterceptedCode(
  interaction: ChatInputCommandInteraction,
  npcKey: string,
): Promise<void> {
  const guildId = interaction.guildId ?? "global";
  const ctx = await resolveInterceptedCode(interaction.user.id, guildId, interaction.channelId);
  if (!ctx) {
    await interaction.reply({ content: "Voce (ou sua party) nao tem essa missao ativa.", ephemeral: true });
    return;
  }
  const state = ensureState(ctx.inst.stateJson);
  const choice = availableInterceptedCodeNpcs(state, interaction.channelId, ctx.variant).find((npc) => npc.key === npcKey);
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
  await runDialogue(
    interaction.channel,
    interaction.channelId,
    interaction.guildId ?? "global",
    ctx,
    npcKey,
    "(o time inicia a conversa)",
    interaction.user,
  );
  await interaction.editReply(`Voce se aproxima de **${choice.name}**. Continue por mensagens normais no canal.`);
}

export async function continueInterceptedCodeMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.guildId) return false;
  const ctx = await resolveInterceptedCode(message.author.id, message.guildId, message.channelId);
  if (!ctx) return false;
  const state = ensureState(ctx.inst.stateJson);
  if (!state.activeNpc) return false;
  if (!availableInterceptedCodeNpcs(state, message.channelId, ctx.variant).some((npc) => npc.key === state.activeNpc)) return false;
  await runDialogue(
    message.channel,
    message.channelId,
    message.guildId,
    ctx,
    state.activeNpc,
    message.content || "...",
    message.author,
  );
  return true;
}

async function runDialogue(
  channel: TextBasedChannel | null,
  channelId: string,
  guildId: string,
  ctx: InterceptedCodeContext,
  npcKey: string,
  playerMessage: string,
  actor: { id: string; username: string },
): Promise<void> {
  const inst = await getInstance(ctx.inst.id);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "INTERCEPTED_CODE") return;
  const state = ensureState(inst.stateJson);
  const turn = (state.talks?.[npcKey] ?? 0) + 1;
  state.talks![npcKey] = turn;

  if (npcKey === ctx.variant.cryptanalyst.key && state.stage === "BRIEFING") {
    const done = turn >= turns(def, "briefingTurns", 3);
    await speak(
      channel,
      ctx.variant.cryptanalyst,
      playerMessage,
      done
        ? "Ultima fala: explique que a mensagem foi cifrada por deslocamento e mande o time usar /mapa para alinhar os fragmentos ate formar a frase."
        : "Explique que a vila interceptou uma mensagem inimiga e que o encontro criminoso precisa ser impedido antes de acontecer.",
      done ? 2 : Math.min(turn - 1, 1),
    );
    if (done) {
      state.stage = "DECIPHER";
      state.activeNpc = null;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "receber_mensagem_interceptada");
      await setState(inst.id, state);
      await sendMissionNotice(channel, {
        kind: "investigacao",
        title: "Mensagem pronta para decifragem",
        description: "O conteúdo interceptado foi colocado sobre a mesa de análise da mansão.",
        items: ["Use `/mapa` para abrir a mesa de decifragem."],
        itemsTitle: "Próximo passo",
      });
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === ctx.variant.contact.key && state.stage === "CONTACT") {
    const done = turn >= turns(def, "contactTurns", 3);
    await speak(
      channel,
      ctx.variant.contact,
      playerMessage,
      done
        ? `Ultima fala: apos ouvir a senha LANTERNA, revele que o encontro verdadeiro foi movido para a ${ctx.variant.forestName}.`
        : "Fale como um contato criminoso desconfiado no beco. Teste a senha LANTERNA e tente descobrir se o jogador pertence ao grupo.",
      done ? 2 : Math.min(turn - 1, 1),
    );
    if (done) {
      state.stage = "LEADER_TALK";
      state.activeNpc = null;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "encontrar_contato_beco");
      await markObjective(inst.id, "descobrir_local_encontro");
      await setState(inst.id, state);
      await sendMissionNotice(channel, {
        kind: "descoberta",
        title: "Local do encontro decifrado",
        description: "A mensagem revela que o ponto de encontro foi alterado.",
        items: [`${ctx.variant.forestName} — <#${ctx.variant.forestChannelId}>`],
        itemsTitle: "Destino descoberto",
      });
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === ctx.variant.leader.key && state.stage === "LEADER_TALK") {
    const fight = turn >= turns(def, "leaderTurns", 3);
    await speak(
      channel,
      ctx.variant.leader,
      playerMessage,
      fight
        ? "Ultima fala: perceba que o codigo foi quebrado, ordene que os comparsas queimem as provas e inicie combate."
        : "Tente manter autoridade sobre o encontro criminoso, desconfiando de como o time achou a clareira.",
      fight ? 2 : Math.min(turn - 1, 1),
    );
    if (fight) {
      state.stage = "FIGHT";
      state.activeNpc = null;
      state.combatStarted = true;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "confrontar_encontro_criminoso");
      await setState(inst.id, state);
      await startInterceptedCodeCombatFromActor(channel, channelId, guildId, actor, inst.id, def, ctx.variant);
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === ctx.variant.cryptanalyst.key && state.stage === "RETURN") {
    const done = turn >= turns(def, "returnTurns", 2);
    await speak(
      channel,
      ctx.variant.cryptanalyst,
      playerMessage,
      done
        ? "Ultima fala: registre a decifragem, confirme que o encontro foi impedido e encerre a missao."
        : "Receba o relatorio sobre a senha, o beco, a floresta e as provas recuperadas.",
      3 + Math.min(turn - 1, 1),
    );
    if (done) {
      state.stage = "DONE";
      state.activeNpc = null;
      await markObjective(inst.id, "entregar_relatorio_codigo");
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

function cipherEmbed(state: InterceptedCodeState, def: InterceptedCodeContext["def"], result?: string): EmbedBuilder {
  const choices = normalizeChoices(state.cipherChoices);
  const assembled = choices.map((choice, index) => `**${index + 1}.** ${CIPHER_SLOTS[index]![choice]}`).join("\n");
  return new EmbedBuilder()
    .setColor(0x8e44ad)
    .setTitle("Mesa de Decifragem")
    .setDescription(
      [
        "Mensagem interceptada:",
        CIPHER_TEXT,
        "",
        "Ajuste cada fragmento ate a frase fazer sentido:",
        assembled,
        "",
        `Erros ao confirmar: **${state.mistakes ?? 0}/${maxMistakes(def)}**`,
        result ?? "",
      ].filter(Boolean).join("\n"),
    );
}

function cipherRows(instanceId: string, state: InterceptedCodeState): ActionRowBuilder<ButtonBuilder>[] {
  const choices = normalizeChoices(state.cipherChoices);
  const rows = choices.map((choice, index) =>
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`code-cipher:${instanceId}:slot:${index}:prev`)
        .setLabel(`${index + 1} <`)
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`code-cipher:${instanceId}:slot:${index}:next`)
        .setLabel(`${index + 1} >`)
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`code-cipher:${instanceId}:slot:${index}:keep`)
        .setLabel((CIPHER_SLOTS[index]![choice] ?? "").slice(0, 28))
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
    ),
  );
  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`code-cipher:${instanceId}:confirm`)
        .setLabel("Confirmar frase")
        .setStyle(ButtonStyle.Success),
    ),
  );
  return rows;
}

async function startCipherPuzzle(
  channel: TextBasedChannel | null,
  instanceId: string,
  actorDiscordId: string,
): Promise<void> {
  if (!channel || !("send" in channel)) return;
  const inst = await getInstance(instanceId);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "INTERCEPTED_CODE") return;
  let state = ensureState(inst.stateJson);
  const variant = variantFor(def);
  const msg = await channel.send({ embeds: [cipherEmbed(state, def)], components: cipherRows(instanceId, state) });

  while (state.stage === "DECIPHER") {
    try {
      const btn = (await msg.awaitMessageComponent({
        componentType: ComponentType.Button,
        time: stepTimeout(def),
        filter: (i: ButtonInteraction) =>
          i.user.id === actorDiscordId && i.customId.startsWith(`code-cipher:${instanceId}:`),
      })) as ButtonInteraction;

      const parts = btn.customId.split(":");
      let result: string | undefined;
      if (parts[2] === "slot") {
        const slot = Number(parts[3] ?? 0);
        const direction = parts[4];
        const choices = normalizeChoices(state.cipherChoices);
        if (Number.isInteger(slot) && CIPHER_SLOTS[slot]) {
          const delta = direction === "prev" ? -1 : 1;
          choices[slot] = (choices[slot]! + delta + CIPHER_SLOTS[slot]!.length) % CIPHER_SLOTS[slot]!.length;
          state.cipherChoices = choices;
          await setState(instanceId, state);
        }
      } else if (parts[2] === "confirm") {
        const correct = normalizeChoices(state.cipherChoices).every((choice, index) => choice === CIPHER_CORRECT[index]);
        if (correct) {
          state.stage = "CONTACT";
          state.running = false;
          await markObjective(instanceId, "decifrar_mensagem");
          await setState(instanceId, state);
          await btn.update({
            embeds: [
              new EmbedBuilder()
                .setColor(0x2ecc71)
                .setTitle("Mensagem decifrada")
                .setDescription(
                  `**ENCONTRO NO BECO. SENHA LANTERNA. AO ANOITECER.**\n\nSiga para ${variant.alleyName}: <#${variant.alleyChannelId}>.`,
                ),
            ],
            components: [],
          });
          return;
        }
        state.mistakes = (state.mistakes ?? 0) + 1;
        result = "**A frase ainda nao fecha.** A ordem, local, senha ou horario estao inconsistentes.";
        if ((state.mistakes ?? 0) >= maxMistakes(def)) {
          await failInterceptedCode(instanceId, msg, "Confirmacoes erradas demais deram tempo para os criminosos trocarem a cifra e sumirem.");
          return;
        }
        await setState(instanceId, state);
      }
      await btn.update({ embeds: [cipherEmbed(state, def, result)], components: cipherRows(instanceId, state) });
    } catch {
      state.running = false;
      await setState(instanceId, state);
      await msg.edit({ components: [] }).catch(() => undefined);
      await sendMissionNotice(channel, pausedMissionNotice("A sessão de decifragem foi interrompida.", "Use /mapa para retomar a mensagem interceptada."));
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

async function startInterceptedCodeCombatFromActor(
  channel: TextBasedChannel | null,
  channelId: string,
  guildId: string,
  actor: { id: string; username: string },
  instanceId: string,
  def: InterceptedCodeContext["def"],
  variant: InterceptedCodeVariant,
): Promise<void> {
  if (await getActiveSession(channelId)) return;
  const char = await getOrCreateCharacter(actor.id, guildId, actor.username);
  const { players, attrsById } = await gatherPartyPlayers(channel, guildId, starterFrom(char));
  const session = await startCombat({
    channelId,
    guildId,
    scenarioId: variant.forestScenarioId,
    players,
    npcs: [
      { templateId: leaderTemplate(def) },
      { templateId: gruntTemplate(def) },
      { templateId: gruntTemplate(def) },
    ],
    missionInstanceId: instanceId,
  });
  await cacheAttrs(session, attrsById);
  if (channel && "send" in channel) {
    await channel.send(
      `Os criminosos tentam queimar as provas! ${players.length} ninja(s) entram no combate. Use \`/mapa\`.`,
    );
  }
}

async function startInterceptedCodeCombat(
  interaction: ChatInputCommandInteraction,
  ctx: InterceptedCodeContext,
): Promise<void> {
  await startInterceptedCodeCombatFromActor(
    interaction.channel,
    interaction.channelId,
    interaction.guildId ?? "global",
    interaction.user,
    ctx.inst.id,
    ctx.def,
    ctx.variant,
  );
}

async function failInterceptedCode(instanceId: string, msg: Message, reason: string): Promise<void> {
  await prisma.missionInstance.update({ where: { id: instanceId }, data: { status: "FAILED" } });
  await msg.edit({
    embeds: [new EmbedBuilder().setColor(0xc0392b).setTitle("Codigo perdido").setDescription(reason)],
    components: [],
  }).catch(() => undefined);
}

export async function onInterceptedCodeCombatWon(
  interaction: ChatInputCommandInteraction,
  instanceId: string,
): Promise<void> {
  const inst = await getInstance(instanceId);
  if (!inst || inst.status !== "ACTIVE") return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "INTERCEPTED_CODE") return;
  const state = ensureState(inst.stateJson);
  const variant = variantFor(def);
  state.stage = "RETURN";
  state.combatStarted = false;
  state.activeNpc = null;
  await markObjective(inst.id, "derrotar_criminosos_codigo");
  await setState(inst.id, state);
  await interaction.followUp(
    `O encontro foi impedido e as provas foram recuperadas. Volte para ${variant.administrationName}: <#${variant.administrationChannelId}>.`,
  );
}

export function interceptedCodeVariantIds(): string[] {
  return Object.keys(VARIANTS);
}
