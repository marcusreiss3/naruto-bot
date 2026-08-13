# Especificação — Economia, recursos e vilas

Este documento é a especificação funcional para implementar a economia do bot. Ele foi escrito para o Claude usar como plano de execução; não é código. O objetivo é fazer o **Ryō** já existente circular entre missões, mercado, coleta, craft, impostos e evolução das cinco vilas, sem criar armas além das que o bot já possui.

## 1. Resultado pretendido

O ciclo principal deve ser:

```text
Missões / coleta em RP → Ryō e materiais → mercado e craft
                                  ↓                 ↓
                         doação à vila       imposto da vila
                                  ↓                 ↓
                    cofre + estoque da vila ←────────┘
                                  ↓
              obras, produção passiva e manutenção semanal
                                  ↓
          alimentos/materiais mais disponíveis para os ninjas
```

Princípios obrigatórios:

- Ryō é a única moeda. Não criar “yen” como segunda moeda; toda referência a yen nesta ideia significa Ryō.
- O Kage **não escolhe preços unitários**. NPCs vendem e compram por uma tabela global. O Kage escolhe apenas a taxa tributária da vila, que aumenta o preço final e vai ao cofre.
- Coleta no RP é relevante no início e continua sendo a forma rápida de abastecer uma vila. A produção passiva ajuda, mas não substitui jogadores usando os comandos nos canais do mundo aberto.
- A economia não deve punir quem ficou dias sem jogar: o imposto pessoal só é cobrado de Genin+ que atingirem uma meta semanal oculta de XP. O imposto de consumo continua embutido em compras de mercado.
- Vilas pequenas não podem precisar de muitos mais meses que Konoha para chegar ao máximo. Custos e produção usam população **ativa**, não número bruto de cargos.
- Toda alteração de saldo, estoque, taxa, obra, saque ou manutenção deve gerar um lançamento auditável e imutável.

## 2. Contexto confirmado no código atual

### Ryō, missões e inventário

- `UserCharacter.ryo` já existe em `prisma/schema.prisma`.
- A conclusão de missão deposita hoje todo o Ryō diretamente no personagem em `completeMission()` de `src/services/missions/mission-service.ts`.
- As 43 missões atuais pagam, em média: rank D **73,1 Ryō** (50–90), rank C **212,5 Ryō** (180–225) e rank B **468 Ryō** (420–500). Não há missão A atualmente.
- Portanto, a referência solicitada de um jogador médio fazendo uma C + D por dia é cerca de **286 Ryō/dia**; um avançado fazendo B + C + D é cerca de **754 Ryō/dia**. As cinco missões B atuais dão em média **534 XP** e **468 Ryō**; três B equivalem a **1.602 XP** e guiam a meta oculta semanal abaixo.
- `InventoryItem` já suporta quantidade, e `src/services/characters/inventory.ts` já possui consumo atômico, transferência e combinação de Kunai + Papel Bomba.

### Itens existentes — não criar novas armas

Em `src/data/items.ts` já existem as armas e ferramentas que devem entrar no craft/mercado:

- Armas: `kunai`, `shuriken`, `fuma_shuriken`, `senbon`, `kunai_explosiva`, `katana`, `lamina_chakra`.
- Ferramentas: `papel_bomba`, `bomba_fumaca`, `fios_aco_ninja`, `pergaminho_arsenal`, `corrente_ferro`, `esfera_explosiva`.

O catálogo ainda não tem alimentos nem materiais. Eles podem ser criados como itens novos nas categorias já previstas (`FOOD` e `MATERIAL`).

### Vilas, cargos e mansões

`src/services/village-service.ts` já define `KONOHA`, `SUNA`, `IWA`, `KUMO` e `KIRI`, seus cargos Discord, nomes e mansões. A vila atual de um membro é inferida pelo cargo Discord. As mansões também estão declaradas em `src/data/scenarios/index.ts`:

| Vila | Administração | Canal |
|---|---|---:|
| Konoha | Mansão do Hokage | `1516470677962494084` |
| Suna | Mansão do Kazekage | `1523371643102167234` |
| Kumo | Mansão do Raikage | `1523371661074763850` |
| Iwa | Mansão do Tsuchikage | `1523371687721177270` |
| Kiri | Mansão da Mizukage | `1523374733448577024` |

Esses canais devem ser o local natural para comandos de administração, painel da vila, relatórios de obras e avisos de manutenção. O comando pode funcionar em qualquer canal para não travar a staff, mas fora da mansão deve responder de modo efêmero e apontar a mansão correspondente.

### Lacuna de rank

O bot não guarda hoje o rank narrativo do ninja; há nível do personagem e cargos de vila, mas não há Genin/Chunin/Jonin persistido. Logo, antes de aplicar “Genin+”, criar uma fonte de verdade `NinjaRank` com `ACADEMIA`, `GENIN`, `CHUNIN`, `JONIN`, `KAGE`. Ela pode ser espelhada em cargos Discord depois, mas a regra financeira deve consultar o banco, não depender apenas de cache de cargos. Enquanto não houver rank definido, tratar o personagem como `ACADEMIA` e não tributá-lo.

## 3. Modelo econômico

### 3.1 Mercado NPC e impostos

Cada vila terá NPCs de mercado com uma tabela global de preço base. O preço exibido e efetivamente cobrado é:

```text
preço final = teto(preço base × (1 + taxa de imposto da vila))
imposto recolhido = preço final − preço base
```

O Kage define uma única `taxRate` entre **0% e 10%**, em passos inteiros de 1%. O valor inicial recomendado é **5%**. Ela altera imediatamente o preço exibido no mercado, mas a taxa do imposto pessoal é congelada por competência semanal.

O encargo de consumo no mercado é imediato, pois ele já está incorporado no preço. A venda normal a jogadores é um **sumidouro de Ryō**: não credita o cofre da vila, nem a receita-base nem o acréscimo da taxa. Já o imposto pessoal sobre missões é **semanal**, sujeito à atividade em XP e detalhado na próxima seção. A missão sempre entrega a recompensa integral no momento em que é concluída.

Regras:

- Academia não acumula atividade tributável nem paga imposto pessoal ou de mercado; isso protege jogadores novos.
- Cada missão concluída por Genin+ deve registrar, na mesma transação da recompensa, XP tributável e Ryō de missão tributável na competência semanal em aberto. Não descontar Ryō nessa hora.
- Compra normal de jogador cobra o preço final e remove esse Ryō da circulação; não muda o cofre. Registrar o valor para recibo/telemetria, mas não como receita da vila.
- Vendas de recursos ao NPC pagam o preço de recompra fixo e **não** sofrem imposto; isso impede que o jogador pague para escoar coleta.
- Não aplicar imposto retroativo ao trocar de vila. A missão grava a vila e o rank que o personagem possuía no instante da conclusão; a cobrança semanal respeita essa atribuição.
- Taxa alterada pelo Kage tem efeito imediato nos preços de compra, mas pode ser mudada no máximo uma vez a cada 24 h. Isso impede oscilações abusivas antes de compras grandes.
- A vila recebe Ryō comercial apenas ao vender estoque em contratos de atacado para **Empreendedores NPC**. Esses NPCs representam comerciantes independentes que compram lotes da produção da vila; a venda normal ao jogador não é um contrato de atacado e não entra no cofre.

Preço base inicial sugerido, calibrado contra D = 50–90 e C = 180–225 Ryō:

| Produto NPC | Base em Ryō | Observação |
|---|---:|---|
| Kunai | 35 | descartável de combate |
| Shuriken | 22 | descartável de combate |
| Senbon | 18 | descartável de combate |
| Fūma Shuriken | 120 | item mais caro, ainda acessível após uma C |
| Papel Bomba | 55 | componente da Kunai Explosiva |
| Bomba de Fumaça | 50 | ferramenta tática |
| Fios de Aço Ninja | 45 | ferramenta tática |
| Carne cozida | 18 | alimento simples |
| Peixe cozido | 16 | alimento simples |
| Fruta | 10 | alimento básico |
| Pão | 14 | alimento básico |
| Lámen | 48 | craft ou compra, recuperação alta |
| Pergaminho de Arsenal | 300 | item raro; `ryoValue` permanece 300 para manter restauração do pergaminho gasto em 150 Ryō |
| Katana | 450 | compra de longo prazo; não é descartável |
| Lâmina de Chakra | 2.400 | compra tardia; idealmente limitada por estoque/forja |

Materiais existem principalmente para craft e obras. O NPC pode recomprá-los por 30% do valor de referência, sempre arredondando para baixo. Isso cria uma saída de emergência, mas torna craft e doação mais vantajosos que transformar coleta em uma impressora de Ryō.

### 3.2 Imposto pessoal semanal por atividade

A meta de atividade é **1.600 XP tributáveis na semana**. Ela fica propositalmente oculta: não exibir barra, contador ou mensagem “faltam X XP” em `/perfil`, `/vila`, `/loja` ou nos embeds de missão. O jogador sabe que missões tornam seu personagem ativo no mundo, mas não deve otimizar a economia em torno de uma linha visível de XP.

O número foi escolhido a partir do estado atual do bot: três missões rank B rendem em média 1.602 XP (as cinco B variam de 480 a 570 XP), portanto a meta equivale aproximadamente a três B. É suficiente para separar atividade semanal real de uma única missão C/D, sem exigir login diário.

Durante a semana, manter por personagem e por vila de origem os acumuladores internos:

```text
xpTributavelDaSemana
ryoDeMissaoTributavelDaSemana
```

Somar somente recompensas de missões concluídas enquanto o personagem era `GENIN`, `CHUNIN`, `JONIN` ou `KAGE`. XP de Academia, craft, coleta, comida, admin e qualquer fonte futura que não seja missão não entram nessa meta. A meta é avaliada pelo **total do personagem**, somando eventuais registros em vilas diferentes; o Ryō cobrado é repartido entre as vilas conforme o Ryō de missão que foi registrado para cada uma.

Não calcular a meta a partir de `UserCharacter.xp`: `addXp()` em `src/services/characters/character-service.ts` consome XP ao subir de nível e esse campo guarda apenas o progresso residual. A fonte correta é `def.rewards.xp` no instante em que `completeMission()` conclui a missão, acumulada em `WeeklyTaxActivity` na mesma transação.

