# Etapa 06 — Evoluções, produção e manutenção

Leia a seção 6 e os comandos de vila em `docs/economia-vilas.md`. As etapas 01–05 precisam estar concluídas e o agendador persistente da etapa 02 deve estar testado. Esta é a última etapa porque depende de estoque, cofre, recursos, Kage e scheduler estáveis.

## Objetivo

Implementar o Centro da Vila, os quatro setores da vila, obras com tempo real, produção diária, fator por população ativa e reforma semanal.

## Entregas

- Criar `Criação e Hortas`, `Minas e Fundições`, `Silvicultura e Coleta` e `Poços e Reservatórios`, níveis 0–5, com custo, duração, insumos específicos e produção-base exatamente da tabela mestre. Poços produzem somente Água Limpa e bonificam somente `/acao coletar-agua`.
- Criar `Centro da Vila`, iniciando no nível 1, com níveis 2–3, custos/tempos e desconto de manutenção da tabela mestre. Ele define a capacidade global: nível 1 permite uma obra, nível 2 duas e nível 3 três.
- Uma obra pode ser setor, Ichiraku ou Centro; contar globalmente todas as `CONSTRUINDO` da vila e bloquear atomicamente quando alcançar a capacidade do Centro. Nunca permitir duas obras no mesmo prédio. Evoluir o Centro ocupa uma vaga e só libera a próxima ao terminar.
- Aplicar `fator = limitar(0,30, 1,50, ativos14d / 20)` aos custos/produção, usando a população ativa definida no documento mestre. Mostrar fator e número de ativos no painel.
- Usar o scheduler persistente para concluir obras e depositar produção diária no estoque central. Reinício do bot deve concluir somente uma vez tudo que venceu offline.
- Nunca produzir Minério Raro ou Madeira Reforçada passivamente; bônus de coleta afetam apenas recurso comum.
- Criar manutenção semanal com prazo de 72 h para setores, Ichiraku ativo e Centro. Empório, Marcenaria, Fundição e Oficina são infraestrutura inicial e não cobram manutenção nesta versão. Aplicar ao Ryō o desconto de 0/10/20% do Centro nível 1/2/3; material não recebe desconto. Se não pagar, suspender apenas a construção afetada sem reduzir nível; Centro em reforma limita novos inícios a uma obra e perde o desconto até ser reparado.
- Completar a aba `Obras` do painel `/vila` para Kage: mostrar Centro, vagas ocupadas/total e fila; iniciar evolução, ver cronômetro, confirmar custo/fator/vaga e pagar manutenção por botões, select e modal. `admin-vila nivel set` e `admin-vila centro set` continuam exclusivos da staff, devem limpar obra pendente incompatível e criar lançamento com motivo.

## Regras técnicas

- No início de obra, verificar e reservar a vaga global, debitar cofre e estoque em uma única transação e registrar custo congelado completo. Não recalcular custo quando a obra termina; cancelar/concluir libera a vaga uma única vez.
- Job não deve depender de `setTimeout` sozinho: ao iniciar o bot, buscar obras, produções e reformas vencidas no banco.
- Produção diária deve ter chave de execução por vila/setor/data para não duplicar depois de reinício ou dois timers.
- Só usar `EconomyActionLog` e eventos reais dos últimos 14 dias para população ativa; nunca contar quantidade de cargos Discord.
- Não adicionar novos tipos de arma e não alterar a chance de recursos raros.

## Testes de aceite

- Nível 3 usa custo/tempo da tabela, congela fator e não muda se a população variar depois.
- Centro nível 1 impede iniciar segunda obra; ao concluir Centro nível 2 permite exatamente duas, e Centro nível 3 exatamente três, contando Ichiraku e setor juntos mesmo em cliques concorrentes.
- Obra vencida durante bot desligado é concluída uma única vez no boot.
- Dois processamentos da produção do mesmo dia não duplicam estoque.
- Falta de manutenção suspende somente a construção afetada; nível é preservado e volta ao pagar. Centro sem reforma não cancela obras existentes, mas permite iniciar somente uma e não dá desconto.
- `admin-vila nivel set` para Minas de Iwa nível 3 e `admin-vila centro set` ficam consistentes, com motivo e sem obra fantasma.

## Encerramento

Depois desta etapa, atualizar `docs/economia-vilas.md` apenas se o comportamento final divergir de uma regra aprovada. Entregar relatório final de todos os jobs recorrentes, custos, comandos e testes de concorrência.
