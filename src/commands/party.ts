import { ButtonStyle, SlashCommandBuilder, type ButtonInteraction, type ChatInputCommandInteraction } from "discord.js";
import type { Command } from "./types.js";
import { accept, decline, getMyParty, invite, leave, type PartyView } from "../services/party/party-service.js";
import {
  button,
  buttonRow,
  divider,
  economyContainer,
  factsBlock,
  listBlock,
  noticeBlock,
  text,
  titleBlock,
  v2Payload,
  v2Public,
  type TopLevel,
} from "../ui/economy-components-v2.js";
import { emoji } from "../ui/economy-emojis.js";

const INVITE_PREFIX = "party:invite";
const inviteButtonId = (action: "accept" | "decline", inviteId: string) =>
  `${INVITE_PREFIX}:${action}:${inviteId}`;

function memberLines(party: PartyView): string[] {
  return party.memberIds.map((id) =>
    id === party.leaderId
      ? `${emoji("lider_party")} <@${id}> — líder`
      : `${emoji("party")} <@${id}>`,
  );
}

function errorPanel(message: string): TopLevel[] {
  return [economyContainer("erro", [noticeBlock("erro", message)])];
}

export function invitePanel(inviterId: string, inviteeId: string, inviteId: string): TopLevel[] {
  return [
    economyContainer("vila", [
      titleBlock("party", "Convite para party", "Una seu esquadrão para missões e combates."),
      divider(),
      text(`${emoji("convite")} <@${inviteeId}>, <@${inviterId}> quer você na party.`),
      text("-# Só a pessoa convidada pode responder. O convite expira em 10 minutos."),
      divider(),
      buttonRow(
        button({
          id: inviteButtonId("accept", inviteId),
          label: "Entrar na party",
          style: ButtonStyle.Success,
          emojiKey: "sucesso",
        }),
        button({
          id: inviteButtonId("decline", inviteId),
          label: "Recusar",
          style: ButtonStyle.Secondary,
          emojiKey: "erro",
        }),
      ),
    ]),
  ];
}

export function partyPanel(party: PartyView, title = "Sua party", subtitle?: string): TopLevel[] {
  return [
    economyContainer("vila", [
      titleBlock("party", title, subtitle ?? "Joguem juntos em missões e combates."),
      factsBlock([
        { label: "Líder", value: `${emoji("lider_party")} <@${party.leaderId}>` },
        { label: "Integrantes", value: `${party.memberIds.length}` },
      ]),
      divider(),
      listBlock("Integrantes", memberLines(party), "Nenhum integrante encontrado."),
    ]),
  ];
}

function acceptedPanel(inviteeId: string, party: PartyView): TopLevel[] {
  return partyPanel(party, "Party formada", `<@${inviteeId}> entrou no esquadrão.`);
}

function declinedPanel(inviteeId: string): TopLevel[] {
  return [
    economyContainer("aviso", [
      titleBlock("party", "Convite recusado"),
      noticeBlock("aviso", `<@${inviteeId}> decidiu não entrar na party.`),
    ]),
  ];
}

function leftPanel(disbanded: boolean, userId: string): TopLevel[] {
  return [
    economyContainer("aviso", [
      titleBlock("party", disbanded ? "Party dissolvida" : "Você saiu da party"),
      noticeBlock(
        "aviso",
        disbanded
          ? `<@${userId}> era o líder, então a party foi dissolvida.`
          : `<@${userId}> saiu da party.`,
      ),
    ]),
  ];
}

export const party: Command = {
  data: new SlashCommandBuilder()
    .setName("party")
    .setDescription("Grupo de jogadores (aparecem juntos no combate)")
    .addSubcommand((s) =>
      s
        .setName("convidar")
        .setDescription("Convida um jogador para sua party")
        .addUserOption((o) => o.setName("jogador").setDescription("Quem convidar").setRequired(true)),
    )
    .addSubcommand((s) => s.setName("sair").setDescription("Sai da party (líder dissolve a party)"))
    .addSubcommand((s) => s.setName("ver").setDescription("Mostra sua party")),

  async execute(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId ?? "global";
    const sub = interaction.options.getSubcommand();

    if (sub === "convidar") {
      const alvo = interaction.options.getUser("jogador", true);
      if (alvo.bot) {
        await interaction.reply(v2Payload(errorPanel("Não dá para convidar um bot.")));
        return;
      }

      const result = await invite(guildId, interaction.user.id, alvo.id);
      if (!result.ok || !result.inviteId) {
        await interaction.reply(v2Payload(errorPanel(result.error ?? "Não consegui criar o convite.")));
        return;
      }

      await interaction.reply(v2Payload(invitePanel(interaction.user.id, alvo.id, result.inviteId), false));
      return;
    }

    if (sub === "sair") {
      const result = await leave(guildId, interaction.user.id);
      if (!result.ok) {
        await interaction.reply(v2Payload(errorPanel("Você não está em uma party.")));
        return;
      }
      await interaction.reply(v2Payload(leftPanel(result.disbanded ?? false, interaction.user.id), false));
      return;
    }

    const currentParty = await getMyParty(guildId, interaction.user.id);
    if (!currentParty) {
      await interaction.reply(
        v2Payload([
          economyContainer("aviso", [
            titleBlock("party", "Você ainda não tem party"),
            noticeBlock("aviso", "Use /party convidar para chamar outro ninja."),
          ]),
        ]),
      );
      return;
    }
    await interaction.reply(v2Payload(partyPanel(currentParty), false));
  },

  async handleButton(interaction: ButtonInteraction) {
    const [, , action, inviteId] = interaction.customId.split(":");
    if ((action !== "accept" && action !== "decline") || !inviteId) return;

    const guildId = interaction.guildId ?? "global";
    if (action === "decline") {
      const result = await decline(guildId, interaction.user.id, inviteId);
      if (!result.ok) {
        await interaction.reply(v2Payload(errorPanel(result.error ?? "Não consegui recusar o convite.")));
        return;
      }
      await interaction.update(v2Public(declinedPanel(interaction.user.id)));
      return;
    }

    const result = await accept(guildId, interaction.user.id, inviteId);
    if (!result.ok || !result.party) {
      await interaction.reply(v2Payload(errorPanel(result.error ?? "Não consegui entrar na party.")));
      return;
    }
    await interaction.update(v2Public(acceptedPanel(interaction.user.id, result.party)));
  },
};