Todo **domingo, às 22:00 no fuso `America/Sao_Paulo`**, rodar a apuração idempotente da semana que se encerra:

1. Encontrar a competência aberta, delimitada pelo domingo anterior às 22:00 e o domingo atual às 22:00.
2. Somar o `xpTributavelDaSemana` de cada personagem em todas as vilas.
3. Se o total for menor que 1.600, fechar a competência como `ISENTO_INATIVO`: cobrar zero, não alterar Ryō e não creditar cofre.
4. Se total for 1.600 ou maior, calcular para cada vila atribuída ao personagem: `imposto = piso(ryoDeMissaoTributavelDaVila × taxaCongeladaDaCompetencia)`. A soma é o imposto semanal pessoal do personagem.
5. Debitar todo o imposto automaticamente do personagem, mesmo que o resultado deixe `UserCharacter.ryo` negativo; creditar a parcela de cada vila ao seu cofre e registrar cada parcela no livro-caixa como `WEEKLY_ACTIVITY_TAX`.
6. Enviar DM ao jogador com o recibo final. Uma tarefa automática não pode criar mensagem efêmera; se a DM falhar, gravar o recibo para consulta privada na aba `Relatórios` de `/vila`.
7. Marcar a competência como `CLOSED` com `chargedAt` e criar a nova competência zerada. Nunca apagar o período anterior: “resetar” significa iniciar contadores novos em zero e manter histórico para auditoria.

Exemplos com 5%:

- Um Genin ganha 1.500 XP em missões: não atinge a meta; paga 0 Ryō, mesmo tendo recebido Ryō.
- Um Genin completa três B médias: 1.602 XP e aproximadamente 1.404 Ryō de missão; paga 70 Ryō no domingo e a vila recebe 70 Ryō.
- Um ninja ganha 2.000 XP, 1.000 Ryō em Konoha e 600 Ryō em Suna; as taxas no fechamento são 5% e 7%. O bot cobra 50 para Konoha e 42 para Suna, total 92 Ryō.
- Se esse último ninja tinha 30 Ryō, após a cobrança fica com **−62 Ryō**. Nenhum item é removido e nenhuma missão é bloqueada; recompensas futuras primeiro compensam naturalmente a dívida.

Regras de saldo negativo:

- Permitir `ryo` negativo no schema e em serviços de personagem; não usar `Math.max(0, ryo)` na cobrança.
- Quem está negativo não pode comprar, restaurar pergaminho, iniciar craft com custo em Ryō, fazer doação de Ryō ou sacar/transferir Ryō até voltar a saldo suficiente. Pode concluir missões, coletar, receber itens e vender recursos normalmente.
- Mostrar valores negativos como `Dívida: 62 Ryō` em `/inventario` e `/perfil`, nunca como “−62 Ryō disponíveis”.
- Cobrança semanal não pode falhar por saldo insuficiente e não cria juros. Ela pode criar dívida, mas não cobra novamente a mesma competência.

No início de cada competência, domingo às 22:00, gravar `taxaCongeladaDaCompetencia` para cada vila com o valor atual de `Village.taxRate`. Mudanças feitas pelo Kage durante a semana ainda alteram preços de mercado, mas entram no imposto pessoal **somente na competência seguinte**. Isso impede subir a taxa antes do fechamento para cobrar retroativamente quem já jogou.

Implementação temporal: usar um job agendado com timezone explícito (cron equivalente a `0 22 * * 0`, `America/Sao_Paulo`) e uma chave única por `weekKey + characterId + villageId`. Se o bot reiniciar, uma rotina de recuperação deve processar competências abertas cujo fim já passou. Antes de debitar, conferir se a competência já está fechada; isso impede dupla cobrança em reinício ou execução concorrente.

### 3.3 Cofre, saque e transparência

Cada vila possui um cofre de Ryō. Ele recebe imposto pessoal semanal, doações voluntárias, depósitos pessoais do Kage e contratos de atacado para Empreendedores NPC; paga obras, manutenção e compra de insumos dos jogadores. Vendas normais de `/loja` não entram nele. Apenas o Kage ativo pode iniciar saque, mas o sistema precisa de freios porque o cofre é patrimônio coletivo:

- Qualquer ninja pode abrir `/vila` → `Doar` → `Ryō`, informar uma quantidade inteira positiva e confirmar. O valor sai do Ryō pessoal e entra no cofre como `DONATION_RYO`; não pode deixar o personagem negativo e não conta como imposto.
- Na mansão, o Kage possui na aba `Cofre` o botão `Depositar`. Ele abre o modal **Depositar Ryō no cofre de [Vila]**, informa a quantidade e confirma numa segunda tela. O valor sai da conta do próprio Kage e entra no cofre na mesma transação, com lançamento `KAGE_DEPOSIT`, saldo antes/depois e recibo efêmero. É um aporte voluntário: não aumenta limite de saque, não pode ser desfeito pelo botão e não permite depositar zero, negativo ou mais Ryō do que possui.

- Saque para o personagem do Kage: máximo de **10% do saldo disponível por semana**, com teto de 2.000 Ryō por saque.
- Não é possível sacar Ryō reservado para obra já iniciada nem para manutenção vencida.
- Todo saque posta um registro público no canal da mansão: valor, saldo antes/depois, Kage e motivo obrigatório de 10–200 caracteres.
- Staff pode bloquear saque por uma flag administrativa (`withdrawalsLocked`) sem apagar histórico.
- Kage NPC é representado por `managedByStaff = true`; staff opera as mesmas ações usando `/admin-vila`, mantendo as mesmas restrições e trilha de auditoria. Quando houver Kage jogador, basta preencher `kageDiscordId`; nenhuma regra econômica muda.

## 4. Recursos, coleta e mundo aberto

### 4.1 Materiais novos

Criar apenas materiais e comida, todos empilháveis:

- Comuns: `madeira`, `pedra`, `minerio_ferro`, `carvao`, `argila`, `fibra_vegetal`, `erva_medicinal`, `fruta`, `grao`, `agua_limpa`, `carne_crua`, `peixe_cru`, `couro`, `sal`.
- Processados: `lingote_ferro`, `aco`, `papel`, `polvora`, `farinha`, `lenha`, `caldo`, `tempero`, `tinta_de_selo`.
- Raros: `minerio_raro` (**Minério Raro**) e `madeira_reforcada` (**Madeira Reforçada**).

`minerio_raro` só sai de mineração e `madeira_reforcada` só sai de coleta natural. Eles não devem ser vendidos a NPC; são material de obra de nível alto, Lâmina de Chakra, Pergaminho de Arsenal e futuras receitas especiais.

### 4.2 Comandos e validações

Adicionar o comando de RP solicitado, no formato:

```text
/acao minerar
/acao coletar
/acao cacar
/acao pescar
/acao coletar-agua
```

- Aceitar exclusivamente os seis canais listados na próxima seção.
- Cada ação tem cooldown de **15 minutos por personagem e por tipo de ação**. Não permitir ações paralelas pendentes.
- O bot responde com um embed curto narrativo que pode ser usado no RP e registra canal, vila do jogador, ação, itens e horário.
- Sem uma ordem ativa, a ação dá recursos ao inventário pessoal. O jogador pode movê-los para a vila pelo botão `Doar` de `/vila`; isso mantém escolha e comércio entre jogadores.
- Cada doação incrementa estatísticas semanais da vila. Painel deve mostrar principais contribuidores sem transformar isso em recompensa de Ryō automática.
- Não usar os comandos de combate/mapa como requisito: a coleta acontece nos chats de RP e não pode bloquear uma missão ou combate ativo.

### 4.2.1 Ordens de coleta da vila

O Kage não pode retirar recursos de outro jogador nem forçá-lo a minerar. Ele organiza o abastecimento pelo painel `/vila` → `Estoque` → `Ordens de coleta` → `Criar ordem`.

Na criação, o embed permite selecionar: recurso solicitado, quantidade-meta, recompensa por unidade, orçamento máximo, prazo (de 1 hora a 7 dias) e público. Há dois públicos:

- **Aberta para a vila:** o bot publica um embed no canal configurado da mansão/avisos da vila, com meta, recompensa, prazo e botão `Aceitar ordem`. Não é necessário mencionar todos os membros da vila; evitar `@everyone` e cargos em massa.
- **Convite a ninja:** o Kage escolhe um usuário em `UserSelectMenu`. O bot valida que ele possui personagem da mesma vila e envia uma mensagem/DM com menção ao usuário e botões `Aceitar` e `Recusar`. A menção é somente a esse usuário e não o obriga a participar. Se a DM falhar, registrar o convite no painel e permitir que ele o veja em `/vila`.

Ao criar a ordem, reservar do cofre o orçamento máximo de recompensa. Portanto, o Kage não consegue prometer mais Ryō do que a vila possui, e esse Ryō não pode ser sacado nem usado em outra ordem. Cancelar uma ordem só devolve a parte ainda não paga; materiais já entregues continuam no estoque e pagamentos concluídos não são revertidos.

Um ninja pode ter apenas uma ordem aceita por vez. Ao aceitar, ele vê uma confirmação clara de que os próximos recursos-alvo serão enviados automaticamente à vila. Enquanto ela estiver ativa, uma ação válida nos canais de RP que gerar **o recurso exato pedido** não coloca esse item no inventário pessoal: ele vai diretamente para o estoque central da vila, incrementa a contribuição do ninja e paga `quantidade × recompensa por unidade` a partir da reserva. Recursos diferentes, excedente após a meta, falha/cancelamento da ordem e itens raros (`minerio_raro`, `madeira_reforcada`) continuam indo ao inventário pessoal. Itens raros só podem ser doados manualmente, nunca capturados automaticamente por uma ordem.

Antes de cada confirmação, a transação deve revalidar ordem ativa, prazo, vaga de quantidade, reserva e personagem/vila do participante. Atualizar estoque, reserva, saldo do ninja, progresso e `EconomyLedger` na mesma transação. Ao atingir a meta, esgotar orçamento ou passar o prazo, fechar uma única vez a ordem, devolver a reserva restante ao cofre e editar o anúncio para `Concluída`/`Encerrada`. O histórico deve registrar criador, participante, recurso, quantidades, valor pago, cancelamento e motivo.

