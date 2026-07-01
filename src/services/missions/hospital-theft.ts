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
import { HOSPITAL_KONOHA_CHANNEL_ID } from "../../data/scenarios/index.js";
import { getMission } from "../../data/missions/index.js";
import { formatPersonaLines, sendAsPersona } from "../discord/persona-webhook.js";
import type { RenderEntity } from "../maps/renderer.js";
import { NpcAiService } from "../npc-ai/npc-ai-service.js";
import { getPersona } from "../npc-ai/personas.js";
import { partyMemberIds } from "../party/party-service.js";
import {
  completeMission,
  getActiveMissions,
  getInstance,
  markObjective,
  readState,
  setState,
} from "./mission-service.js";

interface HospitalNpc {
  key: string;
  name: string;
  persona: string;
  imageFile: string;
  cell: string;
}

interface HospitalTheftVariant {
  id: string;
  villageName: string;
  hospitalName: string;
  hospitalChannelId: string;
  doctor: HospitalNpc;
  nurse: HospitalNpc;
  patient: HospitalNpc;
  thief: HospitalNpc;
}

const KONOHA_VARIANT: HospitalTheftVariant = {
  id: "KONOHA",
  villageName: "Konoha",
  hospitalName: "Hospital de Konoha",
  hospitalChannelId: HOSPITAL_KONOHA_CHANNEL_ID,
  doctor: {
    key: "hospital_theft_doctor_konoha",
    name: "Dra. Sanae Morino",
    persona: "hospital_theft_doctor_konoha",
    imageFile: "npcs/hospital-doctor-sanae.png",
    cell: "C3",
  },
  nurse: {
    key: "hospital_theft_nurse_konoha",
    name: "Mika Aburame (enfermeira)",
    persona: "hospital_theft_nurse_konoha",
    imageFile: "npcs/hospital-nurse-mika.png",
    cell: "B5",
  },
  patient: {
    key: "hospital_theft_patient_konoha",
    name: "Otoya (paciente)",
    persona: "hospital_theft_patient_konoha",
    imageFile: "npcs/hospital-patient-otoya.png",
    cell: "E4",
  },
  thief: {
    key: "hospital_theft_injured_ninja_konoha",
    name: "Riku Hayate (ninja ferido)",
    persona: "hospital_theft_injured_ninja_konoha",
    imageFile: "npcs/injured-ninja-riku.png",
    cell: "D6",
  },
};

const VARIANTS: Record<string, HospitalTheftVariant> = {
  KONOHA: KONOHA_VARIANT,
};

const EVIDENCE = [
  {
    id: "bandage",
    label: "Bandagem com sangue",
    clue: "A bandagem foi trocada as pressas e tem cheiro do analgesico raro desaparecido.",
    objectiveId: "pista_bandagem_sangue",
  },
  {
    id: "window",
    label: "Janela do deposito",
    clue: "A janela foi aberta por dentro. O invasor conhecia a rotina do hospital.",
    objectiveId: "pista_janela_deposito",
  },
  {
    id: "ledger",
    label: "Registro de remédios",
    clue: "As doses somem sempre apos visitas a ala de recuperacao ninja.",
    objectiveId: "pista_registro_remedios",
  },
] as const;

const ENDINGS = [
  {
    id: "arrest",
    label: "Prender Riku",
    style: ButtonStyle.Danger,
    title: "Riku foi detido",
    text: "Riku entrega os remédios restantes e aceita ser levado para interrogatorio medico, sem resistencia.",
  },
  {
    id: "convince",
    label: "Convencer Riku",
    style: ButtonStyle.Success,
    title: "Riku aceitou ajuda",
    text: "Riku confessa tudo e permite que a equipe trate sua familia pelos meios oficiais.",
  },
  {
    id: "confront",
    label: "Enfrentar Riku",
    style: ButtonStyle.Primary,
    title: "Riku foi contido",
    text: "Riku tenta fugir, mas esta ferido demais. O time o contem sem matar e recupera os remédios.",
  },
] as const;

export interface HospitalTheftState {
  stage?: "BRIEFING" | "WITNESSES" | "STORAGE" | "THIEF" | "DECISION" | "DONE";
  activeNpc?: string | null;
  talks?: Record<string, number>;
  heard?: string[];
  evidence?: string[];
  running?: boolean;
  ending?: string | null;
}

