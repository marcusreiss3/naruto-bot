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
import { resolveEscort, escortMapHandle } from "../services/missions/escort.js";
import { cleanVillageMapHandle, resolveCleanVillage } from "../services/missions/clean-village.js";
import { purseTheftMapHandle, resolvePurseTheft } from "../services/missions/purse-thief.js";
import { geninComedyMapHandle, resolveGeninComedy } from "../services/missions/genin-comedy.js";
import { dangoRushMapHandle, resolveDangoRush } from "../services/missions/dango-rush.js";
import { resolveRoofCleanup, roofCleanupMapHandle } from "../services/missions/roof-cleanup.js";
import { archiveScrollsMapHandle, resolveArchiveScrolls } from "../services/missions/archive-scrolls.js";
import { medicinalHerbsMapHandle, resolveMedicinalHerbs } from "../services/missions/medicinal-herbs.js";
import { festivalPrepMapHandle, resolveFestivalPrep } from "../services/missions/festival-prep.js";
import { ninkenTrackingMapHandle, resolveNinkenTracking } from "../services/missions/ninken-tracking.js";
import { marketMediationMapHandle, resolveMarketMediation } from "../services/missions/market-mediation.js";
import { dummySubstitutionMapHandle, resolveDummySubstitution } from "../services/missions/dummy-substitution.js";
import { resolveWaspNests, waspNestsMapHandle } from "../services/missions/wasp-nests.js";
import { ichirakuDeliveryMapHandle, resolveIchirakuDelivery } from "../services/missions/ichiraku-delivery.js";
import { cleanWaterMapHandle, resolveCleanWater } from "../services/missions/clean-water.js";
import { nightPatrolMapHandle, resolveNightPatrol } from "../services/missions/night-patrol.js";

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

    // missão de escolta (rota de Konoha -> deserto -> Sunagakure)
    const escortCtx = await resolveEscort(interaction.user.id, guildId);
    if (escortCtx && !session) {
      const note = await escortMapHandle(interaction, escortCtx, channelId, entities);
      if (note) missionNote = note;
    }

    // missao de limpeza (Praca da Folha + Centro Comercial)
    const cleanCtx = await resolveCleanVillage(interaction.user.id, guildId);
    if (cleanCtx && !session) {
      const note = await cleanVillageMapHandle(interaction, cleanCtx, entities);
      if (note) missionNote += note;
    }

    // missao do ladrao de bolsas (Praca da Folha -> Beco de Konoha -> Praca)
    const purseCtx = await resolvePurseTheft(interaction.user.id, guildId);
    if (purseCtx && !session) {
      const note = await purseTheftMapHandle(interaction, purseCtx, entities);
      if (note) missionNote += note;
    }

    // missao da peca de comedia na Academia Genin
    const geninCtx = await resolveGeninComedy(interaction.user.id, guildId);
    if (geninCtx && !session) {
      const note = await geninComedyMapHandle(interaction, geninCtx, entities);
      if (note) missionNote += note;
    }

    // missao dos bolinhos no horario de pico (Centro Comercial)
    const dangoCtx = await resolveDangoRush(interaction.user.id, guildId);
    if (dangoCtx && !session) {
      const note = await dangoRushMapHandle(interaction, dangoCtx, entities);
      if (note) missionNote += note;
    }

    // missao de limpar o telhado da Academia Genin
    const roofCtx = await resolveRoofCleanup(interaction.user.id, guildId);
    if (roofCtx && !session) {
      const note = await roofCleanupMapHandle(interaction, roofCtx, entities);
      if (note) missionNote += note;
    }

    // missao de organizar pergaminhos na Mansao do Hokage
    const archiveCtx = await resolveArchiveScrolls(interaction.user.id, guildId);
    if (archiveCtx && !session) {
      const note = await archiveScrollsMapHandle(interaction, archiveCtx, entities);
      if (note) missionNote += note;
    }

    // missao de ervas medicinais (Hospital de Konoha -> Floresta -> Hospital)
    const herbsCtx = await resolveMedicinalHerbs(interaction.user.id, guildId);
    if (herbsCtx && !session) {
      const note = await medicinalHerbsMapHandle(interaction, herbsCtx, entities);
      if (note) missionNote += note;
    }

    // missao de preparacao do festival da vila (Centro Comercial)
    const festivalCtx = await resolveFestivalPrep(interaction.user.id, guildId);
    if (festivalCtx && !session) {
      const note = await festivalPrepMapHandle(interaction, festivalCtx, entities);
      if (note) missionNote += note;
    }

    // missao do ninken em treinamento (Rota Comercial de Konoha -> Floresta -> Rota)
    const ninkenCtx = await resolveNinkenTracking(interaction.user.id, guildId);
    if (ninkenCtx && !session) {
      const note = await ninkenTrackingMapHandle(interaction, ninkenCtx, entities);
      if (note) missionNote += note;
    }

    // missao de mediacao entre vendedores no Centro Comercial
    const marketCtx = await resolveMarketMediation(interaction.user.id, guildId);
    if (marketCtx && !session) {
      const note = await marketMediationMapHandle(interaction, marketCtx, entities);
      if (note) missionNote += note;
    }

    // missao de treino de substituicao com bonecos danificados
    const dummyCtx = await resolveDummySubstitution(interaction.user.id, guildId);
    if (dummyCtx && !session) {
      const note = await dummySubstitutionMapHandle(interaction, dummyCtx, entities);
      if (note) missionNote += note;
    }

    // missao de remover ninhos de vespas perto da Academia
    const waspCtx = await resolveWaspNests(interaction.user.id, guildId);
    if (waspCtx && !session) {
      const note = await waspNestsMapHandle(interaction, waspCtx, entities);
      if (note) missionNote += note;
    }

    // missao de entrega urgente do Ichiraku (Centro Comercial -> Academia/Hospital/Mansao)
    const ichirakuCtx = await resolveIchirakuDelivery(interaction.user.id, guildId);
    if (ichirakuCtx && !session) {
      const note = await ichirakuDeliveryMapHandle(interaction, ichirakuCtx, entities);
      if (note) missionNote += note;
    }

    // missao de coleta de agua limpa (Hospital -> Floresta/Rota Comercial -> Hospital)
    const waterCtx = await resolveCleanWater(interaction.user.id, guildId);
    if (waterCtx && !session) {
      const note = await cleanWaterMapHandle(interaction, waterCtx, entities);
      if (note) missionNote += note;
    }

    // missao de patrulha noturna no Beco de Konoha
    const patrolCtx = await resolveNightPatrol(interaction.user.id, guildId);
    if (patrolCtx && !session) {
      const note = await nightPatrolMapHandle(interaction, patrolCtx, entities);
      if (note) missionNote += note;
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
