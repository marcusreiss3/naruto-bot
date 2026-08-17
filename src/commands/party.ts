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
import {
  accept,
  decline,
  getMyParty,
  invite,
  leave,
  promote,
  removeMember,
  type PartyView,
} from "../services/party/party-service.js";
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
const REMOVE_BUTTON_ID = "party:manage:remove";
const PROMOTE_BUTTON_ID = "party:manage:promote";
type ManagementAction = "remove" | "promote";

const inviteButtonId = (action: "accept" | "decline", inviteId: string) =>
  `${INVITE_PREFIX}:${action}:${inviteId}`;
const managementSelectId = (action: ManagementAction) => `party:manage:${action}:select`;

function memberLines(party: PartyView): string[] {
  return party.members.map((member) => {
    if (member.discordId === party.leaderId) return `${emoji("lider_party")} <@${member.discordId}> — líder`;
    if (member.role === "SUB_LEADER") return `${emoji("lider_party")} <@${member.discordId}> — sub-líder`;
    return `${emoji("party")} <@${member.discordId}>`;
  });
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

function memberSelect(action: ManagementAction): ActionRowBuilder<UserSelectMenuBuilder> {
  return new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId(managementSelectId(action))
      .setPlaceholder(action === "remove" ? "Escolha quem remover" : "Escolha quem promover")
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

function managementRow(canRemove: boolean, canPromote: boolean) {
  const buttons = [];
  if (canRemove) {
    buttons.push(
      button({
        id: REMOVE_BUTTON_ID,
        label: "Remover da party",
        style: ButtonStyle.Danger,
        emojiKey: "sair_party",
      }),
    );
  }
  if (canPromote) {
    buttons.push(
      button({
        id: PROMOTE_BUTTON_ID,
        label: "Promover",
        style: ButtonStyle.Primary,
        emojiKey: "lider_party",
      }),
    );
  }
  return buttons.length ? buttonRow(...buttons) : null;
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

export function partyHomePanel(party: PartyView | null, viewerId?: string): TopLevel[] {
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

  const isLeader = party.leaderId === viewerId;
  const isSubLeader = party.members.some((member) => member.discordId === viewerId && member.role === "SUB_LEADER");
  const canInvite = isLeader || isSubLeader;
  const management = managementRow(canInvite, isLeader);
  const controls: ContainerChild[] = [
    divider(),
    isLeader
      ? text(`${emoji("lider_party")} Você lidera a party e pode organizar seus integrantes.`)
      : isSubLeader
        ? text(`${emoji("lider_party")} Você é sub-líder: pode convidar e remover membros comuns.`)
        : text(`${emoji("party")} Apenas o líder e sub-líderes podem convidar ou remover integrantes.`),
  ];
  if (canInvite) controls.push(inviteSelect());
  if (management) controls.push(management);
  controls.push(
    buttonRow(
      button({
        id: LEAVE_BUTTON_ID,
        label: "Sair da party",
        style: ButtonStyle.Danger,
        emojiKey: "sair_party",
      }),
    ),
  );

  return [economyContainer("vila", [...partyChildren(party), ...controls])];
}

function acceptedPanel(inviteeId: string, party: PartyView): TopLevel[] {
  const management = managementRow(true, true);
  const children: ContainerChild[] = [
    ...partyChildren(party, "Party formada", `<@${inviteeId}> entrou no esquadrão.`),
    divider(),
    text(`${emoji("lider_party")} O líder pode organizar a party pelos botões abaixo.`),
  ];
  if (management) children.push(management);
  return [economyContainer("vila", children)];
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

function managementPanel(action: ManagementAction): TopLevel[] {
  const isRemoval = action === "remove";
  return [
    economyContainer(isRemoval ? "aviso" : "vila", [
      titleBlock(isRemoval ? "sair_party" : "lider_party", isRemoval ? "Remover integrante" : "Promover sub-líder"),
      text(
        isRemoval
          ? "Escolha um integrante da sua party para remover."
          : "Escolha um membro comum para promover a sub-líder.",
      ),
      memberSelect(action),
    ]),
  ];
}

async function openManagement(interaction: ButtonInteraction, action: ManagementAction): Promise<void> {
  const party = await getMyParty(interaction.guildId ?? "global", interaction.user.id);
  if (!party) {
    await interaction.reply(v2Payload(errorPanel("Você não está em uma party.")));
    return;
  }
  const isLeader = party.leaderId === interaction.user.id;
  const isSubLeader = party.members.some(
    (member) => member.discordId === interaction.user.id && member.role === "SUB_LEADER",
  );
  if (action === "promote" && !isLeader) {
    await interaction.reply(v2Payload(errorPanel("Apenas o líder pode promover sub-líderes.")));
    return;
  }
  if (action === "remove" && !isLeader && !isSubLeader) {
    await interaction.reply(v2Payload(errorPanel("Apenas o líder ou um sub-líder pode remover integrantes.")));
    return;
  }
  await interaction.reply(v2Payload(managementPanel(action)));
}

export const party: Command = {
  data: new SlashCommandBuilder()
    .setName("party")
    .setDescription("Abre seu painel de party"),

  async execute(interaction: ChatInputCommandInteraction) {
    const currentParty = await getMyParty(interaction.guildId ?? "global", interaction.user.id);
    await interaction.reply(v2Payload(partyHomePanel(currentParty, interaction.user.id)));
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
    if (interaction.customId === REMOVE_BUTTON_ID) {
      await openManagement(interaction, "remove");
      return;
    }
    if (interaction.customId === PROMOTE_BUTTON_ID) {
      await openManagement(interaction, "promote");
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
    if (!interaction.isUserSelectMenu()) return;
    const alvoId = interaction.values[0];
    if (!alvoId) return;

    if (interaction.customId === INVITE_SELECT_ID) {
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
      await interaction.editReply(v2Edit(partyHomePanel(currentParty, interaction.user.id)));
      const channel = interaction.channel;
      if (channel?.isTextBased() && "send" in channel) {
        await channel.send(v2Public(invitePanel(interaction.user.id, alvoId, result.inviteId)));
      }
      return;
    }

    const [, group, action, stage] = interaction.customId.split(":");
    if (group !== "manage" || stage !== "select" || (action !== "remove" && action !== "promote")) return;

    const guildId = interaction.guildId ?? "global";
    const result = action === "remove"
      ? await removeMember(guildId, interaction.user.id, alvoId)
      : await promote(guildId, interaction.user.id, alvoId);
    if (!result.ok || !result.party) {
      await interaction.reply(v2Payload(errorPanel(result.error ?? "Não consegui atualizar a party.")));
      return;
    }
    await interaction.update(v2Edit(partyHomePanel(result.party, interaction.user.id)));
  },
};
