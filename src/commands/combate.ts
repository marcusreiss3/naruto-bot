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
  type Message,
} from "discord.js";
import type { Command } from "./types.js";
import { prisma } from "../db/client.js";
import { getScenarioByChannel, getScenarioById, ALL_ABILITIES } from "../data/index.js";
import { moveRange } from "../services/characters/formulas.js";
import {
  buildMissionCompleteEmbed,
  getActiveInstanceForChannel,
  readState,
  setState,
  completeMission,
} from "../services/missions/mission-service.js";
import { catMissionStep, renderCatMission, spawnCat, type CatState, type CatMissionData } from "../services/missions/cat.js";
import { cellDistance, resolveActingParticipantId } from "../services/combat/combat-math.js";
import { BALANCE } from "../config/balance.js";
import { getOrCreateCharacter, attrsFromRow } from "../services/characters/character-service.js";
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
  previewAbilityArea,
  isAreaShape,
  resolveHit,
  endTurn,
  activeParticipant,
  pickUpWeapon,
  attemptFlee,
  getSessionById,
  type AbilityHit,
  type SessionFull,
  type StartPlayer,
} from "../services/combat/combat-engine.js";
import { runNpcTurn } from "../services/combat/npc-combat.js";
import { getAbility } from "../data/index.js";
import { onCombatEnded, onCombatLost } from "../services/missions/mission-runtime.js";
import { partyMemberIds } from "../services/party/party-service.js";
import { MapRenderer } from "../services/maps/renderer.js";
import { buildSessionEntities, condenseLogs } from "../services/combat/combat-render.js";
import { startKidDialogue } from "../services/missions/kid-dialogue.js";
import { moverCleanVillage } from "../services/missions/clean-village.js";
import { moverRoofCleanup } from "../services/missions/roof-cleanup.js";

// Tempo para confirmar um jutsu de area antes de cancelar sozinho.
const PREVIEW_TIMEOUT_MS = 30_000;

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
    )
    .addSubcommand((s) =>
      s
        .setName("byakugan")
        .setDescription("Ativa/desativa o Byakugan (ação bônus, clã Hyuuga)"),
    )
    .addSubcommand((s) =>
      s
        .setName("ketsuryuugan")
        .setDescription("Ativa/desativa o Ketsuryuugan (ação bônus, clã Chinoike)"),
    )
    .addSubcommand((s) =>
      s.setName("fugir").setDescription("Tenta fugir do combate (ação comum, gasta energia)"),
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
      case "byakugan":
        return byakugan(interaction);
      case "ketsuryuugan":
        return ketsuryuugan(interaction);
      case "fugir":
        return fugir(interaction);
    }
  },
};

// Tenta sair do combate. Quanto mais inimigo colado, menor a chance.
async function fugir(interaction: ChatInputCommandInteraction): Promise<void> {
  const { session, me } = await getMyParticipant(interaction);
  if (!session) {
    await interaction.reply({ content: "Não há combate ativo neste canal.", ephemeral: true });
    return;
  }
  if (!me) {
    await interaction.reply({ content: "Você não está neste combate.", ephemeral: true });
    return;
  }
  const active = activeParticipant(session);
  if (active?.id !== me.id) {
    await interaction.reply({ content: "Não é o seu turno.", ephemeral: true });
    return;
  }

  await interaction.deferReply();
  const res = await attemptFlee(session.id, me.id);
  if (!res.ok) {
    await interaction.editReply(`❌ ${res.error}`);
    return;
  }
  await sendCombatView(interaction, session.id, res.logs);
}

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

  const players: StartPlayer[] = [];
  for (const u of users.values()) {
    const char = await getOrCreateCharacter(u.id, guildId, u.username);
    players.push({
      charId: char.id,
      name: char.name,
      level: char.level,
      hpCurrent: char.hpCurrent,
      hpMax: char.hpMax,
      chakra: char.resources!.chakra,
      energia: char.resources!.energia,
      jutsuIds: char.jutsus.map((j) => j.jutsuId),
      attrs: attrsFromRow(char.attributes!),
      nodes: char.skillNodes.map((n) => n.nodeId),
    });
  }

  const session = await startCombat({
    channelId,
    guildId,
    scenarioId: scenario.id,
    players,
  });

  // cacheia atributos e nos da arvore nos flags p/ a engine. Snapshot: no
  // comprado no meio da luta so vale no proximo combate.
  for (let i = 0; i < players.length; i++) {
    const p = session.participants.find((part) => part.charId === players[i]!.charId);
    if (!p) continue;
    await prisma.combatParticipant.update({
      where: { id: p.id },
      data: { flagsJson: JSON.stringify({ level: players[i]!.level, attrs: players[i]!.attrs, nodes: players[i]!.nodes }) },
    });
  }

  await interaction.editReply(
    `⚔️ Combate iniciado em **${scenario.name}** com ${players.length} participante(s)!\nUse \`/mapa\` para ver o grid.`,
  );
}

