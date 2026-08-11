# Etapa 03 — Coleta, materiais, craft e fome

Leia as seções 4 e 5 de `docs/economia-vilas.md`. As etapas 01 e 02 precisam estar concluídas. Não criar lojas ou produção passiva nesta etapa.

## Objetivo

Colocar materiais, alimentos e craft no inventário dos jogadores, usando os seis canais de RP e sem afetar combate ou impostos semanais.

## Entregas

- Adicionar os materiais e alimentos da especificação em `src/data/items.ts`, todos empilháveis e nas categorias corretas. Não adicionar armas novas.
- Adicionar `tinta_de_selo` ao catálogo como material processado. A receita (`1 Carvão + 1 Erva Medicinal + 1 Água Limpa`) fica declarada no catálogo, mas não pode ser executada pelo `/craft` pessoal: ela é exclusiva da Oficina de Selos na etapa 05. O Pergaminho de Arsenal continua sendo item existente, não uma arma nova.
- Adicionar `/acao minerar`, `/acao coletar`, `/acao cacar`, `/acao pescar` e `/acao coletar-agua`, aceitos somente nos seis IDs definidos no documento mestre.
- Criar constante/configuração para Montanha (`1515881137170546852`) sem exigir novo mapa de combate.
- Implementar cooldown por personagem e por ação de 15 minutos, persistido no banco. Duas execuções concorrentes da mesma ação não podem gerar duas recompensas.
- Aplicar tabelas de recursos por área e chances fixas de 5%: Minério Raro apenas em mineração; Madeira Reforçada apenas em coleta natural. Cada ocorrência dá exatamente uma unidade e nunca sai de produção passiva.
- Adicionar `/craft listar` e `/craft criar` apenas para o processamento básico (Lingote, Papel, Farinha e Lenha), Kunai, Shuriken, Senbon e Pão. Não expor aço, pólvora, tinta, armas/ferramentas avançadas nem alimentos preparados: eles dependem das lojas da etapa 05.
- Adicionar `/comer` e saciedade. Não criar degradação, dano ou debuff de fome.
- Declarar uma única receita canônica de Lámen para a etapa 05: `1 Farinha + 1 Caldo + 1 Carne crua OU Peixe cru + 1 Água Limpa + 1 Tempero`. Ela não aparece nem pode ser acionada no `/craft` pessoal.
- Declarar a receita do Pergaminho de Arsenal no catálogo (`8 Papel + 2 Tintas de Selo + 1 Madeira Reforçada + 1 Erva Medicinal`), mas não expô-la no `/craft` pessoal. A produção efetiva é exclusiva da Oficina de Selos na etapa 05.

## Regras técnicas

- Recompensa da coleta entra só no inventário pessoal; doação à vila é a etapa 4.
- Não exigir `/mapa`, combate ou uma mensagem de RP para conceder a coleta.
- Random deve ser injetável ou isolado em helper para teste determinístico.
- Receita deve existir em um catálogo central, marcado com `personal` ou `villageShop`; `/craft` filtra e aceita somente `personal`, enquanto a futura administração da loja usa somente sua receita `villageShop`. Nunca repetir fórmulas em handlers.
- Craft que não custa Ryō ainda precisa de transação para consumir ingredientes e criar produto de uma vez.

## Testes de aceite

- Ação fora do canal correto falha; dentro dele funciona e respeita cooldown.
- Minério Raro não sai de coleta; Madeira Reforçada não sai de mineração; ambos podem ser testados com RNG determinístico.
- Craft falha sem todos os ingredientes e não consome parcialmente.
- Pão consome exatamente 2 Farinhas, 1 Água Limpa e 1 Lenha e restaura 16 de saciedade, limitado a 100.
- Aço, pólvora, Tinta de Selo, comidas preparadas, Lámen, armas avançadas e Pergaminho de Arsenal não aparecem nem podem ser acionados como craft pessoal, mesmo por custom ID forjado.
- Nenhuma dessas ações aumenta o acumulador tributável semanal.

## Não fazer agora

Não criar UI de loja, compra/venda, estoque municipal ou bonificação de coleta por nível da vila.
