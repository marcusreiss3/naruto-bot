# Handoff da implementação da economia

Registro do que cada etapa deixou aplicado e do que a próxima precisa saber.

---

## Etapa 01 — Fundação, inventário e dados de vila

Concluída. Typecheck limpo, 960 testes passando (87 arquivos).

### Migration aplicada

O projeto não usa `prisma migrate` (não existe `prisma/migrations/`); o fluxo é
`db push`. A ordem importa, porque o novo `@@unique([charId, itemId])` não pode
ser criado em cima de duplicatas:

```bash
npm run migrate:inventory-dedup   # consolida pilhas duplicadas (SQL cru, idempotente)
npx prisma db push --accept-data-loss
npm run seed                      # 5 vilas + competência + backfill de estado econômico
npm run register                  # /admin-vila é comando novo
```

`--accept-data-loss` é exigido **só** pelo aviso genérico da unicidade nova.
Rodar o dedup antes é o que torna o push seguro; se ele reportar duplicatas,
elas já foram consolidadas quando o push rodar.

Aplicado em `prisma/dev.db` nesta etapa: `InventoryItem` estava com 0 linhas
(nada a consolidar), 3 personagens receberam `CharacterEconomyState` pelo seed.

### Pendências manuais antes da etapa 2

- **Nenhuma migration manual pendente.** A estrutura de competência
  (`VillageTaxPeriod`, `WeeklyTaxActivity`, `WeeklyTaxCharge`) já está no banco,
  vazia, com as chaves únicas que impedem dupla cobrança.
- Em qualquer outro ambiente (produção/Square), rodar a sequência acima na
  mesma ordem. O `start:prod` roda `db push` sem `--accept-data-loss`, então
  **o dedup precisa rodar antes do primeiro deploy desta etapa**, senão o push
  falha se houver duplicata.
- `NODE_EXTRA_CA_CERTS` continua necessário nesta máquina para qualquer script
  que fale com o Discord (`npm run register`, `npm run dev`).

### Contratos usados pela etapa 2

- `weekKeyFor(date)` / `weekStartFor` / `weekEndFor` em
  `src/services/economy/week.ts` — competência domingo 22:00 `America/Sao_Paulo`.
  O offset é fixo em −3h (sem horário de verão desde 2019); se voltar a existir
  DST, é ali que muda.
- `ensureCurrentTaxPeriods(now)` abre a competência congelando `Village.taxRate`.
  É idempotente pela unicidade `(villageId, weekKey)` — rodar de novo na mesma
  semana **não** re-congela, que é a proteção contra subir imposto no meio da
  semana e cobrar retroativo.
- `WeeklyTaxActivity` precisa ser alimentada dentro da transação de
  `completeMission()` (`src/services/missions/mission-service.ts`), somando
  `def.rewards.xp` e `def.rewards.ryo` — **nunca** `UserCharacter.xp`, que é
  consumido no level up.
- A cobrança é a **única** via autorizada a deixar `UserCharacter.ryo` negativo.
  Ela não pode usar `spendCharacterRyo()`, que exige saldo por design.
- `isTaxableRank(rank)` já filtra Academia.

### Decisões validadas pela staff (2026-08-11)

- `VillageLedger.villageId` é **nulável**. Movimentos que não tocam cofre nem
  estoque (recompensa de missão, restauração de pergaminho paga a NPC) entram no
  mesmo livro com vila nula, para que "toda alteração de Ryō gera auditoria"
  valha de verdade. Relatórios por vila filtram por `villageId`.
- Pilha de inventário zerada fica gravada com `qty = 0` em vez de ser apagada.
  Evita a corrida entre apagar a linha zerada e outra transação somar nela; todo
  leitor já filtra `qty > 0`.

### Entradas e ralos de Ryō (para o balanceamento das próximas etapas)

**`NPC_SALE` é ralo, não transferência.** O Ryō pago a NPC é decrementado do
personagem e **não é creditado em lugar nenhum** — sai do jogo. Vai para o
"bolso de um NPC fictício" que nunca gasta de volta. Isso é intencional: é o
mecanismo de controle de inflação. Não criar um saldo de NPC nem devolver esse
dinheiro à economia por outra via.

Mapa atual (a etapa 2 acrescenta o imposto):

