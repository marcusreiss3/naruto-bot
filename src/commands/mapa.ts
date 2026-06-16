import {
  AttachmentBuilder,
  EmbedBuilder,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { Command } from "./types.js";
import { getScenarioByChannel } from "../data/index.js";
import { MapRenderer, type RenderEntity } from "../services/maps/renderer.js";
import { getActiveSession } from "../services/combat/combat-engine.js";
import { buildSessionEntities } from "../services/combat/combat-render.js";
import { getOrCreateCharacter } from "../services/characters/character-service.js";
import { getAppearance } from "../services/appearance/appearance-service.js";
import {
  getActiveInstanceForChannel,
  readState,
  setState,
} from "../services/missions/mission-service.js";
import { spawnCat, type CatState } from "../services/missions/cat.js";
import {
  resolveBandit,
  investigationMapEntities,
  onCommercialMap,
  type BanditState,
} from "../services/missions/investigation.js";
import { triggerBanditForest } from "../services/missions/mission-runtime.js";

export const mapa: Command = {
  data: new SlashCommandBuilder().setName("mapa").setDescription("Mostra o mapa do cenário deste canal"),
  async execute(interaction: ChatInputCommandInteraction) {
    const channelId = interaction.channelId;
    const scenario = getScenarioByChannel(channelId);
    if (!scenario) {
      await interaction.reply({ content: "❌ Este canal não tem um cenário configurado.", ephemeral: true });
      return;
    }
    await interaction.deferReply();

    const entities: RenderEntity[] = [];
    const drops: { cell: string }[] = [];
    let round: number | undefined;

    const guildId = interaction.guildId ?? "global";

    const session = await getActiveSession(channelId);
    if (session) {
      round = session.round;
      entities.push(...(await buildSessionEntities(session, guildId)));
      session.drops.forEach((d) => drops.push({ cell: d.cell }));
    }

    // missao de gato no canal
    const char = await getOrCreateCharacter(interaction.user.id, guildId, interaction.user.username);
    const missionCtx = await getActiveInstanceForChannel(char.id, channelId);
    let missionNote = "";
    if (missionCtx?.def.type === "FETCH_CAT") {
      let state = readState<CatState>(missionCtx.inst.stateJson);
      if (!state.catCell) {
        const playerCell = state.playerCell ?? "A1";
        state = { catCell: spawnCat(scenario, playerCell), playerCell, turns: 0 };
        await setState(missionCtx.inst.id, state);
      }
      // jogador (com aparência) + gato
      const ap = await getAppearance(interaction.user.id, guildId);
      entities.push({
        cell: state.playerCell,
        label: char.name.slice(0, 3),
        name: char.name,
        color: "#3498db",
        kind: "PLAYER",
        hp: char.hpCurrent,
        hpMax: char.hpMax,
        chakra: char.resources!.chakra,
        energia: char.resources!.energia,
        imageUrl: ap?.imageUrl,
      });
      entities.push({ cell: state.catCell, label: "🐱", color: "#ffffff", kind: "CAT" });
      missionNote = `\n🎯 Missão ativa: **${missionCtx.def.name}** — use \`/mover\` para perseguir o gato.`;
    }

    // missão dos bandidos (investigação no comercial / confronto na floresta)
    const banditCtx = await resolveBandit(interaction.user.id, guildId);
    if (banditCtx && !session) {
      const bstate = readState<BanditState>(banditCtx.inst.stateJson);
      const stage = bstate.stage ?? "INVESTIGATE";
      const forestId = String(banditCtx.def.data?.forestChannelId ?? "");

      if (channelId === banditCtx.def.channelId) {
        // centro comercial
        if (stage === "INVESTIGATE") {
          await onCommercialMap(banditCtx.inst.id);
          entities.push(...investigationMapEntities());
          missionNote = `\n🎯 **${banditCtx.def.name}** — fale com os NPCs usando \`/interagir npc\` para descobrir as pistas.`;
        } else {
          missionNote = `\n🎯 **${banditCtx.def.name}** — vá para a **Floresta** e use \`/mapa\` para o confronto.`;
        }
      } else if (channelId === forestId) {
        // floresta
        if (stage === "FOREST") {
          missionNote = `\n🎯 **${banditCtx.def.name}** — o confronto começa!`;
          // dispara a fala do líder (etapa FIGHT)
          await triggerBanditForest(interaction, char, banditCtx.inst.id);
        } else if (stage === "FIGHT") {
          missionNote = `\n🎯 **${banditCtx.def.name}** — confronto em andamento. Fale no canal ou use \`/jutsu\`.`;
        } else {
          missionNote = `\n🎯 **${banditCtx.def.name}** — descubra as pistas no **Centro Comercial** antes de vir à Floresta.`;
        }
      }
    }

    const png = await MapRenderer.renderScenario({ scenario, round, entities, drops });
    const file = new AttachmentBuilder(png, { name: "mapa.png" });

    const embed = new EmbedBuilder()
      .setTitle(`🗺️ ${scenario.name}`)
      .setDescription(`${scenario.description}${missionNote}`)
      .setColor(0x2ecc71)
      .setImage("attachment://mapa.png");

    await interaction.editReply({ embeds: [embed], files: [file] });
  },
};
