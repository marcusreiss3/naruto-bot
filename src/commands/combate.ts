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
import { emoji } from "../ui/economy-emojis.js";
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
import type { Element } from "../config/enums.js";
import { getOrCreateCharacter, attrsFromRow } from "../services/characters/character-service.js";
import { isSparringChannel } from "../services/combat/sparring.js";
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
  stepMove,
  finishMovement,
  movementBudget,
  movementUsed,
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
import { pickUpInventoryItem } from "../services/characters/inventory.js";
import { tenketsuSealed } from "../services/combat/effects.js";
import { MapRenderer } from "../services/maps/renderer.js";
import { buildSessionEntities, condenseLogs } from "../services/combat/combat-render.js";
import { buildCombatEmbed, buildStatusEmbed, combatRows, turnPhase } from "../services/combat/combat-view.js";
import { startKidDialogue } from "../services/missions/kid-dialogue.js";
import { moverCleanVillage } from "../services/missions/clean-village.js";
import { moverRoofCleanup } from "../services/missions/roof-cleanup.js";
import { withTraitNode } from "../services/characters/trait-service.js";

// Tempo para confirmar um jutsu de area antes de cancelar sozinho.
const PREVIEW_TIMEOUT_MS = 30_000;

type ViewPayload = {
  content?: string;
  embeds?: EmbedBuilder[];
  files?: AttachmentBuilder[];
  components?: ActionRowBuilder<ButtonBuilder>[];
};

// Descobre o discordId de um participante p/ marcar o dono do turno.
async function participantMention(p: SessionFull["participants"][number]): Promise<string | null> {
  if (p.isNpc || !p.charId) return null;
  const uc = await prisma.userCharacter.findUnique({
    where: { id: p.charId },
    select: { discordId: true },
  });
  return uc ? `<@${uc.discordId}>` : null;
}

// Monta o payload completo do turno: mapa renderizado, embed com o painel de
// acoes e os botoes da fase atual. Usado tanto no envio novo quanto na edicao
// (botao de movimento) — por isso devolve o payload em vez de enviar.
async function buildCombatPayload(
  sessionId: string,
  guildId: string,
  logs: string[],
  opts?: { controls?: boolean; mention?: boolean },
): Promise<ViewPayload> {
  const session = await getSessionById(sessionId);
  if (!session) return { content: condenseLogs(logs).slice(0, 1900) || "—" };

  const scenario = getScenarioById(session.scenarioId)!;
  const entities = await buildSessionEntities(session, guildId);
  // So' o grid: sem coordenadas, titulo, legenda nem barras dentro do PNG —
  // as coordenadas viraram botoes e o status virou embed de texto abaixo.
  const png = await MapRenderer.renderScenario({
    scenario,
    round: session.round,
    entities,
    drops: session.drops.map((d) => ({ cell: d.cell })),
    includeStatusPanel: false,
    showMetadata: false,
  });
  const file = new AttachmentBuilder(png, { name: "combate.png" });

  const active = session.status === "ACTIVE" ? activeParticipant(session) : null;
  const phase = turnPhase(active);
  const budget = active ? movementBudget(session, active) : 0;
  const used = active ? movementUsed(active) : 0;

  const embed = buildCombatEmbed({
    session,
    active,
    logs,
    phase,
    moveBudget: budget,
    moveUsed: used,
  });

  // segundo embed = status; empilhado na MESMA mensagem, entao continua
  // tudo editavel de uma vez a cada passo do movimento
  const status = buildStatusEmbed(session);
  const embeds = status ? [embed, status] : [embed];

  const payload: ViewPayload = { embeds, files: [file], components: [] };
  // controles so' aparecem no turno de um jogador de verdade
  if (opts?.controls && active && phase !== "NPC" && phase !== "NEUTRO") {
    payload.components = combatRows({ phase, stepsLeft: Math.max(0, budget - used) });
  }
  if (opts?.mention && active) {
    const mention = await participantMention(active);
    if (mention) payload.content = mention;
  }
  return payload;
}