// Resolve por qual CombatParticipant o usuario age agora: o proprio, ou o
// corpo que estiver pilotando via Shintenshin (Yamanaka) — ver
// resolveActingParticipantId em combat-math.ts. `me` vem null tanto se o
// jogador nao esta em combate quanto se o PROPRIO corpo dele foi capturado
// (a mente esta em outro lugar, nao pode agir).
async function getMyParticipant(interaction: ChatInputCommandInteraction) {
  const channelId = interaction.channelId;
  const guildId = interaction.guildId ?? "global";
  const session = await getActiveSession(channelId);
  if (!session) return { session: null, me: null };
  const char = await getOrCreateCharacter(interaction.user.id, guildId, interaction.user.username);
  const own = session.participants.find((p) => p.charId === char.id) ?? null;
  if (!own) return { session, me: null };
  // passa quem esta na vez agora: com os Clones de Transferencia de Mente o
  // jogador pode pilotar ate' 3 corpos ao mesmo tempo, entao precisa saber
  // QUAL deles esta ativo pra ensureMyTurn nao acusar "nao e' seu turno" errado.
  const actingId = resolveActingParticipantId(own, session.participants, activeParticipant(session)?.id);
  const me = actingId ? session.participants.find((p) => p.id === actingId) ?? null : null;
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
    const cleanHandled = await moverCleanVillage(interaction, dest);
    if (cleanHandled) return;
    const roofHandled = await moverRoofCleanup(interaction, dest);
    if (roofHandled) return;
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
  let missionCompleteEmbed: EmbedBuilder | null = null;
  if (step.captured) {
    const result = await completeMission(char.id, ctx.def.id);
    if (result) missionCompleteEmbed = buildMissionCompleteEmbed(ctx.def.name, result.rewards);
  }

  const png = await renderCatMission(scenario, step.state, char, guildId);
  const file = new AttachmentBuilder(png, { name: "gato.png" });
  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setDescription(logs.join("\n").slice(0, 4000))
    .setImage("attachment://gato.png");
  await interaction.reply({ embeds: missionCompleteEmbed ? [embed, missionCompleteEmbed] : [embed], files: [file] });

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

  // jutsu de area: mostra o que vai ser atingido e pede confirmacao
  const confirmed = await confirmAreaAbility(interaction, session, me, abilityId, targetCell);
  if (!confirmed) return;

  const res = await useAbility(session, me.id, abilityId, targetCell, targetId);
  if (!res.ok) {
    await interaction.editReply({ content: `❌ ${res.error}`, embeds: [], files: [], components: [] });
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

// Mostra a area de um jutsu no mapa e pede confirmacao antes de gastar recurso.
// Retorna true se pode seguir (confirmado, ou nao e jutsu de area).
async function confirmAreaAbility(
  interaction: ChatInputCommandInteraction,
  session: SessionFull,
  me: SessionFull["participants"][number],
  abilityId: string,
  targetCell: string | null,
): Promise<boolean> {
  const ability = getAbility(abilityId);
  if (!ability || !isAreaShape(ability)) return true;

  // jutsu de area sem alvo nao tem direcao: nao da para desenhar nem acertar.
  // Avisa aqui em vez de deixar o useAbility recusar sem explicar o porque.
  if (!targetCell) {
    await interaction.editReply(
      `❌ **${ability.name}** precisa de um alvo para saber a direção.\n` +
        "Escolha alguém no autocomplete de `alvo`, ou passe uma célula (ex: `alvo:C4`).",
    );
    return false;
  }

  const preview = previewAbilityArea(session, me.id, ability, targetCell);
  if (!preview) return true;

  const scenario = getScenarioById(session.scenarioId)!;
  const guildId = interaction.guildId ?? "global";
  const entities = await buildSessionEntities(session, guildId);
  const nums = numberSameNames(session.participants);
  const nameOf = (p: SessionFull["participants"][number]) => displayName(p.name, nums.get(p.id));

  // vermelho quando so pega inimigo; laranja quando tem aliado na area
  const color = preview.allies.length ? "#e67e22" : "#e74c3c";
  const png = await MapRenderer.renderScenario({
    scenario,
    round: session.round,
    entities,
    highlight: { cells: preview.cells, color },
    highlightOrigin: me.cell,
  });
  const file = new AttachmentBuilder(png, { name: "preview.png" });

  const shapeLabel =
    ability.shape === "CONE" ? "cone" : ability.shape === "LINE" ? "linha" : "área";
  const lines: string[] = [
    `**${ability.name}** — ${shapeLabel}, alcance ${ability.range}, custo ${ability.cost}% ${ability.resource}.`,
    `Atinge **${preview.cells.length}** célula(s).`,
  ];
  if (preview.enemies.length) {
    lines.push(`🔴 Inimigos na área: ${preview.enemies.map(nameOf).join(", ")}`);
  }
  if (preview.allies.length) {
    lines.push(`⚠️ **Também acerta seus aliados: ${preview.allies.map(nameOf).join(", ")}**`);
  }
  if (!preview.enemies.length && !preview.allies.length) {
    lines.push("⚪ Nenhum alvo na área.");
  }
  if (preview.confused) {
    lines.push("😵 Você está confuso — o alvo real pode ser outro.");
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("jutsu_confirm")
      .setLabel("Confirmar")
      .setStyle(preview.allies.length ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId("jutsu_cancel").setLabel("Cancelar").setStyle(ButtonStyle.Secondary),
  );

  const embed = new EmbedBuilder()
    .setColor(preview.allies.length ? 0xe67e22 : 0xe74c3c)
    .setTitle("Confirmar jutsu")
    .setDescription(lines.join("\n"))
    .setImage("attachment://preview.png");

  const prompt = await interaction.editReply({ embeds: [embed], files: [file], components: [row] });

  try {
    const click = await (prompt as Message).awaitMessageComponent({
      componentType: ComponentType.Button,
      time: PREVIEW_TIMEOUT_MS,
      filter: (i) => i.user.id === interaction.user.id,
    });
    await click.deferUpdate();
    if (click.customId === "jutsu_cancel") {
      await interaction.editReply({
        content: "❌ Jutsu cancelado. Nenhum recurso gasto.",
        embeds: [],
        files: [],
        components: [],
      });
      return false;
    }
    return true;
  } catch {
    await interaction.editReply({
      content: "⌛ Tempo esgotado. Jutsu cancelado, nenhum recurso gasto.",
      embeds: [],
      files: [],
      components: [],
    });
    return false;
  }
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
  // Yamanaka: se o corpo alvo estiver sob controle mental, quem escolhe a
  // reacao e' o CONTROLADOR (a mente que esta la agora), nao o dono original
  // (que esta imovel/inconsciente em outro lugar).
  const reactor = target.controlledById
    ? (session!.participants.find((p) => p.id === target.controlledById) ?? target)
    : target;
  if (reactor.isNpc || !reactor.charId) {
    return resolveHit(sessionId, hit, attackerId, { reaction: "NONE" });
  }
  const targetChar = await prisma.userCharacter.findUnique({ where: { id: reactor.charId } });
  if (!targetChar) return resolveHit(sessionId, hit, attackerId, { reaction: "NONE" });

  // reacoes por JUTSU que o alvo possui (Substituicao etc). Lidas ao vivo do DB.
  const ownedRows = await prisma.characterJutsu.findMany({
    where: { charId: reactor.charId },
    select: { jutsuId: true },
  });
  const reactionJutsus = ownedRows
    .map((r) => getAbility(r.jutsuId))
    .filter((a): a is NonNullable<typeof a> => !!a && a.actionType === "REACAO");

  // ---- Passo 1: reagir ou levar o dano ----
  const gateRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("rx_react").setLabel("🛡️ Reagir").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("rx_none").setLabel("💥 Levar dano").setStyle(ButtonStyle.Danger),
  );

  const prompt = await interaction.followUp({
    content: `🎯 <@${targetChar.discordId}> está sob ataque de **${hit.ability.name}** (~${hit.rawDamage} dano). Reagir em 20s?`,
    components: [gateRow],
  });

  const mine = (i: ButtonInteraction) => i.user.id === targetChar.discordId;

  let gate: ButtonInteraction;
  try {
    gate = (await prompt.awaitMessageComponent({
      componentType: ComponentType.Button,
      time: 20_000,
      filter: mine,
    })) as ButtonInteraction;
  } catch {
    await prompt.edit({ content: "⌛ Sem reação a tempo (dano total).", components: [] }).catch(() => undefined);
    return resolveHit(sessionId, hit, attackerId, { reaction: "NONE" });
  }

  if (gate.customId === "rx_none") {
    await gate.update({ content: "💥 Encarou o golpe (dano total).", components: [] });
    return resolveHit(sessionId, hit, attackerId, { reaction: "NONE" });
  }

  // ---- Passo 2: qual reacao ----
  // esquiva normal + um botao por jutsu de reacao + bloquear/aparar base.
  const buttons: ButtonBuilder[] = [
    new ButtonBuilder().setCustomId("rx_dodge").setLabel("💨 Esquiva normal").setStyle(ButtonStyle.Primary),
  ];
  for (const j of reactionJutsus.slice(0, 5)) {
    buttons.push(new ButtonBuilder().setCustomId(`rx_j_${j.id}`).setLabel(j.name.slice(0, 40)).setStyle(ButtonStyle.Success));
  }
  buttons.push(new ButtonBuilder().setCustomId("rx_block").setLabel("🛡️ Bloquear").setStyle(ButtonStyle.Secondary));
  buttons.push(new ButtonBuilder().setCustomId("rx_parry").setLabel("🗡️ Aparar").setStyle(ButtonStyle.Secondary));

  // Discord: max 5 botoes por linha.
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(i, i + 5)));
  }
  await gate.update({ content: `🛡️ <@${targetChar.discordId}>, escolha a reação (15s):`, components: rows });

  let reaction: "DODGE" | "BLOCK" | "PARRY" | "NONE" = "NONE";
  let reactionAbilityId: string | undefined;
  try {
    const btn = (await prompt.awaitMessageComponent({
      componentType: ComponentType.Button,
      time: 15_000,
      filter: mine,
    })) as ButtonInteraction;
    const id = btn.customId;
    if (id === "rx_dodge") reaction = "DODGE";
    else if (id === "rx_block") reaction = "BLOCK";
    else if (id === "rx_parry") reaction = "PARRY";
    else if (id.startsWith("rx_j_")) {
      reactionAbilityId = id.slice("rx_j_".length);
      const ab = getAbility(reactionAbilityId);
      reaction = (ab?.reactionKind ?? "DODGE") as typeof reaction;
    }
    await btn.update({ content: `🛡️ Reação escolhida.`, components: [] });
  } catch {
    await prompt.edit({ content: "⌛ Demorou pra escolher (dano total).", components: [] }).catch(() => undefined);
  }

  return resolveHit(sessionId, hit, attackerId, { reaction, reactionAbilityId });
}

