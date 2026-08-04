# Patch notes — 4 de agosto de 2026

## Resumo

- Uniformização dos requisitos exibidos, descrições, tooltips, efeitos, reações e custos das técnicas.
- Rebalanceamento de genjutsu, clãs curtos, água, bukijutsu, lâmina de chakra e algumas técnicas de controle.
- Criação do inventário, equipamentos, ações básicas e primeiros recursos de bukijutsu.
- Inclusão e padronização de ícones e fundos das árvores, com personagens enquadrados no modelo Uchiha.
- Correções de servidor/site, cache de assets, árvores, imagens e documentação visual.

## Completo

### Regras, descrições e interface

- `reqPool` passou a ser apresentado com base no custo obrigatório acumulado do caminho da árvore, eliminando requisitos menores do que o gasto real.
- Chances abaixo de 100%, durações relevantes, acúmulos, invocações, terreno, toggle, uso único e outras limitações passaram a aparecer em “Efeitos e regras”.
- A narrativa visual foi separada das regras mecânicas para evitar repetição.
- Efeitos passaram a usar os nomes reconhecidos pelo glossário e tooltips explicam o efeito sem duplicar todo o texto da técnica.
- Removidos da narrativa os valores técnicos de dano e multiplicadores acumulados.
- Descrições curtas de técnicas elementais e de clã foram ampliadas quando necessário.
- Efeitos de Encharcado, Sangramento, Sobrecarga, Dreno de Chakra, Acelerado, Fumaça e outros passaram a explicitar seus valores e duração quando aplicável.
- Byakugan, Ketsuryugan, Rede de Sombra, Clones de Transferência de Mente, controle mental e técnicas semelhantes receberam descrições mais claras.
- “Inevitável”, “Não pode ser esquivado” e “Ignora Bloqueio e Aparo” substituíram os nomes técnicos dos efeitos nas descrições para os jogadores.

### Genjutsu e controle

- `genjutsuScaling` foi uniformizado para zero.
- O dano base do Genjutsu Ketsuryugan foi compensado sem exibir dano na narrativa.
- Controle Yamanaka foi especificado como invasão mental com teste de Ninjutsu, resistência baseada na diferença entre os atributos, chance limitada entre 10% e 90% e bloqueio contra alvos 10 ou mais níveis acima.
- A iniciativa passou a admitir prioridade explícita no Véu da Mente.
- Ecos do Cativeiro foi limitado às imobilizações aplicadas pela árvore de Genjutsu.
- Genjutsu: Interrogatório passou a deixar pré-condições e dreno na seção de regras, com custo revisto para uma técnica de função predominantemente utilitária.
- Aprisionamento da Árvore Assassina e controles semelhantes foram revisados quanto a reação, duração e contra-jogo.

### Reações e balanceamento

- Clones de Transferência de Mente tornou-se inevitável e limitado a uma vez por combate.
- Técnicas selecionadas deixaram de ignorar esquiva e passaram a ignorar apenas Bloqueio/Aparo.
- O custo de controles em área foi aumentado em relação ao controle individual.
- Ajustes realizados em Kamaitachi, Punho Rochoso e Bomba do Tubarão Hoshigaki para respeitar o modelo de árvore curta, barata e antecipada.
- As quatro regressões de requisitos da árvore de Fogo foram corrigidas.
- Grande Onda Explosiva teve dano aumentado de 34 para 38.
- Maré Condutora passou a conceder +25% de dano com jutsus de Água; Fio d’Água concede +50% contra alvos Encharcados.
- O multiplicador universal final das Kekkei Genkai foi reduzido para 1,50x, sem exibir linguagem técnica de multiplicação nas árvores.
- Cadeia do Desastre Celestial passou a consumir Energia.
- Dragões Gêmeos Ascendentes, Esfera Explosiva e Meteoro Anexado foram ajustados para consumir Energia quando o esforço físico é o elemento dominante.
- Lâmina de Chakra recebeu progressão por elementos conhecidos: cada elemento aumenta dano e custo original em 10%; água também reduz o custo da lâmina em 15%.
- Voo da Andorinha e a Lâmina de Chakra foram fortalecidos sem transformar a arma em um ápice gratuito.
- Barreiras apropriadas passaram a usar reação; transformações com benefícios adicionais mantiveram sua ação original.

### Árvores e técnicas

- A árvore de Senju foi criada e balanceada, com ramificações de Água e Ninjutsu Médico, mantendo Água levemente acima em força.
- A ramificação de Água de Senju foi reorganizada em formato quadrado, sem sobreposição de nós.
- A árvore de Bukijutsu foi criada com ramificações de fios, arsenal selado e lâminas de chakra, incluindo passivas de afinidade elemental.
- Maestria de Arremesso foi conectada à Esfera Explosiva e a progressão de requisitos foi corrigida.
- Meteoro Anexado passou a exigir Energia.
- Câmara de Tortura foi adicionada à linha de fios.
- A ramificação de Manipulação de Fios foi mantida separada da ramificação de Arsenal Selado.
- Yotsuki foi reorganizado em uma única linha de técnicas de Raio, preservando a ramificação de Kenjutsu; requisitos de Prisão Amplificada e técnicas relacionadas foram corrigidos.
- Passivas de Yuki, Yotsuki e Bakurei foram revistas para não duplicar bônus genéricos e para ficar próximas do nível das técnicas que aprimoram.
- Yuki passou a reduzir em 8% o custo de Ninjutsu.
- Golem Defensor passou a exibir a vida da Barreira concedida.

### Inventário, equipamentos e ações

- Inventário separado por categorias, com Ryo e quantidade de cada item.
- Itens cadastrados: Kunai, Shuriken, Fūma Shuriken, Senbon, Kunai Explosiva, Papel Bomba, Bomba de Fumaça, Fios de Aço Ninja e Katana.
- Equipar não consome o item; desequipar libera o espaço de equipamento.
- Apenas um item pode ficar equipado por vez.
- Armas arremessáveis podem ser arremessadas sem equipar e são consumidas ao arremessar.
- Foram adicionados comandos e documentação para `/equipar`, `/desequipar`, `/arremessar`, `/usar`, `/atacar`, `/mover`, `/combate fugir`, `/combate fim-turno`, `/combate pegar-arma`, uso de jutsus, atributos e ações básicas.
- Criada a página “Equipamentos e Ações Básicas”.

### Assets, fundos e site

- Ícones de clãs, elementos, Kekkei Genkai, Genjutsu, Bukijutsu, Poeira e Senju foram adicionados ou substituídos.
- Fundos de árvores foram padronizados em 1672×941, com centro livre para os nós.
- Nara teve o dedo corrigido e o símbolo das costas removido.
- Foram criados fundos para Sarutobi, Hatake, Yamanaka, Kamaitachi, Hoshigaki, Hozuki, Kaguya, Yuki, Chinoike, Raikage, Yotsuki, Kamizuru, Onoki e Bakurei.
- O Hozuki foi corrigido para ter exatamente dois braços.
- Yuki foi virado para olhar para a esquerda.
- Chinoike foi reduzida e teve o braço ambíguo removido.
- Iryo Ninjutsu, Bukijutsu e Genjutsu foram reenquadrados para se aproximar do modelo Uchiha.
- Cache de `app.js` e versão dos assets foram atualizados para garantir a entrega das imagens novas.
- O site local foi reiniciado e os assets novos foram validados com respostas HTTP 200.

### Verificação

- `public/app.js` passou em `node --check`.
- Todos os fundos novos foram validados em 1672×941 no formato WebP.
- `git diff --check` foi executado antes do commit.
