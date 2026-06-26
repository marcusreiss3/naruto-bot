import { SlashCommandBuilder, type ChatInputCommandInteraction, type AutocompleteInteraction } from "discord.js";
import type { Command } from "./types.js";
import { prisma } from "../db/client.js";
import { isAdmin } from "../utils/permissions.js";
import { ATTRIBUTES, ELEMENTS, MASTERY_LEVELS, RESOURCES, EFFECT_IDS } from "../config/enums.js";
import type { Attribute, Element } from "../config/enums.js";
import {
  getOrCreateCharacter,
  setAttribute,
  addAttribute,
  setLevel,
  setResource,
  setMastery,
  setElement,
  setClan,
  addJutsu,
  removeJutsu,
} from "../services/characters/character-service.js";
import { CLANS, getAbility, ALL_ABILITIES, MISSIONS } from "../data/index.js";
import { assignMission, removeMission, completeMission, buildMissionCompleteEmbed } from "../services/missions/mission-service.js";
import { getActiveSession, endCombat } from "../services/combat/combat-engine.js";
import { getAppearance, releaseAppearance } from "../services/appearance/appearance-service.js";

const attrChoices = ATTRIBUTES.map((a) => ({ name: a, value: a }));
const resourceChoices = RESOURCES.map((r) => ({ name: r, value: r }));
const masteryChoices = MASTERY_LEVELS.map((m) => ({ name: m, value: m }));
const elementChoices = ELEMENTS.map((e) => ({ name: e, value: e }));
const clanChoices = CLANS.map((c) => ({ name: c.name, value: c.id }));
const effectChoices = EFFECT_IDS.map((e) => ({ name: e, value: e }));

