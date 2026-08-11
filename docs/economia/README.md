# Roteiro de implementação da economia

`../economia-vilas.md` é a especificação-mestra de regras e balanceamento. Os arquivos desta pasta dividem a implementação em entregas seguras. O Claude deve executar **uma etapa por vez**, na ordem abaixo, e parar para validação antes de receber a próxima.

## Mensagem para enviar ao Claude em cada etapa

> Execute somente a etapa `docs/economia/NN-nome-da-etapa.md`. Leia primeiro a seção indicada de `docs/economia-vilas.md`. Não implemente etapas futuras e não altere combate/missões fora do necessário. Antes de encerrar, rode typecheck e os testes relevantes, crie testes para as regras novas e entregue um resumo com: arquivos alterados, migration aplicada, comandos adicionados, testes executados e pendências. Espere a próxima etapa.

## Ordem obrigatória

1. [01 — Fundação, inventário e dados](01-fundacao-inventario-vila.md)
2. [02 — Imposto semanal e relógio automático](02-imposto-semanal-e-relogio.md)
3. [03 — Coleta, materiais, craft e fome](03-coleta-craft-fome.md)
4. [04 — Administração, cofre e estoque central](04-administracao-cofre-estoque.md)
5. [05 — Lojas e interface Discord](05-lojas-interface-discord.md)
6. [06 — Evoluções, produção e manutenção](06-evolucoes-producao-manutencao.md)

## Regras de execução

- Não pular migration, testes ou validação de saldo antes de adicionar interface bonita.
- Toda alteração de Ryō, item, estoque ou obra deve acontecer numa transação curta e gerar lançamento de auditoria.
- Não usar `findFirst` como se fosse trava de saldo. Para inventário/estoque, usar unicidade no banco e atualização condicional ou transação que recarrega a linha.
- O bot é destinado a este servidor. Não criar arquitetura de multi-servidor além do que já existe naturalmente em `UserCharacter.guildId`.
- Não criar armas novas. Materiais e alimentos novos são permitidos.
- Ao terminar uma etapa, não começar a seguinte “por conta própria”. A staff valida e envia a próxima instrução.

## Marco mínimo utilizável

Depois da etapa 4, já haverá uma economia utilizável e verificável: ranks, imposto semanal, cofre, estoque, coleta, comida, craft e doação. Lojas e evoluções são expansões posteriores; se algo atrasar, o bot continua jogável sem elas.
