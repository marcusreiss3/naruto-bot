import { SlashCommandBuilder, type ChatInputCommandInteraction, type AutocompleteInteraction } from "discord.js";
import type { Command } from "./types.js";
import { prisma } from "../db/client.js";
import { isAdmin } from "../utils/permissions.js";
import { ATTRIBUTES, ATTRIBUTE_LABELS, ELEMENTS, FIGHTING_STYLES, FIGHTING_STYLE_LABELS, MASTERY_LEVELS, RESOURCES, EFFECT_IDS, effectLabel, TRAIT_RARITIES, TRAIT_RARITY_LABELS } from "../config/enums.js";
import type { Attribute, Element, EffectId, FightingStyle } from "../config/enums.js";
import { getTrait, traitsByRarity } from "../data/traits.js";
import { getCharacterTrait, setCharacterTrait, clearCharacterTrait } from "../services/characters/trait-service.js";
import { respec } from "../services/characters/attribute-allocator.js";
import {
  getOrCreateCharacter,
  setAttribute,
  addAttribute,
  setLevel,
  setResource,
  setMastery,
  setElement,
  setFightingStyle,
  setClan,
  addJutsu,
  removeJutsu,
} from "../services/characters/character-service.js";
import { CLANS, getAbility, ALL_ABILITIES, MISSIONS } from "../data/index.js";
import { allNodes } from "../data/element-trees/index.js";
import { assignMission, removeMission, completeMission, buildMissionCompleteEmbed } from "../services/missions/mission-service.js";
import { getActiveSession, getSessionById, endCombat, type SessionFull } from "../services/combat/combat-engine.js";
import { onCombatEnded } from "../services/missions/mission-runtime.js";
import { getAppearance, releaseAppearance } from "../services/appearance/appearance-service.js";
import { resetSheet } from "../services/sheet/sheet-reset.js";
import { villageFromMember, VILLAGE_NAMES } from "../services/village-service.js";