export const admin: Command = {
  data: new SlashCommandBuilder()
    .setName("admin")
    .setDescription("Comandos administrativos")
    .addSubcommandGroup((g) =>
      g
        .setName("atributo")
        .setDescription("Atributos")
        .addSubcommand((s) =>
          s
            .setName("set")
            .setDescription("Define um atributo")
            .addUserOption((o) => o.setName("usuario").setDescription("Usuário").setRequired(true))
            .addStringOption((o) => o.setName("atributo").setDescription("Atributo").addChoices(...attrChoices).setRequired(true))
            .addIntegerOption((o) => o.setName("valor").setDescription("Valor").setRequired(true)),
        )
        .addSubcommand((s) =>
          s
            .setName("add")
            .setDescription("Soma a um atributo")
            .addUserOption((o) => o.setName("usuario").setDescription("Usuário").setRequired(true))
            .addStringOption((o) => o.setName("atributo").setDescription("Atributo").addChoices(...attrChoices).setRequired(true))
            .addIntegerOption((o) => o.setName("valor").setDescription("Delta").setRequired(true)),
        ),
    )
    .addSubcommandGroup((g) =>
      g
        .setName("efeito")
        .setDescription("Efeitos de status (em combate)")
        .addSubcommand((s) =>
          s
            .setName("adicionar")
            .setDescription("Adiciona efeito ao participante em combate")
            .addUserOption((o) => o.setName("usuario").setDescription("Usuário").setRequired(true))
            .addStringOption((o) => o.setName("efeito").setDescription("Efeito").addChoices(...effectChoices).setRequired(true))
            .addIntegerOption((o) => o.setName("stacks").setDescription("Stacks").setRequired(false))
            .addIntegerOption((o) => o.setName("duracao").setDescription("Duração").setRequired(false)),
        )
        .addSubcommand((s) =>
          s
            .setName("remover")
            .setDescription("Remove efeito")
            .addUserOption((o) => o.setName("usuario").setDescription("Usuário").setRequired(true))
            .addStringOption((o) => o.setName("efeito").setDescription("Efeito").addChoices(...effectChoices).setRequired(true)),
        ),
    )
    .addSubcommandGroup((g) =>
      g
        .setName("jutsu")
        .setDescription("Jutsus")
        .addSubcommand((s) =>
          s
            .setName("adicionar")
            .setDescription("Concede um jutsu")
            .addUserOption((o) => o.setName("usuario").setDescription("Usuário").setRequired(true))
            .addStringOption((o) => o.setName("jutsu").setDescription("Jutsu").setAutocomplete(true).setRequired(true)),
        )
        .addSubcommand((s) =>
          s
            .setName("remover")
            .setDescription("Remove um jutsu")
            .addUserOption((o) => o.setName("usuario").setDescription("Usuário").setRequired(true))
            .addStringOption((o) => o.setName("jutsu").setDescription("Jutsu").setAutocomplete(true).setRequired(true)),
        ),
    )
    .addSubcommandGroup((g) =>
      g
        .setName("missao")
        .setDescription("Missões")
        .addSubcommand((s) =>
          s
            .setName("adicionar")
            .setDescription("Atribui missão")
            .addUserOption((o) => o.setName("usuario").setDescription("Usuário").setRequired(true))
            .addStringOption((o) => o.setName("missao").setDescription("Missão").setAutocomplete(true).setRequired(true)),
        )
        .addSubcommand((s) =>
          s
            .setName("remover")
            .setDescription("Remove missão")
            .addUserOption((o) => o.setName("usuario").setDescription("Usuário").setRequired(true))
            .addStringOption((o) => o.setName("missao").setDescription("Missão").setAutocomplete(true).setRequired(true)),
        )
        .addSubcommand((s) =>
          s
            .setName("concluir")
            .setDescription("Conclui missão")
            .addUserOption((o) => o.setName("usuario").setDescription("Usuário").setRequired(true))
            .addStringOption((o) => o.setName("missao").setDescription("Missão").setAutocomplete(true).setRequired(true)),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("pontos-add")
        .setDescription("Adiciona pontos de atributo")
        .addUserOption((o) => o.setName("usuario").setDescription("Usuário").setRequired(true))
        .addIntegerOption((o) => o.setName("valor").setDescription("Quantidade").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("nivel-set")
        .setDescription("Define o nível")
        .addUserOption((o) => o.setName("usuario").setDescription("Usuário").setRequired(true))
        .addIntegerOption((o) => o.setName("valor").setDescription("Nível").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("recurso-set")
        .setDescription("Define chakra/energia (0-100)")
        .addUserOption((o) => o.setName("usuario").setDescription("Usuário").setRequired(true))
        .addStringOption((o) => o.setName("recurso").setDescription("Recurso").addChoices(...resourceChoices).setRequired(true))
        .addIntegerOption((o) => o.setName("valor").setDescription("0-100").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("maestria-set")
        .setDescription("Define maestria")
        .addUserOption((o) => o.setName("usuario").setDescription("Usuário").setRequired(true))
        .addStringOption((o) => o.setName("recurso").setDescription("Recurso").addChoices(...resourceChoices).setRequired(true))
        .addStringOption((o) => o.setName("nivel").setDescription("Nível").addChoices(...masteryChoices).setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("elemento-set")
        .setDescription("Concede um elemento")
        .addUserOption((o) => o.setName("usuario").setDescription("Usuário").setRequired(true))
        .addStringOption((o) => o.setName("elemento").setDescription("Elemento").addChoices(...elementChoices).setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("cla-set")
        .setDescription("Define o clã")
        .addUserOption((o) => o.setName("usuario").setDescription("Usuário").setRequired(true))
        .addStringOption((o) => o.setName("cla").setDescription("Clã").addChoices(...clanChoices).setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("combate-encerrar")
        .setDescription("Encerra o combate do canal")
        .addChannelOption((o) => o.setName("canal").setDescription("Canal (padrão: atual)").setRequired(false)),
    )
    .addSubcommand((s) =>
      s
        .setName("curar")
        .setDescription("Restaura HP cheio + chakra/energia 100%")
        .addUserOption((o) => o.setName("usuario").setDescription("Usuário").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("aparencia-apagar")
        .setDescription("Apaga a aparência reservada de um usuário")
        .addUserOption((o) => o.setName("usuario").setDescription("Usuário").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("debug-personagem")
        .setDescription("Mostra dados crus do personagem")
        .addUserOption((o) => o.setName("usuario").setDescription("Usuário").setRequired(true)),
    ),
  async autocomplete(interaction: AutocompleteInteraction) {
    const focused = interaction.options.getFocused(true);
    const q = focused.value.toLowerCase();
    let choices: { name: string; value: string }[] = [];
    if (focused.name === "jutsu") {
      choices = ALL_ABILITIES.map((a) => ({ name: `${a.name} (${a.id})`.slice(0, 100), value: a.id }));
    } else if (focused.name === "missao") {
      choices = MISSIONS.map((m) => ({ name: `${m.name} [${m.rank}] (${m.id})`.slice(0, 100), value: m.id }));
    }
    const filtered = choices
      .filter((c) => c.name.toLowerCase().includes(q) || c.value.toLowerCase().includes(q))
      .slice(0, 25);
    await interaction.respond(filtered);
  },

  async execute(interaction: ChatInputCommandInteraction) {
    if (!isAdmin(interaction)) {
      await interaction.reply({ content: "⛔ Você não tem permissão.", ephemeral: true });
      return;
    }
    const guildId = interaction.guildId ?? "global";
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();

    const getChar = async () => {
      const user = interaction.options.getUser("usuario", true);
      return getOrCreateCharacter(user.id, guildId, user.username);
    };

    await interaction.deferReply({ ephemeral: true });

    if (group === "atributo") {
      const char = await getChar();
      const attr = interaction.options.getString("atributo", true) as Attribute;
      const valor = interaction.options.getInteger("valor", true);
      if (sub === "set") await setAttribute(char.id, attr, valor);
      else await addAttribute(char.id, attr, valor);
      await interaction.editReply(`✅ ${attr} ${sub === "set" ? "=" : "+="} ${valor} para **${char.name}**.`);
      return;
    }

    if (group === "efeito") {
      const char = await getChar();
      const session = await getActiveSession(interaction.channelId);
      const part = session?.participants.find((p) => p.charId === char.id);
      if (!part) {
        await interaction.editReply("❌ Personagem não está em combate neste canal.");
        return;
      }
      const effectId = interaction.options.getString("efeito", true);
      if (sub === "adicionar") {
        const stacks = interaction.options.getInteger("stacks") ?? 1;
        const duracao = interaction.options.getInteger("duracao") ?? 2;
        await prisma.effectInstance.create({
          data: { participantId: part.id, effectId, name: effectId, stacks, duration: duracao },
        });
        await interaction.editReply(`✅ Efeito ${effectId} (x${stacks}, ${duracao} turnos) em **${char.name}**.`);
      } else {
        await prisma.effectInstance.deleteMany({ where: { participantId: part.id, effectId } });
        await interaction.editReply(`✅ Efeito ${effectId} removido de **${char.name}**.`);
      }
      return;
    }

    if (group === "jutsu") {
      const char = await getChar();
      const jutsu = interaction.options.getString("jutsu", true);
      if (!getAbility(jutsu)) {
        await interaction.editReply(`❌ Jutsu \`${jutsu}\` não existe.`);
        return;
      }
      if (sub === "adicionar") await addJutsu(char.id, jutsu);
      else await removeJutsu(char.id, jutsu);
      await interaction.editReply(`✅ Jutsu \`${jutsu}\` ${sub === "adicionar" ? "concedido a" : "removido de"} **${char.name}**.`);
      return;
    }

    if (group === "missao") {
      const char = await getChar();
      const missao = interaction.options.getString("missao", true);
      if (sub === "adicionar") {
        const r = await assignMission(char.id, missao);
        await interaction.editReply(r.ok ? `✅ Missão \`${missao}\` atribuída a **${char.name}**.` : `❌ ${r.error}`);
      } else if (sub === "remover") {
        await removeMission(char.id, missao);
        await interaction.editReply(`✅ Missão \`${missao}\` removida de **${char.name}**.`);
      } else {
        const r = await completeMission(char.id, missao);
        const def = MISSIONS.find((m) => m.id === missao);
        await interaction.editReply(
          r
            ? { embeds: [buildMissionCompleteEmbed(def?.name ?? missao, r.rewards).setFooter({ text: `Concluída para ${char.name}` })] }
            : "❌ Missão ativa não encontrada.",
        );
      }
      return;
    }

    // subcommands sem grupo
    switch (sub) {
      case "pontos-add": {
        const char = await getChar();
        const valor = interaction.options.getInteger("valor", true);
        await prisma.userCharacter.update({ where: { id: char.id }, data: { attributePoints: { increment: valor } } });
        await interaction.editReply(`✅ +${valor} pontos de atributo para **${char.name}**.`);
        return;
      }
      case "nivel-set": {
        const char = await getChar();
        const valor = interaction.options.getInteger("valor", true);
        await setLevel(char.id, valor);
        await interaction.editReply(`✅ Nível de **${char.name}** = ${valor}.`);
        return;
      }
      case "recurso-set": {
        const char = await getChar();
        const recurso = interaction.options.getString("recurso", true) as "chakra" | "energia";
        const valor = interaction.options.getInteger("valor", true);
        await setResource(char.id, recurso, valor);
        await interaction.editReply(`✅ ${recurso} de **${char.name}** = ${valor}%.`);
        return;
      }
      case "maestria-set": {
        const char = await getChar();
        const recurso = interaction.options.getString("recurso", true) as "chakra" | "energia";
        const nivel = interaction.options.getString("nivel", true) as "BASICO" | "CONTROLADO" | "MESTRE";
        await setMastery(char.id, recurso, nivel);
        await interaction.editReply(`✅ Maestria de ${recurso} = ${nivel} para **${char.name}**.`);
        return;
      }
      case "elemento-set": {
        const char = await getChar();
        const elemento = interaction.options.getString("elemento", true) as Element;
        await setElement(char.id, elemento);
        await interaction.editReply(`✅ Elemento ${elemento} concedido a **${char.name}**.`);
        return;
      }
      case "cla-set": {
        const char = await getChar();
        const cla = interaction.options.getString("cla", true);
        await setClan(char.id, cla);
        await interaction.editReply(`✅ Clã ${cla} para **${char.name}**.`);
        return;
      }
      case "combate-encerrar": {
        const ch = interaction.options.getChannel("canal");
        const channelId = ch?.id ?? interaction.channelId;
        const session = await getActiveSession(channelId);
        if (!session) {
          await interaction.editReply("❌ Nenhum combate ativo nesse canal.");
          return;
        }
        await endCombat(session.id);
        await interaction.editReply("✅ Combate encerrado.");
        return;
      }
      case "curar": {
        const char = await getChar();
        await prisma.userCharacter.update({ where: { id: char.id }, data: { hpCurrent: char.hpMax } });
        await prisma.characterResourceState.update({ where: { charId: char.id }, data: { chakra: 100, energia: 100 } });
        await interaction.editReply(`💚 **${char.name}** restaurado: HP ${char.hpMax}/${char.hpMax}, chakra/energia 100%.`);
        return;
      }
      case "aparencia-apagar": {
        const user = interaction.options.getUser("usuario", true);
        const ap = await getAppearance(user.id, guildId);
        const freed = await releaseAppearance(user.id, guildId);
        await interaction.editReply(
          freed
            ? `🗑️ Aparência de <@${user.id}>${ap ? ` (**${ap.characterName}**)` : ""} apagada.`
            : `ℹ️ <@${user.id}> não tinha aparência reservada.`,
        );
        return;
      }
      case "debug-personagem": {
        const char = await getChar();
        const full = await prisma.userCharacter.findUnique({
          where: { id: char.id },
          include: { attributes: true, resources: true, mastery: true, elements: true, clan: true, jutsus: true },
        });
        await interaction.editReply("```json\n" + JSON.stringify(full, null, 2).slice(0, 1900) + "\n```");
        return;
      }
    }
  },
};
