import { ButtonStyle, SlashCommandBuilder, StringSelectMenuBuilder, type AnySelectMenuInteraction, type ButtonInteraction, type ChatInputCommandInteraction } from "discord.js";
import type { Command } from "./types.js";
import { getOrCreateCharacter } from "../services/characters/character-service.js";
import { claimPuppetConstruction, listPuppetWorkshop, puppetCapabilities, uninstallPuppetUpgrade } from "../services/puppets/puppet-service.js";
import { getPuppetUpgrade, PUPPET_SHELLS, type PuppetShell } from "../data/puppet-upgrades.js";
import { activeParticipant, deployPuppet, getActiveSession } from "../services/combat/combat-engine.js";
import { prisma } from "../db/client.js";
import { button, buttonRow, divider, economyContainer, factsBlock, listBlock, noticeBlock, selectRow, text, titleBlock, v2Payload, type ContainerChild, type TopLevel } from "../ui/economy-components-v2.js";
import { emoji } from "../ui/economy-emojis.js";

const PREFIX = "marionetes:v1";
const id = (action: string, value?: string) => `${PREFIX}:${action}${value ? `:${value}` : ""}`;

type Workshop = NonNullable<Awaited<ReturnType<typeof listPuppetWorkshop>>>;

function remaining(from: Date): string {
  const ms = from.getTime() - Date.now();
  if (ms <= 0) return "pronta";
  const hours = Math.floor(ms / 3_600_000);
  const mins = Math.ceil((ms % 3_600_000) / 60_000);
  return hours ? `${hours}h ${mins}min` : `${mins}min`;
}