### 4.3 Canais e distribuição

| Área | ID | Ações permitidas | Recursos principais |
|---|---:|---|---|
| Deserto | `1516428050063954152` | coletar, caçar | fibra vegetal, fruta do deserto, argila, sal, carne crua, couro |
| Campo Aberto | `1522249926845923339` | coletar, caçar | madeira, fibra, grão, fruta, ervas, carne, couro |
| Rio | `1515881122179842113` | pescar, coletar-agua, coletar | peixe cru, água limpa, argila, fibra, ervas |
| Floresta | `1515881109878214746` | coletar, caçar | madeira, fruta, ervas, fibra, carne, couro |
| Montanha | `1515881137170546852` | minerar, coletar, caçar | pedra, minério de ferro, carvão, ervas, carne, couro |
| Caverna | `1521879431168131132` | minerar, coletar-agua | pedra, minério de ferro, carvão, argila, água limpa |

Os IDs de deserto, campo, rio, floresta e caverna já existem em `src/data/scenarios/index.ts`. O ID de Montanha está no requisito, mas não existe ainda entre os cenários do código: criar uma constante de canal/configuração de coleta sem forçar um mapa de combate novo nesta entrega.

Recompensa por ação: 3–7 unidades distribuídas entre os recursos daquela tabela; caça/pesca concede 2–5 carne/peixe e 0–2 couro/fibra. O objetivo é que coleta abasteça craft e vila, não ultrapasse uma missão como fonte de Ryō.

Chances raras, fixas e sem bônus de nível:

- `minerar`: **5%** por ação de obter exatamente 1 Minério Raro.
- `coletar`: **5%** por ação de obter exatamente 1 Madeira Reforçada.

Não mostrar “quase ganhou” e não permitir aumentar essas chances por obra. A melhoria de vila pode aumentar materiais comuns, nunca os raros.

## 5. Craft, ferramentas e alimentos

### 5.1 Limite entre craft pessoal e produção da vila

O comando pessoal `/craft` existe somente para o básico. Seu embed `listar` deve mostrar apenas essas receitas e nunca permitir que o jogador escolha manualmente uma receita avançada por `customId`, texto ou comando forjado.

| Onde é produzido | Receitas permitidas | Como o jogador obtém o resultado |
|---|---|---|
| **`/craft` pessoal** | Lingote de Ferro, Papel, Farinha, Lenha; Kunai, Shuriken e Senbon; Pão | Consome o inventário do próprio jogador e cria o item imediatamente. |
| **Fundição Ninja da própria vila** | Aço, Pólvora, Fūma Shuriken, Papel Bomba, Bomba de Fumaça, Fios de Aço Ninja, Kunai Explosiva, Katana e Lâmina de Chakra | Kage/staff produz com o estoque da Fundição; jogadores obtêm o produto comprando-o em `/loja`. |
| **Ichiraku da própria vila** | Caldo, Tempero, Carne Cozida, Peixe Cozido, Ensopado, Dango e Lámen | Kage/staff produz com o estoque do Ichiraku; jogadores compram o alimento pronto em `/loja`. |
| **Oficina de Selos da própria vila** | Tinta de Selo e Pergaminho de Arsenal | Kage/staff produz com o estoque da Oficina; Pergaminho respeita o limite semanal de três. |

“Própria vila” significa a estrutura ativa ligada à vila do personagem e seu centro comercial configurado. O jogador ainda pode coletar materiais por conta própria, mas para transformar recursos em produto avançado precisa vendê-los à loja, entregá-los por ordem de coleta/doação ou comprar o produto final quando estiver em estoque. Isso mantém coleta individual útil sem permitir que ela substitua por completo a economia da vila.

Não criar botão de “craft avançado pessoal” dentro de `/loja` nesta versão. A produção municipal é uma ação de gestão do Kage/staff, auditada, que consome `VillageShopStock`; o jogador comum usa somente `Comprar`, `Vender materiais` e `Estoque` na loja.

### 5.2 Craft das armas e ferramentas existentes

O craft consome materiais e cria somente os IDs de item já existentes. O preço NPC oferece conveniência; craft reduz Ryō, mas exige tempo/coleta.

| Resultado | Receita inicial |
|---|---|
| Kunai | 1 Lingote de Ferro + 1 Madeira + 1 Couro |
| Shuriken | 1 Lingote de Ferro + 1 Carvão |
| Senbon (3) | 1 Lingote de Ferro |
| Fūma Shuriken | 4 Lingotes de Ferro + 2 Madeira Reforçada + 1 Couro |
| Papel Bomba | 2 Papel + 1 Pólvora + 1 Fibra Vegetal |
| Bomba de Fumaça | 1 Argila + 1 Pólvora + 1 Fibra Vegetal |
| Fios de Aço Ninja | 2 Aço + 1 Fibra Vegetal |
| Kunai Explosiva | manter a combinação atual: 1 Kunai + 1 Papel Bomba |
| Katana | 8 Aço + 2 Madeira Reforçada + 2 Couro |
| Lâmina de Chakra | 12 Aço + 2 Minério Raro + 1 Papel + 3 Ervas Medicinais |
| Pergaminho de Arsenal | **somente Oficina de Selos:** 8 Papel + 2 Tintas de Selo + 1 Madeira Reforçada + 1 Erva Medicinal |

Processamento pessoal, sem custo de Ryō: 2 Minério de Ferro + 1 Carvão → 1 Lingote; 3 Fibra → 1 Papel; 2 Grãos → 1 Farinha; 2 Madeira → 1 Lenha. Processamento municipal: 2 Lingotes + 1 Carvão → 1 Aço; Pólvora: 1 Carvão + 1 Sal + 1 Fibra; Tinta de Selo: 1 Carvão + 1 Erva Medicinal + 1 Água Limpa.

O craft pessoal permitido é instantâneo e feito por `/craft criar receita`. Receitas municipais só aparecem ao Kage/staff na administração da loja adequada e sempre usam o estoque daquela loja. **Pergaminho de Arsenal não aparece no craft pessoal:** só pode ser produzido pela Oficina de Selos, pelo Kage/staff, usando estoque da vila e limite semanal. Não adicionar durabilidade de armas agora: armas de arremesso já são consumidas pelo combate e katana/lâmina não possuem sistema de desgaste.

### 5.3 Fome e alimentos

Adicionar `saciedade` de 0 a 100 ao estado do personagem, inicial 100. Criar `/comer item [quantidade]`; ele consome o item fora de combate e aumenta saciedade até o máximo. Por enquanto **não implementar queda de fome, dano, debuff ou morte por fome**. O campo, o inventário e o consumo ficam prontos para a etapa posterior.

| Tipo | Item | Receita / origem | Acesso | Saciedade |
|---|---|---|---|---:|
| Cru | Carne crua | caça | inventário / `/comer` | 4 |
| Cru | Peixe cru | pesca | inventário / `/comer` | 4 |
| Básico | Fruta | coleta | inventário / `/comer` | 8 |
| Básico | Pão | 2 Farinha + 1 Água Limpa + 1 Lenha | `/craft` pessoal | 16 |
| Preparado | Carne cozida | Carne crua + Lenha + Sal | Ichiraku | 18 |
| Preparado | Peixe cozido | Peixe cru + Lenha + Sal | Ichiraku | 16 |
| Preparado | Ensopado | Carne crua + Fruta + Água Limpa + Lenha | Ichiraku | 25 |
| Craft avançado | Lámen | 1 Farinha + 1 Caldo + 1 Carne crua **ou** Peixe cru + 1 Água Limpa + 1 Tempero | Ichiraku | 40 |
| Craft avançado | Dango | 2 Farinha + 1 Fruta | Ichiraku | 22 |

`Caldo` é 1 Carne crua + 1 Água Limpa + 1 Lenha; `Tempero` é 1 Erva Medicinal + 1 Sal. Esta é a **única receita canônica de Lámen** e deve ser usada pelo catálogo e pelo Ichiraku; ela não pertence ao `/craft` pessoal. Alimentos preparados podem ser vendidos por NPC com preço afetado pela taxa; matéria-prima e craft mantêm a economia de recursos útil.

## 6. Evolução de vila

Cada vila começa com os quatro setores no nível 0 e o **Centro da Vila** no nível 1. Existe uma fila global de obras: no começo, a vila só pode construir ou evoluir **uma coisa por vez**, independentemente de ser setor, Ichiraku ou o próprio Centro. Nunca é permitido empilhar dois níveis no mesmo prédio.

### 6.1 Centro da Vila e limite global de obras

O Centro representa a capacidade administrativa e de trabalhadores da vila. Ele não gera recursos; seu valor é permitir mais obras simultâneas e reduzir o componente em Ryō da manutenção semanal. Começa no nível 1 gratuitamente e não pode ser demolido.

| Nível do Centro | Obras simultâneas máximas | Redução no Ryō de manutenção |
|---:|---:|---:|
| 1 (inicial) | 1 | 0% |
| 2 | 2 | 10% |
| 3 | 3 | 20% |

Para passar de nível 1 para 2: 5.000 Ryō, 300 Madeira, 260 Pedra e 100 Minério de Ferro; duração base de 3 dias. Para passar de nível 2 para 3: 11.000 Ryō, 650 Madeira, 550 Pedra e 220 Minério de Ferro; duração base de 10 dias. Aplicar o mesmo fator de população, congelado no início, aos custos de Ryō e materiais do Centro.

Uma melhoria do próprio Centro ocupa uma vaga da fila enquanto está em `CONSTRUINDO`; a nova vaga só é liberada quando ela termina. Exemplo: no Centro nível 1, iniciar sua evolução ocupa a única vaga; ao terminar no nível 2, passam a existir duas vagas. Em nível 3, há no máximo três obras simultâneas no total. A contagem inclui evolução de setor, construção do Ichiraku e evolução do Centro, mas não inclui pagamento de manutenção. Empório, Marcenaria, Fundição Ninja e Oficina de Selos já existem e nunca ocupam vaga de construção.