| Fluxo | Tipo | Efeito no total de Ryō do jogo |
|---|---|---|
| Recompensa de missão | `MISSION_REWARD` | **entra** (criado do nada) |
| Restauração de pergaminho | `NPC_SALE` | **sai** (ralo) |
| Imposto semanal (etapa 2) | `WEEKLY_ACTIVITY_TAX` | transfere: jogador → cofre |
| Doação, obra, saque do Kage | vários | transfere entre jogador e cofre |

`MISSION_REWARD` e `STOCK_DEPOSIT` foram acrescentados aos tipos mínimos de
lançamento listados na seção 9 do spec.

---

## Etapa 02 — Imposto semanal e relógio automático

Concluída. Typecheck limpo, 987 testes passando (89 arquivos).

### Migration aplicada

```bash
npx prisma db push    # sem --accept-data-loss: só campos novos e nulos
npm run seed          # continua idempotente
```

Campos novos: `UserCharacter.villageId` (nulo) e `WeeklyTaxCharge.receiptSentAt`
(nulo). Nenhum dado existente foi tocado. **`npm run register` não é necessário**
— esta etapa não mexeu em `SlashCommandBuilder`.

### Decisão de escopo: `UserCharacter.villageId`

A especificação exige que a missão grave **a vila do instante da conclusão**
(sem imposto retroativo ao trocar de vila). Mas `completeMission()` é chamado de
~45 lugares e nenhum deles recebe o `GuildMember`, então não havia como derivar
a vila do cargo do Discord ali dentro.

Solução: a vila passou a ser persistida no personagem e espelhada do cargo em
**um único ponto** — o dispatcher de `InteractionCreate` em `src/index.ts`,
via `syncCharacterVillage()`. Grava só quando mudou.

`villageFromMemberStrict()` (em `economy/village-sync.ts`) é deliberadamente
diferente de `villageFromMember()`: **não** cai em Konoha. Sem cargo de vila o
valor é `null`, e `null` não acumula imposto — creditar Konoha por acidente seria
pior que não cobrar. Isso já antecipa a regra técnica da etapa 04.

**Limitação conhecida:** a sincronização acontece em interação (slash command,
botão, modal), não em mensagem de texto solta. Um jogador que troque de cargo e
conclua uma missão **apenas por diálogo de texto**, sem tocar em nenhum comando,
acumula na vila anterior até a próxima interação. Aceitei isso para não gravar no
banco a cada mensagem do servidor. Se incomodar, o ponto de correção é o handler
de `MessageCreate`.

### Correção durante a etapa

`pendingWeekKeys()` derivava o vencimento da competência de `openedAt` (quando a
linha foi gravada) em vez da própria chave. Uma competência criada com atraso
venceria na data errada. Agora usa `weekEndFromKey(weekKey)`. Coberto por teste.

### O que a etapa 3 precisa saber

- `accumulateMissionActivity(tx, ...)` roda **dentro** da transação da recompensa
  em `completeMission()`. Só acumula Genin+ com vila definida.
- `addXp()` roda **depois** da transação, de propósito: ele consome XP no level
  up, então `UserCharacter.xp` é residual e nunca serve de base para a meta.
- A cobrança semanal é a **única** via que deixa `ryo` negativo. Ela não usa
  `spendCharacterRyo()` (que exige saldo por design) — escreve o decremento
  direto dentro da transação de fechamento.
- Quem está em dívida já é bloqueado em qualquer gasto por `spendCharacterRyo()`.
  Coleta, missão, item recebido e venda continuam livres, como pede o spec.
- O recibo persistido são as próprias linhas de `WeeklyTaxCharge`
  (`@@index([charId, weekKey])`). `receiptSentAt` nulo = DM falhou ou não foi
  tentada. **A aba `Relatórios` de `/vila` que exibe isso é da etapa 04.**
- O relógio (`tax-scheduler.ts`) guarda estado no banco, não no timer:
  `closeWeek()` é idempotente, então reinício não cobra duas vezes e um domingo
  fora do ar é recuperado no boot seguinte.
- A meta de 1.600 XP continua **oculta**: nenhum embed, recibo ou comando mostra
  contador de XP tributável. Há teste que falha se o recibo vazar isso.

---

