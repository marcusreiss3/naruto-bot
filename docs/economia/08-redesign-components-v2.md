# Etapa 08 — Redesign da economia com Discord Components V2

Leia este arquivo inteiro e as seções 4, 5, 7 e 8 de `docs/economia-vilas.md` antes de alterar código. Esta etapa é uma reconstrução visual dos painéis da economia já implementados. Preserve todas as regras, permissões, transações, `customId`, modais e serviços econômicos existentes; mude a apresentação e apenas o mínimo necessário do roteamento para Components V2.

## Objetivo visual

Substituir os embeds econômicos atualmente densos e desorganizados por painéis nativos, escaneáveis e consistentes. O resultado deve se parecer com uma interface de jogo dentro do Discord: cartões com cor, título claro, hierarquia de informação, divisores e ações próximas ao contexto.

Não tentar colocar botões em um `EmbedBuilder`: isso não existe. Usar **Components V2**, onde um `Container` é o cartão visual e um `Section` pode colocar um botão como acessório ao lado do texto. No cliente Discord, isso dá o aspecto de botão “dentro do card”, como nas interfaces modernas vistas em servidores grandes.

## Restrição essencial do Discord

Toda mensagem convertida deve usar `MessageFlags.IsComponentsV2` (`32768`). Em uma mensagem V2:

- não enviar `embeds` nem `content`;
- enviar todo texto por `TextDisplayBuilder`;
- não transformar a mesma mensagem de volta em embed depois: a flag não é removível;
- após `deferReply`, usar `editReply` para aplicar a flag V2 e a árvore inteira de componentes;
- manter mensagens efêmeras quando já eram privadas; anúncios públicos continuam públicos;
- modais continuam sendo modais normais. Components V2 é para mensagens, não motivo para reescrever formulários de quantidade.

O projeto instalado já usa `discord.js` **14.26.4** e expõe `ContainerBuilder`, `SectionBuilder`, `TextDisplayBuilder`, `SeparatorBuilder`, `MediaGalleryBuilder`, `ThumbnailBuilder` e `MessageFlags.IsComponentsV2`. Não adicionar biblioteca visual externa e não fazer downgrade.

## Escopo obrigatório

Converter todos os resultados e painéis da economia abaixo. Não tocar nos embeds de combate, missões ou comandos sem relação com economia nesta etapa.

| Fluxo | Arquivos de busca atuais | Público | Resultado esperado |
|---|---|---|---|
| `/loja` | `src/commands/loja.ts` | jogador, efêmero | menu de lojas, Mercado Geral, loja municipal, bloqueio do Ichiraku, confirmação/recibo |
| `/vila` | `src/commands/vila.ts` | jogador/Kage, efêmero | visão geral, estoque, doação, recibos, cofre, impostos, relatórios, ordens |
| Comércio do Kage | `src/commands/vila-comercio.ts` | Kage, efêmero | administração, abastecer, produzir, atacado, construção do Ichiraku |
| Obras do Kage | `src/commands/vila-obras.ts` | Kage, efêmero | Centro, vagas, setores, cronômetros e reformas |
| Exploração | `src/commands/acao.ts` | canal de RP | resultado narrativo da coleta |
| Criar, comida e inventário | `src/commands/criar.ts`, `src/commands/inventario.ts`, comando de comer | jogador | listas, resultado e estado do inventário/saciedade |
| Administração de vila | `src/commands/admin-vila.ts` | staff | recibos de ajuste curtos e auditáveis |

Se um arquivo auxiliar cria embed para um desses fluxos, converter também. Toda resposta simples de erro pode continuar texto efêmero curto; não transformar “saldo insuficiente” em uma tela grande.

## Arquitetura obrigatória

Criar um módulo reutilizável, por exemplo `src/ui/economy-components-v2.ts`, responsável por montar os blocos visuais. Handlers e serviços não devem repetir markdown, cores, separadores ou emojis.

O módulo deve expor helpers pequenos e previsíveis, por exemplo:

- `economyContainer(accentColor, children)`;
- `titleBlock(emoji, title, subtitle?)`;
- `metricGrid` ou `factsBlock` para dados curtos;
- `noticeBlock(tipo, texto)` para sucesso, aviso, erro e bloqueio;
- `divider()` com `SeparatorBuilder` visível e espaçamento apropriado;
- `primaryActionSection(texto, button)` para texto com botão acessório;
- `navigationRow` e `closeRow`;
- `itemLabel(itemId, quantity?)`, sempre com emoji e nome;
- `receiptBlock(recibo)`.

