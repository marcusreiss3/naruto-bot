import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { Command } from "./types.js";
import { prisma } from "../db/client.js";
import { getScenarioByChannel, getScenarioById, ALL_ABILITIES } from "../data/index.js";
import { moveRange } from "../services/characters/formulas.js";
import {
  getActiveInstanceForChannel,
  readState,
  setState,
  completeMission,
} from "../services/missions/mission-service.js";
import { catMissionStep, spawnCat, type CatState, type CatMissionData } from "../services/missions/cat.js";
import { cellDistance } from "../services/combat/combat-math.js";
import { BALANCE } from "../config/balance.js";
import { getOrCreateCharacter } from "../services/characters/character-service.js";
import {
  startCombat,
  getActiveSession,
  endCombat,
  moveParticipant,
  validateMove,
  setElevated,
  numberSameNames,
  displayName,
  useAbility,
  resolveHit,
  endTurn,
  activeParticipant,
  pickUpWeapon,
  getSessionById,
  type AbilityHit,
  type SessionFull,
} from "../services/combat/combat-engine.js";
import { runNpcTurn } from "../services/combat/npc-combat.js";
import { getAbility } from "../data/index.js";
import { onCombatEnded, onCombatLost } from "../services/missions/mission-runtime.js";
import { partyMemberIds } from "../services/party/party-service.js";
import { MapRenderer } from "../services/maps/renderer.js";
import { buildSessionEntities, condenseLogs } from "../services/combat/combat-render.js";
import { renderCatMission } from "../services/missions/cat-render.js";
import { startKidDialogue } from "../services/missions/kid-dialogue.js";

// Renderiza o mapa do combate + log enxuto num embed e envia.
async function sendCombatView(
  interaction: ChatInputCommandInteraction,
  sessionId: string,
  logs: string[],
  opts?: { followup?: boolean },
): Promise<void> {
  const session = await getSessionById(sessionId);
  const guildId = interaction.guildId ?? "global";
  let payload: { content?: string; embeds?: EmbedBuilder[]; files?: AttachmentBuilder[] };
  if (!session) {
    payload = { content: condenseLogs(logs).slice(0, 1900) || "—" };
  } else {
    const scenario = getScenarioById(session.scenarioId)!;
    const entities = await buildSessionEntities(session, guildId);
    const png = await MapRenderer.renderScenario({ scenario, round: session.round, entities });
    const file = new AttachmentBuilder(png, { name: "combate.png" });
    const embed = new EmbedBuilder()
      .setColor(0xe67e22)
      .setDescription(condenseLogs(logs).slice(0, 4000) || "—")
      .setImage("attachment://combate.png");
    payload = { embeds: [embed], files: [file] };
  }
  if (opts?.followup) await interaction.followUp(payload);
  else if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
  else await interaction.reply(payload);
}

export const combate: Command = {
  data: new SlashCommandBuilder()
    .setName("combate")
    .setDescription("Sistema de combate tático")
    .addSubcommand((s) =>
      s
        .setName("iniciar")
        .setDescription("Inicia um combate neste canal")
        .addStringOption((o) =>
          o.setName("jogadores").setDescription("Mencione os participantes (@a @b ...)").setRequired(false),
        ),
    )
    .addSubcommand((s) => s.setName("fim-turno").setDescription("Encerra seu turno"))
    .addSubcommand((s) => s.setName("pegar-arma").setDescription("Pega a arma caída na sua célula (ação comum)"))
    .addSubcommand((s) =>
      s
        .setName("agua")
        .setDescription("Ativa/desativa andar sobre a água (ação bônus)"),
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    switch (sub) {
      case "iniciar":
        return iniciar(interaction);
      case "fim-turno":
        return fimTurno(interaction);
      case "pegar-arma":
        return pegarArma(interaction);
      case "agua":
        return agua(interaction);
    }
  },
};