## Etapa 03 — Coleta, materiais, craft e fome

Concluída. Typecheck limpo, 1.032 testes passando (91 arquivos).

### Migration aplicada

```bash
npx prisma db push    # sem --accept-data-loss: só tabelas novas
npm run register      # /acao, /craft e /comer são comandos novos (27 no total)
```

Tabelas novas: `GatheringCooldown` e `EconomyActionLog`. Nenhum dado existente
foi tocado. O seed não mudou.

### Onde ficou cada coisa

- `src/data/gathering.ts` — as seis áreas, seus canais e o pool de recursos por
  ação. **A Montanha (`1515881137170546852`) mora aqui, não em `scenarios/`**,
  porque é área de coleta sem mapa de combate.
- `src/data/recipes.ts` — catálogo central único. Toda receita tem
  `scope: personal | villageShop`; as municipais também têm `station`
  (`FUNDICAO`, `ICHIRAKU`, `OFICINA_SELOS`). Nenhum handler repete fórmula.
- `src/services/economy/gathering.ts` — `rollGathering()` puro com RNG injetável
  e `claimGatherCooldown()` atômico.
- `src/services/economy/crafting.ts`, `eating.ts` — craft pessoal e saciedade.

### Contrato do RNG (importa para quem for escrever teste)

A ordem das chamadas de `rng()` em `rollGathering()` é contrato:

- caça/pesca: `[qtd principal] [qtd secundária] [dado do raro]`
- demais ações: `[total] [um sorteio por unidade] [dado do raro]`

O dado do raro é **sempre** a última chamada, inclusive em ações que não têm
raro. Um teste que esqueça de fixar esse último valor vai ver 1 item a mais.

### Decisões

- **`personalRecipe()` é a única porta do `/craft`.** Ela devolve `undefined`
  para qualquer receita municipal, então id forjado por customId, autocomplete
  ou comando não produz aço, pólvora, tinta, Lámen nem Pergaminho de Arsenal.
  Há teste que enche o inventário dos ingredientes certos e confirma a recusa.
- **Kunai Explosiva** está declarada no catálogo como `villageShop`/`FUNDICAO`
  (tabela 5.1), mas o jogador continua montando pela combinação existente
  (`/usar` Papel Bomba com Kunai em `prepareExplosiveKunai`). As duas coisas
  coexistem; a seção 5.2 manda manter a combinação atual.
- **Pilha zerada continua com `qty = 0`** (decisão da etapa 01), então
  `getInventoryQty` é a forma correta de checar posse — não `findUnique` + null.
- **A página de equipamento do site** (`buildEquipmentCatalog`) passou a filtrar
  `WEAPON | NINJA_TOOL | CONSUMABLE`. Sem isso os 34 materiais/alimentos novos
  apareceriam como equipamento. Continua listando os mesmos 14 itens.
- **Materiais e alimentos não têm `ryoValue`.** Preço de NPC, recompra a 30% e
  margem de loja são da etapa 05; não inventei número aqui.

### O que a etapa 4 precisa saber

- Coleta entra **só no inventário pessoal**. Ordens de coleta (que desviam o
  recurso-alvo direto para o estoque central) são da etapa 04, seção 4.2.1.
- Itens raros são marcados com `rare: true` e têm helper `isRareResource()`.
  Eles **nunca** podem ser capturados automaticamente por ordem de coleta — só
  doação manual.
- `EconomyActionLog` já grava canal, vila, ação e itens; a população ativa de 14
  dias da etapa 04 sai de uma consulta nessa tabela.
- Nada da etapa 03 toca `WeeklyTaxActivity`, `ryo` ou `VillageLedger`. Há teste
  que trava isso.

---

## Etapa 04 — Administração, cofre e estoque central

Concluída. Typecheck limpo, 1.080 testes passando (93 arquivos).

### Migration aplicada

```bash
npx prisma db push    # sem --accept-data-loss: campos com default e tabelas novas
npm run register      # /vila é novo e /admin-vila ganhou 6 grupos (28 comandos)
```

Novos: `Village.reservedRyo`, `CharacterEconomyState.activeOrderId`,
`CollectionOrder`, `CollectionOrderMember`.

### Canais de anúncio (informados pela staff em 2026-08-11)