// Renderiza o mapa do combate + log enxuto num embed e envia.
// `movement` liga os controles do turno; `mention` marca o dono da vez (so'
// quando o turno TROCA de dono, pra nao pingar a cada acao do proprio jogador).
async function sendCombatView(
  interaction: ChatInputCommandInteraction,
  sessionId: string,
  logs: string[],
  opts?: { followup?: boolean; movement?: boolean; mention?: boolean },
): Promise<void> {
  const guildId = interaction.guildId ?? "global";
  const payload = await buildCombatPayload(sessionId, guildId, logs, {
    controls: opts?.movement,
    mention: opts?.mention ?? opts?.movement,
  });
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
    .addSubcommand((s) => s.setName("pegar-item").setDescription("Pega um item largado na sua célula (ação comum)"))
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
      s
        .setName("sharingan")
        .setDescription("Ativa/desativa um estágio do Sharingan (ação bônus, clã Uchiha)")
        .addIntegerOption((o) =>
          o
            .setName("tomoe")
            .setDescription("Estágio do Sharingan que deseja ativar")
            .setRequired(true)
            .addChoices(
              { name: "Primeiro Tomoe", value: 1 },
              { name: "Segundo Tomoe", value: 2 },
              { name: "Terceiro Tomoe", value: 3 },
            ),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("portao")
        .setDescription("Ativa/desativa um Portão Interno (ação bônus)")
        .addIntegerOption((o) =>
          o
            .setName("portao")
            .setDescription("Portão Interno que deseja abrir")
            .setRequired(true)
            .addChoices(
              { name: "Portão da Abertura", value: 1 },
              { name: "Portão do Descanso", value: 2 },
              { name: "Portão da Vida", value: 3 },
              { name: "Portão da Dor", value: 4 },
              { name: "Portão do Fechamento", value: 5 },
              { name: "Portão da Alegria", value: 6 },
              { name: "Portão da Tristeza", value: 7 },
              { name: "Portão da Morte", value: 8 },
            ),
        ),
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
      case "pegar-item":
        return pegarItem(interaction);
      case "agua":
        return agua(interaction);
      case "byakugan":
        return byakugan(interaction);
      case "ketsuryuugan":
        return ketsuryuugan(interaction);
      case "sharingan":
        return sharingan(interaction);
      case "portao":
        return portao(interaction);
      case "fugir":
        return fugir(interaction);
    }
  },
  async handleButton(interaction: ButtonInteraction) {
    if (!interaction.customId.startsWith("combate:movimento:")) return;
    await handleMovementButton(interaction);
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
      nodes: withTraitNode(char.skillNodes.map((n) => n.nodeId), char.trait?.traitId),
      elements: char.elements.map((e) => e.element as Element),
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
      data: {
        flagsJson: JSON.stringify({
          level: players[i]!.level,
          attrs: players[i]!.attrs,
          nodes: players[i]!.nodes,
          elements: players[i]!.elements,
        }),
      },
    });
  }

  await interaction.editReply(
    `${emoji("combate")} Combate iniciado em **${scenario.name}** com ${players.length} participante(s)!\nUse \`/mapa\` para ver o grid.`,
  );
  await sendCombatView(interaction, session.id, ["O combate começou. Escolha seu deslocamento."], {
    followup: true,
    movement: true,
  });
}