// aceita id exato ou nome (caso o usuario digite sem escolher do autocomplete)
function resolveAbilityId(input: string): string | null {
  if (getAbility(input)) return input;
  const lower = input.toLowerCase().trim();
  const byName = ALL_ABILITIES.find((a) => a.name.toLowerCase() === lower);
  if (byName) return byName.id;
  const partial = ALL_ABILITIES.find((a) => a.name.toLowerCase().includes(lower));
  return partial?.id ?? null;
}

async function iniciar(interaction: ChatInputCommandInteraction): Promise<void> {
  const channelId = interaction.channelId;
  const guildId = interaction.guildId ?? "global";
  const scenario = getScenarioByChannel(channelId);
  if (!scenario) {
    await interaction.reply({ content: "❌ Canal sem cenário.", ephemeral: true });
    return;
  }
  const existing = await getActiveSession(channelId);
  if (existing) {
    await interaction.reply({ content: "❌ Já existe um combate ativo neste canal.", ephemeral: true });
    return;
  }

  await interaction.deferReply();
  const users = new Map<string, { id: string; username: string }>();
  users.set(interaction.user.id, interaction.user);
  // membros da party do autor entram automaticamente
  for (const id of await partyMemberIds(guildId, interaction.user.id)) {
    if (users.has(id)) continue;
    try {
      const u = await interaction.client.users.fetch(id);
      users.set(u.id, u);
    } catch {
      /* ignora */
    }
  }
  // parse mentions do texto
  const raw = interaction.options.getString("jogadores") ?? "";
  for (const m of raw.matchAll(/<@!?(\d+)>/g)) {
    const id = m[1]!;
    try {
      const u = await interaction.client.users.fetch(id);
      users.set(u.id, u);
    } catch {
      /* ignora */
    }
  }

  if (users.size > BALANCE.maxParticipants) {
    await interaction.editReply(`❌ Máximo de ${BALANCE.maxParticipants} participantes.`);
    return;
  }

  const players = [];
  for (const u of users.values()) {
    const char = await getOrCreateCharacter(u.id, guildId, u.username);
    players.push({
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
    });
  }

  const session = await startCombat({
    channelId,
    guildId,
    scenarioId: scenario.id,
    players,
  });

  // cacheia atributos nos flags p/ a engine
  for (let i = 0; i < players.length; i++) {
    const p = session.participants[i]!;
    await prisma.combatParticipant.update({
      where: { id: p.id },
      data: { flagsJson: JSON.stringify({ attrs: players[i]!.attrs }) },
    });
  }

  await interaction.editReply(
    `⚔️ Combate iniciado em **${scenario.name}** com ${players.length} participante(s)!\nUse \`/mapa\` para ver o grid.`,
  );
}

async function getMyParticipant(interaction: ChatInputCommandInteraction) {
  const channelId = interaction.channelId;
  const guildId = interaction.guildId ?? "global";
  const session = await getActiveSession(channelId);
  if (!session) return { session: null, me: null };
  const char = await getOrCreateCharacter(interaction.user.id, guildId, interaction.user.username);
  const me = session.participants.find((p) => p.charId === char.id) ?? null;
  return { session, me };
}

function ensureMyTurn(session: SessionFull, meId: string): string | null {
  const active = activeParticipant(session);
  if (!active) return "Sem participante ativo.";
  if (active.id !== meId) return `Não é seu turno. Vez de **${active.name}**.`;
  return null;
}