export interface HospitalTheftChoice {
  key: string;
  name: string;
}

export interface HospitalTheftContext {
  inst: NonNullable<Awaited<ReturnType<typeof getInstance>>>;
  def: NonNullable<ReturnType<typeof getMission>>;
  ownerCharId: string;
  variant: HospitalTheftVariant;
}

function variantFor(def: NonNullable<ReturnType<typeof getMission>>): HospitalTheftVariant {
  return VARIANTS[String(def.data?.variantId ?? "KONOHA")] ?? KONOHA_VARIANT;
}

function ensureState(raw: string): HospitalTheftState {
  const state = readState<HospitalTheftState>(raw);
  state.stage = state.stage ?? "BRIEFING";
  state.activeNpc = state.activeNpc ?? null;
  state.talks = state.talks ?? {};
  state.heard = state.heard ?? [];
  state.evidence = state.evidence ?? [];
  state.running = state.running ?? false;
  state.ending = state.ending ?? null;
  return state;
}

function turns(
  def: HospitalTheftContext["def"],
  key: "briefingTurns" | "witnessTurns" | "thiefTurns",
  fallback: number,
): number {
  return Number(def.data?.[key] ?? fallback);
}

function stepTimeout(def: HospitalTheftContext["def"]): number {
  return Number(def.data?.stepTimeoutMs ?? 90_000);
}

async function findContextByCharId(charId: string, channelId?: string): Promise<HospitalTheftContext | null> {
  for (const inst of await getActiveMissions(charId)) {
    const def = getMission(inst.missionId);
    if (!def || def.type !== "HOSPITAL_THEFT") continue;
    const variant = variantFor(def);
    if (channelId && channelId !== variant.hospitalChannelId) continue;
    return { inst, def, ownerCharId: charId, variant };
  }
  return null;
}