`VILLAGE_ANNOUNCE_CHANNELS` em `src/data/villages.ts`. As cinco vilas têm canal
próprio e o jogador comum enxerga todos — por isso a ordem aberta e o registro
público de saque vão para lá, e **não** para a mansão.

| Vila | Canal |
|---|---|
| Konoha | `1536739194708164608` |
| Suna | `1536739340862881812` |
| Kiri | `1536739452209201363` |
| Kumo | `1536739627380121620` |
| Iwa | `1536739735307943956` |

A mansão continua sendo o lugar **de onde** o Kage administra (gate de
`podeKage`), não o lugar onde se anuncia.

### Como a reserva do cofre funciona

É a peça que impede o Kage de prometer Ryō que a vila não tem. O invariante:

```
criar ordem   → reservedRyo += orçamento          (treasuryRyo não muda)
entregar      → treasuryRyo -= pago; reservedRyo -= pago
fechar        → reservedRyo -= sobra não usada
```

Somando: a reserva sempre volta a zero e o cofre cai exatamente pelo que foi
pago. `availableTreasury = treasury − reserved` é o que o saque enxerga, então
**saque nunca encosta em reserva**.

SQL não compara duas colunas num `WHERE`, então a reserva na criação usa
concorrência otimista: lê `treasuryRyo`/`reservedRyo`, calcula o disponível e
grava condicionando aos **dois valores lidos**. Se outra ordem entrar no meio,
`count` volta 0 e a transação inteira cai. Há teste de duas criações simultâneas
disputando o mesmo Ryō.

### Decisões

- **`activeOrderId` mora em `CharacterEconomyState`.** "Um ninja só aceita uma
  ordem por vez" precisa ser atômico, e o Prisma/SQLite não faz índice único
  parcial. Aceitar é um `UPDATE ... WHERE activeOrderId IS NULL`: dois cliques
  simultâneos não passam os dois. Fechar a ordem libera todo mundo de uma vez.
- **`Command.handleSelect` é novo.** O painel precisa de `StringSelectMenu` e
  `UserSelectMenu`, e o dispatcher em `src/index.ts` só roteava botão e modal.
  Adicionei o roteamento de select com o mesmo formato de customId.
- **Kage ≠ staff.** `podeKage = isKage && inMansion`. Ser Kage não dá
  `/admin-vila`, e Kage fora da mansão vê o painel em modo leitura com a
  instrução de ir para lá.
- **Ordem nunca tem recurso raro como alvo**, e `deliverToOrder` recusa raro
  mesmo se alguém forçasse. Raro só vai para a vila por doação manual.
- **População ativa é só leitura.** O fator aparece no painel e no
  `/admin-vila ver`, mas não multiplica custo nem produção — isso é da etapa 6,
  que ainda precisa congelar o fator no início de cada obra.

### O que a etapa 5 precisa saber

- `VILLAGE_MARKET_CHANNELS` (seção 7.1) **ainda não existe no código** — é da
  etapa 05. Os cinco IDs já estão confirmados; ver a tabela abaixo. Como não
  sobra nenhuma vila pendente, o estado "mercado ainda não configurado" deixa de
  ser um caso real — mantenha o tratamento só como defesa.
- O helper de reserva (`reservedRyo`) já está pronto para obra e manutenção da
  etapa 6; hoje só ordem de coleta usa.
- As abas `Obras` e `Comércio` já existem no painel mostrando "em breve" —
  é só trocar o `renderEmBreve` pelo conteúdo real.
- Receitas municipais já estão no catálogo com `station` (`FUNDICAO`,
  `ICHIRAKU`, `OFICINA_SELOS`); a administração de loja filtra por
  `villageShopRecipes(station)`.

### Canais comerciais das cinco vilas (para a etapa 05)

Informados/confirmados pela staff em 2026-08-11. Konoha, Suna e Kiri já existem
como constante em `src/data/scenarios/index.ts`; **Kumo e Iwa ainda não estão no
código** e precisam entrar junto com `VILLAGE_MARKET_CHANNELS`.