Ao iniciar qualquer obra, contar no banco todas as obras `CONSTRUINDO` daquela vila, inclusive as de loja, e bloquear de forma atômica se o total já for igual à capacidade atual. Uma obra concluída, cancelada ou vencida libera a vaga apenas uma vez. Se o Centro estiver `NECESSITA_REFORMA`, não cancelar obras já iniciadas, mas limitar novos inícios a uma vaga até a reforma ser paga e suspender seu desconto de manutenção.

Setores iniciais:

1. **Criação e Hortas** — produção diária de carne, grão, frutas e couro; melhora levemente o resultado de caça.
2. **Minas e Fundições** — produção diária de pedra, minério de ferro e carvão; aumenta materiais comuns de mineração.
3. **Silvicultura e Coleta** — produção diária de madeira, fibra, ervas e frutas; aumenta materiais comuns de coleta natural.
4. **Poços e Reservatórios** — produção diária de Água Limpa; aumenta apenas a quantidade de Água Limpa obtida em `/acao coletar-agua`.

Produção passiva é depositada uma vez por dia no **estoque da vila**, não no inventário do Kage. O Kage pode abrir retirada de estoque para ninjas, vender o excedente a NPC ou reservar para obra. Nunca gerar Minério Raro ou Madeira Reforçada passivamente.

### 6.2 População ativa e justiça entre vilas

Definição de população ativa: personagens únicos da vila que, nos últimos 14 dias, concluíram uma missão, fizeram coleta válida, craftaram, comeram, compraram/venderam ou doaram à vila. Não contar bots, contas com cargo sem personagem ou múltiplas ações do mesmo jogador.

Usar `N = max(1, ativos_14d)` e:

```text
fator de população = limitar entre 0,30 e 1,50 (N / 20)
custo da obra/manutenção = arredondar para cima(custo-base × fator)
produção diária = arredondar para cima(produção-base × fator)
```

Isso conserva quase o mesmo esforço por jogador entre vilas com 6, 20 ou 30 ativos. A trava mínima impede custo/produção irrisórios para vilas quase vazias; a máxima evita que Konoha escale sem limite. Exibir no painel os ativos, fator e data da última apuração. Recalcular diariamente à 00:05 no fuso configurado, e congelar o fator quando uma obra é iniciada para que seu custo não mude no meio.

### 6.3 Custos, duração e resultado

Custos abaixo são **por setor**, antes do fator populacional. Toda obra consome Ryō do cofre e materiais do estoque quando inicia; não há reembolso automático ao cancelar. A duração é real (job agendado), mesmo se o bot reiniciar.

| Próximo nível | Ryō | Madeira | Pedra | Ferro | Tempo |
|---|---:|---:|---:|---:|---:|
| 1 | 1.200 | 80 | 80 | 20 | 3 horas |
| 2 | 2.100 | 140 | 130 | 40 | 1 dia |
| 3 | 3.600 | 240 | 220 | 70 | 3 dias |
| 4 | 5.800 | 380 | 350 | 120 | 7 dias |
| 5 | 9.000 | 600 | 550 | 200 | 15 dias |

Materiais específicos, adicionais ao custo comum:

| Setor | Níveis 1–4 | Nível 5 |
|---|---|---|
| Criação e Hortas | 30/60/100/150 Grão + 15/25/40/60 Couro | 240 Grão + 100 Couro + 80 Água Limpa |
| Minas e Fundições | 25/45/75/120 Carvão | 180 Carvão + 1 Minério Raro |
| Silvicultura e Coleta | 25/45/75/120 Fibra Vegetal | 180 Fibra Vegetal + 1 Madeira Reforçada |
| Poços e Reservatórios | 20/40/70/110 Argila + 10/18/30/45 Fibra Vegetal | 170 Argila + 75 Fibra Vegetal |

Produção-base diária por setor, antes do fator de população:

| Nível | Criação e Hortas | Minas e Fundições | Silvicultura e Coleta | Poços e Reservatórios |
|---|---|---|---|---|
| 0 | nenhuma | nenhuma | nenhuma | nenhuma |
| 1 | 8 carne, 4 grão, 2 couro | 10 pedra, 4 ferro, 3 carvão | 10 madeira, 6 fibra, 3 fruta | 10 água limpa |
| 2 | 14 carne, 8 grão, 4 couro | 18 pedra, 8 ferro, 6 carvão | 18 madeira, 11 fibra, 5 fruta/erva | 18 água limpa |
| 3 | 22 carne, 13 grão, 6 couro | 28 pedra, 13 ferro, 10 carvão | 28 madeira, 17 fibra, 8 fruta/erva | 28 água limpa |
| 4 | 32 carne, 19 grão, 9 couro | 40 pedra, 20 ferro, 15 carvão | 40 madeira, 25 fibra, 12 fruta/erva | 40 água limpa |
| 5 | 45 carne, 28 grão, 13 couro | 55 pedra, 30 ferro, 22 carvão | 55 madeira, 35 fibra, 17 fruta/erva | 55 água limpa |

Nos níveis 2–5, o setor também dá +5% por nível apenas na quantidade de recursos **comuns** coletados pelo ninja em sua ação correspondente, até +20%. Criação afeta caça, Minas afeta mineração, Silvicultura afeta coleta natural e Poços afeta somente Água Limpa em `/acao coletar-agua`. Essa bonificação é da vila do jogador, independente de onde ele coleta, e não altera cooldown, recursos raros ou as chances de caça/pesca.

Cada setor completo exige 26 dias e 3 horas de trabalho de construção. A vila começa com apenas uma vaga e precisa investir no Centro para ter duas ou três; a fila de quatro setores, Centro e Ichiraku torna as obras um projeto de muitas semanas, enquanto o acúmulo dos custos e materiais mantém a vila máxima como objetivo de meses. Com 10 ativos, os quatro setores custam cerca de 43.400 Ryō e o Centro nível 3 adiciona cerca de 8.000 Ryō, antes do Ichiraku e recursos (fator 0,5). Pelas receitas médias e imposto padrão, a arrecadação de missão de 10 jogadores médios é cerca de 4.300 Ryō/mês antes de comércio: o progresso exige priorização, mas não décadas. Com 20 ativos o custo e a arrecadação dobram de modo proporcional.

### 6.4 Manutenção e reforma semanal

Às segundas 00:15, cada setor nível 1+, Ichiraku ativo e Centro nível 2+ cobra reforma. O custo semanal é calculado sobre a soma dos custos-base já investidos naquela construção. Empório, Marcenaria, Fundição Ninja e Oficina de Selos são infraestrutura inicial e ficam isentos de manutenção nesta primeira versão.

```text
Ryō de manutenção = teto(3% × custo-base acumulado × fator congelado da semana × desconto do Centro)
cada material usado = teto(1% × total acumulado daquele material × fator)
desconto do Centro = 1,00 no nível 1; 0,90 no nível 2; 0,80 no nível 3
```

O desconto do Centro afeta somente Ryō, nunca materiais, custo de obra ou preço da loja. Ele é consultado no momento de gerar a cobrança e não reduz pendências já criadas. Exemplo: um setor nível 3 com fator 0,5 paga por volta de 104 Ryō semanais no Centro nível 1, 94 no nível 2 ou 84 no nível 3, além de pequenas quantidades de materiais. A cobrança é intencionalmente bem menor que uma obra, mas cresce com nível.

- Prazo de graça: 72 h após a cobrança.
- Se não houver saldo/estoque: a construção fica `NECESSITA_REFORMA`; setor suspende produção passiva e bônus de coleta, Ichiraku suspende compra/venda/produção, e Centro suspende desconto e novas vagas além da primeira. O nível nunca é perdido.
- Ao pagar a reforma pendente, reativar na hora. Não cobrar juros nem acumular várias semanas: uma pendência representa a reforma em atraso.
- Obras não podem começar com reforma pendente no prédio que será melhorado; uma loja em reforma não pode operar.

## 7. Lojas de vila e interface Discord

### 7.1 Onde `/loja` funciona

`/loja` só deve abrir nos canais comerciais da vila. Isso dá identidade a cada local e evita que o menu apareça em combate, mansões ou mundo aberto. As cinco vilas têm canal comercial confirmado:

| Vila | Canal comercial | ID |
|---|---|---:|
| Konoha | Centro Comercial de Konoha | `1516183249712582657` |
| Suna | Centro Comercial de Sunagakure | `1523372488292302958` |
| Kiri | Centro Comercial de Kirigakure | `1523372437398487151` |
| Kumo | Centro Comercial de Kumogakure | `1523372472223793254` |
| Iwa | Centro Comercial de Iwagakure | `1523372453403955281` |

Os três primeiros já existem como constante em `src/data/scenarios/index.ts`. **Kumo e Iwa foram informados pela staff em 2026-08-11 e ainda não estão no código** — a etapa 05 deve criar `VILLAGE_MARKET_CHANNELS` em configuração com os cinco. Com todos preenchidos, não há mais vila em estado “mercado ainda não configurado”; se algum dia um canal for removido, `/loja` naquela vila responde de forma efêmera avisando disso, sem direcionar o jogador para Konoha.

O usuário pode comprar e vender apenas no mercado da sua própria vila. Um futuro sistema de viagem/comércio entre vilas pode abrir exceções, mas não faz parte desta versão.

### 7.2 Tipos de loja e disponibilidade

Cada vila recebe o **Mercado Geral** gratuitamente. Ele é um NPC externo para emergências: tem uma seleção diária pequena, cara e variável de matérias-primas, além de recompra de emergência. Não produz equipamento, não usa estoque municipal e não gera receita para o cofre; a compra normal é um sumidouro de Ryō, como definido na seção 3.

Cada vila já começa com **Empório de Alimentos**, **Marcenaria**, **Fundição Ninja** e **Oficina de Selos** ativas, com estoque vazio. São instalações históricas da vila: não têm custo/tempo de construção, não ocupam vaga do Centro e, nesta primeira versão, não cobram manutenção semanal. O Kage pode administrá-las desde o início.

Somente o **Ichiraku — Casa de Lámen** é construível. Ele começa `BLOQUEADO`; sua obra usa cofre e estoque da vila, ocupa uma vaga global do Centro e fica `CONSTRUINDO` por 5 dias. Antes de ficar `ATIVA`, não recebe, vende nem produz itens. Aplicar o mesmo fator de população das obras da vila aos custos do Ichiraku e congelá-lo no início.

