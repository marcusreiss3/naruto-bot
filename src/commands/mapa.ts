import {
  AttachmentBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { Command } from "./types.js";
import { getScenarioByChannel, getScenarioById } from "../data/index.js";
import type { ScenarioDef } from "../data/types.js";
import type { NinjaRank } from "../config/enums.js";
import { MapRenderer, type RenderEntity } from "../services/maps/renderer.js";
import { getActiveSession } from "../services/combat/combat-engine.js";
import { buildSessionEntities } from "../services/combat/combat-render.js";
import { getOrCreateCharacter } from "../services/characters/character-service.js";
import { getAppearance } from "../services/appearance/appearance-service.js";
import { formatRyo } from "../services/economy/character-economy.js";
import { EconomyError } from "../services/economy/errors.js";
import {
  isHospitalChannel,
  treatCharacter,
  TREATMENT_COST,
  type TreatmentKind,
} from "../services/characters/hospital-service.js";
import {
  button,
  buttonRow,
  divider,
  factsBlock,
  feedbackBlock,
  mediaGallery,
  ryo,
  singleCard,
  text,
  titleBlock,
  v2Edit,
  v2Payload,
  v2Public,
  type ContainerChild,
  type TopLevel,
} from "../ui/economy-components-v2.js";
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
import { cloneInvestigationMapHandle, resolveCloneInvestigation } from "../services/missions/clone-investigation.js";
import { resolveUrgentDeliveries, urgentDeliveriesMapHandle } from "../services/missions/urgent-deliveries.js";
import { festivalSecurityMapHandle, resolveFestivalSecurity } from "../services/missions/festival-security.js";
import { falseNinjasMapHandle, resolveFalseNinjas } from "../services/missions/false-ninjas.js";
import { resolveSupplyDepot, supplyDepotMapHandle } from "../services/missions/supply-depot-defense.js";
import { missingChildMapHandle, resolveMissingChild } from "../services/missions/missing-child.js";
import { insectPlagueMapHandle, resolveInsectPlague } from "../services/missions/insect-plague.js";
import { interceptedCodeMapHandle, resolveInterceptedCode } from "../services/missions/intercepted-code.js";
import { caveRescueMapHandle, resolveCaveRescue } from "../services/missions/cave-rescue.js";
import { itinerantFestivalMapHandle, resolveItinerantFestival } from "../services/missions/itinerant-festival.js";
import { resolveRouteTraps, routeTrapsMapHandle } from "../services/missions/route-traps.js";
import { hospitalTheftMapHandle, resolveHospitalTheft } from "../services/missions/hospital-theft.js";
import { damagedBridgeMapHandle, resolveDamagedBridge } from "../services/missions/damaged-bridge.js";
import { floodRescueMapHandle, resolveFloodRescue } from "../services/missions/flood-rescue.js";
import { districtNightPatrolMapHandle, resolveDistrictNightPatrol } from "../services/missions/district-night-patrol.js";
import { enemyOutpostMapHandle, resolveEnemyOutpostInfiltration } from "../services/missions/enemy-outpost-infiltration.js";
import { marketFireMapHandle, resolveMarketFire } from "../services/missions/market-fire.js";
import { nukeninHuntMapHandle, resolveNukeninHunt } from "../services/missions/nukenin-hunt.js";
import { resolveRiverSmuggling, riverSmugglingMapHandle } from "../services/missions/river-smuggling.js";
import { desertAmbushMapHandle, resolveDesertAmbush } from "../services/missions/desert-ambush.js";
import { bandanaCollectorMapHandle, resolveBandanaCollector } from "../services/missions/bandana-collector.js";
import { resolveYukiHeir, yukiHeirMapHandle } from "../services/missions/yuki-heir.js";
import { corpsePulseMapHandle, resolveCorpsePulse } from "../services/missions/corpse-pulse.js";
import { eliteMaskMapHandle, resolveEliteMask } from "../services/missions/elite-mask.js";
import { forbiddenBellMapHandle, resolveForbiddenBell } from "../services/missions/forbidden-bell.js";
import { mestreEstiloStaticEntities } from "../services/missions/mestre-estilo.js";
import { emoji } from "../ui/economy-emojis.js";
import {
  canClaimDailyMissionRank,
  claimDailyMission,
  DAILY_MISSION_RANKS,
  getDailyMissionBoard,
  getDailyMissionClaims,
  getDailyMissionOffer,
  type DailyMissionRank,
} from "../services/missions/daily-mission-board.js";
import { renderMissionBoardCard } from "../ui/mission-board-card.js";
import { isVillageMansionChannel } from "../services/village-service.js";
import { villageFromMemberStrict } from "../services/economy/village-sync.js";
import { missionBoardSummary } from "../data/missions/board-summaries.js";

const PREFIX = "mapa:v1";
const cid = (action: string) => `${PREFIX}:${action}`;

interface HospitalCharState {
  hpCurrent: number;
  hpMax: number;
  ryo: number;
}

// Bloco de tratamento pago, mostrado dentro do mesmo container so' quando o
// canal e' um hospital e nao ha' combate ativo nele (checado por quem chama).
function buildHospitalSection(char: HospitalCharState, feedback?: string): ContainerChild[] {
  const cheia = char.hpCurrent >= char.hpMax;
  const children: ContainerChild[] = [
    divider(),
    titleBlock("hospital", "Tratamento médico", "Cura paga em Ryō"),
    factsBlock([
      { label: "Vida", value: `${emoji("vida")} ${char.hpCurrent}/${char.hpMax}` },
      { label: "Ryō", value: ryo(formatRyo(char.ryo)) },
    ]),
  ];
  if (feedback) children.push(feedbackBlock(feedback));
  children.push(
    buttonRow(
      button({
        id: cid("heal-basic"),
        label: `Tratamento básico (${TREATMENT_COST.basic} Ryō)`,
        emojiKey: "vida",
        disabled: cheia,
      }),
      button({
        id: cid("heal-advanced"),
        label: `Tratamento avançado (${TREATMENT_COST.advanced} Ryō)`,
        style: ButtonStyle.Primary,
        emojiKey: "vida",
        disabled: cheia,
      }),
    ),
  );
  return children;
}

// Reconstroi o container so' com o essencial (titulo/descricao estaticos do
// cenario + mapa ja anexado + secao de hospital) apos um clique de cura. Nao
// refaz o pipeline de ~40 missoes do execute(): a nota de missao eventual so'
// volta a aparecer quando o jogador roda /mapa de novo, o que e' aceitavel
// para uma acao que so' mexe em vida/Ryo.
function rebuildContainerAfterHeal(scenario: ScenarioDef, char: HospitalCharState, feedback: string): TopLevel[] {
  const children: ContainerChild[] = [
    titleBlock("mapa", scenario.name),
    text(scenario.description),
    mediaGallery("attachment://mapa.png", `Mapa de ${scenario.name}`),
    ...buildHospitalSection(char, feedback),
  ];
  return singleCard("vila", children);
}

function isDailyMissionRank(value: string | undefined): value is DailyMissionRank {
  return DAILY_MISSION_RANKS.includes(value as DailyMissionRank);
}

async function buildDailyMissionBoard(char: { id: string; ninjaRank: string }, feedback?: string) {
  const ninjaRank = char.ninjaRank as NinjaRank;
  const board = await getDailyMissionBoard(char.id);
  const claims = await getDailyMissionClaims(char.id, board.dayKey);
  const offers = DAILY_MISSION_RANKS.map((rank) => {
    const mission = getDailyMissionOffer(board.offers, rank);
    return {
      rank,
      name: mission?.name ?? null,
      description: mission ? missionBoardSummary(mission) : null,
      locked: mission ? !canClaimDailyMissionRank(ninjaRank, rank) : false,
      claimed: mission ? claims.has(rank) : false,
      unavailable: mission === null,
    };
  });
  const image = await renderMissionBoardCard({ dayKey: board.dayKey, offers });
  const buttons = offers.map((offer) => button({
    id: cid(`mission:${offer.rank}`),
    label: offer.unavailable
      ? `Rank ${offer.rank}: sem missões`
      : offer.claimed
        ? `Rank ${offer.rank}: aceita`
        : `Pegar missão ${offer.rank}`,
    style: offer.claimed ? ButtonStyle.Success : ButtonStyle.Primary,
    emojiKey: "missoes",
    disabled: offer.unavailable || offer.claimed || offer.locked,
  }));
  const children: ContainerChild[] = [
    titleBlock("missoes", "Mural de missões", "Ofertas pessoais renovadas diariamente à 00:00 (Brasília)"),
    text(
      `${emoji("informacao")} Você pode aceitar uma missão por rank a cada dia, com 3h para concluir. ` +
        `Genin: D sozinho, C só em party com um(a) Chūnin ou Jōnin. Chūnin: D e C sozinho, B só em party com outro(a) Chūnin ou Jōnin. Jōnin e Kage: D, C e B livre.`,
    ),
    mediaGallery("attachment://mural-missoes.png", "Mural diário de missões"),
  ];
  if (feedback) children.push(feedbackBlock(feedback));
  children.push(divider(), buttonRow(...buttons));
  return {
    payload: v2Payload(singleCard("vila", children), true),
    file: new AttachmentBuilder(image, { name: "mural-missoes.png" }),
  };
}

export const mapa: Command = {
  data: new SlashCommandBuilder().setName("mapa").setDescription("Mostra o mapa do cenário deste canal"),
  async execute(interaction: ChatInputCommandInteraction) {
    const channelId = interaction.channelId;
    let session = await getActiveSession(channelId);
    const scenario = session
      ? getScenarioById(session.scenarioId) ?? getScenarioByChannel(channelId)
      : getScenarioByChannel(channelId);
    if (!scenario) {
      await interaction.reply({ content: `${emoji("erro")} Este canal não tem um cenário configurado.`, ephemeral: true });
      return;
    }
    await interaction.deferReply();

    const entities: RenderEntity[] = [];
    const drops: { cell: string }[] = [];
    let round: number | undefined;

    const guildId = interaction.guildId ?? "global";

    let renderScenario = scenario;
    if (session) {
      round = session.round;
      entities.push(...(await buildSessionEntities(session, guildId)));
      session.drops.forEach((d) => drops.push({ cell: d.cell }));
    } else {
      // Mestres de estilo de luta sao fixos no cenario — aparecem pra
      // qualquer jogador que visite o local, tenha ou nao comecado a missao
      // de aprender com eles (diferente do padrao ephemeral das outras
      // missoes, que so' mostram NPC com instancia ja ativa).
      entities.push(...mestreEstiloStaticEntities(channelId));
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

    // missao de identificar o clone infiltrado na Academia
    const cloneCtx = await resolveCloneInvestigation(interaction.user.id, guildId);
    if (cloneCtx && !session) {
      const note = await cloneInvestigationMapHandle(interaction, cloneCtx, entities);
      if (note) missionNote += note;
    }

    // missao de entregas oficiais entre a Mansao, Academia, Hospital e Mercado
    const deliveriesCtx = await resolveUrgentDeliveries(interaction.user.id, guildId);
    if (deliveriesCtx && !session) {
      const note = await urgentDeliveriesMapHandle(interaction, deliveriesCtx, entities);
      if (note) missionNote += note;
    }

    // missao rank C de seguranca do festival no Centro Comercial
    const festivalSecurityCtx = await resolveFestivalSecurity(interaction.user.id, guildId);
    if (festivalSecurityCtx && !session) {
      const note = await festivalSecurityMapHandle(interaction, festivalSecurityCtx, entities);
      if (note) missionNote += note;
    }

    // missao rank C de patrulha noturna no distrito comercial
    const districtNightPatrolCtx = await resolveDistrictNightPatrol(interaction.user.id, guildId);
    if (districtNightPatrolCtx && !session) {
      const note = await districtNightPatrolMapHandle(interaction, districtNightPatrolCtx, entities);
      if (note) missionNote += note;
    }

    // missao rank C dos falsos ninjas, configurada pela vila
    const falseNinjasCtx = await resolveFalseNinjas(interaction.user.id, guildId, interaction.channelId);
    if (falseNinjasCtx && !session) {
      const note = await falseNinjasMapHandle(interaction, falseNinjasCtx, entities);
      if (note) missionNote += note;
    }

    // missao rank C de defesa do deposito regional
    const supplyDepotCtx = await resolveSupplyDepot(interaction.user.id, guildId, interaction.channelId);
    if (supplyDepotCtx && !session) {
      const note = await supplyDepotMapHandle(interaction, supplyDepotCtx, entities);
      if (note) missionNote += note;
    }

    // missao rank C da crianca desaparecida, com investigacao por varios locais
    const missingChildCtx = await resolveMissingChild(interaction.user.id, guildId, interaction.channelId);
    if (missingChildCtx && !session) {
      const note = await missingChildMapHandle(interaction, missingChildCtx, entities);
      if (note) missionNote += note;
    }

    // missao rank C da praga de insetos controlados por chakra
    const insectPlagueCtx = await resolveInsectPlague(interaction.user.id, guildId, interaction.channelId);
    if (insectPlagueCtx && !session) {
      const note = await insectPlagueMapHandle(interaction, insectPlagueCtx, entities);
      if (note) missionNote += note;
    }

    // missao rank C da mensagem criptografada interceptada
    const interceptedCodeCtx = await resolveInterceptedCode(interaction.user.id, guildId, interaction.channelId);
    if (interceptedCodeCtx && !session) {
      const note = await interceptedCodeMapHandle(interaction, interceptedCodeCtx, entities);
      if (note) missionNote += note;
    }

    // missao rank C de resgate na caverna
    const caveRescueCtx = await resolveCaveRescue(interaction.user.id, guildId, interaction.channelId);
    if (caveRescueCtx && !session) {
      const note = await caveRescueMapHandle(interaction, caveRescueCtx, entities);
      if (note) missionNote += note;
    }

    // missao rank C de protecao de festival itinerante
    const itinerantFestivalCtx = await resolveItinerantFestival(interaction.user.id, guildId, interaction.channelId);
    if (itinerantFestivalCtx && !session) {
      const note = await itinerantFestivalMapHandle(interaction, itinerantFestivalCtx, entities);
      if (note) missionNote += note;
    }

    // missao rank C de armadilhas na rota comercial
    const routeTrapsCtx = await resolveRouteTraps(interaction.user.id, guildId, interaction.channelId);
    if (routeTrapsCtx && !session) {
      const note = await routeTrapsMapHandle(interaction, routeTrapsCtx, entities);
      if (note) missionNote += note;
    }

    // missao rank C de roubo de remedios no hospital
    const hospitalTheftCtx = await resolveHospitalTheft(interaction.user.id, guildId, interaction.channelId);
    if (hospitalTheftCtx && !session) {
      const note = await hospitalTheftMapHandle(interaction, hospitalTheftCtx, entities);
      if (note) missionNote += note;
    }

    // missao rank C da ponte danificada na rota comercial
    const damagedBridgeCtx = await resolveDamagedBridge(interaction.user.id, guildId, interaction.channelId);
    if (damagedBridgeCtx && !session) {
      const note = await damagedBridgeMapHandle(interaction, damagedBridgeCtx, entities);
      if (note) missionNote += note;
    }

    // missao rank C de resgate em rio/enchente
    const floodRescueCtx = await resolveFloodRescue(interaction.user.id, guildId, interaction.channelId);
    if (floodRescueCtx && !session) {
      const note = await floodRescueMapHandle(interaction, floodRescueCtx, entities);
      if (note) missionNote += note;
    }

    // missao rank B de infiltracao no posto inimigo
    const enemyOutpostCtx = await resolveEnemyOutpostInfiltration(interaction.user.id, guildId);
    if (enemyOutpostCtx && !session) {
      const note = await enemyOutpostMapHandle(interaction, enemyOutpostCtx);
      if (note) missionNote += note;
    }

    // missao rank C de incendio nas barracas do Centro Comercial
    const marketFireCtx = await resolveMarketFire(interaction.user.id, guildId);
    if (marketFireCtx && !session) {
      const note = await marketFireMapHandle(interaction, marketFireCtx, entities);
      if (note) missionNote += note;
    }

    // missao rank C de cacada ao nukenin menor
    const nukeninHuntCtx = await resolveNukeninHunt(interaction.user.id, guildId);
    if (nukeninHuntCtx && !session) {
      const note = await nukeninHuntMapHandle(interaction, nukeninHuntCtx, entities);
      if (note) missionNote += note;
    }

    // missao rank C de contrabando no Rio
    const riverSmugglingCtx = await resolveRiverSmuggling(interaction.user.id, guildId);
    if (riverSmugglingCtx && !session) {
      const note = await riverSmugglingMapHandle(interaction, riverSmugglingCtx, entities);
      if (note) missionNote += note;
    }

    // missao rank C de emboscada no Deserto
    const desertAmbushCtx = await resolveDesertAmbush(interaction.user.id, guildId);
    if (desertAmbushCtx && !session) {
      const note = await desertAmbushMapHandle(interaction, desertAmbushCtx, entities);
      if (note) missionNote += note;
    }

    // missao rank C do colecionador de bandanas
    const bandanaCollectorCtx = await resolveBandanaCollector(interaction.user.id, guildId);
    if (bandanaCollectorCtx && !session) {
      const note = await bandanaCollectorMapHandle(interaction, bandanaCollectorCtx, entities);
      if (note) missionNote += note;
    }

    // missao rank B do herdeiro do Cla Yuki, com origem baseada na vila do jogador
    const yukiHeirCtx = await resolveYukiHeir(interaction.user.id, guildId, interaction.channelId);
    if (yukiHeirCtx && !session) {
      const note = await yukiHeirMapHandle(interaction, yukiHeirCtx, entities);
      if (note) missionNote += note;
    }

    // missao rank B do pulso do cadaver em Konoha
    const corpsePulseCtx = await resolveCorpsePulse(interaction.user.id, guildId, interaction.channelId);
    if (corpsePulseCtx && !session) {
      const note = await corpsePulseMapHandle(interaction, corpsePulseCtx, entities);
      if (note) missionNote += note;
    }

    // missao rank B da Mascara de Cinzas em Konoha
    const eliteMaskCtx = await resolveEliteMask(interaction.user.id, guildId, interaction.channelId);
    if (eliteMaskCtx && !session) {
      const note = await eliteMaskMapHandle(interaction, eliteMaskCtx, entities);
      if (note) missionNote += note;
    }

    // missao rank B do Sino Que Nao Deve Tocar
    const forbiddenBellCtx = await resolveForbiddenBell(interaction.user.id, guildId, interaction.channelId);
    if (forbiddenBellCtx && !session) {
      const note = await forbiddenBellMapHandle(interaction, forbiddenBellCtx, entities);
      if (note) missionNote += note;
    }

    if (!session) {
      const freshSession = await getActiveSession(channelId);
      if (freshSession) {
        session = freshSession;
        renderScenario = getScenarioById(session.scenarioId) ?? renderScenario;
        round = session.round;
        entities.length = 0;
        drops.length = 0;
        entities.push(...(await buildSessionEntities(session, guildId)));
        session.drops.forEach((d) => drops.push({ cell: d.cell }));
      }
    }

    const png = await MapRenderer.renderScenario({
      scenario: renderScenario,
      round,
      entities,
      drops,
      includeStatusPanel: false,
      showMetadata: false,
    });
    const mapFile = new AttachmentBuilder(png, { name: "mapa.png" });
    const statusPng = await MapRenderer.renderStatusPanel(entities);

    const children: ContainerChild[] = [
      titleBlock("mapa", renderScenario.name),
      text(`${renderScenario.description}${missionNote}`),
      mediaGallery("attachment://mapa.png", `Mapa de ${renderScenario.name}`),
    ];
    if (!session && isHospitalChannel(channelId)) {
      children.push(...buildHospitalSection(char));
    }

    await interaction.editReply({ ...v2Edit(singleCard("vila", children)), files: [mapFile] });
    // O mural é uma resposta efêmera própria: o mapa continua visível no
    // canal, enquanto as missões diárias de cada jogador permanecem privadas.
    // Busca o membro de propósito, em vez de depender do objeto parcial que
    // acompanha a interação. Assim o gate lê o cargo real no Discord mesmo
    // quando o cache local ainda não refletiu uma troca de vila.
    const memberForMissionBoard = interaction.guild
      ? await interaction.guild.members.fetch(interaction.user.id).catch(() => null)
      : null;
    const atOwnVillageMansion = isVillageMansionChannel(villageFromMemberStrict(memberForMissionBoard), channelId);
    if (!session && char.ninjaRank !== "ACADEMIA" && atOwnVillageMansion) {
      const mural = await buildDailyMissionBoard(char);
      await interaction.followUp({ ...mural.payload, files: [mural.file] });
    }
    // O Discord coloca imagens da mesma mensagem em grade. O painel segue em
    // uma mensagem própria para ficar sempre abaixo do mapa, sem recortes.
    if (statusPng && interaction.channel?.isTextBased() && "send" in interaction.channel) {
      const statusFile = new AttachmentBuilder(statusPng, { name: "status.png" });
      const statusChildren: ContainerChild[] = [mediaGallery("attachment://status.png", "Painel de status")];
      await interaction.channel.send({ ...v2Public(singleCard("vila", statusChildren)), files: [statusFile] });
    }
  },

  async handleButton(interaction: ButtonInteraction) {
    const [, , action, actionArg] = interaction.customId.split(":");
    if (action === "mission") {
      if (!isDailyMissionRank(actionArg)) return;
      const guildId = interaction.guildId ?? "global";
      const char = await getOrCreateCharacter(interaction.user.id, guildId, interaction.user.username);
      const memberForMissionBoard = interaction.guild
        ? await interaction.guild.members.fetch(interaction.user.id).catch(() => null)
        : null;
      if (!isVillageMansionChannel(villageFromMemberStrict(memberForMissionBoard), interaction.channelId)) {
        await interaction.reply({ content: `${emoji("erro")} Você só pode aceitar missões na mansão do Kage da sua vila.`, ephemeral: true });
        return;
      }
      const result = await claimDailyMission(char.id, interaction.user.id, guildId, char.ninjaRank as NinjaRank, actionArg);
      const mural = await buildDailyMissionBoard(
        char,
        result.ok
          ? `✅ Missão aceita: **[${result.mission!.rank}] ${result.mission!.name}**. Use \`/missoes minhas\` para acompanhar os objetivos.`
          : `❌ ${result.error ?? "Não foi possível aceitar esta missão."}`,
      );
      await interaction.update({ ...v2Edit(mural.payload.components), files: [mural.file] });
      return;
    }
    if (action !== "heal-basic" && action !== "heal-advanced") return;

    const channelId = interaction.channelId;
    const guildId = interaction.guildId ?? "global";
    const scenario = getScenarioByChannel(channelId);
    const char = await getOrCreateCharacter(interaction.user.id, guildId, interaction.user.username);

    let hpCurrent = char.hpCurrent;
    let hpMax = char.hpMax;
    let ryoAtual = char.ryo;
    let feedback: string;
    try {
      if (!scenario || !isHospitalChannel(channelId)) {
        throw new EconomyError("Isto só funciona dentro de um hospital.");
      }
      const session = await getActiveSession(channelId);
      if (session) {
        throw new EconomyError("Não é possível receber tratamento durante um combate ativo neste canal.");
      }
      const kind: TreatmentKind = action === "heal-basic" ? "basic" : "advanced";
      const result = await treatCharacter(char.id, kind);
      hpCurrent = result.hpCurrent;
      hpMax = result.hpMax;
      ryoAtual = char.ryo - TREATMENT_COST[kind];
      feedback = `✅ Tratamento concluído: +${result.healed} de vida (${hpCurrent}/${hpMax}).`;
    } catch (error) {
      feedback = `❌ ${error instanceof Error ? error.message : "Não foi possível concluir o tratamento."}`;
    }

    if (!scenario) {
      await interaction.reply({ content: feedback, ephemeral: true });
      return;
    }
    const payload = v2Edit(rebuildContainerAfterHeal(scenario, { hpCurrent, hpMax, ryo: ryoAtual }, feedback));
    await interaction.update(payload);
  },
};