Não guardar regra de preço, saldo, autorização ou estoque nesses helpers: eles recebem dados já calculados pelos serviços. Não usar strings de item espalhadas por handlers.

## Sistema de emojis preparado para emojis customizados

Criar `src/ui/economy-emojis.ts` com chaves semânticas, não IDs de Discord espalhados. Enquanto a staff não fornecer emojis customizados, usar estes placeholders Unicode:

| Chave | Placeholder |
|---|---|
| Ryō / cofre | `💴` / `🏦` |
| Madeira / fibra / papel / lenha | `🪵` / `🧵` / `📄` / `🔥` |
| Pedra / minério / carvão / argila | `🪨` / `⛏️` / `⬛` / `🏺` |
| Água / carne / peixe / fruta / grão / couro / erva | `💧` / `🥩` / `🐟` / `🍎` / `🌾` / `🧤` / `🌿` |
| Lingote / aço / pólvora / tinta | `🔩` / `⚙️` / `💥` / `🖋️` |
| Minério Raro / Madeira Reforçada | `💎` / `🌳` |
| Kunai / shuriken / senbon / papel bomba | `🔪` / `✴️` / `📍` / `🧨` |
| Katana / Lâmina de Chakra / pergaminho | `🗡️` / `✨` / `📜` |
| Mercado / Empório / Marcenaria / Fundição / Ichiraku / Oficina | `🧺` / `🍎` / `🪵` / `🔥` / `🍜` / `📜` |
| Vila / Kage / estoque / obras / impostos / relatório | `🏯` / `👑` / `📦` / `🏗️` / `🧾` / `📊` |
| Produção / ordem de coleta / manutenção | `⚙️` / `📋` / `🛠️` |

Toda chave deve aceitar futuramente uma string customizada como `<:madeira:ID>` sem alterar renderizadores. Para emoji de botão, usar o formato aceito por `ButtonBuilder.setEmoji`; para texto, usar a mesma string. Não gravar IDs falsos, não usar emoji customizado inexistente e não bloquear a interface se um emoji ainda não estiver configurado.

## Linguagem visual

Usar uma paleta pequena e consistente:

| Contexto | Cor do Container |
|---|---:|
| Vila / informação | azul `#4F7FC9` |
| Cofre / Ryō / sucesso | verde `#2F9E62` |
| Mercado / comércio | dourado `#C9A227` |
| Estoque / recursos naturais | marrom `#8B5A2B` |
| Obras / manutenção | laranja `#D97706` |
| Aviso / bloqueio | cinza `#6B7280` |
| Erro / ação irreversível | vermelho `#C2413B` |

Regras de composição:

- Cada painel tem um container principal com título em `TextDisplay` (`# Emoji Título`) e uma linha de contexto menor logo abaixo.
- Separar blocos importantes com `SeparatorBuilder` visível; usar espaçamento maior somente entre seções, não entre cada linha.
- Dados curtos devem ficar em uma única linha ou bloco compacto, por exemplo `**Saldo:** 💴 240 Ryō • **Imposto:** 5%`.
- Não usar caixas excessivas, tabelas Markdown largas, 10 campos vazios ou texto em itálico como estrutura.
- Cada cartão pode ter no máximo uma ação principal em destaque. Ações secundárias ficam em `ActionRow` abaixo.
- Uma tela normalmente deve ter 1–3 containers e no máximo 40 componentes totais. Se ultrapassar, paginar ou usar select; não remover informação essencial silenciosamente.
- Recibos devem aparecer como faixa verde no topo na próxima renderização e desaparecer ao atualizar/trocar de tela; não acumular histórico inteiro no painel.
- Todo painel com modal deve dizer em uma frase clara o que o modal fará, e exibir máximo/impacto antes da confirmação.

## Wireframes obrigatórios

Os blocos abaixo são estrutura visual; adaptar dados reais, mas manter a hierarquia e as ações.

### `/loja` — início