| Loja | Situação inicial | Função | Custo / construção |
|---|---|---|---:|
| Empório de Alimentos | ativa | frutas, carne/peixe crus, grão, farinha, água e compra/revenda de ingredientes básicos | já existente |
| Marcenaria | ativa | madeira, papel, lenha, fibra e compra/processamento de recursos naturais | já existente |
| Fundição Ninja | ativa | lingotes, aço e craft/venda das armas e ferramentas já existentes | já existente |
| Ichiraku — Casa de Lámen | bloqueada | lámen, ensopado, dango, caldo e compra dos ingredientes da cozinha | 7.500 Ryō, 300 madeira, 180 pedra, 160 grão; 5 dias |
| Oficina de Selos | ativa | Tinta de Selo e Pergaminho de Arsenal, sem criar novas armas | já existente |

Não há loja de armas nova: a Fundição comercializa e produz somente `kunai`, `shuriken`, `fuma_shuriken`, `senbon`, `papel_bomba`, `bomba_fumaca`, `fios_aco_ninja`, `katana`, `lamina_chakra` e combinações já especificadas. A loja é um prédio econômico; ela não cria uma arma além da lista do bot.

Cada loja possui capacidade fixa de estoque de 500 unidades totais. Não implementar nível, evolução de loja, melhoria de capacidade ou limite diário adicional nesta economia.

### 7.2.1 Mercado Geral: emergência, rotação e escassez

O Mercado Geral **não possui estoque infinito** e não pode ser a fonte normal de recursos. Às 00:05 de cada dia em `America/Sao_Paulo`, gerar e persistir para cada vila exatamente **quatro ofertas diferentes**, válidas até a próxima virada. O bot não pode rerrolar a seleção em reinício: se já existe oferta para `vila + dayKey`, ele a reutiliza.

Cada oferta nasce com quantidade compartilhada proporcional à população ativa de 14 dias da vila, congelada quando a oferta diária é criada:

```text
quantidade inicial por oferta = limitar entre 10 e 60(teto(2 × ativos_14d))
```

Portanto, vila com 6 ativos recebe 12 unidades por oferta; com 20 ativos, 40; com 30 ou mais, 60. Isso mantém o Mercado Geral limitado, mas não deixa Konoha e uma vila pequena disputarem o mesmo estoque absoluto. Ao chegar a zero, aparece como esgotada e não pode ser comprada até o próximo dia. O jogador vê no embed `restante/quantidade inicial`, a hora do próximo reabastecimento e que é um NPC de emergência. Compra simultânea deve reduzir o estoque com atualização condicional/transação, sem vender a mesma unidade duas vezes.

Sortear sem repetição, com peso:

| Grupo | Itens elegíveis | Peso por item |
|---|---|---:|
| Comum | Madeira, Pedra, Fibra Vegetal, Água Limpa | 100 |
| Menos comum | Minério de Ferro, Carvão, Argila, Grão, Couro | 55 |
| Difícil | Erva Medicinal | 20 |

Nunca oferecer Minério Raro, Madeira Reforçada, equipamentos, comida preparada, Pergaminho de Arsenal ou materiais processados (Lingote, Aço, Papel, Pólvora, Farinha, Lenha, Caldo, Tempero e Tinta). Assim, um item difícil pode aparecer, mas aparece muito menos vezes que madeira ou pedra.

O preço do Mercado Geral é sempre `teto(shopBuyBase × 2,0 × (1 + imposto atual))`. Portanto é intencionalmente mais caro que o preço de varejo da loja municipal da mesma vila. O Mercado Geral continua recomprando recursos comuns por 30% do valor de referência, sem imposto e sem tocar o cofre, mas não compra raros.

A Oficina de Selos tem uma regra adicional de escassez: pode produzir no máximo **3 Pergaminhos de Arsenal por vila e por competência semanal**. A contagem reseta junto da abertura da competência semanal de domingo às 22:00, é persistida no banco e não pode ser contornada por reinício, troca de Kage ou construção de segunda oficina (há somente uma Oficina por vila). Cada produção consome a receita completa e uma Madeira Reforçada; não há produção passiva, compra de Minério Raro ou atalho administrativo sem lançamento explícito.

### 7.3 Estoque central, estoque da loja e valor de entrega

Há três inventários distintos, que nunca podem ser confundidos:

1. **Inventário pessoal**: itens pertencem ao personagem.
2. **Estoque central da vila**: materiais doados e produção passiva; usados em obras/manutenção.
3. **Estoque da loja**: ingredientes e produtos prontos disponíveis naquele estabelecimento.

O valor de itens não pode ser criado ao simplesmente transferi-los entre os dois estoques da vila. Portanto:

- Quando o jogador usa a loja para **vender ingrediente**, ela compra do inventário pessoal, paga Ryō ao jogador e move o item para o estoque daquela loja. Esse é o caso em que o jogador “recebe o valor dos recursos enviados à loja”.
- Quando Kage/staff **abastece uma loja** usando o estoque central, só transfere estoque central → estoque da loja. Não recebe Ryō pessoalmente; caso contrário seria possível esvaziar o cofre para o Kage através de uma loja.
- Quando a loja **produz** um alimento ou ferramenta, consome ingredientes do estoque da própria loja e cria produto no mesmo estoque. Para o atalho administrativo pedido, permitir também `Produzir com estoque central`: a transação move os ingredientes necessários do estoque central e deposita somente o produto pronto na loja, com log completo.
- Quando um jogador compra produto de uma loja municipal, o produto sai do estoque da loja e todo o Ryō pago sai da circulação. Não creditar cofre, nem como receita-base nem como imposto; isso evita duplicação e mantém a venda comum separada da arrecadação da vila.
- O Mercado Geral não tem estoque municipal. Sua compra/venda continua sendo com NPC externo e também não altera o cofre.
- A loja municipal gera entrada para o cofre apenas quando o Kage aceita um **Contrato de Empreendedor NPC**: um comprador atacadista leva um lote de itens prontos do estoque da loja e paga o valor atacadista diretamente ao cofre. O contrato é uma ação administrativa auditada, tem limite diário e nunca é disparado por uma compra normal de jogador.

Assim, recursos têm valor de compra, produtos têm valor de venda e não há conversão gratuita de madeira/carne em Ryō. O painel sempre deve mostrar “valor estimado do estoque” apenas como informação; esse valor não é saldo sacável.

### 7.3.1 Varejo obrigatório das lojas municipais

Toda loja municipal deve realmente vender ao jogador os itens abaixo **quando houver estoque físico nela**. Kage/staff abastece pelo botão `Abastecer`, movendo os itens do estoque central para a loja; o jogador compra por `/loja` → `Comprar`. Não deixar o botão `Comprar` desativado só porque a loja não fabrica o item: Marcenaria e Empório também são balcões de varejo.

| Loja | Itens que pode vender | `retailBase` por unidade antes do imposto |
|---|---|---|
| Empório | Fruta, Carne Crua, Peixe Cru, Grão, Farinha, Água Limpa, Erva Medicinal, Pão | 10, 12, 11, 8, 14, 5, 11, 14 |
| Marcenaria | Madeira, Fibra Vegetal, Papel, Lenha | 8, 7, 10, 6 |
| Fundição Ninja | Minério de Ferro, Pedra, Carvão, Argila, Lingote de Ferro, Aço, Pólvora; e os equipamentos já definidos | 18, 5, 9, 8, 30, 55, 25; equipamentos usam os valores da seção 3 |
| Ichiraku | Carne Cozida, Peixe Cozido, Dango, Ensopado, Lámen | 18, 16, 30, 35, 48 |
| Oficina de Selos | Papel, Tinta de Selo, Pergaminho de Arsenal | 10, 24, 300 |

O preço final continua sendo `teto(retailBase × (1 + imposto atual))`. A loja pode comprar uma matéria-prima do jogador por `shopBuyBase` menor e revendê-la mais cara **somente se ela estiver no seu estoque real**; essa margem é a conveniência de mercado e o Ryō da venda normal continua sendo sumidouro, não receita do cofre. Não criar produto ou Ryō ao transferir central → loja.

O catálogo de `Comprar` deve listar apenas itens permitidos para aquela loja com `quantidade > 0`; se não houver nenhum, mostrar “sem estoque para venda” e manter o botão desativado. O catálogo de `Abastecer` do Kage só permite ingredientes de receitas daquela loja e itens vendáveis nela, evitando estoque que não pode ser usado nem vendido.

### 7.4 Preços de compra e margem das lojas

Cada ingrediente recebe `shopBuyBase`, definido em dados estáticos. A loja paga o vendedor:

```text
preço recebido pelo jogador = piso(shopBuyBase × (1 − taxa de imposto atual))
```

O imposto de abastecimento é retenção pequena de serviço. A taxa nunca é escolhida item por item pelo Kage. Se o resultado for 0, a loja não oferece compra daquele item; não usar “pagar 0 Ryō” silenciosamente.

Tabela inicial sugerida, por unidade:

| Item enviado à loja | Loja que aceita | `shopBuyBase` | Com 5% de imposto |
|---|---|---:|---:|
| Madeira | Marcenaria | 5 | 4 |
| Fibra Vegetal | Marcenaria / Empório | 4 | 3 |
| Fruta | Empório / Ichiraku | 8 | 7 |
| Erva Medicinal | Empório / Ichiraku | 7 | 6 |
| Minério de Ferro | Fundição | 12 | 11 |
| Pedra | Fundição | 3 | 2 |
| Carvão | Fundição / Ichiraku | 6 | 5 |
| Argila | Fundição | 5 | 4 |
| Carne crua | Empório / Ichiraku | 9 | 8 |
| Peixe cru | Empório / Ichiraku | 8 | 7 |
| Couro | Empório / Fundição | 7 | 6 |
| Grão | Empório / Ichiraku | 5 | 4 |
| Água Limpa | Empório / Ichiraku | 3 | 2 |
| Farinha | Empório / Ichiraku | 10 | 9 |
| Caldo | Ichiraku | 14 | 13 |
| Tempero | Ichiraku | 8 | 7 |
| Papel | Marcenaria / Oficina de Selos | 6 | 5 |
| Tinta de Selo | Oficina de Selos | 12 | 11 |