export async function resolveHospitalTheft(
  discordId: string,
  guildId: string,
  channelId?: string,
): Promise<HospitalTheftContext | null> {
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

export function availableHospitalTheftNpcs(
  state: HospitalTheftState,
  channelId: string,
  variant: HospitalTheftVariant,
): HospitalTheftChoice[] {
  if (channelId !== variant.hospitalChannelId) return [];
  if (state.stage === "BRIEFING") return [{ key: variant.doctor.key, name: variant.doctor.name }];
  if (state.stage === "WITNESSES") {
    if (state.activeNpc) {
      const active = [variant.nurse, variant.patient].find((npc) => npc.key === state.activeNpc);
      return active ? [{ key: active.key, name: active.name }] : [];
    }
    return [variant.nurse, variant.patient]
      .filter((npc) => !(state.heard ?? []).includes(npc.key))
      .map((npc) => ({ key: npc.key, name: npc.name }));
  }
  if (state.stage === "THIEF") return [{ key: variant.thief.key, name: variant.thief.name }];
  return [];
}

export async function hospitalTheftMapHandle(
  interaction: ChatInputCommandInteraction,
  ctx: HospitalTheftContext,
  entities: RenderEntity[],
): Promise<string | null> {
  if (interaction.channelId !== ctx.variant.hospitalChannelId) return null;
  const state = ensureState(ctx.inst.stateJson);

  if (state.stage === "BRIEFING") {
    entities.push(npcEntity(ctx.variant.doctor));
    return `\nMissao ativa: **${ctx.def.name}** - fale com a medica usando \`/interagir npc\`.`;
  }
  if (state.stage === "WITNESSES") {
    entities.push(npcEntity(ctx.variant.nurse), npcEntity(ctx.variant.patient));
    return `\nMissao ativa: **${ctx.def.name}** - investigue funcionarios e pacientes com \`/interagir npc\`. Depoimentos: **${state.heard?.length ?? 0}/2**.`;
  }
  if (state.stage === "STORAGE") {
    entities.push(...storageEntities(state));
    if (!state.running) {
      state.running = true;
      await setState(ctx.inst.id, state);
      void startStoragePuzzle(interaction.channel, ctx.inst.id, interaction.user.id)
        .catch(() => undefined);
    }
    return `\nMissao ativa: **${ctx.def.name}** - procure pistas no deposito pelo painel enviado no canal. Pistas: **${state.evidence?.length ?? 0}/3**.`;
  }
  if (state.stage === "THIEF") {
    entities.push(npcEntity(ctx.variant.thief), ...storageEntities(state));
    return `\nMissao ativa: **${ctx.def.name}** - confronte o ninja ferido usando \`/interagir npc\`.`;
  }
  if (state.stage === "DECISION") {
    entities.push(npcEntity(ctx.variant.thief));
    if (!state.running) {
      state.running = true;
      await setState(ctx.inst.id, state);
      void startDecisionPanel(interaction.channel, ctx.inst.id, interaction.user.id)
        .catch(() => undefined);
    }
    return `\nMissao ativa: **${ctx.def.name}** - escolha como resolver o roubo no painel enviado no canal.`;
  }
  return null;
}

function npcEntity(npc: HospitalNpc): RenderEntity {
  return {
    cell: npc.cell,
    name: npc.name,
    label: npc.name.slice(0, 3),
    color: "#1abc9c",
    kind: "NPC",
    imageFile: npc.imageFile,
  };
}

function storageEntities(state: HospitalTheftState): RenderEntity[] {
  const found = new Set(state.evidence ?? []);
  return [
    { cell: "B6", id: "bandage", label: "\u{1FA79}", name: "Bandagem" },
    { cell: "D4", id: "window", label: "\u{1FA9F}", name: "Janela" },
    { cell: "E6", id: "ledger", label: "\u{1F4CB}", name: "Registro" },
  ].map((entry) => ({
    cell: entry.cell,
    label: found.has(entry.id) ? "\u2705" : entry.label,
    color: found.has(entry.id) ? "#2ecc71" : "#3498db",
    kind: "MARKER" as const,
    name: entry.name,
  }));
}

async function speak(
  channel: TextBasedChannel | null,
  npc: HospitalNpc,
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

export async function interactHospitalTheft(
  interaction: ChatInputCommandInteraction,
  npcKey: string,
): Promise<void> {
  const guildId = interaction.guildId ?? "global";
  const ctx = await resolveHospitalTheft(interaction.user.id, guildId, interaction.channelId);
  if (!ctx) {
    await interaction.reply({ content: "Voce (ou sua party) nao tem essa missao ativa.", ephemeral: true });
    return;
  }
  const state = ensureState(ctx.inst.stateJson);
  const choice = availableHospitalTheftNpcs(state, interaction.channelId, ctx.variant).find((npc) => npc.key === npcKey);
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
  await runDialogue(interaction.channel, ctx, npcKey, "(o time inicia a conversa)");
  await interaction.editReply(`Voce se aproxima de **${choice.name}**. Continue por mensagens normais no canal.`);
}

export async function continueHospitalTheftMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.guildId) return false;
  const ctx = await resolveHospitalTheft(message.author.id, message.guildId, message.channelId);
  if (!ctx) return false;
  const state = ensureState(ctx.inst.stateJson);
  if (!state.activeNpc) return false;
  if (!availableHospitalTheftNpcs(state, message.channelId, ctx.variant).some((npc) => npc.key === state.activeNpc)) return false;
  await runDialogue(message.channel, ctx, state.activeNpc, message.content || "...");
  return true;
}

