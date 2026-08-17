import {
  ActionRowBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  UserSelectMenuBuilder,
  type AnySelectMenuInteraction,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from "discord.js";
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
  v2Edit,
  v2Payload,
  v2Public,
  type ContainerChild,
  type TopLevel,
} from "../ui/economy-components-v2.js";
import { emoji } from "../ui/economy-emojis.js";

const INVITE_PREFIX = "party:invite";
const INVITE_SELECT_ID = "party:invite:select";
const LEAVE_BUTTON_ID = "party:leave";
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

function inviteSelect(): ActionRowBuilder<UserSelectMenuBuilder> {
  return new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId(INVITE_SELECT_ID)
      .setPlaceholder("Escolha um ninja para convidar")
      .setMinValues(1)
      .setMaxValues(1),
  );
}

function partyChildren(party: PartyView, title = "Sua party", subtitle?: string): ContainerChild[] {
  return [
    titleBlock("party", title, subtitle ?? "Joguem juntos em missões e combates."),
    factsBlock([
      { label: "Líder", value: `${emoji("lider_party")} <@${party.leaderId}>` },
      { label: "Integrantes", value: `${party.memberIds.length}` },
    ]),
    divider(),
    listBlock("Integrantes", memberLines(party), "Nenhum integrante encontrado."),
  ];
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
  return [economyContainer("vila", partyChildren(party, title, subtitle))];
}

export function partyHomePanel(party: PartyView | null): TopLevel[] {
  if (!party) {
    return [
      economyContainer("vila", [
        titleBlock("party", "Forme sua party", "Convide ninjas para enfrentar missões e combates juntos."),
        noticeBlock("aviso", "Você ainda não faz parte de uma party."),
        divider(),
        text(`${emoji("convite")} Escolha um ninja para enviar um convite.`),
        inviteSelect(),
      ]),
    ];
  }

  return [
    economyContainer("vila", [
      ...partyChildren(party),
      divider(),
      text(`${emoji("convite")} Convide outro ninja ou saia do grupo quando quiser.`),
      inviteSelect(),
      buttonRow(
        button({
          id: LEAVE_BUTTON_ID,
          label: "Sair da party",
          style: ButtonStyle.Danger,
          emojiKey: "sair_party",
        }),
      ),
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
      text(
        `${emoji("sair_party")} ${
          disbanded
            ? `<@${userId}> era o líder, então a party foi dissolvida.`
            : `<@${userId}> saiu da party.`
        }`,
      ),
    ]),
  ];
}

export const party: Command = {
  data: new SlashCommandBuilder()
    .setName("party")
    .setDescription("Abre seu painel de party"),

  async execute(interaction: ChatInputCommandInteraction) {
    const currentParty = await getMyParty(interaction.guildId ?? "global", interaction.user.id);
    await interaction.reply(v2Payload(partyHomePanel(currentParty)));
  },

  async handleButton(interaction: ButtonInteraction) {
    const guildId = interaction.guildId ?? "global";
    if (interaction.customId === LEAVE_BUTTON_ID) {
      const result = await leave(guildId, interaction.user.id);
      if (!result.ok) {
        await interaction.reply(v2Payload(errorPanel("Você não está em uma party.")));
        return;
      }
      await interaction.update(v2Edit(leftPanel(result.disbanded ?? false, interaction.user.id)));
      return;
    }

    const [, , action, inviteId] = interaction.customId.split(":");
    if ((action !== "accept" && action !== "decline") || !inviteId) return;

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

  async handleSelect(interaction: AnySelectMenuInteraction) {
    if (!interaction.isUserSelectMenu() || interaction.customId !== INVITE_SELECT_ID) return;

    const alvoId = interaction.values[0];
    if (!alvoId) return;
    const alvo = interaction.users.get(alvoId) ?? await interaction.client.users.fetch(alvoId).catch(() => null);
    if (!alvo || alvo.bot) {
      await interaction.reply(v2Payload(errorPanel("Não dá para convidar um bot.")));
      return;
    }

    const guildId = interaction.guildId ?? "global";
    const result = await invite(guildId, interaction.user.id, alvoId);
    if (!result.ok || !result.inviteId) {
      await interaction.reply(v2Payload(errorPanel(result.error ?? "Não consegui criar o convite.")));
      return;
    }

    await interaction.deferUpdate();
    const currentParty = await getMyParty(guildId, interaction.user.id);
    await interaction.editReply(v2Edit(partyHomePanel(currentParty)));
    const channel = interaction.channel;
    if (channel?.isTextBased() && "send" in channel) {
      await channel.send(v2Public(invitePanel(interaction.user.id, alvoId, result.inviteId)));
    }
  },
};
