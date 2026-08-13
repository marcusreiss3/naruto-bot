"use strict";

(function exposeGuideCatalog() {
  const categories = [
    {
      id: "inicio",
      title: "Começando",
      description: "Do primeiro comando à leitura do seu personagem.",
      icon: "🌱",
      order: 1,
    },
    {
      id: "progressao",
      title: "Progressão",
      description: "Atributos, árvores e técnicas que formam sua build.",
      icon: "📈",
      order: 2,
    },
    {
      id: "combate",
      title: "Combate",
      description: "Turnos, posicionamento, equipamentos e efeitos.",
      icon: "⚔️",
      order: 3,
    },
    {
      id: "aventura",
      title: "Aventura",
      description: "Missões, NPCs e jogo em grupo.",
      icon: "🗺️",
      order: 4,
    },
    {
      id: "economia",
      title: "Economia",
      description: "Coleta, fabricação, alimentação e comércio.",
      icon: "🪙",
      order: 5,
    },
    {
      id: "referencia",
      title: "Referência",
      description: "Atalhos de comandos e respostas rápidas.",
      icon: "📚",
      order: 6,
    },
  ];

  const learningPath = [
    "primeiros-passos",
    "personagem-e-atributos",
    "arvores-e-jutsus",
    "itens-e-equipamentos",
    "efeitos-de-combate",
    "combate-tatico",
    "missoes-e-party",
    "economia-coleta-e-craft",
  ];

  const guides = [
    {
      slug: "primeiros-passos",
      title: "Primeiros passos",
      description: "Crie seu registro, confira a ficha e descubra o próximo passo sem se perder.",
      category: "inicio",
      icon: "🥷",
      order: 1,
      type: "guide",
      readingTime: 3,
      keywords: ["iniciante", "começar", "personagem", "perfil", "discord", "site"],
      sections: [
        {
          id: "primeiro-contato",
          title: "Seu primeiro contato",
          blocks: [
            {
              type: "paragraph",
              text: "O personagem é criado automaticamente quando você usa um comando que precisa da ficha. Ele começa na Academia, com os valores básicos e os recursos cheios. O caminho mais simples é abrir o perfil; depois, você pode definir o nome de interpretação e a aparência.",
            },
            {
              type: "steps",
              items: [
                { title: "Abra a ficha", text: "Use /perfil ver para criar ou consultar o personagem." },
                { title: "Escolha o nome", text: "Use /perfil nome para definir o nome exibido na ficha e no site." },
                { title: "Sincronize a vila", text: "Use /sincronizar-vila para atualizar o vínculo a partir do seu cargo no servidor." },
                { title: "Personalize", text: "Use /aparencia definir para enviar uma ilustração humanoide, revisar a análise e confirmar a identidade reservada." },
                { title: "Confira seus recursos", text: "No perfil, revise nível, vida, chakra, energia, atributos, elementos, clã, trait e técnicas." },
              ],
            },
            {
              type: "callout",
              tone: "info",
              title: "Parte da ficha depende da equipe",
              text: "Clã, trait, rank ninja e estilo de luta são definidos pela administração no estado atual do jogo; não há um comando público para escolhê-los ou sorteá-los.",
            },
          ],
        },
        {
          id: "rota-inicial",
          title: "Uma rota segura para começar",
          blocks: [
            {
              type: "list",
              items: [
                "Distribua pontos somente depois de entender o papel de cada atributo.",
                "Abra o inventário antes de entrar em combate e veja quais ações cada item permite.",
                "Consulte as missões disponíveis; quando uma for atribuída pela administração, acompanhe o objetivo ativo.",
                "Use a aba Árvores deste site para planejar técnicas antes de comprar nós.",
                "Crie um /boneco-treino e use /mapa para praticar posicionamento, alcance e técnicas.",
              ],
            },
            { type: "commands", groupIds: ["character", "village"] },
            {
              type: "callout",
              tone: "info",
              title: "O site lê a mesma ficha do bot",
              text: "Entre com a mesma conta do Discord usada no servidor. Se o site ainda não encontrar seu ninja, use /perfil ver no servidor e recarregue a página.",
            },
          ],
        },
      ],
      related: ["personagem-e-atributos", "arvores-e-jutsus", "indice-de-comandos"],
    },
    {
      slug: "personagem-e-atributos",
      title: "Personagem e atributos",
      description: "Entenda a ficha, distribua pontos e planeje os orçamentos das árvores.",
      category: "progressao",
      icon: "📊",
      order: 2,
      type: "guide",
      readingTime: 4,
      keywords: ["atributos", "pontos", "build", "perfil", "vida", "chakra", "energia"],
      sections: [
        {
          id: "lendo-a-ficha",
          title: "O que a ficha reúne",
          blocks: [
            {
              type: "paragraph",
              text: "O perfil concentra a progressão do ninja: nível e XP, vida, chakra, energia, atributos, elementos, clã, trait, Ryō e técnicas aprendidas. Use essa visão antes de decidir onde investir.",
            },
            { type: "commands", groupIds: ["character"] },
          ],
        },
        {
          id: "distribuindo-pontos",
          title: "Distribuindo pontos",
          blocks: [
            {
              type: "steps",
              items: [
                { title: "Abra /atributos", text: "O painel mostra os valores atuais e os pontos disponíveis." },
                { title: "Monte um rascunho", text: "Selecione um atributo e adicione pontos; nada é gravado enquanto você estiver apenas ajustando." },
                { title: "Revise os avisos", text: "O próprio painel sinaliza atributos que ainda não possuem efeito mecânico." },
                { title: "Confirme", text: "A confirmação grava o rascunho e pode liberar técnicas cujos requisitos foram alcançados." },
              ],
            },
            {
              type: "callout",
              tone: "warning",
              title: "Confirme com cuidado",
              text: "Limpar apaga apenas o rascunho. Depois de confirmar, uma redistribuição depende da ação de respec da administração.",
            },
            {
              type: "callout",
              tone: "info",
              title: "Kugutsu e Senjutsu ainda não alteram os cálculos",
              text: "Esses dois atributos podem aparecer na ficha e receber pontos, mas hoje não produzem efeito mecânico no combate ou nas árvores. O painel de atributos também sinaliza essa condição.",
            },
          ],
        },
        {
          id: "bolsas-das-arvores",
          title: "Atributo e orçamento de árvore",
          blocks: [
            {
              type: "paragraph",
              text: "Cada nó informa qual atributo o sustenta. O valor desse atributo também forma uma bolsa independente para comprar nós ligados a ele; comprar um nó não reduz o atributo da ficha, mas reduz o saldo disponível daquela bolsa. Nível, pré-requisitos e acessos de clã, elemento ou estilo ainda podem bloquear a compra.",
            },
            {
              type: "callout",
              tone: "tip",
              title: "Planeje pelo caminho completo",
              text: "Antes de investir, abra os nós seguintes e compare requisitos, custo e ramo. Um nó barato pode ser pré-requisito de uma especialização longa.",
            },
          ],
        },
      ],
      related: ["primeiros-passos", "arvores-e-jutsus", "faq"],
    },
    {
      slug: "arvores-e-jutsus",
      title: "Árvores e jutsus",
      description: "Leia os nós, reconheça bloqueios e transforme sua progressão em técnicas de combate.",
      category: "progressao",
      icon: "🌳",
      order: 3,
      type: "guide",
      readingTime: 5,
      keywords: ["árvore", "jutsu", "nó", "técnica", "passiva", "elemento", "clã", "kekkei genkai"],
      sections: [
        {
          id: "tipos-de-arvore",
          title: "O que você encontra aqui",
          blocks: [
            {
              type: "list",
              items: [
                "Fundamentos reúne a base de Ninjutsu e os desbloqueios de natureza de chakra.",
                "Árvores elementais organizam técnicas e passivas de cada natureza disponível ao personagem.",
                "Há árvores próprias para áreas como Taijutsu, Bukijutsu, Genjutsu, Iryō Ninjutsu e Fūinjutsu.",
                "Clãs, estilos de luta e Kekkei Genkai aparecem quando as condições correspondentes existem na ficha.",
              ],
            },
            {
              type: "callout",
              tone: "info",
              title: "Consulta não é desbloqueio",
              text: "Ver todas as árvores permite estudar caminhos ainda fechados. Isso não concede elemento, clã, estilo ou permissão para comprar seus nós.",
            },
            {
              type: "callout",
              tone: "info",
              title: "Dois clãs ainda não têm árvore",
              text: "Kazekage e Shirogane existem no cadastro atual de clãs, mas ainda não possuem uma árvore própria neste site.",
            },
          ],
        },
        {
          id: "como-ler-um-no",
          title: "Como ler e comprar um nó",
          blocks: [
            {
              type: "steps",
              items: [
                { title: "Escolha uma árvore", text: "Use a faixa inferior e observe se ela pertence à sua ficha ou está apenas em modo de consulta." },
                { title: "Abra o nó", text: "O painel detalha descrição, efeitos, tipo de ação, alcance, recurso, custo e requisitos." },
                { title: "Leia o estado", text: "Nós dominados, compráveis e bloqueados recebem estados diferentes; um bloqueado informa o primeiro requisito ausente." },
                { title: "Confirme a compra", text: "O servidor revalida saldo e requisitos e, quando o nó concede uma técnica, ela passa a integrar seu arsenal." },
              ],
            },
          ],
        },
        {
          id: "usando-jutsus",
          title: "Do nó ao combate",
          blocks: [
            {
              type: "paragraph",
              text: "As categorias funcionais são /jutsu ninjutsu, /jutsu taijutsu, /jutsu kenjutsu, /jutsu bukijutsu, /jutsu iryo e /jutsu genjutsu. Escolha a categoria indicada pela técnica, procure a habilidade no autocomplete e informe um alvo ou uma célula quando ela exigir. Técnicas de clã também aparecem na categoria mecânica mostrada pelo nó; ativações oculares próprias são feitas pelos subcomandos correspondentes de /combate.",
            },
            {
              type: "callout",
              tone: "warning",
              title: "Não use /jutsu cla",
              text: "Esse subcomando está registrado, mas nenhuma técnica atual usa a categoria CLA; por isso, ele não encontra habilidades. Use a categoria mecânica exibida no nó da técnica.",
            },
            { type: "commands", groupIds: ["combat"] },
          ],
        },
      ],
      related: ["personagem-e-atributos", "combate-tatico", "efeitos-de-combate"],
    },
    {
      slug: "combate-tatico",
      title: "Combate tático",
      description: "Domine o grid, a economia de ações, os recursos e as reações defensivas.",
      category: "combate",
      icon: "⚔️",
      order: 4,
      type: "guide",
      readingTime: 5,
      keywords: ["combate", "turno", "mapa", "mover", "ação", "reação", "chakra", "energia", "fugir"],
      sections: [
        {
          id: "fluxo-do-turno",
          title: "Fluxo do seu turno",
          blocks: [
            {
              type: "steps",
              items: [
                { title: "Leia o campo", text: "Confira o mapa, posições, terreno e quem está na vez." },
                { title: "Resolva o movimento", text: "Use os controles do painel ou /mover para avançar pelo grid e conclua o deslocamento quando estiver pronto." },
                { title: "Use suas ações", text: "Ataques, itens e técnicas ocupam o tipo de ação indicado em seus dados; o painel mostra o que ainda está disponível." },
                { title: "Encerre a vez", text: "Quando não quiser agir mais, use /combate fim-turno. Se todos os espaços de ação acabarem, o fluxo também pode avançar sozinho." },
              ],
            },
          ],
        },
        {
          id: "ataque-e-defesa",
          title: "Ataques e reações",
          blocks: [
            {
              type: "paragraph",
              text: "Você pode atacar com a arma equipada quando ela possui um ataque básico, arremessar uma arma compatível, usar ferramentas ou executar um jutsu aprendido. Quando um golpe permite defesa, o alvo recebe opções como Esquiva, Bloqueio, Aparo ou uma técnica de reação que possua. Efeitos de controle podem limitar essas respostas.",
            },
            {
              type: "callout",
              tone: "tip",
              title: "Posição decide opções",
              text: "Confira alcance e formato da técnica antes de gastar uma ação. Alvos, linhas, cones e áreas dependem das células ocupadas no momento do uso.",
            },
          ],
        },
        {
          id: "recursos-e-saida",
          title: "Recursos e saída do combate",
          blocks: [
            {
              type: "paragraph",
              text: "Técnicas consomem chakra ou energia conforme sua ficha. Por padrão, esses recursos não se recuperam automaticamente a cada turno: as técnicas básicas universais de recuperação ajudam a reorganizar o ritmo, enquanto algumas técnicas e passivas específicas também podem restaurá-los. Fugir é uma ação e pode ser dificultado por inimigos próximos ou impedido por efeitos.",
            },
            { type: "commands", groupIds: ["combat"] },
          ],
        },
      ],
      related: ["arvores-e-jutsus", "itens-e-equipamentos", "efeitos-de-combate"],
    },
    {
      slug: "itens-e-equipamentos",
      title: "Itens e equipamentos",
      description: "Organize a mochila e saiba quando equipar, usar, arremessar, dar ou largar um item.",
      category: "combate",
      icon: "🎒",
      order: 5,
      type: "guide",
      readingTime: 4,
      keywords: ["item", "inventário", "arma", "equipar", "arremessar", "ferramenta", "consumível"],
      sections: [
        {
          id: "mochila-e-categorias",
          title: "Sua mochila",
          blocks: [
            {
              type: "paragraph",
              text: "O inventário mostra somente o que seu personagem carrega, separado por categoria, junto das quantidades, ações disponíveis, arma equipada, Ryō e saciedade. Materiais e alimentos continuam na mochila, mas não são equipamentos de combate.",
            },
            {
              type: "list",
              items: [
                "Equipar prepara uma arma sem consumir a unidade; quando ela possui ataque básico, esse ataque passa a ser usado no corpo a corpo.",
                "Arremessar usa uma arma própria para lançamento e consome uma unidade depois que a ação é validada.",
                "Usar ativa ferramentas ninja, habilidades de item ou consumíveis compatíveis.",
                "Dar transfere itens a outro jogador; largar deixa itens na sua célula durante um combate.",
              ],
            },
            {
              type: "callout",
              tone: "info",
              title: "Nem toda arma equipada ataca",
              text: "A Katana pode ser equipada e desequipada, mas ainda não possui ataque básico. Consulte a habilidade exibida em cada item antes de planejar sua ação.",
            },
          ],
        },
        {
          id: "catalogo-de-equipamentos",
          title: "Catálogo vivo de equipamentos",
          blocks: [
            {
              type: "paragraph",
              text: "Os cartões abaixo vêm do catálogo do jogo. Eles acompanham automaticamente as armas, ferramentas, consumíveis, ações e habilidades atualmente disponíveis.",
            },
            { type: "equipment", mode: "items" },
          ],
        },
        {
          id: "comandos-de-item",
          title: "Comandos de item",
          blocks: [
            { type: "commands", groupIds: ["equipment"] },
            {
              type: "callout",
              tone: "warning",
              title: "Consumo só depois da validação",
              text: "O bot verifica inventário, alvo, distância, turno e ação antes de concluir o uso. Leia a resposta do comando para saber se a unidade foi realmente consumida.",
            },
          ],
        },
      ],
      related: ["combate-tatico", "efeitos-de-combate", "economia-coleta-e-craft"],
    },
    {
      slug: "efeitos-de-combate",
      title: "Efeitos de combate",
      description: "Consulte controles, danos contínuos, defesas, marcadores e efeitos especiais.",
      category: "combate",
      icon: "✨",
      order: 6,
      type: "reference",
      readingTime: 4,
      keywords: ["efeito", "status", "controle", "barreira", "dano contínuo", "marcador", "debuff", "buff"],
      sections: [
        {
          id: "como-interpretar",
          title: "Como interpretar um efeito",
          blocks: [
            {
              type: "paragraph",
              text: "Efeitos alteram o estado do participante além do dano ou da cura imediata. A técnica informa chance, duração e aplicação; o glossário explica o que o estado faz enquanto estiver ativo.",
            },
            {
              type: "list",
              items: [
                "Danos contínuos são resolvidos pelo motor no momento indicado pelo efeito.",
                "Controles podem retirar movimento, ação, fuga, arma ou acesso a categorias de técnica.",
                "Apoios protegem ou fortalecem, enquanto marcadores preparam interações com outras técnicas.",
                "Alguns efeitos de clã e Kekkei Genkai acumulam estados e possuem um desfecho próprio.",
              ],
            },
          ],
        },
        {
          id: "glossario",
          title: "Glossário atualizado",
          blocks: [
            {
              type: "callout",
              tone: "info",
              title: "Valores sempre atuais",
              text: "Este glossário é montado com as regras de balanceamento do servidor, evitando que números antigos permaneçam na documentação.",
            },
            { type: "equipment", mode: "effects" },
          ],
        },
      ],
      related: ["combate-tatico", "itens-e-equipamentos", "arvores-e-jutsus"],
    },
    {
      slug: "missoes-e-party",
      title: "Missões e party",
      description: "Encontre atividades, acompanhe objetivos, interaja com NPCs e forme um grupo.",
      category: "aventura",
      icon: "👥",
      order: 7,
      type: "guide",
      readingTime: 4,
      keywords: ["missão", "objetivo", "party", "grupo", "npc", "interagir", "cooperação"],
      sections: [
        {
          id: "acompanhando-missoes",
          title: "Acompanhando missões",
          blocks: [
            {
              type: "steps",
              items: [
                { title: "Veja o catálogo", text: "Use /missoes ativas para conhecer as atividades existentes e seus ranks. Essa lista é uma consulta, não aceita uma missão." },
                { title: "Receba a missão", text: "A administração atribui a atividade ao personagem; depois disso, ela aparece entre suas missões ativas." },
                { title: "Consulte o progresso", text: "Use /missoes minhas para ver as missões em andamento e o próximo objetivo ainda aberto." },
                { title: "Interaja no cenário", text: "Quando houver um NPC disponível, /interagir usa o autocomplete para mostrar com quem é possível falar." },
              ],
            },
            {
              type: "callout",
              tone: "tip",
              title: "Objetivos são progressivos",
              text: "A lista destaca objetivos concluídos e revela o próximo passo relevante. Leia também as mensagens e componentes próprios de cada missão.",
            },
          ],
        },
        {
          id: "formando-party",
          title: "Formando uma party",
          blocks: [
            {
              type: "paragraph",
              text: "Uma party liga jogadores para que apareçam juntos nos combates compatíveis. Qualquer membro pode convidar; quem convida sem ter party cria uma e se torna líder. O convite expira em 10 minutos, e a saída do líder dissolve o grupo. Ao iniciar um combate comum, os integrantes da party do autor entram automaticamente.",
            },
            { type: "commands", groupIds: ["missions"] },
            {
              type: "callout",
              tone: "info",
              title: "Suporte varia por missão",
              text: "Algumas atividades possuem fluxo próprio para grupos. Formar uma party não compartilha automaticamente todo objetivo ou recompensa; siga as regras mostradas pela missão.",
            },
          ],
        },
      ],
      related: ["primeiros-passos", "combate-tatico", "economia-coleta-e-craft"],
    },
    {
      slug: "economia-coleta-e-craft",
      title: "Economia, coleta e craft",
      description: "Reúna recursos, fabrique itens e use os mercados e painéis da sua vila.",
      category: "economia",
      icon: "🛠️",
      order: 8,
      type: "guide",
      readingTime: 5,
      keywords: ["economia", "ryo", "ryō", "coleta", "minerar", "caçar", "pescar", "craft", "loja", "vila", "saciedade"],
      sections: [
        {
          id: "ciclo-pessoal",
          title: "O ciclo de recursos",
          blocks: [
            {
              type: "steps",
              items: [
                { title: "Sincronize sua vila", text: "Se necessário, use /sincronizar-vila; a origem é o seu cargo no servidor, não uma escolha digitada." },
                { title: "Vá ao local correto", text: "As ações de exploração funcionam nos canais de RP compatíveis e a resposta indica locais possíveis quando você estiver no canal errado." },
                { title: "Colete", text: "Use /acao minerar, coletar, cacar, pescar ou coletar-agua conforme o recurso procurado. Cada tipo de ação tem 15 minutos de espera por personagem, independentemente dos outros tipos." },
                { title: "Confira a mochila", text: "Use /inventario para revisar materiais, alimentos, equipamentos, Ryō e saciedade." },
                { title: "Fabrique", text: "Use /craft listar para ver receitas pessoais e /craft criar para consumir materiais da mochila." },
              ],
            },
          ],
        },
        {
          id: "comida-e-comercio",
          title: "Comida, lojas e vila",
          blocks: [
            {
              type: "list",
              items: [
                "/comer aceita alimentos que você possui e recupera a saciedade até o limite do personagem.",
                "/loja abre o mercado somente no centro comercial da sua própria vila ou no Ichiraku dela, quando essa estrutura estiver disponível.",
                "/vila abre o painel de estoque, doação e recursos administrativos permitidos ao seu cargo.",
                "Receitas pessoais são imediatas; produtos avançados e comida preparada pertencem às estruturas da vila.",
              ],
            },
            {
              type: "callout",
              tone: "info",
              title: "Saciedade no estado atual",
              text: "A saciedade pode ser recuperada com comida, mas hoje não diminui e não aplica dano ou penalidade. Ela já está preparada para a evolução futura desse sistema.",
            },
            {
              type: "callout",
              tone: "warning",
              title: "Dívida bloqueia gastos",
              text: "Um saldo negativo de Ryō aparece como dívida. Enquanto ele não voltar a ser positivo, operações que exigem gasto ficam bloqueadas.",
            },
            {
              type: "callout",
              tone: "tip",
              title: "Leia o painel antes de confirmar",
              text: "Estoques, ofertas, permissões e custos são revalidados no servidor. Painéis antigos não garantem que uma operação ainda esteja disponível.",
            },
            { type: "commands", groupIds: ["economy", "village"] },
          ],
        },
        {
          id: "economia-coletiva",
          title: "Economia coletiva da vila",
          blocks: [
            {
              type: "paragraph",
              text: "O painel da vila reúne cofre, estoques, doações e recibos. Conforme o cargo e as permissões, ele também acompanha ordens de coleta, obras, setores, produção e manutenção; a liderança da vila administra as decisões reservadas ao Kage.",
            },
            {
              type: "callout",
              tone: "info",
              title: "Tributação semanal",
              text: "Personagens Genin ou superiores podem entrar na tributação semanal quando cumprem os critérios internos de atividade. O painel e os recibos mostram o resultado aplicável; o limiar exato de atividade não é publicado.",
            },
          ],
        },
      ],
      related: ["itens-e-equipamentos", "missoes-e-party", "indice-de-comandos"],
    },
    {
      slug: "indice-de-comandos",
      title: "Índice de comandos",
      description: "Uma referência compacta para personagem, combate, itens, missões e atividades do dia a dia.",
      category: "referencia",
      icon: "⌨️",
      order: 9,
      type: "reference",
      readingTime: 4,
      keywords: ["comando", "slash", "atalho", "perfil", "combate", "item", "missão", "discord"],
      sections: [
        {
          id: "comandos-principais",
          title: "Comandos principais",
          blocks: [
            {
              type: "paragraph",
              text: "Digite / no Discord e escolha o comando sugerido. Campos com autocomplete mostram apenas opções compatíveis sempre que possível; os cartões abaixo usam a referência enviada pelo próprio servidor.",
            },
            { type: "commands", all: true },
          ],
        },
        {
          id: "exploracao-e-economia",
          title: "Exploração e economia",
          blocks: [
            {
              type: "list",
              items: [
                "/acao minerar, /acao coletar, /acao cacar, /acao pescar e /acao coletar-agua funcionam nos canais de RP adequados.",
                "/craft listar e /craft criar: consultar e fabricar receitas pessoais.",
                "/comer: consumir um alimento da mochila e recuperar saciedade.",
                "/loja: acessar o mercado quando estiver em um local comercial válido.",
                "/vila: abrir o painel da vila; /sincronizar-vila atualiza a vila a partir do cargo do servidor.",
                "/invocacao: consultar suas invocações ativas.",
              ],
            },
          ],
        },
        {
          id: "boas-praticas",
          title: "Boas práticas",
          blocks: [
            {
              type: "callout",
              tone: "info",
              title: "A resposta do bot é autoritativa",
              text: "Autocompletar ajuda a preencher, mas não concede permissão. O bot sempre relê ficha, inventário, turno, posição e acesso antes de executar uma ação.",
            },
            {
              type: "paragraph",
              text: "Comandos de administração e de administração da vila são restritos por permissão e, por isso, não fazem parte do fluxo comum do jogador.",
            },
          ],
        },
      ],
      related: ["primeiros-passos", "combate-tatico", "faq"],
    },
    {
      slug: "faq",
      title: "Perguntas frequentes",
      description: "Respostas rápidas para bloqueios, recursos, árvores, inventário e acesso ao site.",
      category: "referencia",
      icon: "❓",
      order: 10,
      type: "reference",
      readingTime: 5,
      keywords: ["faq", "dúvida", "erro", "bloqueado", "recurso", "personagem", "party", "site"],
      sections: [
        {
          id: "duvidas-gerais",
          title: "Dúvidas gerais",
          blocks: [
            {
              type: "faq",
              items: [
                {
                  question: "Por que o site diz que não encontrou meu personagem?",
                  answer: "Use /perfil ver no mesmo servidor para criar ou carregar a ficha, entre no site com a mesma conta do Discord e recarregue a página.",
                },
                {
                  question: "Comprar um nó reduz o valor do meu atributo?",
                  answer: "Não. O atributo permanece na ficha, mas cada compra ocupa parte da bolsa ligada a ele. O site mostra total, gasto e saldo dessa bolsa.",
                },
                {
                  question: "Onde gasto pontos de maestria?",
                  answer: "Ainda não existe um fluxo público para gastar esses pontos. Eles podem aparecer nos dados do personagem, mas não devem ser tratados como uma progressão utilizável neste momento.",
                },
                {
                  question: "Por que um nó está bloqueado?",
                  answer: "Abra o nó para ver o primeiro requisito ausente. Pode faltar um nó anterior, nível, valor ou saldo do atributo, elemento, clã, estilo de luta ou outra condição específica.",
                },
                {
                  question: "Posso comprar uma técnica de uma árvore que estou apenas consultando?",
                  answer: "Não. Ver todas as árvores é um recurso de planejamento; o servidor continua exigindo os acessos reais da ficha.",
                },
                {
                  question: "Por que meu jutsu não aparece no autocomplete?",
                  answer: "Confira se a técnica foi realmente aprendida e escolha a categoria correta em /jutsu. Algumas técnicas também dependem de condições ativas ou de equipamento para serem usadas.",
                },
                {
                  question: "Chakra e energia voltam automaticamente durante a luta?",
                  answer: "Não a cada turno. O grupo de comandos de combate mostra as técnicas básicas usadas para recuperar cada recurso durante a luta.",
                },
                {
                  question: "Qual é a diferença entre Inventário e o catálogo deste site?",
                  answer: "O inventário mostra os itens que você possui agora. O catálogo explica os equipamentos disponíveis no jogo e suas ações, mesmo que ainda não estejam na sua mochila.",
                },
                {
                  question: "Entrar em uma party compartilha qualquer missão automaticamente?",
                  answer: "Não. A party coloca o grupo junto nos combates compatíveis, mas cada missão define como participantes, objetivos e recompensas são tratados.",
                },
              ],
            },
          ],
        },
        {
          id: "ainda-com-duvida",
          title: "Antes de pedir ajuda",
          blocks: [
            {
              type: "list",
              items: [
                "Leia a mensagem completa retornada pelo comando; ela costuma indicar requisito, local ou estado inválido.",
                "Atualize o perfil, o inventário ou a página antes de repetir uma ação feita em um painel antigo.",
                "Em combate, confira turno, movimento concluído, ação disponível, alcance e recurso.",
                "Em missões, consulte /missoes minhas e releia o próximo objetivo visível.",
              ],
            },
            { type: "commands", groupIds: ["character", "combat", "missions"] },
          ],
        },
      ],
      related: ["primeiros-passos", "indice-de-comandos", "arvores-e-jutsus"],
    },
  ];

  window.GUIDE_CATALOG = { categories, learningPath, guides };
})();