async function runDialogue(
  channel: TextBasedChannel | null,
  ctx: HospitalTheftContext,
  npcKey: string,
  playerMessage: string,
): Promise<void> {
  const inst = await getInstance(ctx.inst.id);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "HOSPITAL_THEFT") return;
  const state = ensureState(inst.stateJson);
  const turn = (state.talks?.[npcKey] ?? 0) + 1;
  state.talks![npcKey] = turn;

  if (npcKey === ctx.variant.doctor.key && state.stage === "BRIEFING") {
    const done = turn >= turns(def, "briefingTurns", 3);
    await speak(
      channel,
      ctx.variant.doctor,
      playerMessage,
      done
        ? "Ultima fala: mande o time ouvir a enfermeira Mika e o paciente Otoya antes de ir ao deposito."
        : "Explique que remedios raros sumiram do deposito do hospital e que uma acusacao errada pode causar panico.",
      done ? 2 : Math.min(turn - 1, 1),
    );
    if (done) {
      state.stage = "WITNESSES";
      state.activeNpc = null;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "receber_denuncia_hospital");
      await setState(inst.id, state);
      if (channel && "send" in channel) await channel.send("Use `/mapa` e ouca a enfermeira e o paciente com `/interagir npc`.");
      return;
    }
    await setState(inst.id, state);
    return;
  }

  const witness = [ctx.variant.nurse, ctx.variant.patient].find((npc) => npc.key === npcKey);
  if (witness && state.stage === "WITNESSES") {
    const done = turn >= turns(def, "witnessTurns", 2);
    await speak(
      channel,
      witness,
      playerMessage,
      done
        ? "Ultima fala: revele uma pista clara ligando as doses desaparecidas a um ninja ferido da ala de recuperacao."
        : "Fale como testemunha cautelosa no hospital, sem acusar diretamente alguem de primeira.",
      done ? 1 : 0,
    );
    if (done) {
      state.heard = [...new Set([...(state.heard ?? []), npcKey])];
      state.activeNpc = null;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, npcKey === ctx.variant.nurse.key ? "ouvir_enfermeira" : "ouvir_paciente");
      if (state.heard.length >= 2) {
        state.stage = "STORAGE";
        if (channel && "send" in channel) await channel.send("Depoimentos reunidos. Use `/mapa` para investigar o deposito.");
      }
      await setState(inst.id, state);
      return;
    }
    await setState(inst.id, state);
    return;
  }

  if (npcKey === ctx.variant.thief.key && state.stage === "THIEF") {
    const done = turn >= turns(def, "thiefTurns", 3);
    await speak(
      channel,
      ctx.variant.thief,
      playerMessage,
      done
        ? "Ultima fala: confesse que roubou remedios para alguem da familia, mostre culpa e deixe claro que o time precisa decidir o que fazer."
        : "Fale como ninja ferido, defensivo, com dor e tentando esconder que roubou remedios por desespero familiar.",
      done ? 2 : Math.min(turn - 1, 1),
    );
    if (done) {
      state.stage = "DECISION";
      state.activeNpc = null;
      state.talks![npcKey] = 0;
      await markObjective(inst.id, "confrontar_ninja_ferido");
      await setState(inst.id, state);
      if (channel && "send" in channel) await channel.send("Use `/mapa` para escolher como resolver o roubo.");
      return;
    }
    await setState(inst.id, state);
  }
}

function storageEmbed(state: HospitalTheftState, result?: string): EmbedBuilder {
  const found = new Set(state.evidence ?? []);
  return new EmbedBuilder()
    .setColor(0x1abc9c)
    .setTitle("Deposito de Remedios")
    .setDescription(
      [
        "Procurem pistas sem contaminar os remedios restantes.",
        "",
        ...EVIDENCE.map((entry) => `${found.has(entry.id) ? "\u2705" : "\u26AA"} **${entry.label}:** ${found.has(entry.id) ? entry.clue : "ainda nao examinada"}`),
        "",
        `Pistas encontradas: **${found.size}/${EVIDENCE.length}**`,
        result ?? "",
      ].filter(Boolean).join("\n"),
    );
}

function storageRows(instanceId: string, state: HospitalTheftState): ActionRowBuilder<ButtonBuilder>[] {
  const found = new Set(state.evidence ?? []);
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      ...EVIDENCE.map((entry) =>
        new ButtonBuilder()
          .setCustomId(`hospital-theft:evidence:${instanceId}:${entry.id}`)
          .setLabel(entry.label)
          .setStyle(found.has(entry.id) ? ButtonStyle.Success : ButtonStyle.Secondary)
          .setDisabled(found.has(entry.id)),
      ),
    ),
  ];
}