export async function mover(interaction: ChatInputCommandInteraction): Promise<void> {
  const dest = interaction.options.getString("destino", true).toUpperCase();
  const { session, me } = await getMyParticipant(interaction);

  // sem combate ativo: pode ser a missao do gato neste canal
  if (!session || !me) {
    const handled = await moverMissaoGato(interaction, dest);
    if (handled) return;
    await interaction.reply({ content: "❌ Você não está em combate aqui.", ephemeral: true });
    return;
  }

  const turnErr = ensureMyTurn(session, me.id);
  if (turnErr) {
    await interaction.reply({ content: `❌ ${turnErr}`, ephemeral: true });
    return;
  }

  const scenario = getScenarioById(session.scenarioId)!;
  const isTree = (scenario.cells.trees ?? []).includes(dest);
  const isHeight = (scenario.cells.height ?? []).includes(dest);

  // ---- ALTURA (⬆️): subir gasta movimento + ação comum; confirma antes ----
  if (isHeight) {
    const chk = validateMove(session, me.id, dest);
    if (!chk.ok) {
      await interaction.reply({ content: `❌ ${chk.error}`, ephemeral: true });
      return;
    }
    if (me.actedCommon) {
      await interaction.reply({
        content: "❌ Subir na altura também gasta sua **ação comum**, e você já a usou nesta rodada.",
        ephemeral: true,
      });
      return;
    }
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("climb_confirm").setLabel("Subir (movimento + ação comum)").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("climb_cancel").setLabel("Cancelar").setStyle(ButtonStyle.Secondary),
    );
    const prompt = await interaction.reply({
      content: `⬆️ **${dest}** é terreno elevado. Para subir você gasta a **ação de movimento E a ação comum** desta rodada. Confirmar?`,
      components: [row],
      fetchReply: true,
    });
    try {
      const btn = (await prompt.awaitMessageComponent({
        componentType: ComponentType.Button,
        time: 30_000,
        filter: (i: ButtonInteraction) => i.user.id === interaction.user.id,
      })) as ButtonInteraction;
      if (btn.customId === "climb_confirm") {
        const res = await moveParticipant(session, me.id, dest, { elevated: true, alsoCommon: true });
        if (!res.ok) {
          await btn.update({ content: `❌ ${res.error}`, components: [] });
          return;
        }
        await btn.update({
          content: `🧗 **${me.name}** subiu para **${dest}** (terreno elevado).`,
          components: [],
        });
        await sendCombatView(interaction, session.id, [`🧗 **${me.name}** subiu para **${dest}** (movimento + ação comum). Bônus de altura.`], { followup: true });
      } else {
        await btn.update({ content: "Movimento cancelado. Escolha outra célula.", components: [] });
      }
    } catch {
      await prompt.edit({ content: "⌛ Tempo esgotado. Movimento cancelado.", components: [] }).catch(() => undefined);
    }
    return;
  }

  // ---- ÁRVORE (🌲): move normal, depois pergunta subir/ficar embaixo ----
  if (isTree) {
    const res = await moveParticipant(session, me.id, dest);
    if (!res.ok) {
      await interaction.reply({ content: `❌ ${res.error}`, ephemeral: true });
      return;
    }
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("tree_up").setLabel("🧗 Subir na árvore").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("tree_down").setLabel("⬇️ Ficar embaixo").setStyle(ButtonStyle.Secondary),
    );
    const prompt = await interaction.reply({
      content: `🌲 **${me.name}** chegou em **${dest}** (árvore). Subir na árvore (bônus de altura) ou ficar embaixo?`,
      components: [row],
      fetchReply: true,
    });
    try {
      const btn = (await prompt.awaitMessageComponent({
        componentType: ComponentType.Button,
        time: 30_000,
        filter: (i: ButtonInteraction) => i.user.id === interaction.user.id,
      })) as ButtonInteraction;
      if (btn.customId === "tree_up") {
        await setElevated(session, me.id, true);
        await btn.update({ content: `🧗 **${me.name}** subiu na árvore em **${dest}**.`, components: [] });
        await sendCombatView(interaction, session.id, [`🧗 **${me.name}** subiu na árvore em **${dest}**. Bônus de altura.`], { followup: true });
      } else {
        await btn.update({ content: `⬇️ **${me.name}** ficou embaixo da árvore em **${dest}**.`, components: [] });
        await sendCombatView(interaction, session.id, [`⬇️ **${me.name}** ficou embaixo em **${dest}**.`], { followup: true });
      }
    } catch {
      await prompt.edit({ content: `🌲 **${me.name}** ficou embaixo da árvore em **${dest}** (sem resposta).`, components: [] }).catch(() => undefined);
    }
    return;
  }

  // ---- movimento normal ----
  const res = await moveParticipant(session, me.id, dest);
  if (!res.ok) {
    await interaction.reply({ content: `❌ ${res.error}`, ephemeral: true });
    return;
  }
  await sendCombatView(interaction, session.id, [`🏃 **${me.name}** moveu-se para **${dest}**.`]);
}