Não adicionar `ovo` nem `macarrao`: eles pertenciam a uma receita descartada. Farinha, Caldo e Tempero já são derivados das receitas de alimento desta especificação. Materiais raros não são comprados por loja: só entram por doação/transferência administrativa e obras/receitas especiais. Portanto, Madeira Reforçada destinada à Oficina de Selos precisa ser doada ao estoque central e abastecida pelo Kage; ela nunca é comprada automaticamente pela oficina.

Para impedir que uma vila de cofre baixo compre infinitamente recursos, cada loja tem orçamento diário de aquisição igual a `500 × fator de população` Ryō, e não pode pagar além do Ryō livre no cofre. A interface deve mostrar o orçamento restante. A venda do jogador falha de maneira clara se o orçamento, a capacidade ou o cofre forem insuficientes.

Além do orçamento, o NPC de cada loja municipal compra apenas uma **seleção diária rotativa** de matérias-primas: entre 2 e 4 tipos, conforme os ninjas ativos da vila, e cada tipo tem uma cota compartilhada de `limitar(12, 80, teto(3 × ativos))` unidades. A seleção e a cota são congeladas por vila, loja e dia; reiniciar o bot não rerrola, e duas vendas simultâneas não ultrapassam o restante. O painel `/loja` mostra `cota restante/inicial` e não deixa selecionar material fora da seleção do dia ou já esgotado.

Preço de varejo é o `retailBase` global da seção 3 aplicado à taxa. Para produtos de loja sem preço anterior, usar inicialmente: carne cozida 18, peixe cozido 16, pão 14, dango 30, ensopado 35 e lámen 48 Ryō. Com imposto de 5%, um Lámen custa 51 Ryō. O custo exibido no painel deve ser calculado dinamicamente a partir dos ingredientes e do preço de compra atual, nunca um número fixo escrito no embed.

Receita obrigatória da Casa de Lámen:

```text
1 Lámen = 1 Farinha + 1 Caldo + 1 Carne crua OU 1 Peixe cru + 1 Água Limpa + 1 Tempero
```

Ao produzir 1 Lámen, os ingredientes saem do estoque escolhido (loja ou central, conforme a ação) e 1 `lamen` entra no estoque do Ichiraku. Produzir não dá Ryō; venda comum ao jogador também não muda o cofre. O cofre recebe somente se o Kage vender lote pronto em Contrato de Empreendedor NPC. Mostrar no embed custo estimado, preço atual e margem estimada, mas não permitir editar nenhum deles pelo painel do Kage.

Na Oficina de Selos, o painel `Produzir` mostra `Pergaminho de Arsenal (0/3 nesta semana)`. Ao selecionar, o embed exibe a receita, a Madeira Reforçada disponível e o próximo reset semanal; só então libera confirmação. O pergaminho pronto entra no estoque da Oficina, é comprado por jogador pelo `retailBase` de 300 Ryō mais a taxa atual e permanece compatível com o fluxo existente de `pergaminho_arsenal_gasto` e restauração por 150 Ryō.

### 7.5 Fluxo de `/loja` com embeds, botões e modais

Implementar a interação como uma mensagem efêmera por usuário, iniciada por `/loja`. Mensagens efêmeras evitam que jogadores disputem os botões do mesmo painel e não poluem o chat de RP. Todo clique edita a mesma resposta (`interaction.update`); não enviar um novo embed para cada tela. Logs econômicos e anúncios de obra continuam públicos na mansão, mas a navegação é privada.

Tela inicial sugerida:

```text
Embed: 🏪 Mercado de [Nome da Vila]
Descrição: Centro Comercial de [Vila] • Imposto atual: 5% • Cofre: 8.420 Ryō
Campos:
- Mercado Geral — aberto
- Empório de Alimentos — aberto
- Marcenaria — aberto
- Fundição Ninja — aberto
- Ichiraku — Casa de Lámen — aberto / bloqueado / construindo
- Oficina de Selos — aberto
Rodapé: Escolha uma loja abaixo. Os preços já incluem o imposto da vila.

Componentes, linha 1:
[Select: Escolha uma loja — Mercado Geral / Alimentos / Marcenaria / Fundição / Ichiraku / Oficina de Selos]
Componentes, linha 2:
[Atualizar] [Fechar]
```

Como há seis lojas, a primeira linha usa `StringSelectMenu`; botões comportam no máximo cinco opções por linha. A única loja bloqueada nesta versão é o Ichiraku; ao selecioná-lo, mostrar custo/tempo e informar ao jogador que o Kage precisa construí-lo. A administração de lojas não fica em `/loja`: ela é acessada pelo Kage na aba `Comércio` de `/vila`, dentro da mansão.

Ao escolher uma loja, editar o embed, preservando o mesmo painel:

```text
Embed: 🔥 Fundição Ninja — Kumogakure
Descrição: Produtos prontos: 18/500 • Orçamento de compra hoje: 312/500 Ryō
Campos:
- Comprar: Kunai 37 Ryō • Shuriken 24 Ryō • Papel Bomba 58 Ryō
- Vendemos matérias-primas: Minério de Ferro 11 Ryō/un. • Carvão 5 Ryō/un.
- Produção: 6 lingotes, 2 aços, 18 kunai
Rodapé: Preços atualizados pelo imposto de 5%.

Linha 1: [Comprar] [Vender materiais] [Estoque] [Voltar]
Linha 2: [Atualizar] [Fechar]
```

`Comprar` abre um select de produtos disponíveis (até 25 opções); escolher um abre um **modal** com campo obrigatório `quantidade`. `Vender materiais` abre select das matérias que a loja aceita e, após escolha, um modal com `quantidade`. A pessoa não deve escrever a quantidade em mensagem comum: modal evita ambiguidade no RP e garante que o bot receba o dado pela interação.

Validação do modal, antes de qualquer alteração:

- aceitar somente inteiro decimal positivo (`1`, `2`, ...); rejeitar zero, negativo, decimal, texto e notação científica;
- limitar compra à menor quantidade entre solicitado, estoque disponível e `piso(ryoPersonagem / preçoFinal)`;
- limitar venda à menor quantidade entre solicitado, inventário pessoal, espaço da loja, orçamento diário e Ryō livre do cofre;
- se a quantidade for maior que o permitido, não ajustar silenciosamente: mostrar o máximo e pedir confirmação por botão `Confirmar X` / `Cancelar`;
- na confirmação, executar uma única transação Prisma que movimenta item, Ryō, orçamento diário, cofre e livro-caixa;
- responder com recibo efêmero e editar o painel com os novos valores.

Custom IDs devem conter somente versão, ação, vila/loja e um `sessionId` opaco, por exemplo `loja:v1:buy:KONOHA:ichiraku:abc123`. O prefixo precisa ser `loja`, pois o roteador atual despacha componentes pelo nome do comando. Não colocar valor, saldo, preço ou quantidade confiável no custom ID. Ao receber botão/modal, recarregar loja, cofre, personagem e sessão do banco; verificar dono da sessão, expiração (15 min), canal comercial correto, vila do jogador e permissão de Kage. Isso evita clicar em painel velho ou forjar ação por custom ID.

### 7.6 Administração da loja pelo Kage, via `/vila`

A aba `Comércio` do painel `/vila` abre uma tela diferente, somente para Kage/staff autorizado e na mansão correspondente. Ela deve editar o mesmo painel efêmero e oferecer botões claros, não comandos escondidos:

```text
Embed: ⚙️ Administração — Ichiraku
Descrição: Estoque da loja: 12/500 • Estoque central disponível: 36 carnes, 10 farinhas, 8 caldos e 12 temperos
Campos:
- Produzir Lámen: 1 farinha + 1 caldo + 1 carne **ou** peixe + 1 água + 1 tempero → 1 lámen
- Varejo atual: 51 Ryō • custo estimado: calculado pelos insumos • imposto: 5%
- Vendas ao jogador: 4 lámen • Contratos de empreendedor hoje: 0/1

Linha 1: [Abastecer] [Produzir] [Contrato empreendedor] [Retirar produto] [Histórico]
Linha 2: [Voltar à loja] [Fechar]
```

Fluxo exato para abastecimento pedido:

1. Kage clica `Abastecer`.
2. O embed é editado e mostra os itens relevantes. Para o Ichiraku são Farinha, Caldo, Carne, Peixe, Água e Tempero; como são seis, usar select de item em vez de seis botões.
3. Ao clicar em `Carne`, abrir modal “Enviar Carne ao Ichiraku” com campo `quantidade` e texto de máximo disponível no estoque central.
4. Validar inteiro positivo e capacidade. Mostrar confirmação “Enviar 12 Carne: estoque central 36 → 24; Ichiraku 4 → 16”.
5. Ao confirmar, transferir de `VillageStock` para `VillageShopStock` dentro de transação e registrar `SHOP_RESTOCK` no livro-caixa. Voltar ao embed atualizado.

Fluxo de produção de Lámen:

1. Kage clica `Produzir`, depois `[Lámen]`.
2. Modal pede a quantidade. O embed informa, antes e depois do modal, o máximo possível pelos ingredientes e capacidade.
3. Escolher Carne ou Peixe e consumir exatamente `quantidade ×` a receita; por exemplo, para 3 Lámen de carne, retirar 3 farinhas, 3 caldos, 3 carnes, 3 águas e 3 temperos do estoque da loja. Adicionar 3 Lámen ao estoque de produtos.
4. Se o Kage escolheu “usar estoque central” na tela anterior, retirar esses mesmos itens do estoque central e adicionar diretamente os produtos ao Ichiraku. Nunca retirar ingredientes parcialmente.
5. Registrar `SHOP_CRAFT` com receita, insumos, destino e autor. Não creditar Ryō ao Kage.

`Contrato empreendedor` abre os lotes disponíveis para a loja. Exemplo: Ichiraku pode vender 10 Lámen ao Empreendedor NPC por 420 Ryō, no máximo uma vez por dia e apenas se o estoque tiver os 10 itens. Ao confirmar, retirar o lote, creditar exatamente 420 Ryō ao cofre e criar `SHOP_WHOLESALE_CONTRACT`; não aplicar imposto extra nem disparar uma venda comum. `Retirar produto` entrega item da loja ao estoque central, para distribuição/evento, e exige motivo. Não deve entregar diretamente ao Kage; uma retirada ao jogador é uma ação separada já auditada de estoque da vila. `Histórico` mostra no máximo os últimos 10 lançamentos da loja: quem vendeu/abasteceu, quantidade produzida, vendas, contratos e saldo de estoque. Dados pessoais podem ficar resumidos para outros jogadores; Kage e staff veem o detalhe.

