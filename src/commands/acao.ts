import {
  SlashCommandBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { Command } from "./types.js";
import {
  GATHER_ACTION_BY_SUBCOMMAND,
  GATHER_ACTION_LABELS,
  areasForAction,
  type GatherAction,
} from "../data/gathering.js";
import { getOrCreateCharacter } from "../services/characters/character-service.js";
import { performGathering } from "../services/economy/gathering.js";
import { villageFromMemberStrict } from "../services/economy/village-sync.js";
import type { GuildMember } from "discord.js";
import {
  divider,
  economyContainer,
  itemLabel,
  listBlock,
  noticeBlock,
  ryo,
  text,
  titleBlock,
  v2Edit,
  type AccentName,
  type ContainerChild,
} from "../ui/economy-components-v2.js";
import type { EmojiKey } from "../ui/economy-emojis.js";
import { getItem } from "../data/items.js";

// Frase de abertura por acao. E' RP, nao mecanica: o embed serve para o jogador
// citar no canal. Nao revela chance, cooldown restante nem "quase ganhou".
const NARRATIVA: Record<GatherAction, string> = {
  MINERAR: "Você firma a picareta contra a rocha e trabalha até a veia ceder.",
  COLETAR: "Você vasculha o terreno com calma, separando o que presta do que não presta.",
  CACAR: "Você segue o rastro, espera o momento certo e não erra o bote.",
  PESCAR: "Você lê a corrente, lança a linha e espera o peixe se entregar.",
  COLETAR_AGUA: "Você enche os cantis com água limpa, filtrando o que desce da nascente.",
};

// Coleta e' recurso natural: tudo cai no marrom de estoque da paleta da etapa
// 08. As cores proprias por acao sairam de proposito — a etapa exige paleta
// pequena e consistente, e cinco tons novos so' para /acao brigavam com ela.
const ACAO_ACCENT = {
  MINERAR: "estoque",
  COLETAR: "estoque",
  CACAR: "estoque",
  PESCAR: "estoque",
  COLETAR_AGUA: "estoque",
} as const satisfies Record<GatherAction, AccentName>;

const ACAO_EMOJI = {
  MINERAR: "minerio_ferro",
  COLETAR: "madeira",
  CACAR: "carne_crua",
  PESCAR: "peixe_cru",
  COLETAR_AGUA: "agua_limpa",
} as const satisfies Record<GatherAction, EmojiKey>;

export const acao: Command = {
  data: new SlashCommandBuilder()
    .setName("acao")
    .setDescription("Ações de exploração nos canais de RP")
    .addSubcommand((s) => s.setName("minerar").setDescription("Extrai pedra, minério e carvão"))
    .addSubcommand((s) => s.setName("coletar").setDescription("Recolhe madeira, fibras, ervas e frutas"))
    .addSubcommand((s) => s.setName("cacar").setDescription("Caça animais por carne e couro"))
    .addSubcommand((s) => s.setName("pescar").setDescription("Pesca peixe no rio"))
    .addSubcommand((s) => s.setName("coletar-agua").setDescription("Recolhe água limpa")),

  async execute(interaction: ChatInputCommandInteraction) {
    const action = GATHER_ACTION_BY_SUBCOMMAND[interaction.options.getSubcommand()];
    if (!action) {
      await interaction.reply({ content: "Ação desconhecida.", flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply();
    const guildId = interaction.guildId ?? "global";
    const char = await getOrCreateCharacter(interaction.user.id, guildId, interaction.user.username);

    const outcome = await performGathering(char.id, interaction.channelId, action, {
      villageId: villageFromMemberStrict(interaction.member as GuildMember | null),
    });

    if (!outcome.ok) {
      const areas = areasForAction(action);
      const recovering = outcome.error.toLocaleLowerCase("pt-BR").includes("recuperando");
      const blocks: ContainerChild[] = [
        titleBlock(recovering ? "⏳" : "⚠️", recovering ? "Você ainda está se recuperando" : "Ação indisponível", GATHER_ACTION_LABELS[action]),
        noticeBlock(recovering ? "aviso" : "erro", outcome.error),
      ];
      if (areas.length) {
        blocks.push(
          divider(),
          listBlock(
            "Locais permitidos para esta ação",
            areas.map((area) => `• **${area.name}** — <#${area.channelId}>`),
            "Nenhum local disponível.",
          ),
        );
      }
      blocks.push(text("-# Aguarde o tempo indicado antes de tentar novamente."));
      await interaction.editReply(v2Edit([economyContainer(recovering ? "aviso" : "erro", blocks)]));
      return;
    }

    const { area, loot, delivery } = outcome.result;
    const nome = char.displayName?.trim() || char.name;

    // Cartao publico e compacto: narrativa, loot e rodape. Nada de chance rara,
    // cooldown restante ou informacao de outro jogador (secao 4.2).
    const bloco = [
      titleBlock(ACAO_EMOJI[action], `${GATHER_ACTION_LABELS[action]} — ${area.name}`),
      text(`*${NARRATIVA[action]}*`),
      divider(),
      listBlock(
        "Você obteve",
        loot.map((entry) => itemLabel(entry.itemId, nomeDoItem(entry.itemId), entry.qty)),
        "Nada desta vez.",
      ),
    ];

    // Ordem de coleta ativa desviou o recurso-alvo para a vila: o jogador
    // precisa ver para onde foi e quanto rendeu.
    if (delivery) {
      bloco.push(
        text(
          `-# ${itemLabel(delivery.itemId, nomeDoItem(delivery.itemId), delivery.entregue)} ` +
            `foi direto ao estoque da vila pela ordem de coleta — ${ryo(`${delivery.pago} Ryō`)} pagos.`,
        ),
      );
    }

    bloco.push(text(`-# ${nome} • ${area.name}`));

    // Publico: sem a flag Ephemeral, mas ainda V2 (nada de embeds/content).
    await interaction.editReply(v2Edit([economyContainer(ACAO_ACCENT[action], bloco)]));
  },
};

function nomeDoItem(itemId: string): string {
  return getItem(itemId)?.name ?? itemId;
}
