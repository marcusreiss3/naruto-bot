import {
  ITEM_ACTION_LABELS,
  ITEM_CATEGORY_ICONS,
  ITEM_CATEGORY_LABELS,
  ITEMS,
} from "../../data/items.js";
import { getAbility } from "../../data/index.js";

// Categorias que a pagina de equipamento cobre. MATERIAL e FOOD ficam de fora:
// sao insumo de coleta/craft, nao equipamento com habilidade.
const EQUIPMENT_ITEMS = ITEMS.filter(
  (item) => item.category === "WEAPON" || item.category === "NINJA_TOOL" || item.category === "CONSUMABLE",
);

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
    {
      id: "economy",
      title: "Coleta, craft e comércio",
      icon: "🛠️",
      commands: [
        { command: "/acao minerar", description: "Procura minérios em uma área e canal compatíveis com mineração." },
        { command: "/acao coletar", description: "Coleta plantas e outros recursos disponíveis na área atual." },
        { command: "/acao cacar", description: "Caça recursos em uma área compatível." },
        { command: "/acao pescar", description: "Pesca em um local que ofereça essa atividade." },
        { command: "/acao coletar-agua", description: "Coleta água onde a atividade estiver disponível." },
        { command: "/craft listar", description: "Mostra as receitas pessoais disponíveis e os materiais exigidos." },
        { command: "/craft criar receita quantidade", description: "Produz uma receita conhecida na quantidade informada, se houver materiais." },
        { command: "/comer item quantidade", description: "Consome uma comida do inventário e recupera saciedade." },
        { command: "/loja", description: "Abre a loja da sua vila para consultar, comprar e vender mercadorias." },
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
    quickStart: [
      "Use /perfil ver para conferir seu personagem e /atributos para distribuir pontos.",
      "Use /sincronizar-vila para confirmar seu vínculo e consulte /inventario antes de sair.",
      "Abra sua árvore no site e invista somente nos caminhos que combinam com seus atributos.",
      "Crie um /boneco-treino e abra /mapa para praticar posicionamento sem depender de uma missão.",
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
    // So' equipamento: a pagina e' sobre arma/ferramenta e suas habilidades.
    // Materiais e alimentos da coleta tem economia propria e nao entram aqui.
    items: EQUIPMENT_ITEMS.map((item) => ({
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