| Vila | Canal comercial | ID | Já está no código? |
|---|---|---|---|
| Konoha | Centro Comercial de Konoha | `1516183249712582657` | sim (`CENTRO_COMERCIAL_CHANNEL_ID`) |
| Suna | Centro Comercial de Sunagakure | `1523372488292302958` | sim (`CENTRO_COMERCIAL_SUNA_CHANNEL_ID`) |
| Kiri | Centro Comercial de Kirigakure | `1523372437398487151` | sim (`CENTRO_COMERCIAL_KIRI_CHANNEL_ID`) |
| Kumo | Centro Comercial de Kumogakure | `1523372472223793254` | **não** |
| Iwa | Centro Comercial de Iwagakure | `1523372453403955281` | **não** |

Não confundir com `VILLAGE_ANNOUNCE_CHANNELS` (avisos, usado pela etapa 04) nem
com `VILLAGE_MANSIONS` (administração). São três conjuntos distintos de canal
por vila.

---

## Etapa 05 — Lojas, atacado e interface Discord

Concluída. Typecheck limpo, 1.170 testes passando (95 arquivos).

### Migration aplicada

```bash
npx prisma db push    # sem --accept-data-loss: tabelas novas e campos com default
npm run seed          # cria as 6 lojas de cada vila (30 no total)
npm run register      # /loja é novo e /admin-vila ganhou o grupo ichiraku (29 comandos)
```

Novos: `Village.constructionSlotsUsed`, `VillageShop`, `VillageShopStock`,
`VillageConstruction`, `DiscordUiSession`, `LedgerType.SHOP_DAILY_RESET`.
Nenhum dado existente foi tocado. `seedVillageShops()` só usa `create` quando a
linha não existe — nunca `update` —, então um redeploy **não** devolve um
Ichiraku já construído para `LOCKED` nem zera estoque, orçamento ou canal.

### Onde ficou cada coisa

- `src/data/shops.ts` — as seis lojas, `shopBuyBase`, `retailBase`, contratos de
  atacado e o custo-base da obra do Ichiraku. Conteúdo puro; **nenhum preço
  final é calculado aqui**.
- `src/services/economy/shop-pricing.ts` — todas as fórmulas, puras.
- `src/services/economy/shop-service.ts` — o único lugar que escreve estoque de
  loja, orçamento, contrato e livro-caixa de loja.
- `src/services/economy/constructions.ts` + `construction-scheduler.ts` — obra
  genérica e o relógio de conclusão.
- `src/services/economy/ichiraku-channel.ts` — criação idempotente do canal.
- `src/services/economy/ui-session.ts` — sessão de 15 min do painel.
- `src/commands/loja.ts` — painel do jogador.
- `src/commands/vila-comercio.ts` — aba `Comércio` de `/vila` (administração).

### As quatro travas atômicas desta etapa

Nenhuma delas é `findFirst` seguido de `update`; em todas a condição está no
`WHERE` do próprio `UPDATE`, então quem perde a corrida derruba a transação.

| O que protege | Coluna condicionada |
|---|---|
| Estoque da loja não passa da capacidade | `VillageShop.stockUnits <= capacity - qty` |
| Orçamento do dia não estoura | `dailyBudgetSpent <= orçamento - custo` (com `budgetDayKey` = hoje) |
| Oficina não passa de 3 Pergaminhos/semana | `weeklyCraftCount <= 3 - n` (com `weeklyCraftKey` = competência) |
| Vila não inicia duas obras | `Village.constructionSlotsUsed < ECONOMY.constructionSlots` |

`stockUnits` é denormalizado **de propósito**: a capacidade precisa ser checada
num `WHERE`, e `SOMA` de várias linhas não cabe lá. Todo caminho que escreve
`VillageShopStock` passa pelos helpers que mantêm os dois em sincronia na mesma
transação.

### Contadores com chave ao lado, em vez de job de reset

`budgetDayKey`, `weeklyCraftKey` e `wholesaleDayKey` guardam a que dia/competência
o número pertence. O reset é a comparação com a chave de hoje, feita na própria
transação da ação. Isso é mais forte que um job: reinício, deploy no domingo à
noite ou job que não rodou não contornam o limite, e não existe janela em que o
contador está velho. O `SHOP_DAILY_RESET` no livro-caixa é o rastro de quando a
virada aconteceu de fato.

### Fluxo do Ryō (o que credita o cofre e o que não credita)

