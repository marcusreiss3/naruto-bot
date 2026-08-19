import {
  ITEM_ACTION_LABELS,
  ITEM_CATEGORY_ICONS,
  ITEM_CATEGORY_LABELS,
  ITEMS,
  itemIconUrl,
} from "../../data/items.js";
import { ALL_ABILITIES, getAbility } from "../../data/index.js";
import { CLANS } from "../../data/clans/index.js";
import { TRAITS } from "../../data/traits.js";
import { ELEMENT_LABELS, TRAIT_RARITY_LABELS } from "../../config/enums.js";
import { ECONOMY } from "../../config/balance.js";
import { CLAN_STARTING_ELEMENTS } from "../../data/clans/starting-element.js";
import { CLAN_TREES } from "../../data/clan-trees/index.js";
import {
  CLANS_BY_VILLAGE,
  clanIconUrl,
  traitIconUrl,
} from "../../data/sheet-creation.js";
import { VILLAGE_NAMES, type VillageId } from "../../data/villages.js";
import {
  GATHER_ACTION_LABELS,
  GATHER_AREAS,
  GATHER_RARE_BY_ACTION,
  type GatherAction,
} from "../../data/gathering.js";
import { RECIPES } from "../../data/recipes.js";
import {
  GENERAL_MARKET_POOL,
  SHOPS,
  SHOP_INGREDIENTS,
  SHOP_PRODUCTS,
  referenceValue,
} from "../../data/shops.js";
import { SECTORS, sectorProductionBase } from "../../data/sectors.js";

import { buildMechanicsSummary } from "./skill-description.js";
import { buildEffectCatalog } from "./effect-catalog.js";

// Servidor, cliente (public/app.js) e cache-buster do index.html andam juntos;
// tests/guides-runtime.test.ts trava os tres. O 6 foi pulado: o index.html ja
// estava em "guide-catalog-6" com esta constante em 5, e responder 6 quebraria
// justamente o app.js cacheado sob essa URL, que compara contra 5.
export const GUIDE_CATALOG_SCHEMA_VERSION = 36;

function abilityView(abilityId: string | undefined) {
  if (!abilityId) return null;
  const ability = getAbility(abilityId);
  if (!ability) return null;
  return {
    id: ability.id,
    name: ability.name,
    category: ability.category,
    resource: ability.resource,
    cost: ability.cost,
    actionType: ability.actionType,
    additionalActionType: ability.additionalActionType,
    baseDamage: ability.baseDamage ?? 0,
    range: ability.range,
    shape: ability.shape,
    description: ability.description,
    mechanics: buildMechanicsSummary(ability),
  };
}

function gatheringSources(itemId: string) {
  return GATHER_AREAS.flatMap((area) => {
    const matchingActions = (Object.entries(area.pools) as [GatherAction, string[]][])
      .filter(([action, pool]) => pool.includes(itemId) || GATHER_RARE_BY_ACTION[action] === itemId)
      .map(([action]) => action);
    const rare = matchingActions.length > 0
      && matchingActions.every((action) => GATHER_RARE_BY_ACTION[action] === itemId);
    return matchingActions.length ? [{
      area: area.name,
      actions: matchingActions.map((action) => GATHER_ACTION_LABELS[action]),
      rareChancePercent: rare ? ECONOMY.rareResourceChance * 100 : null,
    }] : [];
  });
}

function recipeSources(itemId: string) {
  return RECIPES.filter((recipe) => recipe.outputItemId === itemId).map((recipe) => {
    const station = recipe.station ? SHOPS.find((shop) => shop.station === recipe.station)?.name : null;
    return {
      name: recipe.name,
      source: recipe.scope === "personal" ? "Craft pessoal" : station ?? "Produção da Vila",
      outputQty: recipe.outputQty,
    };
  });
}

function itemUses(itemId: string) {
  return RECIPES.filter((recipe) => recipe.ingredients.some((ingredient) =>
    ingredient.itemId === itemId || ingredient.anyOf?.includes(itemId),
  )).map((recipe) => recipe.name);
}

function abilityUses(itemId: string) {
  return [...new Set(ALL_ABILITIES.filter((ability) =>
    ability.requiredItems?.some((requirement) => requirement.itemId === itemId)
      || ability.equippedItemIds?.includes(itemId),
  ).map((ability) => ability.name))];
}

