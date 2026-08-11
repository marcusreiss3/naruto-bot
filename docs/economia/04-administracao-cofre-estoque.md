# Etapa 04 — Administração, cofre e estoque central

Leia as seções 3.3, 6, 7, 8 e 9 de `docs/economia-vilas.md`. As etapas 01–03 precisam estar concluídas. Não criar lojas ou evolução/produção nesta etapa.

## Objetivo

Permitir que jogador doe recursos à vila e que Kage/staff gerenciem o cofre e o estoque central com segurança e auditoria.

## Entregas

- Criar resolução de Kage por `kageDiscordId` e modo NPC gerido por staff. Não conceder automaticamente permissão de admin ao Kage.
- Criar somente `/vila` como painel efêmero. Jogador comum vê visão geral, estoque público, recibos próprios e botão `Doar`; item usa select e quantidade usa modal.
- A doação move item pessoal → estoque central em transação e registra `DONATION_ITEM`. Doação de Ryō deve exigir saldo não negativo/suficiente e registrar `DONATION_RYO`.
- Na mansão da própria vila, Kage jogador vê no mesmo `/vila` as abas `Visão Geral`, `Cofre`, `Estoque`, `Obras`, `Comércio`, `Impostos` e `Relatórios`. Nesta etapa implementar Cofre, Estoque, Impostos e Relatórios; Obras/Comércio podem aparecer como “em breve” até suas etapas.
- Cofre usa botões para ver/depositar/sacar. `Depositar` é exclusivo do Kage: abre modal para quantidade inteira positiva, confirma em segunda tela e move Ryō da conta pessoal do Kage para o cofre em uma transação, criando `KAGE_DEPOSIT` com saldo antes/depois. Não aceita saldo insuficiente, zero ou negativo, não cria Ryō e não é um saque reversível. `Sacar` abre modal de valor + motivo, mostra o máximo de 10% do saldo disponível por semana e teto de 2.000 Ryō, depois exige botão de confirmação.
- Estoque usa select para item e modal para quantidade/destinatário; retirada gera `STOCK_WITHDRAWAL`. O Kage nunca recebe campo para editar quantidade diretamente.
- Em `Estoque`, implementar `Ordens de coleta`: Kage cria uma ordem com recurso-alvo, meta, recompensa por unidade, orçamento máximo e prazo; a criação reserva o orçamento do cofre e exige confirmação. A ordem pode ser aberta à vila (embed de anúncio com botão `Aceitar ordem`, sem ping em massa) ou convite individual via `UserSelectMenu` para personagem da mesma vila (menção/DM com `Aceitar`/`Recusar`). O Kage não pode forçar nem retirar recurso de um ninja.
- Um ninja só aceita uma ordem por vez. Após aceitar, cada coleta do recurso-alvo durante a ordem vai automaticamente ao estoque central e a recompensa sai da reserva na mesma transação; raros e recursos fora do alvo continuam no inventário pessoal. Fechar por meta, orçamento, prazo ou cancelamento devolve apenas a reserva não usada. Auditar criação, convite, aceite/recusa, entrega, pagamento, cancelamento e encerramento.
- Criar `/admin-vila` para ajustar cofre, estoque, rank, Kage/NPC e bloqueio de saque. Todo ajuste requer motivo e gera `ADMIN_ADJUSTMENT`.
- Implementar população ativa de 14 dias apenas como leitura/estatística. Ainda não aplicar fator a custo ou produção; isso vem na etapa 6.

## Regras técnicas

- Para economia, não usar o fallback silencioso de `villageFromMember()` para Konoha. Sem cargo de vila válido, operação financeira deve falhar com explicação.
- Kage não pode editar preço de item, apenas a `taxRate` nos limites existentes.
- Saque nunca pode usar Ryō reservado por obra/manutenção futura; como estas ainda não existem, deixar a reserva como helper preparado, saldo reservado inicialmente zero.
- Painel deve usar embed, botões, select e modal já nesta etapa. Não criar navegação de lojas, obra real ou produção ainda; as abas correspondentes só informam a etapa futura.

## Testes de aceite

- Doar item reduz inventário e aumenta estoque em uma única transação; falha sem itens sem alterar nada.
- Jogador comum não consegue sacar nem ajustar cofre; Kage NPC só é operado pela staff.
- Saque de Kage acima do limite semanal falha e um saque válido tem motivo e lançamento público/auditável.
- Depósito do Kage reduz exatamente seu Ryō pessoal e aumenta exatamente o cofre, com `KAGE_DEPOSIT`; tentativa acima do saldo, zero ou negativa não altera nenhum dos dois.
- Personagem sem vila não tem saldo creditado em Konoha por acidente.
- Jogador comum vê `Doar`, mas não vê saldo do cofre, saque, retirada, imposto ou controles de Kage.
- Kage fora da mansão recebe leitura normal e instrução para usar a mansão; dentro dela usa o mesmo painel, sem ganhar `/admin-vila`.
- Convite de ordem para usuário sem personagem da vila falha; jogador não aceito, ordem expirada ou item raro não transfere item/recebe pagamento. Duas confirmações simultâneas não ultrapassam meta nem orçamento.

## Não fazer agora

Não iniciar obras, não entregar recursos a lojas, não vender para Empreendedores NPC e não criar produção diária.