| Ação | Cofre | Circulação |
|---|---|---|
| Jogador compra na loja | **não muda** | Ryō **sai** do jogo (ralo) |
| Loja compra ingrediente do jogador | **−** | transfere cofre → jogador |
| Kage abastece do estoque central | **não muda** | nada |
| Loja produz | **não muda** | nada |
| Contrato de Empreendedor NPC | **+** | Ryō **entra** (NPC paga) |
| Mercado Geral (compra/recompra) | **não muda** | ralo / entrada de emergência |

O `SHOP_SALE_TO_PLAYER` tem `villageId` preenchido para aparecer no histórico da
loja, mas o `ryoDelta` dele é o do **jogador**, não o do cofre — por isso todo
lançamento de loja carrega `meta.treasuryDelta` explícito.

### Decisões

- **Não estendi a tabela de `shopBuyBase` da seção 7.4.** `sal`, `lenha` e
  `lingote_ferro` não estão nela, então nenhuma loja os compra. Consequência
  prática: a Fundição não consegue fabricar pólvora só com o que compra dos
  ninjas, e o Ichiraku não compra lenha para o Caldo — esses insumos entram por
  doação ao estoque central + `Abastecer`, exatamente como a Madeira Reforçada
  da Oficina já entra por decisão do spec. **Se a staff quiser que essas cadeias
  fechem só pelo balcão, é acrescentar três linhas em `SHOP_INGREDIENTS`** — não
  inventei os números por conta própria.
- **Mercado Geral vende matéria bruta com markup de 2×.** O spec pede "oferece
  matérias básicas" mas não dá preço. O markup não é decorativo: se o NPC
  vendesse madeira mais barato do que a Marcenaria paga por ela, o par de lojas
  viraria impressora de Ryō. Há teste varrendo os três níveis de taxa (0%, 5%,
  15%) para todos os materiais.
- **Marcenaria e Empório não produzem nada.** Só Fundição, Ichiraku e Oficina
  têm `station` no catálogo de receitas, e é isso que a seção 7.2 descreve. A
  Marcenaria existe como compradora de madeira/fibra/papel para as obras.
- **`productPrice` valida a loja, não só o item.** Um bug pego por teste: na
  primeira versão qualquer loja com o item em estoque conseguiria vendê-lo.
- **CustomId de `/loja` não carrega vila nem loja.** O spec permite (`loja:v1:
  buy:KONOHA:ichiraku:abc123`), mas os dois já estão na sessão, então ficam de
  fora: `loja:v1:<ação>:<sessionId>`. Menos superfície forjável, mesmo efeito.
- **Anúncio de obra vai para o canal de avisos, não para a mansão.** A seção 7.7
  diz "mansão", mas a etapa 04 já validou com a staff que avisos públicos vão
  para `VILLAGE_ANNOUNCE_CHANNELS` — a mansão é de onde o Kage administra, não
  onde a vila lê.
- **A sessão do painel não tem campo de permissão.** Cheguei a criar um `admin`
  em `DiscordUiSession` e removi: uma coluna sempre-falsa é convite para alguém
  confiar nela como flag de Kage. Quem pode administrar é decidido a cada
  clique por `podeKage`.

### O que a etapa 6 precisa saber

- **`VillageConstruction` já é o modelo genérico.** Centro e setores entram como
  `buildingType: "CENTER" | "SECTOR"` na mesma tabela. Para elevar a fila, mexa
  só em `ECONOMY.constructionSlots` — a trava é o contador em `Village`, não uma
  contagem de linhas.
- **O fator de população já é congelado** em `VillageConstruction.populationFactor`
  no instante da confirmação. A etapa 06 pediu isso; já está feito para o
  Ichiraku e `scaleConstructionCost()` é o ponto de extensão.
- **`AWAITING_CHANNEL` é um estado de verdade**, não um detalhe do Ichiraku: a
  obra conclui e libera a vaga mesmo se o Discord recusar a criação do canal.
  Qualquer prédio futuro com canal próprio deve seguir a mesma ordem — nunca
  ativar antes de persistir o canal, nunca recobrar em nova tentativa.
- **Manutenção semanal (seção 6.4) ainda não existe.** `reservedRyo` está pronto
  para ela, e a seção 7.2 diz explicitamente que as quatro lojas históricas
  **não** cobram manutenção nesta versão.