function render(state: Workshop, selectedId: string | null): TopLevel[] {
  const selected = state.puppets.find((puppet) => puppet.id === selectedId) ?? state.puppets[0] ?? null;
  const caps = puppetCapabilities(state.skillNodes.map((node) => node.nodeId));
  const children: ContainerChild[] = [
    titleBlock("marionete", "Oficina de Marionetes", "Construa, recolha e equipe seus mecanismos"),
    factsBlock([
      { label: "Ryō", value: String(state.ryo) },
      { label: "Em campo", value: `${caps.slots} marionete(s)` },
      { label: "Alcance dos fios", value: `${emoji("fios_chakra")} ${caps.leash} células` },
    ]),
    divider(),
  ];

  if (!state.skillNodes.some((node) => node.nodeId === "kugutsu_oficina_inicial")) {
    children.push(noticeBlock("bloqueio", "Compre **Oficina de Marionetes** na árvore de Kugutsu para liberar construções."));
    return [economyContainer("estoque", children)];
  }

  if (!state.puppets.length) {
    children.push(noticeBlock("aviso", "Você ainda não possui uma marionete concluída."), text("-# Use `/craft marionete nome:<nome> carapaca:<tipo>` para iniciar sua primeira carapaça."));
  } else {
    if (state.puppets.length > 1) {
      children.push(
        selectRow(
          new StringSelectMenuBuilder()
            .setCustomId(id("selecionar"))
            .setPlaceholder("Selecionar marionete")
            .addOptions(state.puppets.slice(0, 25).map((puppet) => ({
              label: puppet.name,
              value: puppet.id,
              description: `${PUPPET_SHELLS[puppet.shell as PuppetShell]?.name ?? puppet.shell} • ${puppet.upgrades.length}/2 mecanismos`,
              default: puppet.id === selected?.id,
            }))),
        ),
      );
      children.push(divider());
    }
    if (selected) {
      const shell = PUPPET_SHELLS[selected.shell as PuppetShell];
      children.push(
        listBlock(`🪆 ${shell?.name ?? selected.shell} — ${selected.name}`, [
          `**ID:** \`${selected.id}\``,
          `**Mecanismos (${selected.upgrades.length}/2):** ${selected.upgrades.length ? selected.upgrades.map((part) => `**${getPuppetUpgrade(part.upgradeId)?.name ?? part.upgradeId}**`).join(" • ") : "nenhum"}`,
          shell?.description ?? "",
        ].filter(Boolean), ""),
      );
      if (selected.upgrades.length) {
        children.push(buttonRow(...selected.upgrades.map((part) => button({ id: id("remover", `${selected.id}:${part.upgradeId}`), label: `Remover ${getPuppetUpgrade(part.upgradeId)?.name ?? "mecanismo"}`.slice(0, 80), style: ButtonStyle.Danger, emojiKey: "mecanismo" }))));
      }
      children.push(buttonRow(button({ id: id("invocar", selected.id), label: "Invocar em combate", style: ButtonStyle.Primary, emojiKey: "marionete" })));
      children.push(text("-# Cada marionete aceita até 2 mecanismos. Inicie uma nova peça com `/craft evolucao` e recolha-a abaixo quando finalizar."));
    }
  }

  const ready = state.puppetOrders.filter((order) => order.status === "READY");
  const building = state.puppetOrders.filter((order) => order.status === "BUILDING");
  if (ready.length || building.length) {
    children.push(divider());
    if (ready.length) children.push(listBlock("Pronto para recolher", ready.map((order) => `**${order.kind === "PUPPET" ? order.puppetName : getPuppetUpgrade(order.optionId)?.name ?? order.optionId}**`), ""));
    if (ready.length) children.push(buttonRow(...ready.slice(0, 5).map((order) => button({ id: id("recolher", order.id), label: `Recolher ${order.kind === "PUPPET" ? order.puppetName : getPuppetUpgrade(order.optionId)?.name ?? "peça"}`.slice(0, 80), style: ButtonStyle.Success, emojiKey: "sucesso" }))));
    if (building.length) children.push(listBlock("Em construção", building.slice(0, 8).map((order) => `**${order.kind === "PUPPET" ? order.puppetName : getPuppetUpgrade(order.optionId)?.name ?? order.optionId}** — ${remaining(order.finishesAt)}`), ""));
  }
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
    if (!state) { await interaction.reply({ content: "❌ Personagem não encontrado.", ephemeral: true }); return; }
    await interaction.update({ components: render(state, interaction.values[0]!), flags: 1 << 15 });
  },
  async handleButton(interaction: ButtonInteraction) {
    if (!interaction.customId.startsWith(PREFIX)) return;
    const [, , action, ...values] = interaction.customId.split(":");
    const { char, state } = await load(interaction);
    if (!state) { await interaction.reply({ content: "❌ Personagem não encontrado.", ephemeral: true }); return; }
    if (action === "recolher") {
      const result = await claimPuppetConstruction(char.id, values[0]!);
      if (!result.ok) { await interaction.reply({ content: `❌ ${result.error}`, ephemeral: true }); return; }
      const refreshed = await listPuppetWorkshop(char.id);
      await interaction.update({ components: render(refreshed!, null), flags: 1 << 15 });
      return;
    }
    if (action === "remover") {
      const [puppetId, upgradeId] = values;
      const result = await uninstallPuppetUpgrade(char.id, puppetId!, upgradeId!);
      if (!result.ok) { await interaction.reply({ content: `❌ ${result.error}`, ephemeral: true }); return; }
      const refreshed = await listPuppetWorkshop(char.id);
      await interaction.update({ components: render(refreshed!, puppetId!), flags: 1 << 15 });
      return;
    }
    if (action === "invocar") {
      const session = await getActiveSession(interaction.channelId);
      const owner = session?.participants.find((participant) => participant.charId === char.id);
      const active = session ? activeParticipant(session) : null;
      if (!session || !owner || active?.id !== owner.id) {
        await interaction.reply({ content: "❌ Você só pode invocar uma marionete no seu próprio turno de combate.", ephemeral: true });
        return;
      }
      if (owner.actedCommon) {
        await interaction.reply({ content: "❌ A invocação usa sua ação comum deste turno.", ephemeral: true });
        return;
      }
      const deployed = await deployPuppet(session, owner.id, values[0]!);
      if (!deployed.ok) { await interaction.reply({ content: `❌ ${deployed.error}`, ephemeral: true }); return; }
      await prisma.combatParticipant.update({ where: { id: owner.id }, data: { actedCommon: true } });
      await interaction.reply({ content: `✅ **${deployed.name}** entrou em campo. A invocação consumiu sua ação comum.`, ephemeral: true });
    }
  },
};
