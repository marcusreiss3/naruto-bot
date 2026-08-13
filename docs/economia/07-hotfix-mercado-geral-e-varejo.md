# Hotfix — Mercado Geral e varejo das lojas municipais

Leia integralmente as seções 7.2.1, 7.3.1 e 7.4 de `docs/economia-vilas.md` antes de alterar código. Este hotfix corrige a implementação já existente da etapa 05. Não alterar imposto, coleta, crafts, construções, combate ou regras de cofre fora do que é indispensável para esta correção.

## Problema a corrigir

O `Mercado Geral` foi implementado como NPC de estoque infinito e as lojas como Marcenaria/Empório recebem estoque físico, mas não o vendem. Isso torna o Mercado Geral a fonte normal de materiais e deixa madeira colocada na Marcenaria sem utilidade para o jogador. Ambos os comportamentos estão proibidos pela regra atualizada do documento mestre.

## Entregas obrigatórias

### 1. Mercado Geral rotativo e limitado

- Substituir `GENERAL_MARKET_MATERIALS.map(...)` com `Number.POSITIVE_INFINITY` por ofertas persistidas, por vila e dia.
- Criar migration Prisma e modelo equivalente a `GeneralMarketOffer` com: vila, `dayKey`, `itemId`, quantidade inicial, quantidade restante e timestamps. Exigir unicidade de `villageId + dayKey + itemId`.
- Às 00:05 em `America/Sao_Paulo`, criar para cada vila quatro ofertas diferentes. Se o bot reiniciar ou o job repetir, reutilizar as mesmas ofertas do `dayKey`; jamais rerrolar ou duplicar.
- Usar seleção ponderada sem repetição:
  - peso 100: `madeira`, `pedra`, `fibra_vegetal`, `agua_limpa`;
  - peso 55: `minerio_ferro`, `carvao`, `argila`, `grao`, `couro`;
  - peso 20: `erva_medicinal`.
- Cada oferta tem quantidade **compartilhada na vila**, congelada ao ser criada: `limitar(10, 60, teto(2 × ativos_14d))`. Exemplos: 6 ativos = 12, 20 ativos = 40, 30+ ativos = 60. Usar a mesma função de população ativa de 14 dias do documento mestre; não usar total de membros/cargos Discord. Não implementar estoque ilimitado, limite pessoal separado ou catálogo com todos os materiais.
- Nunca ofertar `minerio_raro`, `madeira_reforcada`, qualquer arma, alimento preparado, pergaminho ou material processado.
- Reutilizar o scheduler persistente já existente. Além do job, `ensureGeneralMarketOffers(villageId, now)` deve poder ser chamado na abertura/compra para recuperar uma virada ocorrida enquanto o bot estava desligado.
- A compra deve, em uma transação curta, revalidar oferta do dia, quantidade restante e saldo, reduzir `remainingQty` condicionalmente e dar o item. Duas compras simultâneas não podem vender além da quantidade inicial congelada nem deixar saldo negativo.
- O preço deve continuar `teto(shopBuyBase × 2,0 × (1 + taxRate))`; não creditar o cofre. A recompra de emergência por 30% permanece como está e não compra raros.
- No embed, mostrar somente as quatro ofertas, `x restante/inicial`, preço e “Próxima caravana: [horário]”. Item esgotado não pode ser escolhido. Não exibir `∞`.

### 2. Varejo real das lojas municipais

Todo item abaixo precisa poder ser vendido por sua loja **somente quando existir em `VillageShopStock`**. Atualizar o catálogo central de produtos, `shopView`, preços, modais e validações; não criar listas duplicadas em handlers.

| Loja | Itens e `retailBase` |
|---|---|
| Empório | `fruta` 10, `carne_crua` 12, `peixe_cru` 11, `grao` 8, `farinha` 14, `agua_limpa` 5, `erva_medicinal` 11, `pao` 14 |
| Marcenaria | `madeira` 8, `fibra_vegetal` 7, `papel` 10, `lenha` 6 |
| Fundição | `minerio_ferro` 18, `pedra` 5, `carvao` 9, `argila` 8, `lingote_ferro` 30, `aco` 55, `polvora` 25, além dos equipamentos já existentes no catálogo |
| Ichiraku | manter `carne_cozida` 18, `peixe_cozido` 16, `dango` 30, `ensopado` 35, `lamen` 48 |
| Oficina de Selos | `papel` 10, `tinta_de_selo` 24, `pergaminho_arsenal` 300 |

- O preço final municipal segue `teto(retailBase × (1 + taxRate))` e a venda normal continua sendo sumidouro: não muda o cofre.
- `Comprar` deve ficar ativo quando houver pelo menos um produto permitido com quantidade positiva. Deve ficar desativado somente quando a loja não tem item vendável, mostrando “sem estoque para venda”.
- `Abastecer` pelo Kage deve aceitar somente ingredientes de receita daquela loja ou produtos permitidos na tabela acima. Não deixar itens presos numa loja sem receita nem varejo.
- Teste visual/funcional obrigatório: com 500 `madeira` no estoque da Marcenaria, o jogador vê Madeira em `Comprar`, compra 1 e o estoque passa a 499. Com estoque vazio de itens vendáveis, o botão fica desativado.

## Arquivos de contexto

- `src/data/shops.ts`: catálogo atual de lojas/produtos e lista infinita do Mercado Geral a substituir.
- `src/services/economy/shop-service.ts`: `shopView()` e `buyFromShop()` têm os ramos atuais de estoque infinito.
- `src/services/economy/shop-pricing.ts`: manter uma única fórmula de preço.
- `src/commands/loja.ts`: renderização e componentes do embed.
- `src/services/economy/*scheduler*` e `src/index.ts`: registrar/recuperar o job automático sem `setTimeout` não persistido.
- `tests/shops.test.ts` e `tests/shops-db.test.ts`: atualizar as expectativas de infinito e acrescentar testes de catálogo, rotação, esgotamento e concorrência.

## Não fazer

- Não criar armas, itens raros à venda, preços que o Kage possa editar ou crédito de vendas normais ao cofre.
- Não remover a compra de ingredientes das lojas nem a recompra de emergência do Mercado Geral.
- Não modificar saldo de jogadores/estoques existentes em migration, exceto as novas linhas de oferta; dados de `VillageShopStock` atuais devem continuar utilizáveis.

## Validação para entrega

1. Rodar migration/`prisma generate`, `npm run typecheck` e os testes relevantes.
2. Informar arquivos alterados, migration, job registrado e testes executados.
3. Mostrar um exemplo de embed do Mercado Geral com quatro ofertas e um da Marcenaria com Madeira comprável.