// Movimento na missao do gato: limitado pelo alcance de movimento do personagem.
async function moverMissaoGato(interaction: ChatInputCommandInteraction, dest: string): Promise<boolean> {
  const channelId = interaction.channelId;
  const scenario = getScenarioByChannel(channelId);
  if (!scenario) return false;
  const guildId = interaction.guildId ?? "global";
  const char = await getOrCreateCharacter(interaction.user.id, guildId, interaction.user.username);
  const ctx = await getActiveInstanceForChannel(char.id, channelId);
  if (!ctx || ctx.def.type !== "FETCH_CAT") return false;

  const destCoord = dest.match(/^[A-F](?:[1-9]|10)$/);
  if (!destCoord) {
    await interaction.reply({ content: "❌ Célula inválida.", ephemeral: true });
    return true;
  }

  let state = readState<CatState>(ctx.inst.stateJson);
  if (!state.catCell) {
    state = { catCell: spawnCat(scenario, dest), playerCell: dest, turns: 0 };
  }
  // limite de movimento: 2 + floor(taijutsu/5)
  const limit = moveRange(char.attributes!.taijutsu);
  const d = cellDistance(state.playerCell, dest);
  if (d > limit) {
    await interaction.reply({
      content: `❌ Fora do alcance de movimento (máx **${limit}** casas a partir de ${state.playerCell}).`,
      ephemeral: true,
    });
    return true;
  }

  const data = ctx.def.data as unknown as CatMissionData;
  const step = catMissionStep(state, dest, scenario, data);
  await setState(ctx.inst.id, step.state);

  const logs = [`🏃 **${char.name}** foi para **${dest}**.`, ...step.logs];
  if (step.captured) {
    const result = await completeMission(char.id, ctx.def.id);
    if (result) logs.push(`✅ Recompensas: ${result.rewards.xp} XP, ${result.rewards.ryo} ryo.`);
  }

  const png = await renderCatMission(scenario, step.state, char, guildId);
  const file = new AttachmentBuilder(png, { name: "gato.png" });
  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setDescription(logs.join("\n").slice(0, 4000))
    .setImage("attachment://gato.png");
  await interaction.reply({ embeds: [embed], files: [file] });

  // criança agradece (webhook), aguarda 1 resposta do jogador
  if (step.captured) {
    await startKidDialogue(interaction.channel, channelId, interaction.user.id, char.name);
  }
  return true;
}