function transformationSources(itemId: string) {
  return ALL_ABILITIES.flatMap((ability) => (ability.requiredItems ?? []).flatMap((requirement) =>
    requirement.exhaustToItemId === itemId
      ? [{
          ability: ability.name,
          fromItem: ITEMS.find((item) => item.id === requirement.itemId)?.name ?? requirement.itemId,
        }]
      : [],
  ));
}

function villageSectorSources(itemId: string) {
  return SECTORS.flatMap((sector) => {
    const produced = [1, 2, 3, 4, 5]
      .some((level) => (sectorProductionBase(sector.key, level)[itemId] ?? 0) > 0);
    return produced ? [{ sector: sector.name, destination: "Estoque central da Vila" }] : [];
  });
}

function shopNames(types: string[]) {
  return [...new Set(types)].map((type) => SHOPS.find((shop) => shop.type === type)?.name ?? type);
}

function itemShopSources(itemId: string) {
  const fixed = shopNames(SHOP_PRODUCTS.filter((row) => row.itemId === itemId).map((row) => row.shop));
  if (GENERAL_MARKET_POOL.some((offer) => offer.itemId === itemId)) {
    fixed.push("Mercado Geral (oferta diária)");
  }
  return fixed;
}

function itemBuyers(item: (typeof ITEMS)[number]) {
  const buyers = shopNames(SHOP_INGREDIENTS.find((row) => row.itemId === item.id)?.shops ?? []);
  if (!item.rare && (referenceValue(item.id) ?? 0) > 0) {
    buyers.push("Mercado Geral (recompra de emergência)");
  }
  return [...new Set(buyers)];
}

