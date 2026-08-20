# Etapa 05 — Lojas, atacado e interface Discord

Leia a seção 7 inteira e as regras de preço da seção 3 de `docs/economia-vilas.md`. As etapas 01–04 precisam estar concluídas. Esta etapa é só comércio e UI; não implementar evolução de vila.

## Objetivo

Implementar `/loja` nos centros comerciais, com estoque real, modais de quantidade e somente o Ichiraku como loja construível, sem creditar o cofre quando um jogador compra normalmente.

## Pré-requisito de arquitetura Discord

O roteador atual em `src/index.ts` aceita somente botões e modais, e despacha pelo primeiro trecho do `customId` para o nome do comando. Portanto:

- usar prefixo `loja:` — nunca `shop:` — em todos os componentes deste comando;
- adicionar `StringSelectMenuInteraction` ao tipo `Command` (`handleSelect`) e ao roteador global, pois a tela usa selects;
- não usar collectors longos por mensagem para esta economia. Usar handlers globais, sessão persistida de 15 minutos e revalidação no banco;
- todo modal/select/botão deve validar usuário dono da sessão, canal comercial ou canal ativo do Ichiraku, vila, loja ativa e permissão de Kage antes de movimentar valores.

## Entregas

- Configurar `/loja` nos cinco centros comerciais definidos na seção 7.1 do documento mestre. Se algum canal configurado for removido no Discord, responder de forma efêmera que o mercado daquela vila está indisponível, sem direcionar o jogador para outra vila.
- Criar Mercado Geral gratuito; no seed de cada vila, criar Empório, Marcenaria, Fundição Ninja e Oficina de Selos como `ACTIVE`, sem campo de nível e com estoque vazio. Criar somente Ichiraku como `LOCKED` e construível em 5 dias com custo definido no documento mestre. Como agora são seis opções, a escolha de loja usa `StringSelectMenu`.
- Mercado Geral não tem estoque infinito: às 00:05 `America/Sao_Paulo`, persistir quatro ofertas distintas por vila/dia, sorteadas sem repetição pelos pesos e itens da seção 7.2.1 do mestre. Cada oferta recebe `limitar(10, 60, teto(2 × ativos_14d))` unidades compartilhadas, congeladas na criação. Reusar a mesma oferta após reinício, mostrar `restante/inicial` e próximo reset, e nunca oferecer raros, processados, armas ou comida preparada. Seu preço é `shopBuyBase × 2,0`, depois imposto, portanto maior que o varejo municipal.
- A construção do Ichiraku usa `VillageConstruction` genérica com tipo `SHOP` e, nesta etapa, respeita capacidade global fixa de uma obra por vila. A etapa 06 adicionará o Centro da Vila e elevará essa capacidade para duas/três; não criar uma tabela paralela de construção de loja.
- Na conclusão do Ichiraku, criar o canal de texto exato `│・🍜〃﹕𝐈chiraku` na categoria da vila indicada em `ICHIRAKU_CATEGORY_BY_VILLAGE`, sincronizar permissões e persistir `discordChannelId`. Usar estado `AWAITING_CHANNEL` e rotina idempotente: nunca criar duplicado em reinício/erro, e só marcar `ACTIVE` após o canal existir. `/loja` nesse canal abre diretamente o Ichiraku, inclusive em Kumo/Iwa sem centro comercial geral configurado.
- Criar estoque por loja, capacidade, orçamento diário de compra de ingrediente e ledger específico.
- Implementar o varejo físico obrigatório da seção 7.3.1: Empório, Marcenaria, Fundição, Ichiraku e Oficina vendem seus respectivos produtos a jogadores quando o Kage os abastece. Não deixar Marcenaria/Empório como lojas que “só compram matéria-prima”. `Comprar` lista somente itens permitidos naquela loja e com estoque positivo; `Abastecer` aceita somente itens de receita ou varejo daquela loja.
- Criar embed efêmero de navegação de `/loja`, editando a mesma mensagem. Usar botões para até cinco lojas; usar select para catálogo de produto/ingrediente ou lista com mais de cinco opções.
- Vender ingrediente pessoal à loja paga o jogador segundo `shopBuyBase`, reduz o cofre e move o item para estoque da loja. Além do orçamento, cada balcão municipal recebe por dia uma seleção rotativa de matérias-primas e uma cota compartilhada por item, congeladas por vila/dia e escaladas pela população ativa; só os itens selecionados e com cota restante podem ser vendidos. Validar cota, cofre livre, orçamento diário, capacidade e inventário antes de confirmar.
- Compra comum do jogador remove Ryō do jogador e produto da loja, mas **não altera o cofre**. O acréscimo por taxa é apenas parte do preço/sumidouro.
- Ichiraku usa exclusivamente a receita canônica de Lámen. O custo exibido é calculado pelo catálogo, não escrito manualmente no embed.
- Implementar a produção municipal exclusiva: Fundição produz aço, pólvora e todos os equipamentos avançados; Ichiraku produz caldo, tempero e todas as comidas preparadas; Oficina de Selos produz tinta e Pergaminho. Somente Kage/staff, na administração de `/vila`, produz usando `VillageShopStock`. `/criar` pessoal e `/loja` de jogador comum nunca expõem essas receitas.
- Oficina de Selos produz e vende o item existente `pergaminho_arsenal` por 300 Ryō base, preservando `ryoValue: 300` e restauração do pergaminho gasto em 150 Ryō. Exigir 8 Papel, 2 Tintas de Selo, 1 Madeira Reforçada e 1 Erva Medicinal; a produção é limitada a 3 por vila por competência semanal, com contador persistido e reset no job de domingo 22:00.
- Criar `Contrato de Empreendedor NPC`: Kage vende lote completo da loja a comprador atacadista NPC; só essa venda comercial credita o cofre. Exemplo inicial: 10 Lámen → 420 Ryō, no máximo uma vez por dia.
- A administração da loja não cria novos comandos de Kage nem um botão escondido em `/loja`: ela é aberta pela aba `Comércio` do painel `/vila`, na mansão. Pode reutilizar o mesmo renderer do catálogo de `/loja`, mas com ações administrativas autorizadas.