export async function usar(interaction: ChatInputCommandInteraction): Promise<void> {
  const { session, me } = await getMyParticipant(interaction);
  if (!session || !me) {
    await interaction.reply({ content: "❌ Você não está em combate aqui.", ephemeral: true });
    return;
  }
  const turnErr = ensureMyTurn(session, me.id);
  if (turnErr) {
    await interaction.reply({ content: `❌ ${turnErr}`, ephemeral: true });
    return;
  }
  const rawAbility = interaction.options.getString("habilidade", true);
  const abilityId = resolveAbilityId(rawAbility);
  const rawAlvo = interaction.options.getString("alvo") ?? null;

  await interaction.deferReply();
  if (!abilityId) {
    await interaction.editReply(`❌ Jutsu não encontrado: "${rawAbility}".`);
    return;
  }

  // alvo pode ser um participantId (escolhido no autocomplete) ou uma célula (ex: C4)
  let targetId: string | null = null;
  let targetCell: string | null = null;
  if (rawAlvo) {
    const part = session.participants.find((p) => p.id === rawAlvo);
    if (part) {
      targetId = part.id;
      targetCell = part.cell;
    } else {
      targetCell = rawAlvo.toUpperCase();
    }
  }

  const res = await useAbility(session, me.id, abilityId, targetCell, targetId);
  if (!res.ok) {
    await interaction.editReply(`❌ ${res.error}`);
    return;
  }

  const logs = [...res.logs];
  for (const hit of res.hits) {
    const hitLogs = await resolveWithReaction(interaction, session.id, hit, me.id);
    logs.push(...hitLogs);
  }

  await sendCombatView(interaction, session.id, logs);
  await checkVictory(interaction, session.id);
}

// Oferece janela de reacao ao alvo humano; NPC toma full.
async function resolveWithReaction(
  interaction: ChatInputCommandInteraction,
  sessionId: string,
  hit: AbilityHit,
  attackerId: string,
): Promise<string[]> {
  const session = await getSessionById(sessionId);
  const target = session?.participants.find((p) => p.id === hit.targetId);
  if (!target) return [];
  if (target.isNpc || !target.charId) {
    return resolveHit(sessionId, hit, attackerId, { reaction: "NONE" });
  }
  const targetChar = await prisma.userCharacter.findUnique({ where: { id: target.charId } });
  if (!targetChar) return resolveHit(sessionId, hit, attackerId, { reaction: "NONE" });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("react_DODGE").setLabel("Esquivar").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("react_BLOCK").setLabel("Bloquear").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("react_PARRY").setLabel("Aparar").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("react_NONE").setLabel("Sem reação").setStyle(ButtonStyle.Danger),
  );

  const prompt = await interaction.followUp({
    content: `🎯 <@${targetChar.discordId}> está sob ataque de **${hit.ability.name}** (~${hit.rawDamage} dano). Reaja em 20s:`,
    components: [row],
  });

  let reaction: "DODGE" | "BLOCK" | "PARRY" | "NONE" = "NONE";
  try {
    const btn = (await prompt.awaitMessageComponent({
      componentType: ComponentType.Button,
      time: 20_000,
      filter: (i: ButtonInteraction) => i.user.id === targetChar.discordId,
    })) as ButtonInteraction;
    reaction = btn.customId.replace("react_", "") as typeof reaction;
    await btn.update({ content: `🛡️ Reação: **${reaction}**`, components: [] });
  } catch {
    await prompt.edit({ content: "⌛ Sem reação a tempo (dano total).", components: [] }).catch(() => undefined);
  }

  return resolveHit(sessionId, hit, attackerId, { reaction });
}

async function checkVictory(interaction: ChatInputCommandInteraction, sessionId: string): Promise<void> {
  const session = await getSessionById(sessionId);
  if (!session || session.status !== "ACTIVE") return;
  const alive = session.participants.filter((p) => p.hpCurrent > 0);
  const playersAlive = alive.filter((p) => !p.isNpc).length;
  const npcsAlive = alive.filter((p) => p.isNpc).length;
  const hasNpcs = session.participants.some((p) => p.isNpc);

  // combate acaba quando um lado é eliminado (PvE) ou sobra <=1 jogador (PvP)
  const over = hasNpcs ? playersAlive === 0 || npcsAlive === 0 : playersAlive <= 1;
  if (!over) return;

  await endCombat(sessionId);
  await persistResources(session);

  if (playersAlive === 0) {
    await interaction.followUp("💀 **Todos os jogadores foram derrotados!** Combate perdido.");
    await onCombatLost(interaction, session);
    return;
  }

  // jogadores venceram (NPCs eliminados, ou PvP com 1 sobrevivente)
  await interaction.followUp("🏆 **Vitória dos jogadores!**");
  await onCombatEnded(interaction, session);
}