```text
[Container dourado]
# 🧺 Mercado de Konoha
Centro Comercial • imposto atual: 5% • seu saldo: 💴 240 Ryō
────────────────────────
🏪 Estabelecimentos disponíveis
🧺 Mercado Geral — 4 ofertas de emergência hoje
🍎 Empório — aberto • 🪵 Marcenaria — aberto
🔥 Fundição — aberto • 🍜 Ichiraku — em obras
📜 Oficina de Selos — aberta
────────────────────────
[Select: Escolha uma loja]
[Atualizar] [Fechar]
```

Não exibir saldo do cofre ao jogador comum. Status bloqueado/em obras deve ser legível sem fazer o usuário abrir a loja, mas o select continua sendo a navegação principal.

### Mercado Geral

```text
[Container dourado]
# 🧺 Mercado Geral
Caravana externa • preços de emergência • próxima caravana: 00:05
────────────────────────
🪵 Madeira — 17 Ryō • 14/40 restantes
⛏️ Minério de Ferro — 26 Ryō • 25/40 restantes
💧 Água Limpa — 11 Ryō • esgotado
🌿 Erva Medicinal — 24 Ryō • 8/40 restantes
────────────────────────
Seleção diária limitada e compartilhada pela vila.
[Comprar] [Vender recursos] [Voltar]
```

Mostrar somente as quatro ofertas persistidas do dia. `Comprar` abre select apenas com oferta disponível; oferta esgotada continua visível, mas nunca selecionável.

### Loja municipal de jogador

```text
[Container marrom/dourado]
# 🪵 Marcenaria — Konoha
Estoque: 500/500 • seu saldo: 💴 240 Ryō
────────────────────────
À venda agora
🪵 Madeira — 9 Ryō • 500 unidades
📄 Papel — sem estoque
🔥 Lenha — sem estoque
────────────────────────
[Comprar] [Vender materiais] [Estoque] [Voltar]
```

Deixar claro que compra sai do estoque físico e que o cofre não recebe essa venda. Se nenhum produto vendável existir, substituir a lista por aviso cinza “Sem estoque para venda” e desabilitar apenas `Comprar`, nunca a loja toda.

### `/vila` — jogador comum

```text
[Container azul]
# 🏯 Konohagakure
Kage: [nome] • imposto de mercado: 5% • ninjas ativos: 12
────────────────────────
🏗️ Obras: 1/2 vagas ocupadas
🛠️ Reforma pendente: nenhuma
────────────────────────
[Visão geral] [Estoque] [Meus recibos]
[Doar recursos] [Fechar]
```

Na aba Estoque, mostrar recursos em grupos lógicos e no máximo os mais relevantes; botão/seleção de paginação para o restante. Doação abre fluxo com item, quantidade, prévia `inventário → vila` e confirmação.

### `/vila` — Kage: cofre e estoque

```text
[Container verde]
# 🏦 Cofre de Konoha
Disponível: 💴 8.420 Ryō • reservado: 1.000 Ryō
Limite de saque esta semana: 840/2.000 Ryō
────────────────────────
[Section] Deposite Ryō pessoal para financiar a vila.  [Depositar]
[Section] Saques exigem motivo e ficam públicos.         [Sacar]
────────────────────────
[Visão Geral] [Cofre] [Estoque] [Obras] [Comércio]
[Impostos] [Relatórios] [Fechar]
```

Na aba Estoque, a ação principal muda para `Criar ordem de coleta`; mostrar também estoque central, contribuições e ordens abertas. Nunca expor o cofre em aba de jogador comum.

### Obras e Centro da Vila

```text
[Container laranja]
# 🏗️ Obras de Konoha
Centro da Vila nível 2 • 2/2 vagas em uso • manutenção: -10% Ryō
────────────────────────
Em andamento
⛏️ Minas e Fundições → nível 3 • termina em 2d 04h
🍜 Ichiraku • termina em 4d 10h
────────────────────────
Disponíveis para melhorar
🌳 Silvicultura nível 1 → 2 • 2.100 Ryō • 1 dia
[Ver setores] [Evoluir Centro] [Pagar reformas] [Voltar]
```

Impedir ação visualmente quando não há vaga, mas o serviço deve continuar validando. A tela de confirmação mostra custo, fator congelado, materiais e vaga consumida.

### Administração de loja pelo Kage

