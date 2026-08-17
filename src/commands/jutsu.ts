import {
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { Command } from "./types.js";
import { prisma } from "../db/client.js";
import { ALL_ABILITIES } from "../data/index.js";
import { getOrCreateCharacter } from "../services/characters/character-service.js";
import {
  getActiveSession,
  numberSameNames,
  displayName,
  ownedJutsuIds,
  type SessionFull,
} from "../services/combat/combat-engine.js";
import { resolveActingParticipantId } from "../services/combat/combat-math.js";
import { usar } from "./combate.js";

// subcomando -> categoria de habilidade. Tem que bater EXATAMENTE com
// CATEGORIES (config/enums.ts): valor errado aqui nao da erro, so' faz o
// autocomplete voltar vazio pra sempre — foi o que aconteceu com "IRYO"
// (a categoria real e' IRYO_NINJUTSU) e com "KENJUTSU" antes de a categoria
// existir de verdade.
const CAT_BY_SUB: Record<string, string> = {
  ninjutsu: "NINJUTSU",
  taijutsu: "TAIJUTSU",
  kenjutsu: "KENJUTSU",
  bukijutsu: "BUKIJUTSU",
  iryo: "IRYO_NINJUTSU",
  genjutsu: "GENJUTSU",
  kugutsu: "KUGUTSU",
  cla: "CLA",
};

const addCatSub = (name: string, label: string) => (s: SlashCommandSubcommandBuilder) =>
  s
    .setName(name)
    .setDescription(`Usa um jutsu de ${label}`)
    .addStringOption((o) =>
      o.setName("habilidade").setDescription("Jutsu (comece a digitar)").setRequired(true).setAutocomplete(true),
    )
    .addStringOption((o) =>
      o.setName("alvo").setDescription("Alvo (escolha pelo nome) ou célula (ex: C4)").setRequired(false).setAutocomplete(true),
    );

export const jutsu: Command = {
  data: new SlashCommandBuilder()
    .setName("jutsu")
    .setDescription("Usa uma habilidade no combate")
    .addSubcommand(addCatSub("ninjutsu", "Ninjutsu"))
    .addSubcommand(addCatSub("taijutsu", "Taijutsu"))
    .addSubcommand(addCatSub("kenjutsu", "Kenjutsu (espada)"))
    .addSubcommand(addCatSub("bukijutsu", "Bukijutsu (armas/arremesso)"))
    .addSubcommand(addCatSub("iryo", "Iryō (médico)"))
    .addSubcommand(addCatSub("genjutsu", "Genjutsu"))
    .addSubcommand(addCatSub("kugutsu", "Kugutsu (marionetes)"))
    .addSubcommand(addCatSub("cla", "Clã")),

  execute(interaction: ChatInputCommandInteraction) {
    return usar(interaction);
  },

  async autocomplete(interaction: AutocompleteInteraction) {
    const sub = interaction.options.getSubcommand();
    const focusedOpt = interaction.options.getFocused(true);
    const focused = focusedOpt.value.toLowerCase();

    // ----- alvo: participantes vivos, numerados -----
    if (focusedOpt.name === "alvo") {
      const session = await getActiveSession(interaction.channelId);
      if (!session) {
        await interaction.respond([]);
        return;
      }
      const nums = numberSameNames(session.participants);
      const meParticipant = await getMyParticipant(interaction, session);
      const choices = session.participants
        .filter((p) => p.hpCurrent > 0)
        .map((p) => {
          const enemy = meParticipant ? p.teamId !== meParticipant.teamId : p.isNpc;
          const label = `${enemy ? "🔴" : "🔵"} ${displayName(p.name, nums.get(p.id))}`;
          return { name: label.slice(0, 100), value: p.id };
        })
        .filter((c) => c.name.toLowerCase().includes(focused))
        .slice(0, 25);
      await interaction.respond(choices);
      return;
    }

    // ----- habilidade: jutsus possuídos, filtrados pela categoria do subcomando -----
    // Le do participante ACTING (o proprio, ou o corpo que estiver pilotando
    // via Shintenshin) — nao direto do personagem do usuario, senao quem
    // roubou um corpo (Yamanaka) nunca veria os jutsus certos no autocomplete.
    const cat = CAT_BY_SUB[sub];
    const guildId = interaction.guildId ?? "global";
    const char = await getOrCreateCharacter(interaction.user.id, guildId, interaction.user.username);
    const session = await getActiveSession(interaction.channelId);
    let ownedIds: string[];
    if (session) {
      const own = session.participants.find((p) => p.charId === char.id) ?? null;
      const active = session.participants.find((p) => p.id === session.turnOrder[session.activeIndex]);
      const actingId = active?.flags.isPuppet && active.flags.controllerId === own?.id
        ? active.id
        : own ? resolveActingParticipantId(own, session.participants, active?.id) : null;
      const acting = actingId ? session.participants.find((p) => p.id === actingId) : undefined;
      ownedIds = acting ? await ownedJutsuIds(acting) : [];
    } else {
      ownedIds = char.jutsus.map((j) => j.jutsuId); // fora de combate: personagem proprio
    }
    const choices = ALL_ABILITIES.filter((a) => ownedIds.includes(a.id) && (!cat || a.category === cat))
      .filter((a) => a.name.toLowerCase().includes(focused) || a.id.includes(focused))
      .slice(0, 25)
      .map((a) => ({ name: a.name.slice(0, 100), value: a.id }));
    await interaction.respond(choices);
  },
};

async function getMyParticipant(
  interaction: AutocompleteInteraction,
  session: SessionFull,
): Promise<SessionFull["participants"][number] | null> {
  const char = await prisma.userCharacter.findFirst({
    where: { discordId: interaction.user.id, guildId: interaction.guildId ?? "global" },
    select: { id: true },
  });
  if (!char) return null;
  const own = session.participants.find((p) => p.charId === char.id) ?? null;
  if (!own) return null;
  const active = session.participants.find((p) => p.id === session.turnOrder[session.activeIndex]);
  const actingId = active?.flags.isPuppet && active.flags.controllerId === own.id
    ? active.id
    : resolveActingParticipantId(own, session.participants, active?.id);
  return actingId ? (session.participants.find((p) => p.id === actingId) ?? null) : null;
}