export function buildGuideCatalog() {
  const commandGroups = [
    {
      id: "creation",
      title: "Criação e ficha",
      icon: "🥷",
      commands: [
        { command: "/ficha", description: "Abre um espaço privado e inicia a criação guiada do personagem." },
        { command: "/perfil ver", description: "Consulta a ficha concluída, incluindo Vida, recursos, origem e progressão." },
      ],
    },
    {
      id: "character",
      title: "Personagem e progressão",
      icon: "📜",
      commands: [
        { command: "/perfil nome", description: "Define o nome de interpretação do personagem." },
        { command: "/atributos", description: "Abre o painel para distribuir os pontos de atributo disponíveis e confirmar o avanço." },
        { command: "/inventario", description: "Mostra os itens carregados, quantidades, ações disponíveis e a arma equipada." },
        { command: "/aparencia definir", description: "Define a imagem usada para representar o personagem." },
        { command: "/aparencia ver", description: "Mostra a aparência registrada de um personagem." },
      ],
    },
    {
      id: "combat",
      title: "Combate e posicionamento",
      icon: "⚔️",
      commands: [
        { command: "/combate iniciar", description: "Inicia um combate no cenário do canal e pode incluir outros jogadores." },
        { command: "/mapa", description: "Mostra o campo, posições, terreno e participantes do cenário atual." },
        { command: "/atacar alvo", description: "Ataca com o golpe compatível da arma equipada; sem arma, usa Soco." },
        { command: "/jutsu", description: "Usa uma técnica aprendida. Escolha a categoria, a habilidade e depois o alvo ou célula." },
        { command: "/jutsu ninjutsu Concentrar Chakra", description: "Gasta a ação comum do turno para recuperar 20 de chakra. É a opção básica quando nenhuma técnica ou passiva oferece outra recuperação." },
        { command: "/jutsu taijutsu Recuperar o Fôlego", description: "Gasta a ação comum do turno para recuperar 20 de energia. É a opção básica quando nenhuma técnica ou passiva oferece outra recuperação." },
        { command: "/combate fugir", description: "Tenta abandonar a luta. Inimigos próximos reduzem a chance de sucesso." },
        { command: "/combate fim-turno", description: "Encerra sua vez e passa o turno para o próximo participante." },
        { command: "/combate pegar-arma", description: "Recupera uma arma derrubada na mesma célula usando uma ação comum." },
        { command: "/combate pegar-item", description: "Pega um item largado na mesma célula usando uma ação comum." },
        { command: "/combate agua", description: "Ativa ou desativa andar sobre a água usando uma ação bônus, quando a técnica estiver disponível." },
        { command: "/combate byakugan", description: "Ativa ou desativa o Byakugan usando uma ação bônus para personagens Hyuuga aptos." },
        { command: "/combate ketsuryuugan", description: "Ativa ou desativa o Ketsuryuugan usando uma ação bônus para personagens Chinoike aptos." },
        { command: "/combate sharingan tomoe", description: "Ativa ou desativa um estágio aprendido do Sharingan usando uma ação bônus." },
        { command: "/combate portao portao", description: "Ativa ou desativa um Portão Interno aprendido usando uma ação bônus." },
        { command: "/boneco-treino", description: "Cria um alvo de treino para testar dano, alcance e funcionamento das técnicas." },
        { command: "/invocacao", description: "Abre o painel das invocações ativas do seu personagem." },
      ],
    },
    {
      id: "equipment",
      title: "Equipamentos e ferramentas",
      icon: "🎒",
      commands: [
        { command: "/equipar item", description: "Prepara uma arma sem removê-la do inventário. Só uma pode ficar equipada." },
        { command: "/desequipar", description: "Guarda a arma equipada sem consumir o item." },
        { command: "/restaurar-pergaminho pergaminho", description: "Restaura um pergaminho de Bukijutsu gasto por metade do valor em Ryō." },
        { command: "/arremessar item alvo", description: "Lança uma arma à distância e consome uma unidade após a ação ser validada." },
        { command: "/usar item", description: "Ativa ou prepara ferramentas ninja e consome os materiais necessários." },
        { command: "/craft marionete", description: "Abre a oficina para construir uma marionete quando Oficina de Marionetes estiver aprendida." },
        { command: "/marionetes", description: "Gerencia marionetes, mecanismos, construções, reconstruções e invocações em combate." },
        { command: "/dar item jogador", description: "Entrega uma quantidade do item diretamente a outro jogador." },
        { command: "/largar item", description: "Deixa uma quantidade do item na sua célula durante o combate." },
      ],
    },
    {
      id: "world",
      title: "Mundo e viagem",
      icon: "🧭",
      commands: [
        { command: "/viajar", description: "Abre o painel de viagem em um portão de vila ou área do mundo aberto." },
      ],
    },
    {
      id: "missions",
      title: "Missões e interação",
      icon: "🗺️",
      commands: [
        { command: "/missoes ativas", description: "Lista as missões disponíveis no jogo." },
        { command: "/missoes minhas", description: "Mostra as missões que seu personagem está realizando." },
        { command: "/interagir npc", description: "Conversa ou interage com personagens e elementos disponíveis no canal." },
        { command: "/party", description: "Abre o painel para convidar ninjas, ver seu grupo e sair dele." },
        { command: "Botão Entrar na party", description: "Aceita o convite de grupo recebido no canal." },
      ],
    },
    {
      id: "resources",
      title: "Coleta, craft e alimentação",
      icon: "⛏️",
      commands: [
        { command: "/acao minerar", description: "Procura minérios em uma área e canal compatíveis com mineração." },
        { command: "/acao coletar", description: "Coleta plantas e outros recursos disponíveis na área atual." },
        { command: "/acao cacar", description: "Caça recursos em uma área compatível." },
        { command: "/acao pescar", description: "Pesca em um local que ofereça essa atividade." },
        { command: "/acao coletar-agua", description: "Coleta água onde a atividade estiver disponível." },
        { command: "/craft listar", description: "Mostra as receitas pessoais disponíveis e os materiais exigidos." },
        { command: "/craft criar receita quantidade", description: "Produz uma receita conhecida na quantidade informada, se houver materiais." },
        { command: "/comer item quantidade", description: "Consome uma comida do inventário e recupera saciedade." },
      ],
    },
    {
      id: "economy",
      title: "Lojas e comércio",
      icon: "🪙",
      commands: [
        { command: "/loja", description: "Abre a loja da sua vila para consultar, comprar e vender mercadorias." },
        { command: "/loja-premium", description: "Abre a Loja Premium para comprar e usar Giros com Ingots." },
      ],
    },
    {
      id: "village",
      title: "Vila e economia coletiva",
      icon: "🏯",
      commands: [
        { command: "/sincronizar-vila", description: "Sincroniza seu vínculo com a vila configurada no servidor." },
        { command: "/vila", description: "Abre o painel da vila com informações, cofre, estoque e ações permitidas ao seu cargo." },
      ],
    },
  ];

  return {
    schemaVersion: GUIDE_CATALOG_SCHEMA_VERSION,
    quickStart: [
      "Use /ficha para criar seu personagem e /perfil ver para consultar o resultado.",
      "Use /atributos para distribuir pontos e consulte /inventario antes de sair.",
      "Abra sua árvore no site e invista somente nas habilidades que combinam com seus atributos.",
      "Crie um /boneco-treino e abra /mapa para praticar posicionamento sem depender de uma missão.",
      "No seu turno, mova-se pelas setas do painel e use /atacar, /arremessar, /usar ou uma categoria de /jutsu.",
      "Quando terminar suas ações, use /combate fim-turno.",
    ],
    commandGroups,
    commands: commandGroups.flatMap((group) => group.commands),
    effectGroups: buildEffectCatalog(),
    traits: TRAITS.map((trait) => ({
      id: trait.id,
      name: trait.name,
      rarity: trait.rarity,
      rarityLabel: TRAIT_RARITY_LABELS[trait.rarity],
      description: trait.description,
      icon: traitIconUrl(trait),
    })),
    clanGroups: (Object.keys(CLANS_BY_VILLAGE) as VillageId[]).map((villageId) => ({
      id: villageId,
      name: VILLAGE_NAMES[villageId],
      clans: CLANS_BY_VILLAGE[villageId].map((clanId) => {
        const clan = CLANS.find((entry) => entry.id === clanId);
        if (!clan) throw new Error(`Clã não encontrado no catálogo: ${clanId}`);
        const tree = CLAN_TREES[clan.id] ?? [];
        return {
          id: clan.id,
          name: clan.name,
          description: clan.description,
          icon: clanIconUrl(clan.id),
          villageId,
          villageName: VILLAGE_NAMES[villageId],
          guaranteedProgressionElements: (CLAN_STARTING_ELEMENTS[clan.id] ?? [])
            .map((element) => ELEMENT_LABELS[element]),
          progression: tree.length
            ? {
                total: tree.length,
                techniques: tree.filter((node) => node.kind === "JUTSU").map((node) => node.name),
                passives: tree.filter((node) => node.kind === "PASSIVE").length,
              }
            : null,
        };
      }),
    })),
    unarmedAttack: abilityView("item_soco_basico"),
    categories: Object.entries(ITEM_CATEGORY_LABELS).filter(([id]) =>
      ITEMS.some((item) => item.category === id),
    ).map(([id, label]) => ({
      id,
      label,
      icon: ITEM_CATEGORY_ICONS[id as keyof typeof ITEM_CATEGORY_ICONS],
    })),
    items: ITEMS.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      icon: itemIconUrl(item.id),
      category: item.category,
      stackable: item.stackable,
      rare: item.rare ?? false,
      satiety: item.satiety ?? null,
      ryoValue: item.ryoValue ?? null,
      restoration: item.restoresItemId
        ? {
            itemId: item.restoresItemId,
            itemName: ITEMS.find((entry) => entry.id === item.restoresItemId)?.name ?? item.restoresItemId,
            cost: item.ryoValue ? Math.ceil(item.ryoValue / 2) : null,
          }
        : null,
      actions: item.actions.map((action) => ({
        id: action,
        label: ITEM_ACTION_LABELS[action],
      })),
      gatheringSources: gatheringSources(item.id),
      recipeSources: recipeSources(item.id),
      usedInRecipes: itemUses(item.id),
      requiredByAbilities: abilityUses(item.id),
      transformedFrom: transformationSources(item.id),
      villageSectorSources: villageSectorSources(item.id),
      soldBy: itemShopSources(item.id),
      boughtBy: itemBuyers(item),
      basicAbility: abilityView(item.basicAbilityId),
      throwAbility: abilityView(item.throwAbilityId),
      specialRule:
        item.id === "papel_bomba"
          ? "Fora de combate, consome uma Kunai e um Papel Bomba para preparar uma Kunai Explosiva."
          : item.id === "lamina_chakra"
            ? "Exige a habilidade Lâmina de Chakra na árvore de Bukijutsu para ser equipada e utilizada."
            : null,
    })),
  };
}

// Compatibilidade para consumidores antigos; a Central agora usa o catálogo
// completo, mas o nome anterior continua válido enquanto outras integrações
// migram para buildGuideCatalog().
export const buildEquipmentCatalog = buildGuideCatalog;
