import { AttachmentBuilder, MessageFlags, SlashCommandBuilder, type ButtonInteraction, type ChatInputCommandInteraction } from "discord.js";
import sharp from "sharp";
import type { Command } from "./types.js";
import { getActiveSession } from "../services/combat/combat-engine.js";
import { getOrCreateCharacter } from "../services/characters/character-service.js";
import { getAbility } from "../data/index.js";
import { prisma } from "../db/client.js";

function panelImage(name: string, hp: number, max: number): Promise<Buffer> {
  const pct = Math.max(0, Math.min(1, hp / Math.max(1, max)));
  const svg = `<svg width="900" height="180" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#10151d"/><circle cx="100" cy="90" r="62" fill="#6f3e27"/><text x="100" y="105" font-size="68" text-anchor="middle">🐒</text><text x="190" y="65" fill="#f2d18b" font-size="30" font-family="sans-serif" font-weight="bold">${name}</text><rect x="190" y="95" width="640" height="28" rx="8" fill="#5d1d25"/><rect x="190" y="95" width="${Math.round(640 * pct)}" height="28" rx="8" fill="#36c977"/><text x="510" y="117" fill="white" font-size="18" text-anchor="middle" font-family="sans-serif">HP ${hp}/${max}</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export const invocacao: Command = {
  data: new SlashCommandBuilder().setName("invocacao").setDescription("Painel das suas invocações ativas"),
  async execute(interaction: ChatInputCommandInteraction) {
    const session = await getActiveSession(interaction.channelId);
    const char = await getOrCreateCharacter(interaction.user.id, interaction.guildId ?? "global", interaction.user.username);
    const mine = session?.participants.filter((p) => p.flags.isSummon && p.flags.summonerId === session.participants.find((x) => x.charId === char.id)?.id) ?? [];
    if (!mine.length) { await interaction.reply({ content: "Você não possui invocações ativas neste combate.", ephemeral: true }); return; }
    const files: AttachmentBuilder[] = [];
    const components: any[] = [];
    for (const [index, summon] of mine.entries()) {
      const filename = `invocacao-${index}.png`;
      files.push(new AttachmentBuilder(await panelImage(summon.name, summon.hpCurrent, summon.hpMax), { name: filename }));
      const skills = (JSON.parse(summon.jutsuIdsJson) as string[]).map(getAbility).filter(Boolean).map((a) => `• **${a!.name}**${a!.id === "enma_prisao_adamantina" ? " — recarga: 4 rodadas" : ""}`).join("\n") || "Sem habilidades ofensivas.";
      components.push({ type: 17, accent_color: 0x4f8a55, components: [
        { type: 10, content: `## ${summon.name}\n${skills}` },
        { type: 12, items: [{ media: { url: `attachment://${filename}` } }] },
        { type: 1, components: [
          { type: 2, style: 2, label: "Inimigo prioritário", custom_id: `invocacao:prioridade:${summon.id}` },
          { type: 2, style: 1, label: "Atacar: ligado", custom_id: `invocacao:atacar:${summon.id}` },
          { type: 2, style: 2, label: "↑", custom_id: `invocacao:mover:cima:${summon.id}` },
          { type: 2, style: 2, label: "←", custom_id: `invocacao:mover:esquerda:${summon.id}` },
          { type: 2, style: 2, label: "→", custom_id: `invocacao:mover:direita:${summon.id}` },
        ] },
      ] });
    }
    await interaction.reply({ flags: MessageFlags.IsComponentsV2, components, files } as any);
  },
  async handleButton(interaction: ButtonInteraction) {
    const [, action, ...parts] = interaction.customId.split(":");
    const summonId = parts.at(-1);
    const value = action === "mover" ? parts[0] : undefined;
    const session = await getActiveSession(interaction.channelId);
    const char = await getOrCreateCharacter(interaction.user.id, interaction.guildId ?? "global", interaction.user.username);
    const owner = session?.participants.find((p) => p.charId === char.id);
    const summon = session?.participants.find((p) => p.id === summonId && p.flags.isSummon && p.flags.summonerId === owner?.id);
    if (!summon) { await interaction.reply({ content: "Invocação inválida.", ephemeral: true }); return; }
    const flags = { ...summon.flags } as Record<string, unknown>;
    let message = "Ordem atualizada.";
    if (action === "atacar") { flags.attackEnabled = flags.attackEnabled === false; message = flags.attackEnabled === false ? "Ataque desativado." : "Ataque automático ativado."; }
    else if (action === "mover") { flags.moveDirection = value; message = `Direção manual: ${value}.`; }
    else if (action === "prioridade") {
      const enemies = session!.participants.filter((p) => p.teamId !== summon.teamId && p.hpCurrent > 0 && !p.flags.isSummon);
      const index = enemies.findIndex((p) => p.id === flags.priorityTargetId);
      const target = enemies[(index + 1) % enemies.length];
      if (!target) { await interaction.reply({ content: "Sem inimigos válidos.", ephemeral: true }); return; }
      flags.priorityTargetId = target.id; message = `Alvo prioritário: **${target.name}**.`;
    }
    await prisma.combatParticipant.update({ where: { id: summon.id }, data: { flagsJson: JSON.stringify(flags) } });
    await interaction.reply({ content: `✅ ${message}`, ephemeral: true });
  },
};