## Regras técnicas

- Uma compra/venda deve atualizar personagem, estoque, cofre, orçamento e ledger em uma transação curta; nunca confiar em saldo exibido no embed.
- Para uma compra no Mercado Geral, atualizar atomicamente Ryō do jogador e quantidade restante de `GeneralMarketOffer`; para uma compra municipal, atualizar Ryō do jogador e `VillageShopStock`. Em ambos os casos, nunca há crédito ao cofre.
- Não duplicar Ryō: em contrato atacadista, creditar somente o valor do contrato uma vez. Em venda normal, crédito de cofre é zero.
- Modal aceita apenas inteiro positivo. Acima do máximo, mostrar confirmação do máximo em vez de ajustar silenciosamente.
- Custom ID não contém saldo, preço ou quantidade confiável; usar `loja:v1:acao:...:sessionId` e recarregar estado do banco.

## Testes de aceite

- Menu/select chega ao handler de `/loja`; botão com prefixo errado é ignorado e não movimenta saldo.
- Dois cliques para comprar o último item não vendem duas unidades.
- Dois cliques para construir Ichiraku iniciam somente uma obra e descontam recursos uma vez; a etapa 06 generaliza a mesma trava para setores e Centro.
- Conclusão do Ichiraku cria/reutiliza somente um canal `│・🍜〃﹕𝐈chiraku` na categoria correta, persiste o ID e só então ativa a loja; falha de permissão deixa `AWAITING_CHANNEL` sem cobrar de novo e pode ser retomada.
- Três Carnes vendidas ao Ichiraku com 5% pagam 8 Ryō cada somente se cofre/orçamento/espaço permitirem.
- Comprar um Lámen reduz estoque e Ryō do jogador, mas cofre não muda.
- Marcenaria com 500 Madeiras em estoque mostra Madeira em `Comprar`, aceita compra e reduz para 499; sem item vendável, o botão `Comprar` fica desativado e informa “sem estoque para venda”.
- Mercado Geral mostra exatamente quatro ofertas rotativas, não mostra `∞`, não vende item fora da seleção do dia e duas compras concorrentes nunca reduzem estoque abaixo de zero.
- Contrato de 10 Lámen só conclui com lote completo, entra 420 Ryō uma vez no cofre e não pode repetir antes do reset diário.
- Oficina sem Madeira Reforçada ou depois de produzir 3 Pergaminhos na competência não produz outro; após o reset semanal persistido, volta a permitir produção até o limite.
- Jogador comum não consegue acionar receita de produção municipal por botão/modal/custom ID forjado; Kage só produz na loja correspondente e a produção consome o estoque dela atomicamente.

## Não fazer agora

Não começar produção passiva, manutenção ou bônus de coleta. Não criar empreendedor jogador; nesta fase empreendedor é NPC atacadista para manter o escopo controlado.