// Resolve por qual CombatParticipant o usuario age agora: o proprio, ou o
// corpo que estiver pilotando via Shintenshin (Yamanaka) — ver
// resolveActingParticipantId em combat-math.ts. `me` vem null tanto se o
// jogador nao esta em combate quanto se o PROPRIO corpo dele foi capturado
// (a mente esta em outro lugar, nao pode agir).
async function getMyParticipant(interaction: ChatInputCommandInteraction | ButtonInteraction) {
  const channelId = interaction.channelId;
  const guildId = interaction.guildId ?? "global";
  const session = await getActiveSession(channelId);
  if (!session) return { session: null, me: null };
  const char = await getOrCreateCharacter(interaction.user.id, guildId, interaction.user.username);
  const own = session.participants.find((p) => p.charId === char.id) ?? null;
  if (!own) return { session, me: null };
  const active = activeParticipant(session);
  if (active?.flags.isPuppet && active.flags.controllerId === own.id) {
    return { session, me: active };
  }
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

// Deslocamento de cada botao do D-pad. A distancia do grid e' Chebyshev,
// entao a diagonal custa igual a reta.
const DIR_DELTA: Record<string, { dRow: number; dCol: number }> = {
  cima: { dRow: -1, dCol: 0 },
  baixo: { dRow: 1, dCol: 0 },
  esquerda: { dRow: 0, dCol: -1 },
  direita: { dRow: 0, dCol: 1 },
  noroeste: { dRow: -1, dCol: -1 },
  nordeste: { dRow: -1, dCol: 1 },
  sudoeste: { dRow: 1, dCol: -1 },
  sudeste: { dRow: 1, dCol: 1 },
};

// Reescreve a propria mensagem do turno com o mapa e o painel atualizados.
async function refreshTurnMessage(
  interaction: ButtonInteraction,
  sessionId: string,
  logs: string[],
): Promise<void> {
  const payload = await buildCombatPayload(sessionId, interaction.guildId ?? "global", logs, {
    controls: true,
    mention: true,
  });
  await interaction.update({
    content: payload.content ?? "",
    embeds: payload.embeds ?? [],
    files: payload.files ?? [],
    components: payload.components ?? [],
  });
}

async function handleMovementButton(interaction: ButtonInteraction): Promise<void> {
  const direction = interaction.customId.split(":")[2]!;
  const { session, me } = await getMyParticipant(interaction);
  if (!session || !me) { await interaction.reply({ content: "❌ Você não está neste combate.", ephemeral: true }); return; }
  const turnErr = ensureMyTurn(session, me.id);
  if (turnErr) { await interaction.reply({ content: `❌ ${turnErr}`, ephemeral: true }); return; }
  if (me.actedMove) { await interaction.reply({ content: "❌ Movimento já encerrado nesta rodada.", ephemeral: true }); return; }

  // "concluir" (e o antigo "parado") fecham o deslocamento e liberam as acoes
  if (direction === "concluir" || direction === "parado") {
    const result = await finishMovement(session, me.id);
    if (!result.ok) { await interaction.reply({ content: `❌ ${result.error}`, ephemeral: true }); return; }
    const moved = movementUsed(me) > 0;
    const logs = [
      moved
        ? `**${me.name}** encerrou o deslocamento em **${me.cell}**.`
        : `**${me.name}** permaneceu em **${me.cell}**.`,
      "Ação comum e ação bônus liberadas — use `/jutsu`.",
    ];
    await refreshTurnMessage(interaction, session.id, logs);
    return;
  }

  const delta = DIR_DELTA[direction];
  if (!delta) { await interaction.reply({ content: "❌ Direção inválida.", ephemeral: true }); return; }
  const cell = /^([A-Z])(\d+)$/.exec(me.cell);
  const scenario = getScenarioById(session.scenarioId)!;
  if (!cell) { await interaction.reply({ content: "❌ Posição inválida.", ephemeral: true }); return; }
  const row = cell[1]!.charCodeAt(0) - 65 + delta.dRow;
  const col = Number(cell[2]) + delta.dCol;
  if (row < 0 || row >= scenario.rows || col < 1 || col > scenario.cols) {
    await interaction.reply({ content: "❌ Você não pode sair do mapa.", ephemeral: true });
    return;
  }
  const dest = `${String.fromCharCode(65 + row)}${col}`;
  const result = await stepMove(session, me.id, dest);
  if (!result.ok) { await interaction.reply({ content: `❌ ${result.error}`, ephemeral: true }); return; }

  const logs = [`**${me.name}** moveu-se para **${dest}**.`];
  if (result.finished) {
    logs.push("Deslocamento encerrado — ação comum e ação bônus liberadas, use `/jutsu`.");
  } else {
    logs.push(`Restam **${result.left}** célula(s) de deslocamento.`);
  }
  // o mapa e o painel sao reescritos a cada passo, na mesma mensagem
  await refreshTurnMessage(interaction, session.id, logs);
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
  const limit = moveRange();
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
  let missionResult: Awaited<ReturnType<typeof completeMission>> = null;
  if (step.captured) {
    missionResult = await completeMission(char.id, ctx.def.id);
  }

  const png = await renderCatMission(scenario, step.state, char, guildId);
  const file = new AttachmentBuilder(png, { name: "gato.png" });
  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setDescription(logs.join("\n").slice(0, 4000))
    .setImage("attachment://gato.png");
  await interaction.reply({ embeds: [embed], files: [file] });
  // Components V2 nao pode conviver no mesmo payload com o embed do gato —
  // vai como mensagem separada, igual as ~45 missoes de historia.
  if (missionResult) await interaction.followUp(buildMissionCompleteEmbed(ctx.def.name, missionResult));

  // criança agradece (webhook), aguarda 1 resposta do jogador
  if (step.captured) {
    await startKidDialogue(interaction.channel, channelId, interaction.user.id, char.name);
  }
  return true;
}

export async function usar(interaction: ChatInputCommandInteraction): Promise<void> {
  const rawAbility = interaction.options.getString("habilidade", true);
  const abilityId = resolveAbilityId(rawAbility);
  if (!abilityId) {
    await interaction.reply({ content: `❌ Jutsu não encontrado: "${rawAbility}".`, ephemeral: true });
    return;
  }
  const rawAlvo = interaction.options.getString("alvo") ?? null;
  await executeKnownAbility(interaction, abilityId, rawAlvo);
}

export async function executeKnownAbility(
  interaction: ChatInputCommandInteraction,
  abilityId: string,
  rawAlvo: string | null,
  options?: {
    allowUnlearned?: boolean;
    afterAccepted?: () => Promise<{ ok: true } | { ok: false; error: string }>;
  },
): Promise<boolean> {
  const { session, me } = await getMyParticipant(interaction);
  if (!session || !me) {
    await interaction.reply({ content: "❌ Você não está em combate aqui.", ephemeral: true });
    return false;
  }
  const turnErr = ensureMyTurn(session, me.id);
  if (turnErr) {
    await interaction.reply({ content: `❌ ${turnErr}`, ephemeral: true });
    return false;
  }
  await interaction.deferReply();
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
  if (!confirmed) return false;

  const res = await useAbility(session, me.id, abilityId, targetCell, targetId, {
    allowUnlearned: options?.allowUnlearned,
  });
  if (!res.ok) {
    await interaction.editReply({ content: `❌ ${res.error}`, embeds: [], files: [], components: [] });
    return false;
  }
  if (options?.afterAccepted) {
    const accepted = await options.afterAccepted();
    if (!accepted.ok) {
      await interaction.editReply({
        content: `❌ A ação foi aceita, mas o item não pôde ser consumido: ${accepted.error}`,
        embeds: [],
        files: [],
        components: [],
      });
      return false;
    }
  }

  const logs = [...res.logs];
  for (const hit of res.hits) {
    const hitLogs = await resolveWithReaction(interaction, session.id, hit, me.id);
    logs.push(...hitLogs);
  }

  await checkVictory(interaction, session.id);
  // gastou movimento + comum + bonus? o turno passa sozinho e o proximo
  // jogador ja recebe o fluxo completo (mapa + painel + botoes).
  const advanceLogs = await autoAdvanceIfDone(interaction, session.id, me.id);
  logs.push(...advanceLogs);
  await sendCombatView(interaction, session.id, logs, {
    movement: await nextIsPlayer(session.id),
    // so' pinga se o turno realmente mudou de dono
    mention: advanceLogs.length > 0,
  });
  return true;
}

// O proximo a agir e' um jogador? (define se os controles vao junto do embed)
async function nextIsPlayer(sessionId: string): Promise<boolean> {
  const s = await getSessionById(sessionId);
  if (!s || s.status !== "ACTIVE") return false;
  const active = activeParticipant(s);
  return Boolean(active && (!active.isNpc || active.controlledById || active.flags.isPuppet));
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
    // alcance EFETIVO (preview.range), nao o declarado: passiva/trait de
    // alcance so' aparece pro jogador se for mostrada aqui.
    `**${ability.name}** — ${shapeLabel}, alcance ${preview.range}, custo ${ability.cost}% ${ability.resource}.`,
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
  if (target.flags.reactionUsedRound === session!.round) {
    await interaction.followUp({
      content: `⏳ **${target.name}** já usou uma reação defensiva nesta rodada e não pode reagir novamente.`,
    });
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
    .filter(
      (a): a is NonNullable<typeof a> =>
        !!a &&
        a.actionType === "REACAO" &&
        (!a.requiresActiveDoujutsu || reactor.flags[a.requiresActiveDoujutsu.flag] === true),
    );
  // Modificador de Aparência é um mecanismo, não um CharacterJutsu. Enquanto
  // uma marionete equipada estiver viva no campo, ele entra no mesmo seletor
  // de reações do dono.
  const puppetSubstitution = session!.participants.some((p) =>
    p.hpCurrent > 0 && p.flags.isPuppet && p.flags.controllerId === target.id
      && Array.isArray(p.flags.puppetUpgrades)
      && (p.flags.puppetUpgrades as string[]).includes("modificador_aparencia"),
  );
  if (puppetSubstitution) {
    const ability = getAbility("kugutsu_modificador_aparencia");
    if (ability) reactionJutsus.push(ability);
  }

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
  for (const j of reactionJutsus.slice(0, 12)) {
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
  const sparring = isSparringChannel(session.channelId);
  if (!sparring) await persistResources(session);
  const treinoNote = sparring ? "\n-# ⚔️ Combate de treino: sua vida real não foi afetada." : "";

  if (playersAlive === 0) {
    await interaction.followUp(`💀 **Todos os jogadores foram derrotados!** Combate perdido.${treinoNote}`);
    await onCombatLost(interaction, session);
    return;
  }

  // jogadores venceram (NPCs eliminados, ou PvP com 1 sobrevivente)
  await interaction.followUp(`🏆 **Vitória dos jogadores!**${treinoNote}`);
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

// Passa a vez e resolve todos os turnos de NPC seguidos, parando no proximo
// jogador. Devolve os logs acumulados. Compartilhado pelo /combate fim-turno,
// pelo botao "Encerrar turno" e pelo avanco automatico.
async function advanceTurn(
  interaction: ChatInputCommandInteraction,
  sessionId: string,
): Promise<string[]> {
  const logs: string[] = [];
  let result = await endTurn(sessionId);
  logs.push(...result.logs);

  // roda turnos de NPC automaticamente
  let guard = 0;
  while (guard++ < 30) {
    const s = await getSessionById(sessionId);
    if (!s || s.status !== "ACTIVE") break;
    const active = activeParticipant(s);
    // controlledById: um jogador roubou o corpo deste NPC (Shintenshin) —
    // quem age agora e' o jogador, nao a IA.
    if (!active || !active.isNpc || active.hpCurrent <= 0 || active.controlledById || active.flags.isPuppet) break;
    logs.push(`— Turno de **${active.name}** (${active.flags.isSummon ? "invocação" : "NPC"}) —`);
    logs.push(...(await runNpcTurn(s.id, active.id)));
    result = await endTurn(s.id);
    logs.push(...result.logs);
    await checkVictory(interaction, s.id);
  }

  const s2 = await getSessionById(sessionId);
  const nextActive = s2 && s2.status === "ACTIVE" ? activeParticipant(s2) : null;
  if (nextActive) logs.push(`➡️ Vez de **${nextActive.name}**.`);
  return logs;
}

// True quando o participante nao tem mais nada a gastar na rodada. Marionete
// nao tem acao comum/bonus propria (so' movimento): quem realmente esgota
// essas duas e' o condutor, entao o turno dela so' fecha quando a economia
// COMPARTILHADA do condutor tambem estiver zerada.
function turnExhausted(p: SessionFull["participants"][number], session: SessionFull): boolean {
  const economyOwner = p.flags.isPuppet
    ? session.participants.find((x) => x.id === p.flags.controllerId) ?? p
    : p;
  return p.actedMove && economyOwner.actedCommon && economyOwner.actedBonus;
}

// Depois de qualquer acao, se o jogador gastou movimento + comum + bonus o
// turno passa sozinho e o fluxo recomeca no proximo participante. Devolve os
// logs do avanco (vazio quando ainda sobra acao).
async function autoAdvanceIfDone(
  interaction: ChatInputCommandInteraction,
  sessionId: string,
  participantId: string,
): Promise<string[]> {
  const s = await getSessionById(sessionId);
  if (!s || s.status !== "ACTIVE") return [];
  const active = activeParticipant(s);
  // so' avanca se quem esgotou as acoes ainda e' quem esta na vez
  if (!active || active.id !== participantId || !turnExhausted(active, s)) return [];
  return advanceTurn(interaction, sessionId);
}

// Acoes que respondem so' com texto (toggles de dojutsu, portao, pegar item,
// agua...) tambem podem esgotar o turno. Quando esgotam, o proximo turno vai
// num post novo no canal, com mapa, painel e botoes.
async function afterSideAction(
  interaction: ChatInputCommandInteraction,
  sessionId: string,
  participantId: string,
): Promise<void> {
  const logs = await autoAdvanceIfDone(interaction, sessionId, participantId);
  if (!logs.length) return;
  const payload = await buildCombatPayload(sessionId, interaction.guildId ?? "global", logs, {
    controls: await nextIsPlayer(sessionId),
    mention: true,
  });
  if (interaction.channel && "send" in interaction.channel) {
    await interaction.channel.send(payload);
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
  const logs = await advanceTurn(interaction, session.id);
  const s2 = await getSessionById(session.id);
  const nextActive = s2 && s2.status === "ACTIVE" ? activeParticipant(s2) : null;
  await sendCombatView(interaction, session.id, logs, {
    movement: Boolean(nextActive && (!nextActive.isNpc || nextActive.flags.isPuppet)),
  });
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
  await afterSideAction(interaction, session.id, me.id);
}

async function pegarItem(interaction: ChatInputCommandInteraction): Promise<void> {
  const { session, me } = await getMyParticipant(interaction);
  if (!session || !me?.charId) {
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
  const result = await pickUpInventoryItem(me.charId, session.id, me.cell);
  if (!result.ok) {
    await interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
    return;
  }
  await prisma.combatParticipant.update({ where: { id: me.id }, data: { actedCommon: true } });
  await interaction.reply(`📦 ${me.name} pegou **${result.amount}x ${result.name}**.`);
  await afterSideAction(interaction, session.id, me.id);
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
  await afterSideAction(interaction, session.id, me.id);
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
  await afterSideAction(interaction, session.id, me.id);
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
  await afterSideAction(interaction, session.id, me.id);
}

async function portao(interaction: ChatInputCommandInteraction): Promise<void> {
  const { session, me } = await getMyParticipant(interaction);
  if (!session || !me) {
    await interaction.reply({ content: "❌ Você não está em combate aqui.", ephemeral: true });
    return;
  }
  if (me.actedBonus) {
    await interaction.reply({ content: "❌ Ação bônus já usada.", ephemeral: true });
    return;
  }

  const gate = interaction.options.getInteger("portao", true);
  const rules = BALANCE.punhoForteGates[gate];
  if (!rules) {
    await interaction.reply({ content: "❌ Esse Portão Interno ainda não está disponível.", ephemeral: true });
    return;
  }
  const gateNames: Record<number, string> = {
    1: "da Abertura",
    2: "do Descanso",
    3: "da Vida",
    4: "da Dor",
    5: "do Fechamento",
    6: "da Alegria",
    7: "da Tristeza",
    8: "da Morte",
  };
  const currentGate = typeof me.flags.punhoForteGate === "number" ? me.flags.punhoForteGate : 0;
  if (currentGate === 8) {
    await interaction.reply({
      content: "☠️ O Portão da Morte não pode ser fechado nem trocado: ele permanece aberto até você morrer.",
      ephemeral: true,
    });
    return;
  }
  if (gate > 1 && currentGate !== gate - 1 && currentGate !== gate) {
    await interaction.reply({ content: `❌ Abra primeiro o Portão ${gateNames[gate - 1]}.`, ephemeral: true });
    return;
  }
  // Selo dos Tenketsu (Hyuuga): abrir Portao e' forcar chakra pelos tenketsu,
  // entao o selo tranca a abertura. Nao fecha Portao ja' aberto (nem o proprio
  // comando de FECHAR, que passa por aqui com `disabling`): o selo barra a
  // porta, nao desfaz o que ja' passou.
  const closing = currentGate === gate;
  if (!closing && tenketsuSealed(me.effects)) {
    await interaction.reply({
      content: "❌ Seus tenketsu estão selados: você não consegue forçar chakra para abrir um Portão.",
      ephemeral: true,
    });
    return;
  }
  const gateAbilityIds: Record<number, string> = {
    1: "tai_portao_abertura",
    2: "tai_portao_descanso",
    3: "tai_portao_vida",
    4: "tai_portao_dor",
    5: "tai_portao_fechamento",
    6: "tai_portao_alegria",
    7: "tai_portao_tristeza",
    8: "tai_portao_morte",
  };
  if (!me.isNpc && me.charId) {
    const has = await prisma.characterJutsu.findFirst({
      where: { charId: me.charId, jutsuId: gateAbilityIds[gate] },
    });
    if (!has) {
      await interaction.reply({ content: `❌ Você não aprendeu o Portão ${gateNames[gate]}.`, ephemeral: true });
      return;
    }
  }

  const flags = me.flags;
  const disabling = flags.punhoForteGate === gate;
  flags.punhoForteGate = disabling ? undefined : gate;
  await prisma.combatParticipant.update({
    where: { id: me.id },
    data: { flagsJson: JSON.stringify(flags), actedBonus: true },
  });

  await interaction.reply(
    disabling
      ? `💨 **${me.name}** fechou o Portão ${gateNames[gate]}.`
      : `💨 **${me.name}** abriu o Portão ${gateNames[gate]} (+${Math.round((rules.taijutsuDamageMult - 1) * 100)}% de dano de Taijutsu; perde ${rules.selfDamagePerTurn} HP no início de cada turno).`,
  );
  await afterSideAction(interaction, session.id, me.id);
}

async function sharingan(interaction: ChatInputCommandInteraction): Promise<void> {
  const { session, me } = await getMyParticipant(interaction);
  if (!session || !me) {
    await interaction.reply({ content: "❌ Você não está em combate aqui.", ephemeral: true });
    return;
  }
  if (me.actedBonus) {
    await interaction.reply({ content: "❌ Ação bônus já usada.", ephemeral: true });
    return;
  }

  const tomoe = interaction.options.getInteger("tomoe", true) as 1 | 2 | 3;
  const abilityId = `uchiha_sharingan_${tomoe}_tomoe`;
  if (!me.isNpc && me.charId) {
    const has = await prisma.characterJutsu.findFirst({
      where: { charId: me.charId, jutsuId: abilityId },
    });
    if (!has) {
      await interaction.reply({
        content: `❌ Você não desbloqueou o Sharingan de ${tomoe} tomoe.`,
        ephemeral: true,
      });
      return;
    }
  }

  const flags = me.flags;
  const disabling = flags.sharinganTomoe === tomoe;
  flags.sharinganTomoe = disabling ? undefined : tomoe;
  flags.sharinganCopiedAbilityId = undefined;
  await prisma.combatParticipant.update({
    where: { id: me.id },
    data: { flagsJson: JSON.stringify(flags), actedBonus: true },
  });

  if (disabling) {
    await interaction.reply(`👁️ **${me.name}** desativou o Sharingan.`);
    await afterSideAction(interaction, session.id, me.id);
    return;
  }
  const rules = BALANCE.sharingan[tomoe];
  await interaction.reply(
    `🔴 **${me.name}** ativou o Sharingan de ${tomoe} tomoe (+${Math.round(rules.dodgeBonus * 100)}% de esquiva; gasta ${rules.upkeepPerTurn}% de chakra por turno${tomoe === 3 ? "; copia Ninjutsus elementais e estilos de Taijutsu elegíveis observados" : ""}).`,
  );
  await afterSideAction(interaction, session.id, me.id);
}
