# Etapa 01 — Fundação, inventário e dados de vila

Leia as seções 2, 3.2, 8 e 9 de `docs/economia-vilas.md`. Esta etapa cria a base persistente. Não criar coleta, lojas, impostos cobrados, obras nem interface de botões ainda.

## Objetivo

Preparar o banco e os serviços para que nenhuma futura operação econômica consiga duplicar item ou movimentar Ryō sem auditoria.

## Entregas

- Criar `ninjaRank` persistido no personagem: `ACADEMIA`, `GENIN`, `CHUNIN`, `JONIN`, `KAGE`; padrão `ACADEMIA`.
- Criar estado econômico do personagem com `satiety` inicial 100. Não implementar queda de fome nesta etapa.
- Criar vila, cofre, estoque central e livro-caixa append-only. Iniciar as cinco vilas com cofre e estoque vazios via seed idempotente.
- Criar `WeeklyTaxActivity`, `WeeklyTaxCharge` e estrutura de competência/taxa congelada necessárias à etapa 2, mas ainda sem job de cobrança.
- Adicionar `@@unique([charId, itemId])` em `InventoryItem`.
- Fazer migration segura para inventário existente: antes de criar a unicidade, consolidar linhas duplicadas em uma única pilha por personagem/item, somando `qty` e preservando nome válido.
- Criar helpers únicos de inventário: adicionar, retirar e consultar quantidade. Refatorar os caminhos existentes de inventário para não depender de `findFirst` para uma pilha que deveria ser única.
- Criar helpers centrais de ledger e de movimentação de cofre/estoque. Nenhum handler de comando pode atualizar saldo diretamente.
- Adicionar somente `/admin-vila rank set usuario rank` e `/admin-vila ver vila` para a staff conferir a fundação.

## Regras técnicas

- O projeto usa SQLite. Fazer transações curtas; não manter interação Discord aberta dentro de `prisma.$transaction`.
- Para cada retirada, verificar saldo/quantidade dentro da transação. Atualização que levaria quantidade abaixo de zero deve falhar integralmente.
- `ryo` pode ser negativo somente para a cobrança tributária da etapa 2. Os helpers normais de gasto devem exigir saldo suficiente.
- O bot será usado neste servidor; não construir uma camada nova de multi-guild.
- Não alterar o schema de combate, drops ou missões além do campo de rank/estado econômico.

## Testes de aceite

- Migration com duas pilhas do mesmo item consolida corretamente e a unicidade impede nova duplicata.
- Duas retiradas concorrentes não conseguem consumir mais itens do que existem.
- Um lançamento de cofre é criado quando helper de crédito/débito é usado e não pode ser modificado pela API normal.
- Novo personagem inicia como Academia, com 100 de saciedade e 0 Ryō.
- `npm run typecheck` e testes novos passam.

## Não fazer agora

Não adicionar `/loja`, recursos, receitas, jobs, imposto, upgrade de vila ou Kage jogador. Registre no handoff qualquer migration manual necessária antes da etapa 2.
