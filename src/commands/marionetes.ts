import { ButtonStyle, SlashCommandBuilder, StringSelectMenuBuilder, type AnySelectMenuInteraction, type ButtonInteraction, type ChatInputCommandInteraction } from "discord.js";
import type { Command } from "./types.js";
import { getOrCreateCharacter } from "../services/characters/character-service.js";
import { claimPuppetConstruction, discardPuppet, listPuppetWorkshop, puppetCapabilities, PUPPET_OWNERSHIP_LIMIT, puppetRebuildIngredients, startPuppetRebuild, startPuppetUpgradeConstruction, uninstallPuppetUpgrade } from "../services/puppets/puppet-service.js";
import { craftNodeForGrade, getPuppetUpgrade, PUPPET_SHELLS, PUPPET_UPGRADES, type PuppetShell } from "../data/puppet-upgrades.js";
import { getItem } from "../data/items.js";
import { activeParticipant, deployPuppet, getActiveSession } from "../services/combat/combat-engine.js";
import { prisma } from "../db/client.js";
import { button, buttonRow, divider, economyContainer, factsBlock, itemLabel, listBlock, noticeBlock, ryo, selectRow, text, thumbnailSection, titleBlock, v2Payload, type ContainerChild, type TopLevel } from "../ui/economy-components-v2.js";
import { emoji } from "../ui/economy-emojis.js";

const PREFIX = "marionetes:v1";
const id = (action: string, value?: string) => `${PREFIX}:${action}${value ? `:${value}` : ""}`;
type Workshop = NonNullable<Awaited<ReturnType<typeof listPuppetWorkshop>>>;
type Feedback = { kind: "erro" | "sucesso" | "aviso"; message: string };

function remaining(from: Date): string {
  const ms = from.getTime() - Date.now();
  if (ms <= 0) return "pronta";
  const hours = Math.floor(ms / 3_600_000);
  const mins = Math.ceil((ms % 3_600_000) / 60_000);
  return hours ? `${hours}h ${mins}min` : `${mins}min`;
}

function upgradeRequirements(state: Workshop, upgradeId: string): string[] {
  const upgrade = getPuppetUpgrade(upgradeId);
  if (!upgrade) return [];
  const inventory = new Map(state.inventory.map((entry) => [entry.itemId, entry.qty]));
  const gradeUnlocked = state.skillNodes.some((node) => node.nodeId === craftNodeForGrade(upgrade.grade));
  return [
    `${ryo(upgrade.ryo)} Ryō — **${state.ryo}/${upgrade.ryo}**${state.ryo >= upgrade.ryo ? " ✓" : ` • falta **${upgrade.ryo - state.ryo}**`}`,
    `${emoji("informacao")} Nível — **${state.level}/${upgrade.reqLevel}**${state.level >= upgrade.reqLevel ? " ✓" : " • insuficiente"}`,
    `${emoji("mecanismo")} Oficina Grau ${upgrade.grade} — ${gradeUnlocked ? "**liberada** ✓" : "**bloqueada**"}`,
    ...upgrade.ingredients.map((ingredient) => {
      const have = inventory.get(ingredient.itemId) ?? 0;
      const missing = Math.max(0, ingredient.qty - have);
      return `${itemLabel(ingredient.itemId, getItem(ingredient.itemId)?.name ?? ingredient.itemId)} — **${have}/${ingredient.qty}**${missing ? ` • falta **${missing}**` : " ✓"}`;
    }),
  ];
}

function orderLabel(state: Workshop, order: Workshop["puppetOrders"][number]): string {
  if (order.kind === "PUPPET") return order.puppetName ?? "Marionete";
  if (order.kind === "REBUILD") return `Reconstrução de ${state.puppets.find((puppet) => puppet.id === order.puppetId)?.name ?? "marionete"}`;
  return getPuppetUpgrade(order.optionId)?.name ?? order.optionId;
}

