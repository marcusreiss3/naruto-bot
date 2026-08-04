# Patch notes — versão após a correção de abertura do site

Este documento registra apenas o trabalho realizado depois da correção que permitiu abrir o site. A própria correção de abertura não faz parte desta lista.

## Resumo

- Rebalanceamento de técnicas, árvores, custos, requisitos, dano e reações.
- Revisão ampla de descrições, regras e tooltips para deixar as habilidades mais claras.
- Expansão do inventário, equipamentos, ações básicas e Bukijutsu.
- Adição e reorganização de ícones, fundos e elementos visuais das árvores.
- Padronização do site, cache de assets, resolução das imagens e validação de carregamento.

## Balanceamento

- Requisitos exibidos passaram a refletir o custo obrigatório acumulado do caminho, evitando que a interface prometa acesso antes da hora.
- Genjutsu deixou de escalar com atributo acumulado; técnicas afetadas receberam compensações de dano quando necessário.
- Custos, níveis e requisitos foram revistos em árvores curtas ou muito antecipadas.
- Técnicas com controle em área passaram a pagar mais do que controles individuais.
- Técnicas de controle, imobilização e invasão mental receberam limites, testes, duração e condições de uso mais claros.
- A distribuição entre Inevitável, não esquivável e bloqueio/aparo foi ajustada para reduzir negação total de reação.
- Técnicas que ignoravam reações de forma excessiva foram reclassificadas para ignorar somente Bloqueio/Aparo quando apropriado.
- Uso único, invocação obrigatória, terreno, toggle, duração e custo de manutenção passaram a ser considerados no balanceamento.
- Árvores de clã com poucas habilidades foram ajustadas para entregar força mais cedo, mas com eficiência inicial proporcional ao investimento menor.
- Água recebeu ajustes de dano e de interação com Encharcado; Fogo teve regressões de progressão corrigidas.
- Kekkei Genkai teve o multiplicador universal final reduzido, preservando sua superioridade sem tornar técnicas iniciais fortes demais retroativamente.
- Lâmina de Chakra e Voo da Andorinha foram fortalecidos; o dano e o custo da lâmina agora crescem com os elementos conhecidos.
- Custos de técnicas de Bukijutsu foram separados entre Chakra e Energia conforme a natureza física ou técnica da ação.
- Barreiras adequadas passaram a usar reação; transformações com benefícios adicionais mantiveram sua ação original.

## Descrições, regras e tooltips

- A narrativa visual das técnicas foi separada de “Efeitos e regras”.
- Descrições deixaram de repetir custos, dano e regras já exibidos no bloco próprio.
- Chances, duração, acúmulos, limites, terreno, invocações, consumo e reações passaram a aparecer quando relevantes.
- Os nomes técnicos internos foram substituídos por termos compreensíveis aos jogadores.
- Tooltips passaram a explicar efeitos reconhecidos pelo glossário sem repetir o texto inteiro da habilidade.
- Valores de Dreno de Chakra, Acelerado, Sangramento, Sobrecarga, Encharcado, Fumaça, Barreira e efeitos semelhantes foram explicitados.
- Narrativas de técnicas médicas, elementais, de clã, doojutsu e genjutsu foram revisadas para manter o mesmo padrão de clareza.
- Requisitos de controle mental, resistência, iniciativa e prioridade passaram a ser descritos como regras jogáveis.

## Árvores e técnicas novas ou reorganizadas

- Árvore de Senju criada e balanceada, com ramificações de Água e Ninjutsu Médico.
- Ramificação de Água de Senju reorganizada visualmente em formato quadrado, sem sobreposição de nós.
- Árvore de Bukijutsu criada com ramificações de fios, arsenal selado e lâminas de chakra.
- Passivas de Bukijutsu passaram a explicar o que realmente aprimoram, incluindo armas, elementos e requisitos de equipamento.
- Progressão e conexões de Maestria de Arremesso, Esfera Explosiva, Meteoro Anexado e técnicas relacionadas foram corrigidas.
- Câmara de Tortura adicionada à linha de Manipulação de Fios.
- Yotsuki reorganizado para concentrar as técnicas de Raio em uma linha contínua, preservando Kenjutsu.
- Passivas de clãs com bônus genéricos foram aproximadas das técnicas que realmente aprimoram.

## Inventário e ações básicas

- Inventário separado por categorias, com quantidades e Ryo visíveis.
- Itens básicos, armas, consumíveis e equipamentos passaram a ter comandos e usos definidos.
- Equipar não consome o item; desequipar libera o espaço de equipamento.
- Apenas um equipamento pode ficar ativo por vez.
- Arremessar consome a unidade arremessada.
- Foram documentados e integrados comandos para equipar, desequipar, arremessar, usar, atacar, mover, fugir, encerrar turno, pegar arma, usar jutsu e administrar atributos.
- Criada a página “Equipamentos e Ações Básicas”.

## Ícones e fundos visuais

- Ícones de árvores, clãs, elementos, Kekkei Genkai, Genjutsu, Bukijutsu, Iryō Ninjutsu e Poeira foram adicionados, substituídos ou reorganizados.
- Pastas e nomes de assets foram alinhados com as árvores atuais, incluindo a separação visual de Gelo e Yuki.
- Fundos individuais foram adicionados para as árvores de clã e para as árvores gerais do site.
- A composição visual foi padronizada: personagem grande no lado direito, centro livre para os nós, paleta coerente com a árvore e ausência de texto ou interface na arte.
- Correções anatômicas, de orientação e de escala foram aplicadas quando uma imagem não seguia o modelo comum.
- Os fundos foram normalizados para 1672×941 em WebP.

## Site e validação

- Mapeamento de fundos e ícones atualizado no frontend.
- Versões de cache dos assets incrementadas após as substituições.
- Site reiniciado após os lotes de alterações visuais.
- Código frontend validado com `node --check`.
- Assets conferidos quanto à resolução e disponibilidade.
- Página principal e os novos arquivos testados via HTTP com respostas bem-sucedidas.

## Fora deste patch note

- A correção original que permitiu abrir o site.
- O histórico anterior de desenvolvimento já registrado no patch note geral.