async function persistResources(session: SessionFull): Promise<void> {
  for (const p of session.participants) {
    if (p.isNpc || !p.charId) continue;
    const fresh = await prisma.combatParticipant.findUnique({ where: { id: p.id } });
    if (!fresh) continue;
    await prisma.userCharacter.update({
      where: { id: p.charId },
      data: { hpCurrent: Math.max(1, fresh.hpCurrent) },
    });
    await prisma.characterResourceState.update({
      where: { charId: p.charId },
      data: { chakra: fresh.chakra, energia: fresh.energia },
    });
  }
}

async function fimTurno(interaction: ChatInputCommandInteraction): Promise<void> {
  const { session, me } = await getMyParticipant(interaction);
  if (!session || !me) {
    await interaction.reply({ content: "❌ Você não está em combate aqui.", ephemeral: true });
    return;
  }
  const turnErr = ensureMyTurn(session, me.id);
  if (turnErr) {
    await interaction.reply({ content: `❌ ${turnErr}`, ephemeral: true });
    return;
  }
  await interaction.deferReply();
  const logs: string[] = [];
  let result = await endTurn(session.id);
  logs.push(...result.logs);

  // roda turnos de NPC automaticamente
  let guard = 0;
  while (guard++ < 30) {
    const s = await getSessionById(session.id);
    if (!s || s.status !== "ACTIVE") break;
    const active = activeParticipant(s);
    if (!active || !active.isNpc || active.hpCurrent <= 0) break;
    logs.push(`— Turno de **${active.name}** (NPC) —`);
    logs.push(...(await runNpcTurn(s.id, active.id)));
    result = await endTurn(s.id);
    logs.push(...result.logs);
    await checkVictory(interaction, s.id);
  }

  const s2 = await getSessionById(session.id);
  const nextActive = s2 && s2.status === "ACTIVE" ? activeParticipant(s2) : null;
  if (nextActive) logs.push(`➡️ Vez de **${nextActive.name}**.`);
  await sendCombatView(interaction, session.id, logs);
}

async function pegarArma(interaction: ChatInputCommandInteraction): Promise<void> {
  const { session, me } = await getMyParticipant(interaction);
  if (!session || !me) {
    await interaction.reply({ content: "❌ Você não está em combate aqui.", ephemeral: true });
    return;
  }
  const turnErr = ensureMyTurn(session, me.id);
  if (turnErr) {
    await interaction.reply({ content: `❌ ${turnErr}`, ephemeral: true });
    return;
  }
  if (me.actedCommon) {
    await interaction.reply({ content: "❌ Ação comum já usada.", ephemeral: true });
    return;
  }
  const msg = await pickUpWeapon(session.id, me.id);
  await prisma.combatParticipant.update({ where: { id: me.id }, data: { actedCommon: true } });
  await interaction.reply(`🗡️ ${msg}`);
}

async function agua(interaction: ChatInputCommandInteraction): Promise<void> {
  const { session, me } = await getMyParticipant(interaction);
  if (!session || !me) {
    await interaction.reply({ content: "❌ Você não está em combate aqui.", ephemeral: true });
    return;
  }
  if (me.actedBonus) {
    await interaction.reply({ content: "❌ Ação bônus já usada.", ephemeral: true });
    return;
  }
  const flags = me.flags;
  flags.waterWalk = !flags.waterWalk;
  await prisma.combatParticipant.update({
    where: { id: me.id },
    data: { flagsJson: JSON.stringify(flags), actedBonus: true },
  });
  await interaction.reply(
    flags.waterWalk
      ? `🌊 **${me.name}** passou a andar sobre a água (gasta ${BALANCE.waterWalkUpkeepPerTurn}% chakra/turno).`
      : `💧 **${me.name}** parou de andar sobre a água.`,
  );
}