function render(state: Workshop, selectedId: string | null, selectedUpgradeId: string | null = null, feedback?: Feedback, discardConfirmation = false): TopLevel[] {
  const selected = state.puppets.find((puppet) => puppet.id === selectedId) ?? state.puppets[0] ?? null;
  const caps = puppetCapabilities(state.skillNodes.map((node) => node.nodeId));
  const puppetSlots = state.puppets.length + state.puppetOrders.filter((order) => order.kind === "PUPPET" && ["BUILDING", "READY"].includes(order.status)).length;
  const children: ContainerChild[] = [
    titleBlock("marionete", "Oficina de Marionetes", "Construa, acompanhe e equipe seus mecanismos"),
    factsBlock([
      { label: `${emoji("ryo")} Ryō`, value: String(state.ryo) },
      { label: `${emoji("marionete")} Slots`, value: `${puppetSlots}/${PUPPET_OWNERSHIP_LIMIT}` },
      { label: "Em campo", value: `${caps.slots} marionete(s)` },
      { label: `${emoji("fios_chakra")} Alcance`, value: `${caps.leash} células` },
    ]),
    divider(),
  ];

  if (!state.skillNodes.some((node) => node.nodeId === "kugutsu_oficina_inicial")) {
    children.push(noticeBlock("bloqueio", "Compre **Oficina de Marionetes** na árvore de Kugutsu para liberar construções."));
    children.push(text(`-# Depois, abra ${emoji("marionete")} **/craft marionete** para criar a sua carapaça.`));
  } else if (!state.puppets.length) {
    children.push(noticeBlock("aviso", "Você ainda não possui uma marionete concluída."));
    children.push(text(`-# Use ${emoji("marionete")} **/craft marionete** para escolher a carapaça, conferir materiais e iniciar a obra.`));
  } else if (selected) {
    if (state.puppets.length > 1) {
      children.push(selectRow(new StringSelectMenuBuilder().setCustomId(id("selecionar")).setPlaceholder("Selecionar marionete")
        .addOptions(state.puppets.slice(0, 25).map((puppet) => ({
          label: puppet.name,
          value: puppet.id,
          description: `${PUPPET_SHELLS[puppet.shell as PuppetShell]?.name ?? puppet.shell} • ${puppet.upgrades.length}/2 mecanismos`,
          default: puppet.id === selected.id,
        })))));
      children.push(divider());
    }
    const shell = PUPPET_SHELLS[selected.shell as PuppetShell];
    const shellLines = [
      `**ID:** \`${selected.id}\``,
      `**Aparência:** ${selected.appearanceUrl ? "configurada para o mapa" : "não configurada"}`,
      `**Estado:** ${selected.destroyedAt ? "destruída" : "operacional"}`,
      `**Mecanismos (${selected.upgrades.length}/2):** ${selected.upgrades.length ? selected.upgrades.map((part) => `**${getPuppetUpgrade(part.upgradeId)?.name ?? part.upgradeId}**`).join(" • ") : "nenhum"}`,
      shell?.description ?? "",
    ].filter(Boolean);
    const shellMarkdown = `**${emoji("marionete")} ${shell?.name ?? selected.shell} — ${selected.name}**\n${shellLines.join("\n")}`;
    children.push(selected.appearanceUrl
      ? thumbnailSection(shellMarkdown, selected.appearanceUrl, selected.name)
      : text(shellMarkdown));
    if (selected.destroyedAt) {
      const ingredients = puppetRebuildIngredients(selected.shell as PuppetShell);
      const rebuilding = state.puppetOrders.some((order) => order.puppetId === selected.id && order.kind === "REBUILD" && order.status === "BUILDING");
      children.push(noticeBlock("erro", "Esta marionete foi destruída em combate e não pode ser invocada."));
      children.push(listBlock("Reconstrução — 2 horas, sem custo de Ryō", ingredients.map((ingredient) => itemLabel(ingredient.itemId, getItem(ingredient.itemId)?.name ?? ingredient.itemId, ingredient.qty)), "Nenhum material."));
      if (rebuilding) children.push(noticeBlock("aviso", "A reconstrução desta marionete já está em andamento."));
      else children.push(buttonRow(button({ id: id("reconstruir", selected.id), label: "Reconstruir marionete", style: ButtonStyle.Primary, emojiKey: "marionete" })));
    } else {
    if (selected.upgrades.length) {
      children.push(buttonRow(...selected.upgrades.map((part) => button({ id: id("remover", `${selected.id}:${part.upgradeId}`), label: `Remover ${getPuppetUpgrade(part.upgradeId)?.name ?? "mecanismo"}`.slice(0, 80), style: ButtonStyle.Danger, emojiKey: "mecanismo" }))));
    }
    if (selected.upgrades.length < 2) {
      children.push(selectRow(new StringSelectMenuBuilder().setCustomId(id("mecanismo", selected.id)).setPlaceholder("Escolher mecanismo para construir")
        .addOptions(PUPPET_UPGRADES.map((upgrade) => ({
          label: `Grau ${upgrade.grade} • ${upgrade.name}`,
          value: upgrade.id,
          description: `Nv. ${upgrade.reqLevel} • ${upgrade.durationHours}h • ${upgrade.ryo} Ryō`,
          default: upgrade.id === selectedUpgradeId,
        })))));
      const selectedUpgrade = selectedUpgradeId ? getPuppetUpgrade(selectedUpgradeId) : undefined;
      if (selectedUpgrade) {
        children.push(text(`**${emoji("mecanismo")} ${selectedUpgrade.name}**\n${selectedUpgrade.description}\n-# Construção: ${selectedUpgrade.durationHours}h • Grau ${selectedUpgrade.grade}.`));
        children.push(listBlock("Materiais necessários", upgradeRequirements(state, selectedUpgrade.id), "Nenhum material."));
        children.push(buttonRow(button({ id: id("construir", `${selected.id}:${selectedUpgrade.id}`), label: "Iniciar construção", style: ButtonStyle.Primary, emojiKey: "mecanismo" })));
      }
    } else {
      children.push(noticeBlock("aviso", "Esta marionete já possui os 2 mecanismos permitidos."));
    }
    children.push(buttonRow(button({ id: id("invocar", selected.id), label: "Invocar em combate", style: ButtonStyle.Primary, emojiKey: "marionete" })));
    children.push(text("-# A invocação usa sua ação bônus. A marionete recebe um turno próprio logo depois do seu."));
    }
    if (discardConfirmation) {
      children.push(noticeBlock("aviso", `Descartar **${selected.name}**? Esta ação apaga a marionete, seus mecanismos e obras pendentes sem reembolso.`));
      children.push(buttonRow(
        button({ id: id("confirmar-descarte", selected.id), label: "Confirmar descarte", style: ButtonStyle.Danger }),
        button({ id: id("cancelar-descarte", selected.id), label: "Cancelar", style: ButtonStyle.Secondary }),
      ));
    } else {
      children.push(buttonRow(button({ id: id("descartar", selected.id), label: "Descartar marionete", style: ButtonStyle.Danger })));
    }
  }

  const ready = state.puppetOrders.filter((order) => order.status === "READY");
  const building = state.puppetOrders.filter((order) => order.status === "BUILDING");
  if (ready.length || building.length) {
    children.push(divider());
    if (ready.length) children.push(listBlock("Pronto para recolher", ready.map((order) => `**${orderLabel(state, order)}**`), ""));
    if (ready.length) children.push(buttonRow(...ready.slice(0, 5).map((order) => button({ id: id("recolher", order.id), label: `Recolher ${orderLabel(state, order)}`.slice(0, 80), style: ButtonStyle.Success, emojiKey: "sucesso" }))));
    if (building.length) children.push(listBlock("Em construção", building.slice(0, 8).map((order) => `**${orderLabel(state, order)}** — ${remaining(order.finishesAt)}`), ""));
  }
  if (feedback) children.push(divider(), noticeBlock(feedback.kind, feedback.message));
  return [economyContainer("estoque", children)];
}