- **Não há nível de loja e a seção 7.2 proíbe criar um.** Se a etapa 06 falar em
  "melhorar loja", confira antes: capacidade, orçamento e limite diário são
  fixos por decisão do spec.

---

## Etapa 06 — Evoluções, produção e manutenção

Concluída. Typecheck limpo, 1.265 testes passando (97 arquivos). **Última etapa do
roteiro.**

### Migration aplicada

```bash
npx prisma db push    # sem --accept-data-loss: tabelas novas e campos com default
npm run seed          # 4 setores nível 0 + Centro nível 1 por vila (25 prédios)
npm run register      # /admin-vila ganhou 5 grupos novos (29 comandos, nenhum novo)
```

Novos: `Village.constructionSlotsUsed` (já existia da 05), `VillageUpgrade`,
`VillageCenter`, `VillageProductionRun`, `VillageMaintenanceCharge`.
`DiscordUiSession.admin` foi removido (ver etapa 05). Nenhum dado existente foi
tocado; o seed dos prédios só usa `create`, nunca `update`.

### Relatório dos jobs recorrentes

| Job | Quando | Âncora de idempotência | Recuperação de boot |
|---|---|---|---|
| Imposto semanal (02) | domingo 22:00 | `VillageTaxPeriod.status` | `runPendingClosures` |
| Ordens de coleta (04) | boot + cada entrega | `CollectionOrder.status` | `closeFinishedOrders` |
| Obras (05/06) | próxima conclusão, teto 24 h | `VillageConstruction.status` | `completeFinishedConstructions` |
| Canal do Ichiraku (05) | junto das obras | `VillageShop.discordChannelId` | `syncPendingIchirakuChannels` |
| **Produção diária (06)** | **00:05 diário** | **`VillageProductionRun` (vila, prédio, dia)** | **`runPendingProduction`, até 7 dias** |
| **Reforma semanal (06)** | **segunda 00:15, teto 12 h** | **`VillageMaintenanceCharge` (vila, prédio, ciclo)** | **`runMaintenancePass`** |

Todos moram em `village-scheduler.ts` (obras/produção/reforma) e
`tax-scheduler.ts` (imposto). **Nenhum depende de `setTimeout` sozinho**: o boot
roda uma passada de cada e recupera tudo que venceu offline, exatamente uma vez.
O teto de 12 h do relógio de reforma existe porque as 72 h de graça precisam
vencer no meio da semana — ele não pode dormir até a próxima segunda.

`PRODUCTION_CATCHUP_DAYS = 7`: bot fora do ar por um mês **não** despeja 30 dias
de produção de uma vez. É um teto de segurança que o spec não pede; se a staff
preferir recuperar tudo, é um número só em `production.ts`.

### As travas de concorrência (todas testadas)

Nenhuma usa `findFirst` como lock; em todas a condição está no `WHERE` do
próprio `UPDATE`, e quem perde a corrida derruba a transação inteira.

| O que protege | Coluna condicionada | Teste |
|---|---|---|
| Vaga na fila de obras | `Village.constructionSlotsUsed < capacidade` | 4 cliques com Centro 2 → 2 obras |
| Dois níveis do mesmo prédio | `constructingTo IS NULL` | 3 cliques no mesmo setor → 1 obra |
| Obra do Ichiraku | `VillageShop.status = LOCKED` | etapa 05 |
| Conclusão única | `VillageConstruction.status = IN_PROGRESS` | dois boots → 1 conclusão |
| Produção do dia | unicidade (vila, prédio, dia) | 2 execuções paralelas → 1 depósito |
| Cobrança do ciclo | unicidade (vila, prédio, ciclo) | 2 aberturas → 1 cobrança |
| Pagamento de reforma | `status IN (PENDING, OVERDUE)` | 2 pagamentos paralelos → 1 débito |

A capacidade chega ao `WHERE` como **número literal**, lido no começo da mesma
transação, porque SQL não compara duas colunas. O pior caso de uma corrida com a
conclusão do Centro é recusar uma obra que caberia — nunca deixar passar uma a
mais.

### Custos (relatório final)