```text
[Container dourado]
# ⚙️ Administração — Marcenaria
Estoque: 500/500 • orçamento de compra hoje: 150/150 Ryō
────────────────────────
🪵 Varejo: Madeira 500 • Papel 0 • Lenha 0
📦 Central disponível: Madeira 3.500 • Fibra 280
────────────────────────
[Abastecer] [Retirar produto] [Histórico] [Voltar]
```

Para Fundição, Ichiraku e Oficina, adicionar `Produzir` quando houver receita na estação; Marcenaria e Empório não mostram `Produzir`. `Contrato empreendedor` só aparece se a loja possui contrato possível. Não mostrar botão desabilitado sem explicar em texto o motivo.

### `/acao`, `/criar`, `/comer`, `/inventario` e admin

- `/acao`: cartão compacto público, com nome da ação, área, narrativa curta, loot usando `itemLabel`, e rodapé textual com a vila/personagem. Não revelar probabilidade rara, cooldown ou informação de outros jogadores.
- `/criar` e `/comer`: cartão compacto privado com ingredientes consumidos, item criado/consumido, saciedade antes/depois quando aplicável e recibo de sucesso.
- `/inventario`: container privado com saldo, saciedade e categorias dobráveis/paginadas; não gerar mural gigantesco de itens. Usar select de categoria se necessário.
- `/admin-vila`: cartão pequeno de staff, vermelho para ajuste negativo e verde para positivo, exibindo vila, ator, mudança antes/depois, motivo e ID/horário do lançamento.

## Interação e acessibilidade

- Preservar todos os `customId` e validações de sessão existentes sempre que possível. Se algum `customId` precisar mudar, atualizar roteador e testes de modo atômico; nunca colocar saldo, preço, permissão ou quantidade confiável nele.
- Botões devem começar com verbo: `Comprar`, `Abastecer`, `Confirmar`, `Cancelar`, `Doar`, `Voltar`, `Fechar`.
- Desabilitar somente a ação impossível e informar a razão no card. Exemplo: `Comprar` desativado porque não há estoque; não porque o jogador está sem saldo — nesse caso permitir escolher e mostrar o máximo/erro no fluxo atual.
- Usar `ButtonStyle.Success` para confirmar/aportar, `Danger` para cancelar obra/saque irreversível e `Secondary` para navegação. Apenas uma ação primária por grupo.
- Não depender só de cor: toda situação inclui texto (`aberto`, `esgotado`, `em obras`, `suspenso`).
- Não usar ping de usuário/cargo em painel efêmero. Anúncios públicos mantêm as menções já autorizadas pelas regras.

## Testes de aceite

- Nenhuma mensagem convertida envia `embeds` ou `content` junto com `IsComponentsV2`.
- Cada painel convertido usa a flag V2 na resposta inicial/edição e continua funcionando após atualizar, navegar, abrir modal e fechar.
- `/loja` mostra Mercado Geral limitado, Marcenaria com Madeira vendável quando abastecida e recibo de compra com estoque atualizado.
- Painel de Kage expõe ações somente a Kage autorizado na mansão; jogador comum continua sem cofre/saque/controle de obras.
- Todos os `customId` antigos relevantes continuam sendo tratados e não permitem movimentar valores forjando mensagem velha.
- Testar visualmente desktop e celular com mensagens curtas, estoque cheio, estoque vazio, oferta esgotada, Ichiraku bloqueado, obra em andamento e reforma pendente.
- Rodar `npm run typecheck` e os testes de economia existentes; criar testes unitários para os helpers que determinam emojis, estado desabilitado e árvores V2 mais críticas.

## Não fazer nesta etapa

- Não alterar preço, quantidade, chance, regra de coleta, imposto, receita, custo de construção ou permissão econômica.
- Não converter combate, missões ou painéis fora do escopo econômico.
- Não introduzir imagens geradas, web frontend, collectors longos ou estado novo fora das sessões já existentes.
- Não trocar mensagens públicas de auditoria por painéis efêmeros; apenas melhorar a apresentação delas quando estiverem no escopo.

## Entrega

Ao terminar, informar: arquivos alterados, quais fluxos foram convertidos, onde trocar emojis customizados futuramente, comportamento de `deferReply/editReply` com V2, typecheck/testes executados e capturas de tela de `/loja` e `/vila` em estado normal e vazio. Pare e espere validação.