### 7.7 Construção do Ichiraku pelo Kage

No painel `/vila`, o Kage possui `Comércio` → `Construir Ichiraku`. Empório, Marcenaria, Fundição e Oficina não aparecem nessa tela, pois já existem. A tela mostra os requisitos e se o cofre/estoque satisfazem, depois abre confirmação em duas etapas:

```text
Confirmar construção do Ichiraku?
Custo: 3.750 Ryō, 150 madeira, 90 pedra, 80 grão e 30 ferro
Fator de população congelado: 0,50 (10 ativos)
Conclusão: [agora + 5 dias]
[Confirmar obra] [Cancelar]
```

Ao confirmar, primeiro reservar atomicamente uma vaga global do Centro e depois deduzir custo do cofre/estoque, criar uma `VillageConstruction` genérica com tipo `SHOP` e chave `ICHIRAKU`, gravar o fator e postar embed público na mansão: “Ichiraku de Konoha iniciado; conclusão prevista em…”. Ao concluir pelo job, liberar a vaga, criar os estoques vazios, deixar a loja em `AWAITING_CHANNEL`, lançar no livro-caixa e executar a criação do canal descrita abaixo; só então ela fica `ATIVA` e o anúncio é postado no centro comercial/mansão. Se o bot estiver desligado na hora, a próxima execução do job deve detectar `concluiEm <= agora` e finalizar uma única vez.

#### Canal de RP do Ichiraku

Na conclusão da obra, antes de marcar o Ichiraku como `ACTIVE`, o bot deve criar um canal de texto com o nome exato **`│・🍜〃﹕𝐈chiraku`**, no mesmo estilo visual dos canais de mansão. O canal pertence à categoria da vila:

| Vila | ID da categoria do Ichiraku |
|---|---:|
| Konoha | `1528608576220954804` |
| Suna | `1528609210663829524` |
| Kiri | `1528610385555361902` |
| Kumo | `1528610721003344013` |
| Iwa | `1528610530930200596` |

Criar uma configuração única `ICHIRAKU_CATEGORY_BY_VILLAGE` com esses IDs. O canal deve ser `GuildText`, ter a categoria como `parent` e sincronizar as permissões dela. Depois de criado, persistir seu ID em `VillageShop.discordChannelId`.

Essa criação precisa ser idempotente: se `discordChannelId` já apontar para um canal existente, reutilizá-lo; se estiver vazio, procurar na categoria um canal com o nome exato antes de criar outro. Só depois de persistir um canal válido, marcar a loja `ACTIVE`. Se faltar permissão de gerenciar canais ou a categoria não existir, deixar a loja em `AWAITING_CHANNEL`, liberar a vaga de obra, registrar/avisar a staff e tentar novamente no boot/job; nunca cobrar de novo nem criar canais duplicados. Staff pode usar `/admin-vila ichiraku canal sincronizar vila motivo` para disparar essa tentativa manualmente.

Após ativo, `/loja` também é aceito no canal do Ichiraku e abre diretamente o painel daquela loja. No centro comercial normal, o Ichiraku continua sendo uma opção do menu. Mesmo se Kumo/Iwa ainda não tiverem centro comercial configurado, o canal de Ichiraku criado passa a ser um local válido para essa loja.

### 7.8 Estruturas e serviços específicos de lojas

Além das entidades da seção 9, acrescentar:

- `VillageShop`: vila, `shopType`, status (`LOCKED | CONSTRUCTING | AWAITING_CHANNEL | ACTIVE | SUSPENDED`), capacidade fixa, orçamento diário, data de reset, `discordChannelId` opcional e timestamps; único por vila + tipo. Não adicionar nível. No seed, criar Empório/Marcenaria/Fundição/Oficina como `ACTIVE` e Ichiraku como `LOCKED`.
- `VillageShopStock`: loja + item, quantidade; separado de `VillageStock`.
- `GeneralMarketOffer`: vila, `dayKey`, item, quantidade inicial/restante e timestamps; único por vila + competência diária + item. É estoque externo rotativo do Mercado Geral, não `VillageStock` nem patrimônio do cofre.
- `VillageConstruction`: modelo único para Centro, setor e Ichiraku; tipo/chave do prédio, nível-alvo quando aplicável, custo/fator congelados, início, conclusão, status e executor. A capacidade da fila deve consultar todas as construções `CONSTRUINDO` deste modelo.
- `VillageShopLedger`: ou subtipo de `VillageLedger`, com `SHOP_BUY_FROM_PLAYER`, `SHOP_SALE_TO_PLAYER` (sem delta no cofre), `SHOP_WHOLESALE_CONTRACT` (entrada no cofre), `SHOP_RESTOCK`, `SHOP_CRAFT`, `SHOP_WITHDRAWAL` e `SHOP_DAILY_RESET`.
- `DiscordUiSession`: dono Discord, guild, canal, vila, loja/tela atual, expira em, dados mínimos. Pode ser uma tabela curta, limpa por job, ou estado assinado em memória + validação integral no banco; para reinícios, tabela é preferível.

Criar um serviço central, por exemplo `src/services/economy/shop-service.ts`, que seja o único lugar a calcular preço, capacidade, orçamento, compra, venda, craft e lançamentos. Os handlers de `/loja`, botões e modais apenas validam interação, chamam o serviço e renderizam embed. Não duplicar fórmula de imposto em cada callback.

## 8. Comandos

### Jogador

```text
/loja
/acao minerar|coletar|cacar|pescar|coletar-agua
/craft listar
/craft criar receita [quantidade]
/comer item [quantidade]
/vila
```

`/loja` é a única interface de comércio nos centros comerciais. A primeira opção é o **Mercado Geral**, seguido de Empório, Marcenaria, Fundição Ninja e Oficina de Selos já ativos; Ichiraku é a única opção municipal inicialmente bloqueada. Não criar `/mercado` nem uma segunda tabela de preço.

`/vila` abre o painel efêmero da vila. Para jogador comum, ele mostra visão geral, estoque público, relatórios próprios e o botão `Doar`; escolher item e quantidade usa select + modal. Não expor saldo de cofre, saques, custo reservado, contadores ocultos de XP ou controles de gestão a jogador comum.

`/inventario` deve passar a mostrar Ryō, saciedade e as categorias de materiais/alimentos que já existem; não substituir os comandos atuais de equipamento (`/equipar`, `/arremessar`, `/usar`, `/dar`).

### Kage

Kage jogador continua usando somente `/vila`; ele não ganha `/admin`, `/admin-vila` nem permissão Discord de administrador. Quando abre o painel na mansão da própria vila, a mesma mensagem efêmera mostra abas de gestão:

```text
Embed: 🏯 Administração de [Vila]
Descrição: Kage: [nome] • Imposto atual: 5% • Cofre disponível: 8.420 Ryō

Linha 1: [Visão Geral] [Cofre] [Estoque] [Obras] [Comércio]
Linha 2: [Impostos] [Relatórios] [Atualizar] [Fechar]
```

- **Visão Geral:** estado da vila, população ativa, obras em andamento e alertas de manutenção.
- **Cofre:** ver saldo, depositar e sacar. `Depositar` move Ryō pessoal do Kage para o cofre por modal de quantidade e confirmação; `Sacar` abre modal de valor + motivo, mostra o limite semanal e pede confirmação. Ambos exibem saldo antes/depois, mas depósito não é saque reversível.
- **Estoque:** listar, retirar para jogador, consultar doações e criar/acompanhar/cancelar Ordens de coleta. Item é escolhido por select e quantidade/destinatário por modal; a retirada entra como `STOCK_WITHDRAWAL`. Uma ordem usa select para recurso e público, `UserSelectMenu` apenas se for convite individual, e modais para meta, recompensa, orçamento e prazo; a criação exige tela final de confirmação.
- **Obras:** mostrar Centro atual, vagas ocupadas/total e fila em andamento; iniciar evolução de setor/Centro, acompanhar cronômetro e pagar reforma. Escolher prédio e nível abre resumo de custo, fator congelado, vagas restantes e botão de confirmação; nunca permitir digitar nível/valor bruto. Ichiraku em construção aparece nessa fila, embora seja iniciado pela aba `Comércio`.
- **Comércio:** construir o Ichiraku, abrir administração de loja, abastecer, produzir e aceitar Contrato de Empreendedor NPC. Essa aba reutiliza os mesmos renderizadores/serviços da loja, sem duplicar regra.
- **Impostos:** mostrar taxa atual e botão `Alterar taxa`; o modal aceita somente 0–10 e informa que a alteração afeta preço agora, mas imposto pessoal apenas na próxima competência semanal.
- **Relatórios:** últimas entradas/saídas, impostos semanais, contratos, doações e produção. Mostrar no máximo 10 lançamentos por página com paginação.

Fora da mansão, `/vila` pode mostrar leitura e doação, mas os controles de gestão do Kage devem responder apontando a mansão correspondente. Kage NPC não vê esses botões para nenhum jogador: staff usa `/admin-vila`. O Kage pode transferir estoque da vila a um jogador, mas nunca editar quantidade, saldo, nível ou tempo de obra diretamente.

### Staff: `/admin-vila`

Manter este comando separado de `/admin`, como pedido. Todas as ações exigem `isAdmin()` já usada em `src/commands/admin.ts`.

```text
/admin-vila ver vila
/admin-vila kage set vila usuario
/admin-vila kage npc vila ativado
/admin-vila imposto set vila percentual
/admin-vila cofre ajustar vila delta motivo
/admin-vila estoque ajustar vila item delta motivo
/admin-vila nivel set vila setor nivel motivo
/admin-vila centro set vila nivel motivo
/admin-vila obra iniciar|concluir|cancelar vila setor motivo
/admin-vila manutencao resolver vila setor motivo
/admin-vila ichiraku canal sincronizar vila motivo
/admin-vila saque bloquear vila ativado motivo
/admin-vila rank set usuario rank
/admin-vila populacao override vila ativos motivo
```