async function load(interaction: ChatInputCommandInteraction | ButtonInteraction | AnySelectMenuInteraction) {
  const char = await getOrCreateCharacter(interaction.user.id, interaction.guildId ?? "global", interaction.user.username);
  return { char, state: await listPuppetWorkshop(char.id) };
}

export const marionetes: Command = {
  data: new SlashCommandBuilder().setName("marionetes").setDescription("Gerencia suas marionetes e mecanismos"),
  async execute(interaction: ChatInputCommandInteraction) {
    const { state } = await load(interaction);
    if (!state) { await interaction.reply({ content: "❌ Personagem não encontrado.", ephemeral: true }); return; }
    await interaction.reply(v2Payload(render(state, null), true));
  },
  async handleSelect(interaction: AnySelectMenuInteraction) {
    if (!interaction.customId.startsWith(PREFIX) || !interaction.isStringSelectMenu()) return;
    const { state } = await load(interaction);
    if (!state) return;
    const [, , action, puppetId] = interaction.customId.split(":");
    if (action === "selecionar") await interaction.update({ components: render(state, interaction.values[0]!, null), flags: 1 << 15 });
    else if (action === "mecanismo" && puppetId) await interaction.update({ components: render(state, puppetId, interaction.values[0]!), flags: 1 << 15 });
  },
  async handleButton(interaction: ButtonInteraction) {
    if (!interaction.customId.startsWith(PREFIX)) return;
    const [, , action, ...values] = interaction.customId.split(":");
    const { char, state } = await load(interaction);
    if (!state) return;
    if (action === "recolher") {
      const result = await claimPuppetConstruction(char.id, values[0]!);
      const refreshed = await listPuppetWorkshop(char.id);
      await interaction.update({ components: render(refreshed!, null, null, result.ok ? { kind: "sucesso", message: "Construção recolhida e equipada na oficina." } : { kind: "erro", message: result.error }), flags: 1 << 15 });
      return;
    }
    if (action === "remover") {
      const [puppetId, upgradeId] = values;
      const result = await uninstallPuppetUpgrade(char.id, puppetId!, upgradeId!);
      const refreshed = await listPuppetWorkshop(char.id);
      await interaction.update({ components: render(refreshed!, puppetId!, null, result.ok ? { kind: "sucesso", message: `${result.upgrade} foi removido.` } : { kind: "erro", message: result.error }), flags: 1 << 15 });
      return;
    }
    if (action === "reconstruir") {
      const result = await startPuppetRebuild(char.id, values[0]!);
      const refreshed = await listPuppetWorkshop(char.id);
      await interaction.update({ components: render(refreshed!, values[0]!, null, result.ok
        ? { kind: "sucesso", message: `${result.puppet.name} entrou em reconstrução e ficará pronta em 2 horas.` }
        : { kind: "erro", message: result.error }), flags: 1 << 15 });
      return;
    }
    if (action === "descartar") {
      await interaction.update({ components: render(state, values[0]!, null, undefined, true), flags: 1 << 15 });
      return;
    }
    if (action === "cancelar-descarte") {
      await interaction.update({ components: render(state, values[0]!), flags: 1 << 15 });
      return;
    }
    if (action === "confirmar-descarte") {
      const result = await discardPuppet(char.id, values[0]!);
      const refreshed = await listPuppetWorkshop(char.id);
      await interaction.update({ components: render(refreshed!, null, null, result.ok
        ? { kind: "sucesso", message: `${result.name} foi descartada.` }
        : { kind: "erro", message: result.error }), flags: 1 << 15 });
      return;
    }
    if (action === "construir") {
      const [puppetId, upgradeId] = values;
      const result = await startPuppetUpgradeConstruction(char.id, puppetId!, upgradeId!);
      const refreshed = await listPuppetWorkshop(char.id);
      const upgrade = getPuppetUpgrade(upgradeId!);
      await interaction.update({ components: render(refreshed!, puppetId!, upgradeId!, result.ok
        ? { kind: "sucesso", message: `${upgrade?.name ?? "Mecanismo"} entrou em construção. Recolha-o aqui quando ficar pronto.` }
        : { kind: "erro", message: result.error }), flags: 1 << 15 });
      return;
    }
    if (action === "invocar") {
      const session = await getActiveSession(interaction.channelId);
      const owner = session?.participants.find((participant) => participant.charId === char.id);
      const active = session ? activeParticipant(session) : null;
      if (!session || !owner || active?.id !== owner.id) {
        await interaction.update({ components: render(state, values[0]!, null, { kind: "erro", message: "Você só pode invocar a marionete no seu próprio turno de combate." }), flags: 1 << 15 });
        return;
      }
      if (owner.actedBonus) {
        await interaction.update({ components: render(state, values[0]!, null, { kind: "erro", message: "A invocação usa sua ação bônus deste turno." }), flags: 1 << 15 });
        return;
      }
      const deployed = await deployPuppet(session, owner.id, values[0]!);
      if (!deployed.ok) {
        await interaction.update({ components: render(state, values[0]!, null, { kind: "erro", message: deployed.error }), flags: 1 << 15 });
        return;
      }
      await prisma.combatParticipant.update({ where: { id: owner.id }, data: { actedBonus: true } });
      const refreshed = await listPuppetWorkshop(char.id);
      await interaction.update({ components: render(refreshed!, values[0]!, null, { kind: "sucesso", message: `${deployed.name} entrou em campo; a invocação consumiu sua ação bônus.` }), flags: 1 << 15 });
    }
  },
};