async function checkVictory(interaction: ChatInputCommandInteraction, sessionId: string): Promise<void> {
  const session = await getSessionById(sessionId);
  if (!session || session.status !== "ACTIVE") return;
  // Invocacoes (clone/golem) sao isNpc mas NAO decidem o combate: sem excluir,
  // um clone do jogador ainda vivo contaria como inimigo e a luta nunca acabaria.
  const real = session.participants.filter((p) => p.flags.isSummon !== true);
  const alive = real.filter((p) => p.hpCurrent > 0);
  const playersAlive = alive.filter((p) => !p.isNpc).length;
  const npcsAlive = alive.filter((p) => p.isNpc).length;
  const hasNpcs = real.some((p) => p.isNpc);

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
    // controlledById: um jogador roubou o corpo deste NPC (Shintenshin) —
    // quem age agora e' o jogador, nao a IA.
    if (!active || !active.isNpc || active.hpCurrent <= 0 || active.controlledById) break;
    logs.push(`— Turno de **${active.name}** (${active.flags.isSummon ? "invocação" : "NPC"}) —`);
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
  // Tecnica da Caminhada Aquatica (Fundamentos): so quem comprou o jutsu
  // pode ligar/desligar o andar sobre a agua.
  if (!me.isNpc && me.charId) {
    const has = await prisma.characterJutsu.findFirst({
      where: { charId: me.charId, jutsuId: "tecnica_caminhada_aquatica" },
    });
    if (!has) {
      await interaction.reply({
        content: "❌ Você não aprendeu a Técnica da Caminhada Aquática.",
        ephemeral: true,
      });
      return;
    }
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

// Byakugan (Hyuuga): mesmo padrao de toggle+upkeep da Caminhada Aquatica —
// fica ligado ate' ser desativado ou faltar chakra, em vez de gastar toda
// vez que usa. Serve de modelo pra outros doujutsu no futuro (Sharingan etc.).
async function byakugan(interaction: ChatInputCommandInteraction): Promise<void> {
  const { session, me } = await getMyParticipant(interaction);
  if (!session || !me) {
    await interaction.reply({ content: "❌ Você não está em combate aqui.", ephemeral: true });
    return;
  }
  if (me.actedBonus) {
    await interaction.reply({ content: "❌ Ação bônus já usada.", ephemeral: true });
    return;
  }
  if (!me.isNpc && me.charId) {
    const has = await prisma.characterJutsu.findFirst({
      where: { charId: me.charId, jutsuId: "hyuuga_byakugan" },
    });
    if (!has) {
      await interaction.reply({ content: "❌ Você não desbloqueou o Byakugan.", ephemeral: true });
      return;
    }
  }
  const flags = me.flags;
  flags.byakuganActive = !flags.byakuganActive;
  await prisma.combatParticipant.update({
    where: { id: me.id },
    data: { flagsJson: JSON.stringify(flags), actedBonus: true },
  });
  await interaction.reply(
    flags.byakuganActive
      ? `👁️ **${me.name}** ativou o Byakugan (+${Math.round(BALANCE.byakuganDodgeBonus * 100)}% de esquiva contra qualquer ataque; gasta ${BALANCE.byakuganUpkeepPerTurn}% chakra/turno).`
      : `👁️ **${me.name}** desativou o Byakugan.`,
  );
}

// Ketsuryuugan (Chinoike): mesmo padrao de toggle+upkeep do Byakugan.
async function ketsuryuugan(interaction: ChatInputCommandInteraction): Promise<void> {
  const { session, me } = await getMyParticipant(interaction);
  if (!session || !me) {
    await interaction.reply({ content: "❌ Você não está em combate aqui.", ephemeral: true });
    return;
  }
  if (me.actedBonus) {
    await interaction.reply({ content: "❌ Ação bônus já usada.", ephemeral: true });
    return;
  }
  if (!me.isNpc && me.charId) {
    const has = await prisma.characterJutsu.findFirst({
      where: { charId: me.charId, jutsuId: "chinoike_doujutsu" },
    });
    if (!has) {
      await interaction.reply({ content: "❌ Você não desbloqueou o Ketsuryuugan.", ephemeral: true });
      return;
    }
  }
  const flags = me.flags;
  flags.ketsuryuuganActive = !flags.ketsuryuuganActive;
  await prisma.combatParticipant.update({
    where: { id: me.id },
    data: { flagsJson: JSON.stringify(flags), actedBonus: true },
  });
  await interaction.reply(
    flags.ketsuryuuganActive
      ? `🩸 **${me.name}** ativou o Ketsuryuugan (+${Math.round(BALANCE.ketsuryuuganDodgeBonus * 100)}% de esquiva contra qualquer ataque; gasta ${BALANCE.ketsuryuuganUpkeepPerTurn}% chakra/turno).`
      : `🩸 **${me.name}** desativou o Ketsuryuugan.`,
  );
}