async function startStoragePuzzle(
  channel: TextBasedChannel | null,
  instanceId: string,
  actorDiscordId: string,
): Promise<void> {
  if (!channel || !("send" in channel)) return;
  const inst = await getInstance(instanceId);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "HOSPITAL_THEFT") return;
  let state = ensureState(inst.stateJson);
  const msg = await channel.send({ embeds: [storageEmbed(state)], components: storageRows(instanceId, state) });

  while ((state.evidence ?? []).length < EVIDENCE.length) {
    try {
      const btn = (await msg.awaitMessageComponent({
        componentType: ComponentType.Button,
        time: stepTimeout(def),
        filter: (i: ButtonInteraction) =>
          i.user.id === actorDiscordId && i.customId.startsWith(`hospital-theft:evidence:${instanceId}:`),
      })) as ButtonInteraction;

      state = ensureState((await getInstance(instanceId))?.stateJson ?? inst.stateJson);
      const evidenceId = btn.customId.split(":").at(-1) ?? "";
      const evidence = EVIDENCE.find((entry) => entry.id === evidenceId);
      if (!evidence || state.evidence?.includes(evidence.id)) {
        await btn.reply({ content: "Essa pista ja foi examinada.", ephemeral: true });
        continue;
      }

      state.evidence = [...new Set([...(state.evidence ?? []), evidence.id])];
      await markObjective(instanceId, evidence.objectiveId);
      await setState(instanceId, state);
      const done = state.evidence.length >= EVIDENCE.length;
      await btn.update({
        embeds: [storageEmbed(state, `**${evidence.label}:** ${evidence.clue}`)],
        components: done ? [] : storageRows(instanceId, state),
      });
      if (done) break;
    } catch {
      state.running = false;
      await setState(instanceId, state);
      await msg.edit({ components: [] }).catch(() => undefined);
      await channel.send("A busca no deposito foi interrompida. Use `/mapa` para continuar a investigacao.");
      return;
    }
  }

  state.stage = "THIEF";
  state.running = false;
  await markObjective(instanceId, "investigar_deposito");
  await setState(instanceId, state);
  await channel.send("As pistas apontam para um ninja ferido na ala de recuperacao. Use `/mapa` e fale com ele.");
}

function decisionEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle("Decisao moral")
    .setDescription(
      [
        "Riku roubou remedios raros para alguem da familia, mas colocou pacientes do hospital em risco.",
        "Qualquer decisao encerra a missao; escolha o tom do desfecho.",
      ].join("\n"),
    );
}

function decisionRow(instanceId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...ENDINGS.map((ending) =>
      new ButtonBuilder()
        .setCustomId(`hospital-theft:ending:${instanceId}:${ending.id}`)
        .setLabel(ending.label)
        .setStyle(ending.style),
    ),
  );
}

async function startDecisionPanel(
  channel: TextBasedChannel | null,
  instanceId: string,
  actorDiscordId: string,
): Promise<void> {
  if (!channel || !("send" in channel)) return;
  const inst = await getInstance(instanceId);
  if (!inst) return;
  const def = getMission(inst.missionId);
  if (!def || def.type !== "HOSPITAL_THEFT") return;
  const msg = await channel.send({ embeds: [decisionEmbed()], components: [decisionRow(instanceId)] });

  try {
    const btn = (await msg.awaitMessageComponent({
      componentType: ComponentType.Button,
      time: stepTimeout(def),
      filter: (i: ButtonInteraction) =>
        i.user.id === actorDiscordId && i.customId.startsWith(`hospital-theft:ending:${instanceId}:`),
    })) as ButtonInteraction;

    const endingId = btn.customId.split(":").at(-1) ?? "";
    const ending = ENDINGS.find((entry) => entry.id === endingId) ?? ENDINGS[1]!;
    const state = ensureState((await getInstance(instanceId))?.stateJson ?? inst.stateJson);
    state.stage = "DONE";
    state.running = false;
    state.ending = ending.id;
    await markObjective(instanceId, "decidir_destino_riku");
    await markObjective(instanceId, "recuperar_remedios");
    await setState(instanceId, state);
    const result = await completeMission(inst.charId, inst.missionId);

    await btn.update({
      embeds: [
        new EmbedBuilder()
          .setColor(ending.id === "arrest" ? 0xe74c3c : ending.id === "convince" ? 0x2ecc71 : 0x3498db)
          .setTitle(ending.title)
          .setDescription(
            [
              ending.text,
              result
                ? `\nMissao concluida: **${def.name}**!\nRecompensas: ${result.rewards.xp} XP, ${result.rewards.ryo} ryo${result.rewards.items?.length ? `, ${result.rewards.items.map((item) => item.name).join(", ")}` : ""}.`
                : "",
            ].filter(Boolean).join("\n"),
          ),
      ],
      components: [],
    });
  } catch {
    const state = ensureState((await getInstance(instanceId))?.stateJson ?? inst.stateJson);
    state.running = false;
    await setState(instanceId, state);
    await msg.edit({ components: [] }).catch(() => undefined);
    await channel.send("A decisao expirou. Use `/mapa` para escolher como resolver o roubo.");
  }
}

export function hospitalTheftVariantIds(): string[] {
  return Object.keys(VARIANTS);
}