const attrChoices = ATTRIBUTES.map((a) => ({ name: ATTRIBUTE_LABELS[a], value: a }));
const resourceChoices = RESOURCES.map((r) => ({ name: r, value: r }));
const masteryChoices = MASTERY_LEVELS.map((m) => ({ name: m, value: m }));
const elementChoices = ELEMENTS.map((e) => ({ name: e, value: e }));
const fightingStyleChoices = FIGHTING_STYLES.map((s) => ({ name: FIGHTING_STYLE_LABELS[s], value: s }));

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
            .addStringOption((o) => o.setName("efeito").setDescription("Efeito").setAutocomplete(true).setRequired(true))
            .addIntegerOption((o) => o.setName("stacks").setDescription("Stacks").setRequired(false))
            .addIntegerOption((o) => o.setName("duracao").setDescription("Duração").setRequired(false)),
        )
        .addSubcommand((s) =>
          s
            .setName("remover")
            .setDescription("Remove efeito")
            .addUserOption((o) => o.setName("usuario").setDescription("Usuário").setRequired(true))
            .addStringOption((o) => o.setName("efeito").setDescription("Efeito").setAutocomplete(true).setRequired(true)),
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
        )
        .addSubcommand((s) =>
          s
            .setName("matar-inimigos")
            .setDescription("Jutsu admin: derrota todos os inimigos do combate")
            .addChannelOption((o) => o.setName("canal").setDescription("Canal (padrao: atual)").setRequired(false)),
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
        .setName("pontos-set")
        .setDescription("Define os pontos de atributo (valor exato)")
        .addUserOption((o) => o.setName("usuario").setDescription("Usuário").setRequired(true))
        .addIntegerOption((o) => o.setName("valor").setDescription("Quantidade").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("respec")
        .setDescription("Zera os atributos e devolve os pontos investidos")
        .addUserOption((o) => o.setName("usuario").setDescription("Usuário").setRequired(true)),
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
        .setName("estilo-luta-set")
        .setDescription("Ensina um estilo de luta (Punho Forte, Arhat, Adamantino, Agitação, Assassinato)")
        .addUserOption((o) => o.setName("usuario").setDescription("Usuário").setRequired(true))
        .addStringOption((o) => o.setName("estilo").setDescription("Estilo de luta").addChoices(...fightingStyleChoices).setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("cla-set")
        .setDescription("Define o clã")
        .addUserOption((o) => o.setName("usuario").setDescription("Usuário").setRequired(true))
        .addStringOption((o) => o.setName("cla").setDescription("Clã").setAutocomplete(true).setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("trait-set")
        .setDescription("Define a trait (substitui a atual)")
        .addUserOption((o) => o.setName("usuario").setDescription("Usuário").setRequired(true))
        .addStringOption((o) => o.setName("trait").setDescription("Trait").setAutocomplete(true).setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("trait-ver")
        .setDescription("Mostra a trait do personagem")
        .addUserOption((o) => o.setName("usuario").setDescription("Usuário").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("trait-limpar")
        .setDescription("Remove a trait do personagem")
        .addUserOption((o) => o.setName("usuario").setDescription("Usuário").setRequired(true)),
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
        .setName("ficha-resetar")
        .setDescription("APAGA o personagem e libera /ficha para uma nova criação")
        .addUserOption((o) => o.setName("usuario").setDescription("Usuário").setRequired(true))
        .addBooleanOption((o) =>
          o.setName("confirmar").setDescription("Marque para confirmar: a exclusão é irreversível").setRequired(true),
        )
    )
    .addSubcommand((s) =>
      s
        .setName("debug-personagem")
        .setDescription("Mostra dados crus do personagem")
        .addUserOption((o) => o.setName("usuario").setDescription("Usuário").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("desbloquear-tudo")
        .setDescription("DEBUG: 999 em todo atributo, todo elemento concedido, todo nó de toda árvore desbloqueado")
        .addUserOption((o) => o.setName("usuario").setDescription("Usuário").setRequired(true)),
    ),
  async autocomplete(interaction: AutocompleteInteraction) {
    const focused = interaction.options.getFocused(true);
    const q = focused.value.toLowerCase();
    let choices: { name: string; value: string }[] = [];
    if (focused.name === "jutsu") {
      choices = ALL_ABILITIES.map((a) => ({ name: `${a.name} (${a.id})`.slice(0, 100), value: a.id }));
    } else if (focused.name === "missao") {
      const rankOrder = { A: 0, B: 1, C: 2, D: 3 } as const;
      choices = [...MISSIONS]
        .sort((a, b) => (rankOrder[a.rank] ?? 9) - (rankOrder[b.rank] ?? 9))
        .map((m) => ({ name: `${m.name} [${m.rank}] (${m.id})`.slice(0, 100), value: m.id }));
    } else if (focused.name === "cla") {
      choices = [...CLANS]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((c) => ({ name: `${c.name} (${c.id})`.slice(0, 100), value: c.id }));
    } else if (focused.name === "trait") {
      // Ordena por raridade (a ordem de TRAIT_RARITIES ja' e' comum -> mitica)
      choices = TRAIT_RARITIES.flatMap((r) =>
        traitsByRarity(r).map((t) => ({
          name: `${t.name} [${TRAIT_RARITY_LABELS[r]}, ${t.pp} PP]`.slice(0, 100),
          value: t.id,
        })),
      );
    } else if (focused.name === "efeito") {
      choices = EFFECT_IDS.map((e) => ({ name: effectLabel(e), value: e }));
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
      if (!EFFECT_IDS.includes(effectId as EffectId)) {
        await interaction.editReply("Efeito invalido.");
        return;
      }
      if (sub === "adicionar") {
        const stacks = interaction.options.getInteger("stacks") ?? 1;
        const duracao = interaction.options.getInteger("duracao") ?? 2;
        await prisma.effectInstance.create({
          data: { participantId: part.id, effectId, name: effectLabel(effectId), stacks, duration: duracao },
        });
        await interaction.editReply(`✅ Efeito **${effectLabel(effectId)}** (x${stacks}, ${duracao} turnos) em **${char.name}**.`);
      } else {
        await prisma.effectInstance.deleteMany({ where: { participantId: part.id, effectId } });
        await interaction.editReply(`✅ Efeito **${effectLabel(effectId)}** removido de **${char.name}**.`);
      }
      return;
    }

    if (group === "jutsu") {
      if (sub === "matar-inimigos") {
        const ch = interaction.options.getChannel("canal");
        const channelId = ch?.id ?? interaction.channelId;
        const session = await getActiveSession(channelId);
        if (!session) {
          await interaction.editReply("Nenhum combate ativo nesse canal.");
          return;
        }
        const enemiesAlive = session.participants.filter((p) => p.isNpc && p.hpCurrent > 0);
        const playersAlive = session.participants.filter((p) => !p.isNpc && p.hpCurrent > 0);
        if (enemiesAlive.length === 0) {
          await interaction.editReply("Nao ha inimigos vivos nesse combate.");
          return;
        }
        if (playersAlive.length === 0) {
          await interaction.editReply("Nao ha jogadores vivos para receber a vitoria.");
          return;
        }

        await prisma.combatParticipant.updateMany({
          where: { sessionId: session.id, isNpc: true, hpCurrent: { gt: 0 } },
          data: { hpCurrent: 0 },
        });
        const fresh = await getSessionById(session.id);
        if (!fresh) {
          await interaction.editReply("Inimigos derrotados, mas nao consegui recarregar o combate.");
          return;
        }
        await endCombat(session.id);
        await persistCombatResources(fresh);
        await interaction.editReply(`Jutsu admin aplicado: **${enemiesAlive.length}** inimigo(s) derrotado(s).`);
        if (interaction.channel && "send" in interaction.channel) {
          await interaction.channel.send("Jutsu admin aplicado. Todos os inimigos em campo foram derrotados.");
        }
        await onCombatEnded(interaction, fresh);
        return;
      }

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
        let initialState: Record<string, unknown> | undefined;
        if (missao === "herdeiro_cla_yuki") {
          const user = interaction.options.getUser("usuario", true);
          const member = interaction.guild ? await interaction.guild.members.fetch(user.id).catch(() => null) : null;
          initialState = { villageId: villageFromMember(member) };
        }
        const r = await assignMission(char.id, missao, initialState);
        const origin = initialState?.villageId
          ? ` Origem: **${VILLAGE_NAMES[initialState.villageId as keyof typeof VILLAGE_NAMES]}**.`
          : "";
        await interaction.editReply(r.ok ? `✅ Missão \`${missao}\` atribuída a **${char.name}**.${origin}` : `❌ ${r.error}`);
      } else if (sub === "remover") {
        const removed = await removeMission(char.id, missao);
        if (removed.instances === 0) {
          await interaction.editReply(`Nenhum dado da missao \`${missao}\` encontrado para **${char.name}**.`);
          return;
        }
        await interaction.editReply(
          `Missao \`${missao}\` resetada para **${char.name}**. ` +
            `Apaguei ${removed.instances} instancia(s), ${removed.objectives} objetivo(s) e ${removed.combats} combate(s) vinculado(s).`,
        );
        return;
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
      case "pontos-set": {
        const char = await getChar();
        const valor = Math.max(0, interaction.options.getInteger("valor", true));
        await prisma.userCharacter.update({ where: { id: char.id }, data: { attributePoints: valor } });
        await interaction.editReply(`✅ Pontos de atributo de **${char.name}** = ${valor}.`);
        return;
      }
      case "respec": {
        const char = await getChar();
        const devolvidos = await respec(char.id);
        await interaction.editReply(
          `✅ Atributos de **${char.name}** zerados. ${devolvidos} ponto(s) devolvido(s) ao saldo — ele pode redistribuir com \`/atributos\`.`,
        );
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
      case "estilo-luta-set": {
        const char = await getChar();
        const estilo = interaction.options.getString("estilo", true) as FightingStyle;
        await setFightingStyle(char.id, estilo);
        await interaction.editReply(`✅ Estilo de luta ${FIGHTING_STYLE_LABELS[estilo]} ensinado a **${char.name}**.`);
        return;
      }
      case "cla-set": {
        const char = await getChar();
        const cla = interaction.options.getString("cla", true);
        await setClan(char.id, cla);
        await interaction.editReply(`✅ Clã ${cla} para **${char.name}**.`);
        return;
      }
      case "trait-set": {
        const char = await getChar();
        const traitId = interaction.options.getString("trait", true);
        const trait = getTrait(traitId);
        if (!trait) {
          await interaction.editReply(`❌ Trait desconhecida: \`${traitId}\`.`);
          return;
        }
        await setCharacterTrait(char.id, traitId);
        await interaction.editReply(
          `✅ **${char.name}** agora tem **${trait.name}** ` +
            `[${TRAIT_RARITY_LABELS[trait.rarity]}, ${trait.pp} PP].\n${trait.description}`,
        );
        return;
      }
      case "trait-ver": {
        const char = await getChar();
        const trait = await getCharacterTrait(char.id);
        await interaction.editReply(
          trait
            ? `🎲 **${char.name}** — **${trait.name}** ` +
              `[${TRAIT_RARITY_LABELS[trait.rarity]}, ${trait.pp} PP]\n${trait.description}`
            : `🎲 **${char.name}** não tem trait.`,
        );
        return;
      }
      case "trait-limpar": {
        const char = await getChar();
        await clearCharacterTrait(char.id);
        await interaction.editReply(`✅ Trait de **${char.name}** removida.`);
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
      case "desbloquear-tudo": {
        const char = await getChar();
        for (const attr of ATTRIBUTES) await setAttribute(char.id, attr, 999);
        for (const element of ELEMENTS) await setElement(char.id, element);
        for (const style of FIGHTING_STYLES) await setFightingStyle(char.id, style);
        const nodes = allNodes();
        for (const node of nodes) {
          await prisma.characterSkillNode.upsert({
            where: { charId_nodeId: { charId: char.id, nodeId: node.id } },
            create: { charId: char.id, nodeId: node.id },
            update: {},
          });
          if (node.kind === "JUTSU" && node.grantsAbilityId) {
            await prisma.characterJutsu.upsert({
              where: { charId_jutsuId: { charId: char.id, jutsuId: node.grantsAbilityId } },
              create: { charId: char.id, jutsuId: node.grantsAbilityId },
              update: {},
            });
          }
        }
        await interaction.editReply(
          `✅ **${char.name}**: 999 em todos os atributos, todos os elementos e estilos de luta concedidos e ${nodes.length} nós desbloqueados (todas as árvores — elementos, kekkei genkai e TODOS os clãs, mesmo os que não são o seu).`,
        );
        return;
      }
      case "ficha-resetar": {
        const user = interaction.options.getUser("usuario", true);
        if (!interaction.guild) {
          await interaction.editReply("❌ Use este comando dentro do servidor.");
          return;
        }
        if (!interaction.options.getBoolean("confirmar", true)) {
          await interaction.editReply("❌ Reset cancelado: marque `confirmar` para apagar a ficha.");
          return;
        }
        const report = await resetSheet(interaction.guild, user.id);
        if (report.blocked === "COMBATE_ATIVO") {
          await interaction.editReply(
            `❌ **${report.charName}** está em combate ativo. Encerre com \`/admin combate-encerrar\` antes de resetar.`,
          );
          return;
        }
        const linhas = [
          report.hadCharacter
            ? `🗑️ Personagem **${report.charName}** apagado (atributos, jutsus, árvores, inventário, missões, Ryo).`
            : "ℹ️ Nenhum personagem registrado — só a limpeza do resto foi feita.",
          report.clearedDraft ? "• Rascunho de `/ficha` apagado." : null,
          report.deletedChannelId ? "• Canal privado da ficha excluído." : null,
          report.releasedAppearance ? "• Aparência reservada liberada." : null,
          report.canceledTravel ? "• Viagem ativa cancelada." : null,
          report.leftParty ? "• Removido da party." : null,
          report.rolesChanged
            ? "• Cargos: registro/vila/localização removidos, não registrado devolvido."
            : "⚠️ Não consegui ajustar os cargos (membro fora do servidor?).",
          `\n<@${user.id}> já pode usar \`/ficha\` para criar outra.`,
        ].filter(Boolean);
        await interaction.editReply(linhas.join("\n"));
        return;
      }
      case "debug-personagem": {
        const char = await getChar();
        const full = await prisma.userCharacter.findUnique({
          where: { id: char.id },
          include: { attributes: true, resources: true, mastery: true, elements: true, fightingStyles: true, clan: true, jutsus: true },
        });
        await interaction.editReply("```json\n" + JSON.stringify(full, null, 2).slice(0, 1900) + "\n```");
        return;
      }
    }
  },
};

async function persistCombatResources(session: SessionFull): Promise<void> {
  for (const p of session.participants) {
    if (p.isNpc || !p.charId) continue;
    await prisma.userCharacter.update({
      where: { id: p.charId },
      data: { hpCurrent: Math.max(1, p.hpCurrent) },
    });
    await prisma.characterResourceState
      .update({
        where: { charId: p.charId },
        data: { chakra: p.chakra, energia: p.energia },
      })
      .catch(() => undefined);
  }
}
