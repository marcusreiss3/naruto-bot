import {
  ITEM_ACTION_LABELS,
  ITEM_CATEGORY_ICONS,
  ITEM_CATEGORY_LABELS,
  ITEMS,
} from "../../data/items.js";
import { getAbility } from "../../data/index.js";
import { buildMechanicsSummary } from "./skill-description.js";
import { buildEffectCatalog } from "./effect-catalog.js";

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

export function buildEquipmentCatalog() {
  const commandGroups = [
    {
      id: "character",
      title: "Personagem e progressão",
      icon: "📜",
      commands: [
        { command: "/perfil ver", description: "Mostra nível, vida, recursos, atributos, elementos, clã e jutsus." },
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
        { command: "/mover destino", description: "Move o personagem para uma célula válida dentro do alcance de movimento." },
        { command: "/atacar alvo", description: "Ataca corpo a corpo conforme a arma equipada; sem arma, usa Soco." },
        { command: "/jutsu", description: "Usa uma técnica aprendida. Escolha a categoria, a habilidade e depois o alvo ou célula." },
        { command: "/jutsu ninjutsu Concentrar Chakra", description: "Gasta a ação comum do turno para recuperar 20 de chakra. Recurso não se recupera sozinho em combate — esta é a única forma." },
        { command: "/jutsu taijutsu Recuperar o Fôlego", description: "Gasta a ação comum do turno para recuperar 20 de energia. Mesma ideia do Concentrar Chakra, do outro lado do recurso." },
        { command: "/combate fugir", description: "Tenta abandonar a luta. Inimigos próximos reduzem a chance de sucesso." },
        { command: "/combate fim-turno", description: "Encerra sua vez e passa o turno para o próximo participante." },
        { command: "/combate pegar-arma", description: "Recupera uma arma derrubada na mesma célula usando uma ação comum." },
        { command: "/combate pegar-item", description: "Pega um item largado na mesma célula usando uma ação comum." },
        { command: "/boneco-treino", description: "Cria um alvo de treino para testar dano, alcance e funcionamento das técnicas." },
      ],
    },
    {
      id: "equipment",
      title: "Equipamentos e ferramentas",
      icon: "🎒",
      commands: [
        { command: "/equipar item", description: "Prepara uma arma sem removê-la do inventário. Só uma pode ficar equipada." },
        { command: "/desequipar", description: "Guarda a arma equipada sem consumir o item." },
        { command: "/arremessar item alvo", description: "Lança uma arma à distância e consome uma unidade após a ação ser validada." },
        { command: "/usar item", description: "Ativa ou prepara ferramentas ninja e consome os materiais necessários." },
        { command: "/dar item jogador", description: "Entrega uma quantidade do item diretamente a outro jogador." },
        { command: "/largar item", description: "Deixa uma quantidade do item na sua célula durante o combate." },
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
        { command: "/party convidar", description: "Convida outro jogador para formar um grupo." },
        { command: "/party aceitar", description: "Aceita o convite de grupo pendente." },
        { command: "/party ver", description: "Mostra os integrantes do seu grupo atual." },
        { command: "/party sair", description: "Sai do grupo; se você for o líder, o grupo é desfeito." },
      ],
    },
  ];

  return {
    quickStart: [
      "Use /perfil ver para conferir seu personagem e /atributos para distribuir pontos.",
      "Consulte /inventario, equipe uma arma se quiser e abra /mapa antes de agir.",
      "No seu turno, use /mover, /atacar, /arremessar, /usar ou uma categoria de /jutsu.",
      "Quando terminar suas ações, use /combate fim-turno.",
    ],
    commandGroups,
    commands: commandGroups.flatMap((group) => group.commands),
    effectGroups: buildEffectCatalog(),
    unarmedAttack: abilityView("item_soco_basico"),
    categories: Object.entries(ITEM_CATEGORY_LABELS).map(([id, label]) => ({
      id,
      label,
      icon: ITEM_CATEGORY_ICONS[id as keyof typeof ITEM_CATEGORY_ICONS],
    })),
    items: ITEMS.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      category: item.category,
      stackable: item.stackable,
      actions: item.actions.map((action) => ({
        id: action,
        label: ITEM_ACTION_LABELS[action],
      })),
      basicAbility: abilityView(item.basicAbilityId),
      throwAbility: abilityView(item.throwAbilityId),
      specialRule:
        item.id === "papel_bomba"
          ? "Fora de combate, consome uma Kunai e um Papel Bomba para preparar uma Kunai Explosiva."
          : item.id === "katana"
            ? "Por enquanto, pode somente ser equipada ou desequipada."
            : null,
    })),
  };
}