- **Setor**, níveis 1→5: 1.200 / 2.100 / 3.600 / 5.800 / 9.000 Ryō; 3 h / 1 d /
  3 d / 7 d / 15 d. Total por setor: **26 dias e 3 horas**, conferido por teste.
- **Centro**, 1→2: 5.000 Ryō e 3 dias; 2→3: 11.000 Ryō e 10 dias.
- **Ichiraku**: 7.500 Ryō e 5 dias (etapa 05).
- Tudo multiplicado pelo fator de população, **congelado na linha da obra**.
- **Reforma**: `teto(teto(3% × base × fator) × desconto)` para Ryō e
  `teto(1% × acumulado × fator)` para material, sem desconto. O desconto entra
  **depois** do primeiro arredondamento — é o único jeito de reproduzir os
  104 / 94 / 84 Ryō do exemplo da seção 6.4. Há teste fixando os três.

### Comandos

`/vila` → aba **Obras** (Kage, na mansão): Centro, vagas ocupadas/total, fila com
cronômetro, produção diária prevista, reformas pendentes. Evoluir é select de
prédio → tela de confirmação com custo, fator congelado e vagas → botão.
**Nunca se digita nível nem valor.** Pagar reforma é um select.

`/vila` → **Visão Geral** agora mostra obras em andamento e alertas de reforma
para todo mundo (o cofre continua só para o Kage).

Staff, em `/admin-vila`: `nivel set`, `centro set`, `obra listar|concluir|cancelar`,
`manutencao resolver`, `populacao override`. Todos exigem `motivo` e geram
`ADMIN_ADJUSTMENT`.

### Decisões

- **`nivel set` e `centro set` limpam o estado inteiro, não só o número.** Obra
  em andamento naquele prédio é cancelada e a vaga volta; `constructingTo` é
  limpo; cobrança de reforma que perdeu o objeto (setor a 0, Centro a 1) é
  encerrada. Sem isso ficaria "obra fantasma" — prédio travado para sempre ou
  vaga presa. Não há reembolso: baixar nível não devolve nada.
- **`obra concluir` não tem caminho próprio de conclusão.** Ele antecipa
  `finishesAt` e deixa o job normal fechar, para não existirem duas rotinas
  capazes de subir nível.
- **O bônus de coleta é probabilístico, não arredondado.** +5% num loot de 5
  unidades dá 0,25 extra: vira 25% de chance de +1. Arredondar mataria os níveis
  2 e 3, porque um loot tem 3 a 7 unidades e 5% disso nunca chega a 1. A média
  fica exatamente nos +5% do spec. O dado do bônus é a **última** chamada de
  `rng()`, depois do dado do raro, e **só acontece quando há bônus** — sem setor
  evoluído a sequência é idêntica à de antes da etapa 06, e os testes das etapas
  03/05 continuam valendo sem tocar em nada.
- **"fruta/erva" da Silvicultura** (níveis 2–5 da tabela 6.3) virou os dois itens
  em quantidades que somam o valor da tabela, com a fruta levando a sobra ímpar.
  A tabela do spec deixa a divisão em aberto; escolhi não fazer sumir nenhum dos
  dois.
- **O ciclo de reforma tem âncora própria** (segunda 00:15), separada da
  competência do imposto (domingo 22:00). Não fundi as duas de propósito: são
  dois calendários no spec, e unificar faria uma mudança num quebrar o outro. Há
  teste fixando que domingo 23:00 já é competência nova mas ainda é o ciclo de
  reforma antigo.
- **`populationOverride` passou a ser lido.** O campo existia desde a etapa 01 e
  nunca era consultado — `activePopulation` agora curto-circuita nele, e é o que
  torna o fator determinístico nos testes.

### Pendência conhecida (fora do escopo desta etapa)

A seção 8 descreve, na aba **Impostos**, um botão `Alterar taxa` para o Kage com
modal de 0–10, e a seção 3.1 exige limite de **uma mudança a cada 24 h**. Isso
era da etapa 04 e não entrou; hoje a taxa só muda por `/admin-vila imposto set`,
que é da staff e não tem o cooldown de 24 h. **Não implementei porque não está
nas entregas da etapa 06** — mas é a única capacidade de Kage descrita na
seção 8 que ainda não existe. São ~30 linhas em `vila.ts` mais o cooldown em
`setTaxRate`, quando a staff quiser.