`nivel set` é a ferramenta pedida para casos como “setar nível 3 da vila X”; `centro set` faz o mesmo para o Centro. Ambos devem atualizar o estado de maneira consistente (sem obra pendente no prédio), jamais só alterar uma mensagem de painel. Todo comando administrativo precisa pedir `motivo` e criar auditoria.

## 9. Dados persistentes e auditoria

Entidades recomendadas (nomes podem variar, mas separar responsabilidades):

- `NinjaRank` ou campo `ninjaRank` por personagem.
- `CharacterEconomyState`: `satiety`, cooldowns de ação (ou tabela específica de coleta), estatísticas semanais.
- `Village`: id, nome, `taxRate`, `treasuryRyo`, `kageDiscordId`, `managedByStaff`, `withdrawalsLocked`, `populationOverride`, timestamps.
- `VillageTaxPeriod`: vila, competência semanal e `taxaCongeladaDaCompetencia`; única por vila + competência. É criada na abertura da semana e usada na cobrança, não a taxa atual do domingo de fechamento.
- `WeeklyTaxActivity`: competência semanal, personagem, vila de origem, rank no ganho, XP tributável, Ryō de missão tributável, estado (`OPEN | ISENTO_INATIVO | CLOSED`) e timestamps. O valor pode ser acumulado por `upsert`; o histórico fechado não deve ser sobrescrito.
- `WeeklyTaxCharge`: competência, personagem, vila, taxa aplicada, base tributável, imposto calculado, saldo antes/depois e `chargedAt`; chave única para impedir dupla cobrança.
- `VillageStock`: vila + item, quantidade; chave única composta.
- `VillageUpgrade`: vila + setor, nível, status de reforma, manutenção vencida, próxima cobrança.
- `VillageCenter`: vila, nível 1–3, status de reforma, manutenção vencida e próxima cobrança; inicia no nível 1.
- `VillageConstruction`: tipo (`CENTER`, `SECTOR` ou `SHOP`), chave do prédio, nível-alvo quando aplicável, custo e fator congelados em JSON, iniciado em, conclui em, status. Usar este único modelo para controlar a capacidade global de obras.
- `VillageLedger`: lançamento append-only com tipo, vila, Ryō delta, item/quantidade opcionais, ator, personagem afetado, motivo e metadados JSON.
- `EconomyActionLog`: coleta/craft/loja/comida para cooldown, população ativa e investigação de abuso.
- `VillageGatherOrder`: vila, criador, recurso, meta, entregue, recompensa unitária, orçamento reservado/restante, status, público, convidado opcional, prazo e IDs das mensagens de anúncio/convite.
- `VillageGatherContribution`: ordem, personagem, quantidade entregue, Ryō pago, aceito/recusado/em andamento e datas; aplicar unicidade por ordem + personagem.

Tipos mínimos de livro-caixa: `WEEKLY_ACTIVITY_TAX`, `DONATION_RYO`, `DONATION_ITEM`, `KAGE_DEPOSIT`, `GATHER_ORDER_RESERVE`, `GATHER_ORDER_PAYMENT`, `GATHER_ORDER_RELEASE`, `CONSTRUCTION_COST`, `MAINTENANCE_COST`, `PASSIVE_PRODUCTION`, `STOCK_WITHDRAWAL`, `NPC_SALE`, `KAGE_WITHDRAWAL`, `ADMIN_ADJUSTMENT`, `SHOP_BUY_FROM_PLAYER`, `SHOP_SALE_TO_PLAYER`, `SHOP_WHOLESALE_CONTRACT`, `SHOP_RESTOCK`, `SHOP_CRAFT`, `SHOP_WITHDRAWAL`.

Usar transações Prisma para qualquer movimento que envolva duas partes: deduzir Ryō e somar ao cofre, retirar material pessoal e somar ao estoque, deduzir estoque e iniciar obra, etc. Nunca confiar em saldo mostrado no embed.

## 10. Integração recomendada no repositório

Pontos de busca para o Claude:

| Responsabilidade | Arquivo existente | Alteração esperada |
|---|---|---|
| Schema e migração | `prisma/schema.prisma` | modelos de vila/economia, saciedade e rank; adicionar unicidade `InventoryItem(charId, itemId)` com consolidação segura das pilhas já existentes |
| Entrada de Ryō por missão | `src/services/missions/mission-service.ts` → `completeMission()` | pagar recompensa integral e acumular XP/Ryō tributáveis da competência semanal de Genin+ |
| Dados de itens | `src/data/items.ts` | materiais, alimentos, valores de mercado, metadados de receita/saciedade |
| Inventário | `src/services/characters/inventory.ts` | helpers genéricos de adicionar/remover item e consumo de comida/craft |
| Vilas e cargos | `src/services/village-service.ts` | manter `VillageId`; adicionar resolução econômica/Kage sem duplicar os IDs |
| Canais/mansões | `src/data/scenarios/index.ts` | reutilizar IDs; adicionar constante da Montanha para coleta |
| Registro de comandos | `src/commands/index.ts` | registrar `loja`, `acao`, `craft`, `comer`, `vila`, `admin-vila` |
| Admin atual | `src/commands/admin.ts` e `src/utils/permissions.ts` | reaproveitar `isAdmin`, sem abrir permissões a Kage |
| Inventário visível | `src/commands/inventario.ts` | mostrar saciedade e itens por categoria |
| Catálogo do site | `src/services/characters/equipment-catalog.ts` | documentar novos comandos/itens quando a API do site for atualizada |

O helper atual `villageFromMember()` retorna Konoha como fallback. Para economia, não usar esse fallback silencioso em uma transação financeira: se o membro não possui um cargo de vila válido, bloquear a operação e pedir definição da vila. Evita tributar ou creditar Konoha por engano.

Também há uma diferença de terminologia importante: `CharacterResourceState` guarda chakra e energia, não recursos de economia. Materiais devem ficar no inventário e nos estoques de vila; não adicionar madeira/pedra nessa tabela.

## 11. Ordem de implementação e testes de aceite

Implementar em etapas para não quebrar combate e missões. A sequência operacional obrigatória e as instruções de handoff estão em [`docs/economia/README.md`](economia/README.md): fundação → imposto/relógio → coleta/craft/fome → administração/cofre → lojas/UI → evoluções/manutenção → hotfix de mercado/varejo → redesign Components V2. Não tentar implementar a lista inteira em um único pedido ao Claude.

Critérios de aceite essenciais:

- Uma missão C de 200 Ryō para Genin com 5% entrega os 200 ao ninja na hora, acumula seus XP/200 Ryō na competência e não muda o cofre até domingo 22:00.
- A mesma missão feita por Academia entrega 200 Ryō, mas não acumula XP/Ryō tributáveis e não muda o cofre.
- Com 1.599 XP tributáveis na competência, o personagem não paga nada; com 1.600 XP e 1.400 Ryō tributáveis a 5%, paga exatamente 70 Ryō na apuração de domingo.
- Se o personagem tiver somente 30 Ryō ao dever 70, a apuração fecha uma única vez, deixa `ryo = -40` e credita 70 Ryō ao cofre; uma nova execução do job não cobra de novo.
- Com 5% de imposto, Kunai base 35 custa 37; a taxa não permite Kage definir “Kunai = 999” e a compra normal não altera o cofre.
- `/acao minerar` fora de Montanha/Caverna falha; na Caverna funciona, respeita 15 min e pode, em 5%, conceder exatamente 1 Minério Raro.
- Madeira Reforçada nunca sai de mineração e Minério Raro nunca sai de coleta natural ou produção passiva.
- Uma vila com poucos ativos recebe custo e produção pelo mesmo fator; o fator de obra não muda após início.
- Obra de setor nível 3 leva 3 dias reais e não conclui duas vezes se o job rodar novamente.
- Centro nível 1 bloqueia uma segunda obra, nível 2 permite duas e nível 3 permite três, contando setor e Ichiraku juntos; cliques simultâneos nunca ultrapassam o limite.
- Sem manutenção, somente a construção correspondente suspende seus efeitos; o nível permanece.
- Staff consegue definir, por exemplo, Minas de Iwa nível 3 com `/admin-vila nivel set`; há log com motivo.
- Kage NPC e Kage jogador usam o mesmo estado de vila; só muda quem é autorizado a acionar os comandos.
- Nenhuma arma nova é adicionada; apenas receitas para IDs já existentes.
- `/loja` fora do centro comercial correto não abre painel; dentro dele, a mesma mensagem efêmera é editada ao navegar entre as lojas.
- Vender 3 Carnes ao Ichiraku com 5% só funciona se cofre, orçamento e espaço bastarem; move item pessoal → loja, paga 8 Ryō por unidade e cria lançamento atômico.
- Produzir 1 Lámen consome exatamente 1 farinha, 1 caldo, 1 carne **ou** peixe, 1 água e 1 tempero; não muda o Ryō do Kage e adiciona um Lámen ao estoque do Ichiraku.
- Comprar o último Lámen reduz o estoque a zero, remove o Ryō do jogador da circulação e não altera o cofre; dois cliques simultâneos não podem vender o mesmo item duas vezes.
- Em uma Ordem de coleta, só ninja que a aceitou envia automaticamente o recurso-alvo ao estoque; cada ação paga exatamente a partir da reserva, sem ultrapassar meta, prazo ou orçamento. Cancelamento devolve somente a reserva não usada e nunca duplica material ou Ryō.
- Um Contrato de Empreendedor NPC do Ichiraku só pode ocorrer com o lote completo; reduz os 10 Lámen, credita exatamente 420 Ryō uma vez ao cofre e não pode ser repetido antes do reset diário.

## 12. Ideias deliberadamente deixadas para depois

- Fome diminuindo com tempo, viagem ou combate e quaisquer penalidades por fome.
- Caravanas, comércio entre vilas, guerra/embargo e preços dinâmicos de oferta/demanda.
- Durabilidade, reparo e qualidade de armas.
- Bônus de clã/elemento à coleta.
- NPCs autônomos tomando decisões de Kage.

Essas extensões devem consumir os mesmos serviços de mercado, estoque e livro-caixa, em vez de criar saldos paralelos.
