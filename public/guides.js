"use strict";

(function exposeGuideCatalog() {
  const categories = [
    { id: "inicio", title: "Começando", description: "Criação, Clãs, Traços, atributos e leitura da ficha.", icon: "cat-start", order: 1 },
    { id: "progressao", title: "Progressão", description: "Árvores, afinidades e jutsus.", icon: "cat-progress", order: 2 },
    { id: "combate", title: "Combate", description: "Turnos, posicionamento, reações e efeitos.", icon: "cat-combat", order: 3 },
    { id: "aventura", title: "Aventura", description: "Missões, grupos e personagens do mundo.", icon: "cat-adventure", order: 4 },
    { id: "mundo", title: "Mundo e sistemas", description: "Itens, recursos, viagem e economia.", icon: "cat-world", order: 5 },
    { id: "referencia", title: "Referência", description: "Comandos e respostas rápidas.", icon: "cat-reference", order: 6 },
  ];

  const learningPath = [
    "primeiros-passos",
    "clas-e-spins",
    "traits",
    "personagem-e-atributos",
    "arvores-e-jutsus",
    "itens-e-equipamentos",
    "mundo-e-viagem",
    "economia",
    "combate-tatico",
  ];

  const guides = [
    {
      slug: "primeiros-passos",
      title: "Criação e primeiros passos",
      description: "Crie sua ficha com /ficha, escolha sua origem e conclua os primeiros preparativos.",
      category: "inicio",
      icon: "guide-creation",
      order: 1,
      type: "guide",
      readingTime: 7,
      keywords: ["ficha", "criação", "personagem", "giros", "vila", "clã", "traço", "nome", "história", "aparência"],
      sections: [
        {
          id: "iniciar-ficha",
          title: "Como iniciar sua ficha",
          blocks: [
            { type: "paragraph", text: "Use `/ficha` no local indicado para criação de personagem. O bot abre um espaço privado só para você e conduz cada etapa com mensagens, botões e campos de texto." },
            {
              type: "callout",
              tone: "info",
              title: "Seu progresso fica salvo",
              text: "O espaço privado permanece aberto por até uma hora. Se ele expirar antes do fim, use `/ficha` novamente: um novo espaço será criado e o processo continuará exatamente da etapa salva.",
            },
            { type: "commands", groupIds: ["creation"] },
          ],
        },
        {
          id: "origem-e-spins",
          title: "Três Giros de origem",
          blocks: [
            { type: "paragraph", text: "Na primeira ficha, seus três Giros iniciais gratuitos geram três combinações válidas de **Vila + Clã**. Cada clã pertence a uma Vila específica, então combinações incompatíveis nunca entram no sorteio." },
            {
              type: "steps",
              items: [
                { title: "Veja as três origens", text: "O painel apresenta o símbolo, a Vila e a descrição de cada clã sorteado." },
                { title: "Escolha por botão", text: "Selecione uma das três opções." },
              ],
            },
            {
              type: "links",
              items: [
                { slug: "clas-e-spins", section: "clas-por-vila", title: "Ver todos os clãs por Vila", text: "Compare as origens que podem aparecer nos Giros." },
              ],
            },
          ],
        },
        {
          id: "dados-do-personagem",
          title: "Nome, Traço, idade e história",
          blocks: [
            {
              type: "steps",
              items: [
                { title: "Escreva o nome próprio", text: "Digite apenas o primeiro nome, com 2 a 24 caracteres. O sobrenome do clã é acrescentado automaticamente." },
                { title: "Receba seu Traço", text: "O bot sorteia a raridade e apresenta o efeito real. Resultados Míticos permitem escolher entre os três Traços Míticos." },
                { title: "Defina a idade", text: "A idade inicial vai de 11 a 13 anos. O Traço Prodígio Ninja também libera 9 e 10 anos." },
                { title: "Conte sua história", text: "Envie, em uma única mensagem, de 10 a 1.800 caracteres sobre origem, personalidade, objetivos e acontecimentos importantes." },
                { title: "Envie a aparência", text: "Anexe uma imagem ou cole um link direto PNG, JPEG, JPG, GIF ou WEBP." },
              ],
            },
            { type: "callout", tone: "info", title: "Como funciona o sorteio de Traço", text: "As chances são: Comum 47,5%, Rara 30%, Épica 15%, Lendária 7% e Mítica 0,5%. O Guia de Traços reúne todas as opções e seus efeitos." },
            { type: "links", items: [{ slug: "traits", section: "compendio", title: "Abrir o compêndio de Traços", text: "Consulte ícones, raridades e efeitos." }] },
          ],
        },
        {
          id: "giros-e-troca-de-cla",
          title: "Giros e troca de clã e traço",
          blocks: [
            { type: "paragraph", text: "Os três Giros gratuitos fazem parte da primeira ficha. Giros adicionais de Clã e de Traço permitem uma nova rolagem para ajustar sua origem ou sua build depois desse momento." },
            { type: "cards", items: [
              { title: "Ingots", text: "Giros adicionais usam Ingots. Use `/loja-premium` para comprar e usar Giros de Clã ou de Traço." },
              { title: "Boost do servidor", text: "O Boost do servidor também pode conceder Ingots para novos Giros." },
              { title: "Troca de Clã", text: "Antes de se tornar Genin, você pode trocar de Clã normalmente. Depois de alcançar Genin, é preciso resetar o personagem para escolher outro Clã." },
            ] },
            { type: "links", items: [
              { slug: "clas-e-spins", section: "spins", title: "Rever os Giros de Clã", text: "Compare as linhagens e suas Vilas de origem." },
              { slug: "traits", section: "como-obter", title: "Rever os Giros de Traço", text: "Entenda raridades e efeitos antes de rolar novamente." },
            ] },
          ],
        },
        {
          id: "concluir-e-jogar",
          title: "Revise e comece a jogar",
          blocks: [
            { type: "paragraph", text: "A última tela reúne aparência, Vila, clã, Traço, idade e história. Use **Concluir ficha** para confirmar ou **Trocar imagem** para corrigir a aparência antes de finalizar." },
            {
              type: "list",
              items: [
                "Abra `/perfil ver` para consultar sua ficha concluída, sua Vida e seus recursos.",
                "Use `/atributos` para planejar e confirmar sua primeira distribuição de pontos.",
                "Confira `/inventario` antes de entrar em combate.",
                "Estude suas árvores no site antes de comprar habilidades.",
              ],
            },
            { type: "commands", groupIds: ["character"] },
          ],
        },
      ],
      related: ["clas-e-spins", "traits", "personagem-e-atributos"],
    },
    {
      slug: "clas-e-spins",
      title: "Clãs, Vilas e Giros",
      description: "Entenda o sorteio inicial de origem e compare todos os Clãs de cada Vila.",
      category: "inicio",
      icon: "guide-clans",
      order: 2,
      type: "guide",
      readingTime: 7,
      keywords: ["clã", "Vila", "Giros", "origem", "Uchiha", "Hyuuga", "Konohagakure", "Sunagakure", "Kirigakure", "Kumogakure", "Iwagakure"],
      sections: [
        {
          id: "o-que-sao-clas",
          title: "Sua linhagem shinobi",
          blocks: [
            { type: "paragraph", text: "Clãs são famílias ou grupos que formam a base das Vilas ninja. A linhagem pode abrir Kekkei Genkai, Hiden, técnicas exclusivas e árvores próprias de progressão." },
            { type: "callout", tone: "info", title: "Vila e clã permanecem vinculados", text: "Cada clã possui uma Vila de origem. Os Giros sempre entregam pares válidos; por exemplo, um Uchiha não nasce em Sunagakure." },
          ],
        },
        {
          id: "spins",
          title: "Giros e escolha de origem",
          blocks: [
            {
              type: "flow",
              label: "Fluxo dos Giros iniciais",
              items: [
                { title: "Use /ficha", text: "Inicie a criação guiada" },
                { title: "Receba 3 opções", text: "Vila + Clã" },
                { title: "Compare", text: "Símbolo e descrição" },
                { title: "Escolha", text: "Confirme por botão" },
              ],
            },
            { type: "paragraph", text: "Os três Giros gratuitos são usados no início da primeira ficha. Você escolhe uma das três combinações exibidas; as outras duas não mudam a origem depois da confirmação." },
            { type: "callout", tone: "info", title: "Trocar sua linhagem", text: "Antes de se tornar Genin, você pode trocar de Clã normalmente. Depois de alcançar Genin, é preciso resetar o personagem para escolher outro Clã." },
            { type: "links", items: [{ slug: "primeiros-passos", section: "giros-e-troca-de-cla", title: "Giros, Ingots e troca de Clã", text: "Veja o fluxo completo para novos Giros." }] },
          ],
        },
        {
          id: "clas-por-vila",
          title: "Clãs por Vila",
          blocks: [
            { type: "paragraph", text: "Use os filtros para ver as linhagens de cada Vila. Os nomes, descrições e símbolos abaixo são os mesmos usados na criação da ficha." },
            { type: "clans" },
          ],
        },
      ],
      related: ["primeiros-passos", "arvores-e-jutsus", "traits"],
    },
    {
      slug: "personagem-e-atributos",
      title: "Personagem e atributos",
      description: "Entenda seus dez atributos e o crescimento de Vida.",
      category: "inicio",
      icon: "guide-attributes",
      order: 4,
      type: "guide",
      readingTime: 5,
      keywords: ["atributos", "Vida", "HP", "nível"],
      sections: [
        {
          id: "distribuir-atributos",
          title: "Como distribuir pontos",
          blocks: [
            { type: "paragraph", text: "Use `/atributos` para abrir o painel de distribuição. As alterações ficam em um rascunho: ajuste os valores, revise o resultado e confirme somente quando a distribuição combinar com sua build." },
            { type: "callout", tone: "info", title: "Atributo e saldo de árvore", text: "O valor de cada atributo também define quantos pontos você pode investir nas habilidades ligadas a ele. Comprar uma habilidade consome esse saldo de progressão, mas não reduz o atributo mostrado na ficha." },
            { type: "commands", groupIds: ["character"] },
          ],
        },
        {
          id: "dez-atributos",
          title: "Os dez atributos",
          blocks: [
            {
              type: "cards",
              items: [
                { title: "Ninjutsu", text: "Sustenta a progressão dos ninjutsus básicos, das afinidades elementais e dos jutsus de natureza de chakra." },
                { title: "Taijutsu", text: "Sustenta técnicas corporais, aumenta sua Vida máxima e define sua Iniciativa. É a base de estilos focados em combate físico." },
                { title: "Genjutsu", text: "Sustenta ilusões e técnicas de controle mental. Valores maiores também podem ampliar a duração dos Genjutsus." },
                { title: "Bukijutsu", text: "Sustenta técnicas com armas e ferramentas ninja, arremessos, fios, pergaminhos e Lâminas de Chakra." },
                { title: "Iryō Ninjutsu", text: "Sustenta técnicas médicas, cura, proteção e progressões de suporte ao grupo." },
                { title: "Fūinjutsu", text: "Sustenta selos, restrições e técnicas que alteram recursos ou limitam ações do alvo." },
                { title: "Kugutsu", text: "Sustenta o controle de marionetes, suas técnicas e as progressões voltadas ao combate com Kugutsu." },
                { title: "Senjutsu", text: "Sustenta habilidades ligadas à energia natural e progressões voltadas às técnicas de Senjutsu." },
                { title: "Dōjutsu", text: "Sustenta habilidades oculares e requisitos de progressões ligadas a linhagens com Dōjutsu." },
                { title: "Kenjutsu", text: "Sustenta técnicas de espada e estilos voltados ao combate com lâminas empunhadas." },
              ],
            },
          ],
        },
        {
          id: "vida-e-recursos",
          title: "Vida e Iniciativa",
          blocks: [
            { type: "paragraph", text: "Sua Vida máxima base cresce quando o personagem sobe de **nível** e quando você investe em **Taijutsu**. O mesmo atributo define sua Iniciativa: quem tiver o maior valor começa o combate; em empate, a ordem de entrada na sessão é mantida." },
            { type: "list", items: ["Consulte a Vida base atual e máxima em `/perfil ver`.", "Ao entrar em combate, Traços e habilidades passivas podem modificar a Vida máxima e a Iniciativa aplicadas ao participante.", "Durante a luta, a interface de combate mostra a Vida já usada naquele confronto.", "Leia Traços e passivas antes de comparar duas builds: alguns alteram a Vida somente no contexto de combate."] },
            { type: "callout", tone: "info", title: "Perfil e combate mostram etapas diferentes", text: "O perfil mostra a base calculada por nível e Taijutsu. Modificadores de Traço e passivas são aplicados ao montar o participante do combate." },
          ],
        },
      ],
      related: ["traits", "arvores-e-jutsus"],
    },
    {
      slug: "traits",
      title: "Compêndio de Traços",
      description: "Compare todos os Traços do jogo pelos ícones, raridades e efeitos aplicados à sua build.",
      category: "inicio",
      icon: "guide-traits",
      order: 3,
      type: "reference",
      readingTime: 8,
      keywords: ["Traço", "raridade", "Comum", "Rara", "Épica", "Lendária", "Mítica", "build"],
      sections: [
        {
          id: "como-obter",
          title: "Como o Traço é obtido",
          blocks: [
            { type: "paragraph", text: "Cada personagem recebe um Traço permanente durante a criação com `/ficha`. Primeiro é sorteada a raridade; nas faixas Comum, Rara, Épica e Lendária, o resultado é definido automaticamente. Ao alcançar a faixa Mítica, você escolhe um entre os três Traços Míticos." },
            { type: "links", items: [{ slug: "primeiros-passos", section: "giros-e-troca-de-cla", title: "Giros adicionais de Traço", text: "Veja como Ingots e Boost do servidor liberam novas rolagens." }] },
            { type: "cards", items: [
              { title: "Comum", meta: "47,5%", text: "Especializações diretas e fáceis de encaixar em uma build." },
              { title: "Rara", meta: "30%", text: "Defesa, mobilidade, recursos, invocações ou economia." },
              { title: "Épica", meta: "15%", text: "Condições fortes de combate, vantagens situacionais e trocas de poder." },
              { title: "Lendária", meta: "7%", text: "Identidades de build marcantes, com bônus amplos e algumas penalidades." },
              { title: "Mítica", meta: "0,5%", text: "Efeitos únicos de grande impacto; você escolhe uma das três opções." },
            ] },
          ],
        },
        {
          id: "compendio",
          title: "Todos os Traços",
          blocks: [
            { type: "paragraph", text: "Filtre por raridade ou pesquise pelo nome. Cada card usa o mesmo ícone e a mesma descrição funcional apresentados na criação da ficha." },
            { type: "traits" },
          ],
        },
        {
          id: "montando-build",
          title: "Como comparar Traços",
          blocks: [
            { type: "list", items: ["Procure efeitos que reforcem o atributo e as habilidades em que pretende investir.", "Observe bônus de Vida, Chakra e Energia antes de escolher uma rota muito ofensiva.", "Leia também as penalidades: alguns Traços trocam resistência ou um tipo de dano por outra vantagem.", "Efeitos de invocação, economia, alcance ou controle podem ser decisivos mesmo sem aumentar dano diretamente."] },
            { type: "links", items: [
              { slug: "personagem-e-atributos", section: "dez-atributos", title: "Comparar os dez atributos", text: "Entenda qual progressão cada atributo sustenta." },
              { slug: "arvores-e-jutsus", section: "afinidades-elementais", title: "Planejar árvores e afinidades", text: "Veja como a build vira habilidades e jutsus." },
              { slug: "itens-e-equipamentos", section: "armas-e-requisitos", title: "Consultar armas", text: "Combine Traços físicos com os equipamentos corretos." },
            ] },
          ],
        },
      ],
      related: ["personagem-e-atributos", "arvores-e-jutsus", "itens-e-equipamentos"],
    },
    {
      slug: "ranks-ninja",
      title: "Ranks Ninja",
      description: "Ranks representam experiência, responsabilidade, reconhecimento e autoridade dentro da Vila.",
      category: "progressao",
      icon: "guide-ranks",
      order: 5,
      type: "guide",
      readingTime: 4,
      keywords: ["rank", "Academia", "Genin", "Chunin", "Jonin", "ANBU", "Kage"],
      sections: [
        {
          id: "ranks-ninja",
          title: "Ranks Ninja",
          blocks: [
            { type: "paragraph", text: "Ranks representam experiência, responsabilidade, reconhecimento e autoridade dentro da Vila. A evolução acompanha a jornada narrativa do personagem e influencia o tipo de missão e responsabilidade que ele pode assumir." },
            { type: "flow", label: "Progressão principal de ranks", items: [
              { title: "Aluno da Academia", text: "Aprenda os fundamentos" },
              { title: "Genin", text: "Assuma as primeiras missões" },
              { title: "Chūnin", text: "Demonstre estratégia e liderança" },
              { title: "Jōnin", text: "Atue entre a elite da Vila" },
            ] },
            { type: "cards", items: [
              { title: "Aluno da Academia", text: "É o começo da jornada. O personagem aprende os fundamentos da vida shinobi antes de assumir missões oficiais normalmente." },
              { title: "Genin", text: "Ninja oficial preparado para missões de menor risco e atividades moderadas quando acompanhado." },
              { title: "Chūnin", text: "Shinobi reconhecido por maturidade, estratégia e liderança. A promoção passa pelo Exame Chūnin dentro do Roleplay." },
              { title: "Jōnin", text: "Parte da elite da Vila, com acesso a missões de alto nível e responsabilidades de liderança ou treinamento." },
              { title: "ANBU", text: "Caminho especial para operações confidenciais, espionagem, proteção e missões sigilosas. A entrada depende da confiança e escolha do Kage." },
              { title: "Kage", text: "Liderança máxima de uma Vila Oculta, responsável por sua administração, proteção e decisões políticas e militares." },
            ] },
            { type: "callout", tone: "info", title: "ANBU e Kage são caminhos especiais", text: "Essas posições dependem da história do personagem, da confiança da Vila e das decisões tomadas dentro do Roleplay." },
          ],
        },
      ],
      related: ["personagem-e-atributos", "arvores-e-jutsus", "combate-tatico"],
    },
    {
      slug: "arvores-e-jutsus",
      title: "Árvores, afinidades e jutsus",
      description: "Planeje habilidades, desperte elementos e transforme sua progressão em um arsenal de combate.",
      category: "progressao",
      icon: "guide-skills",
      order: 6,
      type: "guide",
      readingTime: 8,
      keywords: ["árvore", "jutsu", "habilidade", "afinidade", "elemento", "Kekkei Genkai", "Ninjutsu", "Fogo", "Água"],
      sections: [
        {
          id: "como-comprar",
          title: "Como ler e comprar habilidades",
          blocks: [
            { type: "paragraph", text: "Abra uma árvore e selecione uma habilidade para ver descrição, custo, requisito de nível, atributo relacionado, habilidades anteriores e, quando houver, dados de combate. O botão de compra só fica disponível quando todos os requisitos são atendidos." },
            { type: "steps", items: [
              { title: "Escolha uma árvore", text: "Use a barra inferior para alternar entre fundamentos, elementos, clã e especializações disponíveis." },
              { title: "Leia a sequência", text: "Linhas conectadas mostram quais habilidades precisam ser aprendidas primeiro." },
              { title: "Confira o saldo", text: "Cada árvore informa qual atributo paga suas compras e quanto continua livre." },
              { title: "Confirme", text: "O site revisa novamente custo e requisitos antes de adicionar a habilidade à sua ficha." },
            ] },
            { type: "callout", tone: "info", title: "Planejar não gasta pontos", text: "Use **Ver todas** para estudar outras árvores. A visualização não concede acesso nem compra habilidades." },
          ],
        },
        {
          id: "afinidades-elementais",
          title: "Afinidades Elementais",
          blocks: [
            { type: "paragraph", text: "As cinco afinidades básicas são **Água, Terra, Fogo, Vento e Raio**. Cada uma libera uma árvore independente, com jutsus, passivas, requisitos e progressões próprias." },
            { type: "flow", label: "Progressão elemental", items: [
              { title: "Clonagem", text: "Aprenda o fundamento inicial" },
              { title: "Substituição", text: "Abra o ramo de elementos" },
              { title: "Primeira afinidade", text: "Invista 2 pontos de Ninjutsu" },
              { title: "Árvore elemental", text: "Abra a natureza adquirida" },
              { title: "Novos jutsus", text: "Avance pela progressão" },
            ] },
            { type: "callout", tone: "info", title: "Custo das afinidades", text: "Depois de aprender Técnica de Clonagem e Técnica de Substituição, a primeira afinidade custa 2 pontos de Ninjutsu. Da segunda à quinta, cada afinidade custa 10 pontos." },
          ],
        },
        {
          id: "kekkei-genkai-elemental",
          title: "Kekkei Genkai Elemental",
          blocks: [
            { type: "paragraph", text: "Ao dominar as árvores básicas exigidas, certas combinações de natureza originam uma Kekkei Genkai Elemental. A fusão é concedida quando a progressão necessária é concluída." },
            { type: "cards", items: [
              { title: "Vapor", text: "Fogo + Água" },
              { title: "Calor", text: "Fogo + Vento" },
              { title: "Lava", text: "Fogo + Terra" },
              { title: "Explosão", text: "Terra + Raio" },
              { title: "Poeira", text: "Fogo + Terra + Vento" },
              { title: "Gelo", text: "Água + Vento" },
            ] },
            { type: "callout", tone: "info", title: "Heranças com avanço próprio", text: "Onoki para Poeira, Bakurei para Explosão e Yuki para Gelo precisam alcançar 25% de cada árvore envolvida em sua própria herança. Para as demais fusões, é necessário concluir as árvores básicas da combinação." },
            { type: "callout", tone: "warning", title: "Uma Kekkei Genkai por fusão", text: "Se o personagem já possui qualquer Kekkei Genkai, o sistema não concede outra por esse fluxo. Planeje qual combinação pretende concluir primeiro." },
          ],
        },
        {
          id: "usar-jutsus",
          title: "Da árvore ao combate",
          blocks: [
            { type: "paragraph", text: "Depois de aprender um jutsu, use a categoria indicada pela habilidade: `/jutsu ninjutsu`, `/jutsu taijutsu`, `/jutsu kenjutsu`, `/jutsu bukijutsu`, `/jutsu iryo` ou `/jutsu genjutsu`. O autocomplete mostra as técnicas disponíveis e a interface pede um alvo ou posição quando necessário." },
            { type: "callout", tone: "info", title: "Técnicas de clã seguem sua categoria", text: "Um jutsu exclusivo continua aparecendo na categoria mecânica exibida em sua habilidade. Ativações oculares e Portões Internos usam os controles correspondentes de `/combate`." },
            { type: "commands", groupIds: ["combat"] },
          ],
        },
      ],
      related: ["personagem-e-atributos", "clas-e-spins", "combate-tatico"],
    },
    {
      slug: "combate-tatico",
      title: "Combate tático",
      description: "Domine turnos, movimento pela interface, ações, terreno, alcance e reações.",
      category: "combate",
      icon: "guide-combat",
      order: 10,
      type: "guide",
      readingTime: 7,
      keywords: ["combate", "turno", "setas", "movimento", "mapa", "ação", "reação", "esquiva", "bloqueio", "aparo"],
      sections: [
        {
          id: "iniciativa",
          title: "Iniciativa e ordem de turno",
          blocks: [
            { type: "paragraph", text: "A ordem inicial do combate é definida pela **Iniciativa**. Seu valor de Taijutsu é a base dessa ordem: quem tiver o maior Taijutsu age primeiro. Bônus de passivas e Traços somam à Iniciativa antes da comparação." },
            { type: "callout", tone: "info", title: "Empates preservam a entrada", text: "Quando dois participantes terminam com a mesma Iniciativa, o combate mantém a ordem em que eles entraram na sessão." },
          ],
        },
        {
          id: "seu-turno",
          title: "Leia o campo antes de agir",
          blocks: [
            { type: "steps", items: [
              { title: "Abra o mapa", text: "Confira participantes, distância, terreno, altura, água, obstáculos e linha de visão." },
              { title: "Mova pelas setas", text: "Use os controles apresentados na própria interface de combate. As setas só permitem posições válidas dentro do seu alcance de movimento." },
              { title: "Escolha a ação", text: "Ataques, itens e jutsus ocupam a ação comum, bônus, movimento ou a combinação indicada na habilidade." },
              { title: "Finalize a vez", text: "Quando não quiser realizar mais ações, use `/combate fim-turno`." },
            ] },
            { type: "callout", tone: "info", title: "O painel é seu controle de movimento", text: "A experiência normal de deslocamento acontece pelas setas do combate. O campo atualiza as opções conforme terreno, alcance e posições ocupadas." },
          ],
        },
        {
          id: "acoes-e-recursos",
          title: "Ações, Chakra e Energia",
          blocks: [
            { type: "paragraph", text: "Cada técnica informa o recurso e o tipo de ação consumidos. Ninjutsus e técnicas de suporte costumam usar Chakra; técnicas físicas costumam usar Energia. Se precisar recuperar recursos, use **Concentrar Chakra** ou **Recuperar o Fôlego**, salvo quando uma habilidade ou Traço modificar essa recuperação." },
            { type: "commands", groupIds: ["combat"] },
          ],
        },
        {
          id: "reacoes",
          title: "Reações defensivas",
          blocks: [
            { type: "paragraph", text: "Quando um ataque permite reação, o painel apresenta as opções válidas. Você pode usar uma reação por rodada; escolha considerando o tipo do golpe, seu recurso e o equipamento disponível." },
            { type: "cards", items: [
              { title: "Esquiva", text: "Tenta evitar todo o golpe. A chance considera a situação do combate e possui limite próprio." },
              { title: "Jutsu de reação", text: "Usa uma técnica defensiva aprendida, como Substituição, quando seus requisitos forem atendidos." },
              { title: "Bloqueio", text: "Recebe o golpe com proteção e reduz parte do dano." },
              { title: "Aparo", text: "**Exige uma arma equipada** e reduz uma parcela maior do dano que o Bloqueio, podendo interagir com contra-ataques. Sem arma na mão — ou se você tiver sido desarmado — a opção não pode ser usada." },
            ] },
            { type: "callout", tone: "info", title: "Aparo pede arma na mão", text: "O Aparo é a única reação com exigência de equipamento: é preciso ter uma arma compatível equipada e não estar sob efeito de Desarme. Se você for desarmado no meio da luta, resta Esquiva, Bloqueio ou um Jutsu de reação até recuperar a arma." },
          ],
        },
        {
          id: "terreno-e-objetivos",
          title: "Terreno, objetos e saída",
          blocks: [
            { type: "list", items: ["Altura e obstáculos podem bloquear a linha de visão.", "Água altera deslocamento e pode aplicar Encharcado; a Caminhada Aquática muda essa interação.", "Armas e itens derrubados precisam estar na sua posição para serem recolhidos.", "Invocações ativas são administradas pelo painel de `/invocacao`.", "Use `/combate fugir` para tentar abandonar a luta; a proximidade de inimigos torna a fuga mais difícil."] },
          ],
        },
      ],
      related: ["arvores-e-jutsus", "efeitos-de-combate", "itens-e-equipamentos"],
    },
    {
      slug: "morte-permanente",
      title: "Morte permanente",
      description: "A morte permanente pode encerrar definitivamente a jornada de um personagem a partir do nível 10.",
      category: "combate",
      icon: "guide-death",
      order: 11,
      type: "guide",
      readingTime: 3,
      keywords: ["morte", "morte permanente", "execução", "velhice", "recomeço", "reset"],
      sections: [
        {
          id: "morte-permanente",
          title: "Morte permanente",
          blocks: [
            { type: "paragraph", text: "A morte permanente pode encerrar definitivamente a jornada de um personagem a partir do **nível 10**. Antes disso, ele ainda pode ser derrotado, ferido ou capturado, mas não é perdido por esse sistema." },
            { type: "cards", items: [
              { title: "Batalhas oficiais", text: "A morte pode ocorrer em combates que permitam execução dentro da narrativa e das regras da atividade." },
              { title: "Velhice", text: "A idade do personagem também pode encerrar sua jornada quando a história chegar a esse ponto." },
            ] },
            { type: "callout", tone: "warning", title: "O que é perdido", text: "Nível, atributos, habilidades, inventário, Ryō e progresso pessoal da ficha são removidos ao fim da jornada." },
            { type: "callout", tone: "info", title: "O que é mantido", text: "Clã, Traço e Ingots não são perdidos. Os Ingots ficam vinculados à conta do Discord e continuam disponíveis para a nova ficha do jogador." },
          ],
        },
        {
          id: "recomeco-apos-morte",
          title: "Recomeço após a morte",
          blocks: [
            { type: "paragraph", text: "Depois da morte permanente, você pode iniciar uma nova jornada. O recomeço devolve a escolha de uma nova origem e preserva o que faz parte da identidade permanente do jogador." },
            { type: "list", items: ["Clã e Traço permanecem disponíveis.", "A nova ficha começa sem os níveis, habilidades, itens e Ryō da anterior.", "Uma nova rolagem gratuita permite definir a próxima origem."] },
            { type: "links", items: [{ slug: "primeiros-passos", section: "giros-e-troca-de-cla", title: "Rever Giros e troca de Clã", text: "Entenda como escolher a origem da próxima ficha." }] },
          ],
        },
      ],
      related: ["personagem-e-atributos", "clas-e-spins", "combate-tatico"],
    },
    {
      slug: "itens-e-equipamentos",
      title: "Itens e equipamentos",
      description: "Consulte armas, ferramentas, comidas, materiais, coleta, receitas e formas reais de obtenção.",
      category: "mundo",
      icon: "guide-items",
      order: 7,
      type: "guide",
      readingTime: 9,
      keywords: ["inventário", "arma", "ferramenta ninja", "comida", "material", "recurso", "coleta", "craft", "receita", "loja", "equipar", "arremessar"],
      sections: [
        {
          id: "inventario",
          title: "Leia seu inventário",
          blocks: [
            { type: "paragraph", text: "Use `/inventario` para ver quantidades, categoria, ações permitidas e a arma equipada. Uma arma preparada continua no inventário e somente uma pode ficar equipada por vez." },
            { type: "commands", groupIds: ["equipment"] },
          ],
        },
        {
          id: "tipos-de-item",
          title: "Tipos de item existentes",
          blocks: [
            { type: "paragraph", text: "Os itens disponíveis estão organizados em quatro grupos: **Armas**, **Ferramentas Ninja**, **Comidas** e **Materiais**. O compêndio mostra somente tipos que possuem itens utilizáveis no jogo." },
            { type: "cards", items: [
              { title: "Armas", text: "Lâminas e projéteis usados em ataques, arremessos ou técnicas." },
              { title: "Ferramentas Ninja", text: "Bombas, fios, pergaminhos e munições especiais com usos próprios." },
              { title: "Comidas", text: "Alimentos crus, ingredientes e pratos que recuperam saciedade quando consumidos." },
              { title: "Materiais", text: "Recursos coletados, processados ou comprados para produção pessoal e da Vila." },
            ] },
          ],
        },
        {
          id: "armas-e-requisitos",
          title: "Armas e habilidades exigidas",
          blocks: [
            { type: "paragraph", text: "Algumas armas dependem de uma habilidade específica antes de poderem ser equipadas e usadas corretamente. O próprio item e a árvore relacionada indicam o requisito." },
            { type: "list", items: ["Use `/equipar item` para preparar uma arma permitida.", "Use `/atacar alvo` quando a arma equipada possuir um golpe compatível; sem arma, o comando usa Soco.", "Use `/desequipar` para guardar a arma sem consumi-la.", "Sempre confira a habilidade exigida antes de comprar ou planejar um equipamento especializado."] },
          ],
        },
        {
          id: "ferramentas-e-arremessos",
          title: "Ferramentas, uso e arremesso",
          blocks: [
            { type: "paragraph", text: "`/usar item` ativa ferramentas como bombas e fios; `/arremessar item alvo` lança armas compatíveis e consome uma unidade depois da validação. Fora do combate, Papel Bomba e Kunai podem ser preparados como Kunai Explosiva." },
            { type: "callout", tone: "info", title: "Pergaminhos de Arsenal", text: "Técnicas de Bukijutsu podem gastar Pergaminhos de Arsenal. Um pergaminho gasto pode ser restaurado com `/restaurar-pergaminho` por metade do seu valor em Ryō." },
          ],
        },
        {
          id: "coleta-e-producao",
          title: "Coleta, produção e alimentação",
          blocks: [
            { type: "paragraph", text: "As fontes de obtenção exibidas no compêndio vêm das áreas de coleta, receitas e lojas. Recursos naturais pertencem a **áreas**, não a Vilas específicas: o guia mostra Floresta, Rio, Montanha, Caverna, Campo Aberto ou Deserto somente quando essa relação existe." },
            { type: "list", items: ["Use `/acao` em uma área compatível para minerar, coletar, caçar, pescar ou obter água.", "Cada tipo de ação de coleta possui seu próprio intervalo de 15 minutos.", "O setor da sua Vila pode melhorar o rendimento da ação mesmo quando a coleta acontece em outra região.", "Setores também produzem determinados recursos no estoque central da Vila; essa produção coletiva aparece separada no card.", "Use `/craft listar` para ver receitas pessoais e `/craft criar` para produzir quando tiver os ingredientes.", "Use `/comer` para consumir uma comida do inventário."] },
            { type: "commands", groupIds: ["resources"] },
            { type: "links", items: [
              { slug: "mundo-e-viagem", section: "destinos", title: "Onde encontrar as áreas", text: "Veja os destinos e regiões abertas do sistema de viagem." },
              { slug: "economia", section: "lojas", title: "Como funcionam as lojas", text: "Entenda compra, venda, estoque e preços." },
            ] },
          ],
        },
        {
          id: "catalogo-de-itens",
          title: "Catálogo completo de itens",
          blocks: [
            { type: "paragraph", text: "Pesquise ou filtre todos os itens disponíveis. Abra um card para consultar descrição, ações, obtenção por área, produção, lojas e usos em receitas ou técnicas, quando esses vínculos existirem." },
            { type: "equipment", mode: "items" },
          ],
        },
      ],
      related: ["mundo-e-viagem", "economia", "combate-tatico"],
    },
    {
      slug: "efeitos-de-combate",
      title: "Efeitos de combate",
      description: "Consulte condições, controles, bônus e marcas que mudam o estado de uma luta.",
      category: "combate",
      icon: "guide-effects",
      order: 12,
      type: "reference",
      readingTime: 7,
      keywords: ["efeito", "Queimadura", "Veneno", "Sangramento", "controle", "Barreira", "Encharcado", "marca"],
      sections: [
        { id: "como-ler", title: "Como os efeitos funcionam", blocks: [
          { type: "paragraph", text: "Jutsus, armas, Traços e terreno podem aplicar condições temporárias. Leia duração, acúmulos e chance de aplicação na habilidade; o combate atualiza os estados após cada ação e rodada." },
          { type: "list", items: ["Dano contínuo pressiona a Vida ao longo das rodadas.", "Controles limitam movimento, ações, recursos ou fuga.", "Apoio e defesa fortalecem o usuário ou protegem contra dano.", "Marcadores preparam combinações para ataques seguintes.", "Efeitos de clã e Kekkei Genkai possuem interações próprias."] },
        ] },
        { id: "catalogo-de-efeitos", title: "Catálogo de efeitos", blocks: [
          { type: "paragraph", text: "Este catálogo vem das mesmas definições usadas pelo combate. Consulte pelo nome sempre que uma habilidade mencionar uma condição." },
          { type: "equipment", mode: "effects" },
        ] },
      ],
      related: ["combate-tatico", "traits", "itens-e-equipamentos"],
    },
    {
      slug: "missoes-e-party",
      title: "Missões, NPCs e party",
      description: "Encontre objetivos, interaja com o mundo e mantenha seu grupo organizado.",
      category: "aventura",
      icon: "guide-missions",
      order: 13,
      type: "guide",
      readingTime: 5,
      keywords: ["missão", "NPC", "party", "grupo", "objetivo", "diálogo", "puzzle", "investigação"],
      sections: [
        { id: "acompanhar-missoes", title: "Acompanhe sua missão", blocks: [
          { type: "steps", items: [
            { title: "Consulte o catálogo", text: "Use `/missoes ativas` para conhecer as missões existentes." },
            { title: "Veja sua jornada", text: "Use `/missoes minhas` para acompanhar missões em andamento e o próximo objetivo." },
            { title: "Leia o local", text: "Objetivos podem pedir movimento, diálogo, investigação, coleta, puzzle ou combate." },
            { title: "Interaja", text: "Use `/interagir npc` quando o objetivo indicar um personagem ou elemento do cenário." },
          ] },
          { type: "commands", groupIds: ["missions"] },
        ] },
        { id: "party", title: "Jogue em party", blocks: [
          { type: "paragraph", text: "Use `/party` para abrir o painel do grupo. Convites duram 10 minutos e são aceitos ou recusados pelos botões da própria mensagem; o grupo acompanha combates e missões compatíveis." },
          { type: "list", items: ["O líder e os sub-líderes podem convidar integrantes.", "O líder pode promover sub-líderes; líder e sub-líderes removem membros comuns.", "Use o botão **Sair da party** no painel para deixar o grupo. Se o líder sair, a party é desfeita.", "Cada missão define participantes, objetivos e recompensas; formar party não compartilha todo conteúdo automaticamente."] },
        ] },
      ],
      related: ["mundo-e-viagem", "combate-tatico", "economia"],
    },
    {
      slug: "mundo-e-viagem",
      title: "Mundo e viagem",
      description: "Entenda sua localização, os destinos, as rotas e a chegada entre Vilas e áreas abertas.",
      category: "mundo",
      icon: "guide-travel",
      order: 8,
      type: "guide",
      readingTime: 6,
      keywords: ["viajar", "viagem", "localização", "Vila", "portão", "mundo aberto", "destino", "rota", "chegada", "exploração"],
      sections: [
        {
          id: "viajar",
          title: "Como viajar",
          blocks: [
            { type: "paragraph", text: "Use `/viajar` no portão da Vila em que você está ou em uma área do mundo aberto. O painel confere sua localização atual e apresenta as cinco Vilas e as regiões abertas como destinos." },
            { type: "steps", items: [
              { title: "Vá ao ponto de partida", text: "Use o portão da sua Vila ou uma área aberta compatível, como floresta, montanhas, campo aberto ou deserto." },
              { title: "Abra /viajar", text: "Confira o local atual e a duração exibida em cada botão de destino." },
              { title: "Escolha o destino", text: "A seleção inicia a viagem, reserva o trajeto e libera o acesso ao caminho correspondente." },
              { title: "Aguarde a chegada", text: "O trajeto leva de 5 a 20 minutos e termina automaticamente." },
              { title: "Continue a jornada", text: "Na chegada, o destino é liberado e o bot envia uma mensagem privada com o local para prosseguir." },
            ] },
            { type: "callout", tone: "info", title: "Requisitos da rota", text: "A viagem não custa Ryō. Você precisa usar o comando em um ponto de partida reconhecido, possuir a localização correspondente e concluir o trajeto atual antes de iniciar outro." },
            { type: "commands", groupIds: ["world"] },
          ],
        },
        {
          id: "destinos",
          title: "Vilas e áreas abertas",
          blocks: [
            { type: "cards", items: [
              { title: "Vilas Ocultas", text: "Konohagakure, Sunagakure, Kirigakure, Kumogakure e Iwagakure." },
              { title: "Floresta e Rio", text: "Região aberta ligada ao Caminho da Floresta." },
              { title: "Montanhas e Caverna", text: "Região aberta ligada ao Caminho da Montanha." },
              { title: "Campo Aberto", text: "Área de passagem cuja rota depende da origem ou do destino." },
              { title: "Deserto", text: "Região aberta ligada ao Caminho do Deserto." },
            ] },
            { type: "callout", tone: "info", title: "Como saber onde você está", text: "Ao abrir `/viajar` em um ponto válido, o painel mostra **Local atual** e desativa o botão desse mesmo destino." },
          ],
        },
        {
          id: "duracao-e-chegada",
          title: "Duração, caminho e chegada",
          blocks: [
            { type: "paragraph", text: "Cada par de origem e destino possui uma duração entre 5 e 20 minutos. Durante o trajeto, o painel informa o caminho usado e a hora prevista de chegada." },
            { type: "list", items: ["Apenas uma viagem pode ficar ativa por jogador.", "A chegada é processada automaticamente.", "Ao concluir, o acesso ao destino é liberado e os cargos residuais de localização e caminho são removidos.", "O bot tenta enviar uma mensagem privada com o destino e o canal de chegada."] },
            { type: "links", items: [
              { slug: "itens-e-equipamentos", section: "coleta-e-producao", title: "Recursos das áreas abertas", text: "Veja quais itens podem ser coletados em cada região real." },
              { slug: "economia", title: "Entenda moedas e lojas", text: "Abra o guia separado de Economia." },
            ] },
          ],
        },
      ],
      related: ["itens-e-equipamentos", "economia", "missoes-e-party"],
    },
    {
      slug: "economia",
      title: "Economia",
      description: "Entenda Ryō, recompensas, compra, venda, estoques e a economia coletiva da Vila.",
      category: "mundo",
      icon: "guide-economy",
      order: 9,
      type: "guide",
      readingTime: 7,
      keywords: ["Ryō", "dinheiro", "economia", "loja", "comprar", "vender", "estoque", "imposto", "cofre", "Vila", "recompensa"],
      sections: [
        {
          id: "ryo-e-recompensas",
          title: "Ryō e movimentações",
          blocks: [
            { type: "paragraph", text: "**Ryō** é a moeda usada em compras e serviços. Missões podem conceder recompensas, lojas municipais compram determinados recursos, o Mercado Geral oferece recompra de emergência para itens elegíveis e ordens de coleta podem pagar pela entrega solicitada." },
            { type: "callout", tone: "warning", title: "Saldo em dívida", text: "Quando o saldo de Ryō está negativo, novos gastos ficam bloqueados até a dívida ser regularizada." },
          ],
        },
        {
          id: "lojas",
          title: "Compra, venda e lojas",
          blocks: [
            { type: "paragraph", text: "Use `/loja` no centro comercial ou no Ichiraku da sua própria Vila. A interface mostra as mercadorias disponíveis, o estoque real, ofertas finitas e os itens aceitos para venda." },
            { type: "list", items: ["O preço final de compra considera o preço base e a tributação vigente.", "A disponibilidade depende do estado e do estoque da loja.", "Nem todo item é vendido ou comprado por todas as lojas.", "O Mercado Geral recompra por 30% do valor de referência; recursos raros e itens sem valor elegível não entram.", "O compêndio de Itens identifica as lojas e formas de venda disponíveis."] },
            { type: "commands", groupIds: ["economy"] },
            { type: "links", items: [{ slug: "itens-e-equipamentos", section: "catalogo-de-itens", title: "Consultar itens e formas de obtenção", text: "Pesquise materiais, comidas, armas e ferramentas." }] },
          ],
        },
        {
          id: "economia-da-vila",
          title: "Economia coletiva da Vila",
          blocks: [
            { type: "paragraph", text: "O painel `/vila` reúne cofre, estoques, doações, recibos, ordens de coleta, obras, setores, produção e manutenção. Setores podem melhorar coletas pessoais e produzir itens diariamente no estoque central; as ações administrativas dependem da responsabilidade do personagem na Vila." },
            { type: "list", items: ["Doações transferem recursos para a estrutura coletiva.", "Recibos registram movimentações econômicas da Vila.", "Setores e obras participam da produção e de seus custos de manutenção.", "A tributação semanal segue as regras de elegibilidade do sistema."] },
            { type: "commands", groupIds: ["village"] },
            { type: "links", items: [{ slug: "mundo-e-viagem", title: "Como viajar entre locais", text: "Viagem e localização ficam em um guia próprio." }] },
          ],
        },
      ],
      related: ["itens-e-equipamentos", "mundo-e-viagem", "missoes-e-party"],
    },
    {
      slug: "indice-de-comandos",
      title: "Índice de comandos",
      description: "Encontre rapidamente os comandos públicos organizados pela atividade que você quer realizar.",
      category: "referencia",
      icon: "guide-commands",
      order: 14,
      type: "reference",
      readingTime: 5,
      keywords: ["comando", "slash", "ficha", "viajar", "perfil", "combate", "item", "missão", "Vila"],
      sections: [
        { id: "todos-os-comandos", title: "Comandos por atividade", blocks: [
          { type: "paragraph", text: "Comece digitando `/` e escolha o comando. O próprio formulário mostra subcomandos, campos obrigatórios e opções disponíveis." },
          { type: "commands", all: true },
        ] },
        { id: "paineis", title: "Comandos que abrem painéis", blocks: [
          { type: "list", items: ["`/ficha` conduz a criação em um espaço privado.", "`/atributos`, `/inventario`, `/loja`, `/vila`, `/invocacao` e `/viajar` abrem interfaces próprias.", "No combate, a movimentação normal é feita pelas setas do painel.", "Seletores e autocompletes evitam que você precise memorizar identificadores de habilidades, itens ou alvos."] },
        ] },
      ],
      related: ["primeiros-passos", "combate-tatico", "mundo-e-viagem"],
    },
    {
      slug: "faq",
      title: "Perguntas frequentes",
      description: "Respostas rápidas para dúvidas de criação, progressão, combate, viagem e inventário.",
      category: "referencia",
      icon: "guide-faq",
      order: 15,
      type: "reference",
      readingTime: 6,
      keywords: ["dúvida", "FAQ", "ficha", "Giros", "Vida", "elemento", "viagem", "party", "inventário"],
      sections: [
        { id: "criacao", title: "Criação e origem", blocks: [
          { type: "faq", items: [
            { question: "O que faço se o espaço da ficha expirar?", answer: "Use `/ficha` novamente no local de criação. O bot abre outro espaço privado e retoma a etapa salva." },
            { question: "Posso combinar qualquer clã com qualquer Vila?", answer: "Não. Cada clã pertence a uma Vila e os três Giros de origem entregam somente combinações válidas." },
            { question: "Posso escolher meu Traço?", answer: "Nas raridades Comum, Rara, Épica e Lendária, o resultado é automático. Se a raridade Mítica for sorteada, você escolhe um dos três Traços Míticos." },
            { question: "Como consigo novos Giros?", answer: "Giros de Clã e de Traço usam Ingots, obtidos na loja, em eventos, sorteios, códigos promocionais, passes ou pelo Boost do servidor." },
            { question: "Posso trocar de Clã depois de criar a ficha?", answer: "Antes de se tornar Genin, a troca é normal. Depois de alcançar Genin, é preciso resetar o personagem para escolher outro Clã." },
          ] },
        ] },
        { id: "progressao", title: "Progressão", blocks: [
          { type: "faq", items: [
            { question: "O que aumenta minha Vida máxima e minha Iniciativa?", answer: "Subir de nível e investir em Taijutsu aumentam a Vida base exibida em `/perfil ver`. Taijutsu também define a Iniciativa: o maior valor começa o combate, com bônus de passivas e Traços somados antes da ordem." },
            { question: "Comprar uma habilidade reduz meu atributo?", answer: "Não. A compra consome o saldo de progressão ligado ao atributo, mas o valor do atributo na ficha permanece igual." },
            { question: "Por que uma habilidade está bloqueada?", answer: "Abra seus detalhes e confira nível, saldo do atributo, habilidades anteriores, elemento, clã, estilo ou outro requisito indicado." },
            { question: "Quanto custa uma afinidade elemental?", answer: "Depois de aprender Técnica de Clonagem e Técnica de Substituição, a primeira afinidade custa 2 pontos de Ninjutsu. A segunda até a quinta custam 10 pontos cada." },
          ] },
        ] },
        { id: "combate-e-itens", title: "Combate e itens", blocks: [
          { type: "faq", items: [
            { question: "Como me movimento no combate?", answer: "Use as setas exibidas na própria interface. Elas mostram apenas as posições válidas dentro do alcance disponível." },
            { question: "O que acontece em um empate de Iniciativa?", answer: "O combate mantém a ordem em que os participantes entraram na sessão." },
            { question: "Por que não consigo equipar a Lâmina de Chakra?", answer: "Ela exige a habilidade Lâmina de Chakra na árvore de Bukijutsu. Aprenda essa habilidade antes de tentar equipar a arma." },
            { question: "Onde vejo o efeito de uma condição?", answer: "Abra o catálogo do Guia de Efeitos. Ele reúne dano contínuo, controles, bônus, marcas e efeitos de linhagem." },
          ] },
        ] },
        { id: "mundo-e-grupo", title: "Mundo e grupo", blocks: [
          { type: "faq", items: [
            { question: "De onde posso usar /viajar?", answer: "De um portão de Vila ou de uma área do mundo aberto reconhecida pelo painel." },
            { question: "A viagem custa Ryō?", answer: "Não. Escolha o destino no painel e aguarde de 5 a 20 minutos pela chegada automática." },
            { question: "Entrar em uma party compartilha toda missão?", answer: "Não. A party acompanha combates e missões compatíveis, mas cada missão define seus participantes, objetivos e recompensas." },
          ] },
        ] },
        { id: "encontrar-resposta", title: "Encontre a resposta certa", blocks: [
          { type: "list", items: ["Leia a mensagem completa do comando: ela costuma indicar local, requisito ou ação que falta.", "Atualize perfil, inventário ou página depois de uma mudança importante.", "Em combate, confira turno, ação disponível, recurso, alcance e linha de visão.", "Em missões, abra `/missoes minhas` e releia o próximo objetivo."] },
          { type: "links", items: [
            { slug: "indice-de-comandos", title: "Abrir o índice de comandos", text: "Encontre a ação certa por categoria." },
            { slug: "primeiros-passos", title: "Rever a criação", text: "Retome o fluxo completo de /ficha." },
          ] },
        ] },
      ],
      related: ["indice-de-comandos", "primeiros-passos", "mundo-e-viagem"],
    },
  ];

  window.GUIDE_CATALOG = { categories, learningPath, guides };
})();
