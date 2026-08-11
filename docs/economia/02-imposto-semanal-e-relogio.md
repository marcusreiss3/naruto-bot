# Etapa 02 — Imposto semanal e relógio automático

Leia as seções 2, 3.1, 3.2 e 3.3 de `docs/economia-vilas.md`. A etapa 01 precisa estar concluída. Não implementar coleta, lojas ou obras nesta etapa.

## Objetivo

Registrar atividade de missão e cobrar automaticamente, no domingo às 22:00 de São Paulo, apenas Genin+ que atingiram 1.600 XP tributáveis na competência.

## Entregas

- Ao concluir missão em `completeMission()`, entregar a recompensa integral e, na mesma transação, acumular `def.rewards.xp` e `def.rewards.ryo` em `WeeklyTaxActivity` se o rank no instante for Genin+.
- Nunca usar `UserCharacter.xp` para a meta; ele é residual após level up.
- Criar competência semanal de domingo 22:00 a domingo 22:00 no fuso `America/Sao_Paulo`.
- No início da competência, congelar `Village.taxRate` em `taxaCongeladaDaCompetencia`. Alteração posterior do Kage muda preços de mercado, mas só entra no imposto pessoal da próxima semana.
- Criar serviço de agendamento persistente: no boot, recuperar tarefas vencidas; em execução, calcular o próximo domingo e programar novo timer. Guardar resultado de cobrança no banco para reinício nunca cobrar duas vezes.
- No fechamento: abaixo de 1.600 XP fecha isento; a partir de 1.600 cobra `piso(ryoTributavel × taxaCongelada)`, debita personagem mesmo se o saldo ficar negativo e credita o cofre com lançamento `WEEKLY_ACTIVITY_TAX`.
- Enviar recibo por DM. Se falhar, salvar para consulta privada na aba `Relatórios` de `/vila`; tarefa automática não pode enviar resposta efêmera.
- Exibir saldo negativo como dívida nos comandos existentes de perfil/inventário e bloquear gastos em Ryō enquanto o saldo não for suficiente, sem bloquear missão, coleta, item recebido ou venda de material.

## Testes de aceite

- 1.599 XP não cobra; 1.600 XP com 1.400 Ryō tributáveis e taxa congelada de 5% cobra 70 Ryō.
- Personagem com 30 Ryō que deve 70 termina em −40 e o cofre recebe 70.
- Executar o fechamento duas vezes só produz uma cobrança e um crédito de cofre.
- Mudar taxa de 5% para 10% no meio da semana não muda a cobrança da competência aberta.
- Simular reinício após 22:00 processa a competência atrasada uma única vez.

## Não fazer agora

Não esconder uma barra visual de XP: a meta é interna. Não cobrar por craft/coleta/comida, não criar juros e não implementar lojas.
