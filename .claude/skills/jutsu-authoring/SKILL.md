---
name: jutsu-authoring
description: Use ao criar, editar ou balancear jutsus/habilidades (Ability) — ninjutsu elemental, iryo, taijutsu, genjutsu, kenjutsu, habilidade de clã. Cobre o contrato do campo Ability, tabela de balanceamento por tier, quais flags a engine realmente lê, requisitos/desbloqueio automático, e o teste obrigatório. Trigger: "adiciona jutsu", "novo jutsu", "cria habilidade", "balancear jutsu", "jutsu de raio/agua/vento", "jutsu do clã X".
---

# Criar jutsu

## ⚠️ Leia antes: não existe mais placeholder

Todas as **258 habilidades** do projeto são conteúdo real. Balanceie normalmente: dano, custo, tier, requisitos, texto.

> Esta seção dizia até 09/08/2026 que as "39 habilidades de jogador (15 elementais, 18 de support, 6 de clã)" eram descartáveis, e citava `chidori`/`fuuton_rasenshuriken`/`uchiha_sharingan1` — ids que não existem mais. Era verdade quando o projeto tinha 39 habilidades no total. O último arquivo descartável, `jutsus/support.ts`, foi apagado em 09/08/2026.

**Arsenal de NPC** (`src/data/jutsus/npc.ts`): a marca é **não ter `requirements`** — `autoUnlockJutsus()` pula essas, então nunca caem no arsenal de jogador nenhum. Só entram em combate via `NpcTemplate.abilityIds`. São duas famílias: os bichos (`pombo_bicada`, `vespa_ferroada`, `cao_ninja_mordida`, `abelha_gigante_*`), com custo 0, e o kit genérico de humanoide com prefixo `npc_` (`npc_soco`, `npc_corte_simples`, `npc_confusao`...), que mantém custo próprio.

| | Requisitos | Onde |
|---|---|---|
| **NPC** | sem `requirements` | `jutsus/npc.ts` |
| **Jogador** | tem `manualOnly` + `level`/`element`/`clanId`/`attributes` | os outros arquivos |

Estar em `NpcTemplate.abilityIds` **não** faz a habilidade ser de NPC — NPCs reusam jutsu de jogador (`katon_goukakyuu`, `suiton_teppoudama`...). O teste é o requisito, não quem usa.

Consequências práticas:
- **Confira o custo** com `npx tsx scripts/audit-jutsu-costs.ts` antes de commitar. Ele mostra o desvio contra a régua e, ao lado, os freios que a fórmula não vê (uso único, dojutsu ativo, gate de nível). Desvio grande **com** freio está explicado; desvio grande com a coluna vazia é dívida.
- **Ids de nó são estáveis** (vão pro banco em `CharacterSkillNode`). Ids de ability podem mudar; a ponte é o `NODE_ABILITY`.
- **`manualOnly: true` em toda ability concedida por nó.** Sem isso o auto-unlock entrega de graça e a árvore vira enfeite — `tests/combat-math.test.ts` trava isso.
- **Reações básicas:** `tai_defesa` (BLOCK), `ken_aparar` (PARRY) e `tecnica_substituicao` (DODGE), em `fundamentals.ts`, são as únicas reações **genéricas** (as outras exigem elemento, clã ou árvore). Não apague sem substituir — a engine escolhe por `reactionKind`, não por id, então nada quebra ao compilar.
- **Ao mexer em NPC:** NPC sem habilidade de dano vira inanimado, a IA o deixa parado.

## Onde

| Categoria | Arquivo |
|---|---|
| NINJUTSU elemental (5 naturezas + 7 kekkei genkai) | `src/data/jutsus/elemental.ts` (`ELEMENTAL[]`) |
| IRYO | `src/data/jutsus/iryo.ts` |
| TAIJUTSU (Punho Forte) | `src/data/jutsus/taijutsu.ts` — Arhat em `arhat.ts`, Adamantino em `adamantino.ts` |
| GENJUTSU | `src/data/jutsus/genjutsu.ts` |
| BUKIJUTSU | `src/data/jutsus/bukijutsu.ts` |
| FUINJUTSU | `src/data/jutsus/fuinjutsu.ts` |
| Ninjutsu de Academia | `src/data/jutsus/fundamentals.ts` |
| CLA | `src/data/clans/index.ts` + registrar id em `passiveIds`/`activeIds` do clã |

Habilidade de NPC vai em `src/data/jutsus/npc.ts` (sem `requirements`).

Contrato do tipo: `src/data/types.ts` → `interface Ability`. Números globais: `src/config/balance.ts`.

## Checklist

1. `id` snake_case com prefixo de família: `katon_goukakyuu`, `iryo_cura_basica`, `raiton_*`, `suiton_*`, `fuuton_*`, `doton_*`.
2. Colocar no bloco da família certa (arquivo é agrupado por elemento/categoria com comentário `// ---- FOGO ----`).
3. Preencher todos os campos obrigatórios (abaixo).
4. `npm run typecheck`.
5. Teste em `tests/` se a mecânica for nova (não só números).

## Campos e o que a engine faz com eles

Obrigatórios: `id`, `name`, `category`, `tier`, `resource`, `cost`, `actionType`, `range`, `shape`, `tags`, `description`.

- **`category`** — `NINJUTSU | IRYO | TAIJUTSU | GENJUTSU | KENJUTSU | CLA`. Define o subcomando (`/jutsu ninjutsu` etc.), se BURN corta o dano (só TAI/KEN), se soma dano de arma (só KENJUTSU), e se NINJUTSU_BLOCK trava o uso (só NINJUTSU).
- **`resource`** — `"chakra"` ou `"energia"`. Custo final = `cost * masteryCostMultiplier[mastery]` (BASICO 1.0 / CONTROLADO 0.7 / MESTRE 0.55). `cost` é **percentual** de um pool de 100.
- **`actionType`** — `COMUM` (1/turno), `BONUS` (1/turno), `MOVIMENTO` (1/turno), `REACAO`. Ataque normal é `COMUM`. Buff self barato é `BONUS`.
- **`scalingAttribute`** — dano/cura = `base + attr * SCALE[attr]`. SCALE: ninjutsu 2.0, iryo 2.5, taijutsu 1.8, kenjutsu 1.8, **genjutsu 1.0**.
- **`shape`** e como `resolveAreaCells` resolve:
  - `SINGLE_TARGET` / `MELEE` — acerta só o alvo escolhido (não a célula inteira).
  - `LINE` — células do traçado origem→alvo, até `range`.
  - `CONE` — cone na direção do alvo, comprimento `range`.
  - `RADIUS` — raio `floor(range / 2)` **em volta do alvo** (não da origem). Range 6 = raio 3.
  - `SELF` — sem alvo; usado p/ buff.
  - `ALLY` — cura/cleanse; alvo pode ser você mesmo.
  - `GLOBAL_OR_SCENARIO` — **não resolve célula nenhuma** (retorna vazio). Só use com lógica custom.
- **`range`** — em células. `MELEE` usa `max(1, range)`. Distância é Chebyshev (diagonal = 1).
- **`effects`** — `{ effectId, stacks?, duration?, chance? }`. **Só aplica se `damage > 0`** — jutsu de puro controle sem `baseDamage` não aplica efeito nenhum pela engine. Dê pelo menos 1 de `baseDamage` ou trate em código.
- **`cleanses`** — remove EffectIds do alvo. Iryo.
- **`requirements`** — `{ level?, attributes?, element?, clanId?, manualOnly? }`. Sem `manualOnly`, o jutsu **desbloqueia sozinho** quando o personagem bate os requisitos. `manualOnly: true` = só admin/arma/pergaminho.
- **`unblockable`** — ignora BLOCK e PARRY **e DODGE** (a engine checa `unblockable` nos três ramos).
- **`undodgeable`** — ignora DODGE.
- **`tags`** — livre, mas `"buff"` num `shape: "SELF"` liga a flag `reactionBuff` (+10% esquiva).

## Tabela de balanceamento

Referência dos jutsus existentes. Fique dentro dela salvo pedido explícito.

| Tier | Nível req. | Attr req. | Custo | baseDamage | Alcance |
|---|---|---|---|---|---|
| 1 | — (só attr 3) | 3 | 15–20 | 14–18 | 1–3 |
| 2 | 10 | 10 | 25–28 | 14–22 | 3–4 |
| 3 | 25 | 20 | 35–40 | 28–32 | 4–6 |

Regras de proporção:
- Dano final tier 1 c/ ninjutsu 3 ≈ 24. Tier 3 c/ ninjutsu 20 ≈ 70. HP base nível 15 ≈ 220. Um tier 3 tira ~1/3 de HP: mantenha isso.
- Área (CONE/RADIUS/LINE) paga com `baseDamage` menor que single-target do mesmo tier.
- `chance` de efeito sobe com tier: t1 ~0.6, t2 ~0.8, t3 = garantido (omitir `chance`).
- BURN explode em 5 stacks por 40 de dano. Não dê stacks que permitam explodir em 1 turno sozinho.

## Calculadora de custo (`suggestedJutsuCost`)

A tabela acima é o ponto de partida; pra um número mais preciso, use
`suggestedJutsuCost()` (`src/services/characters/jutsu-balance.ts`, pesos em
`BALANCE.jutsuCostFormula`). Ela pega `baseDamage`/`baseHeal`/`effects`/
`actionType`/`shape`/`unblockable`/`undodgeable`/`unguardable` da ability e
devolve um custo sugerido — dano em faixas progressivas (os primeiros 20
pontos custam pouco, o excedente custa cada vez mais, mas achata de novo
depois de 35: apice já é freado por nível/atributo altíssimo, não precisa
também levar o preço da faixa do meio), cada efeito com peso próprio
(Atordoamento > Confusão > Imobilização > debuff parcial), área e
indefensável como multiplicador, e o tipo de ação (BONUS paga prêmio por ser
uma ação "de graça" no mesmo turno).

Rode `npx tsx scripts/audit-jutsu-costs.ts` pra comparar o custo sugerido
contra TODA ability existente (mostra o delta, do maior pro menor) — útil pra
achar outlier antes de commitar um custo novo. `npx tsx scripts/apply-jutsu-costs.ts --dry`
mostra o que mudaria se você reaplicasse a fórmula em massa (sem escrever
nada); tire o `--dry` só se for mesmo reprecificar o roster inteiro de novo.

**Não cobre** (fica a critério de quem escreve o jutsu, como antes):
`summon`, `mindTransfer`, `trapField`, `cleanses`, `reduceEffectDuration`,
`restoreResource`, `requiredItems`/`equippedItemIds`, `toggleRules`, `teamBuff`,
e combo-enablers cujo valor real vem de OUTRA ability (ex: SHADOW_BOUND do
Nara — garante o próximo golpe de uma técnica diferente; a fórmula não
enxerga isso e vai sugerir um número mais baixo do que o jutsu realmente
vale). Também não mexe em conteúdo de NPC de verdade — `cost: 0` sem
`requirements` é o sinal de "isso é NPC, não precifique".

## Exemplo

```ts
{
  id: "raiton_jibashi",
  name: "Raiton: Jibashi",
  category: "NINJUTSU",
  element: "RAIO",
  tier: 2,
  resource: "chakra",
  cost: 26,
  actionType: "COMUM",
  baseDamage: 16,
  scalingAttribute: "ninjutsu",
  range: 3,
  shape: "CONE",
  effects: [{ effectId: "STUN", duration: 1, chance: 0.4 }],
  requirements: { element: "RAIO", level: 10, attributes: { ninjutsu: 10 } },
  tags: ["raio", "area", "controle"],
  description: "Onda elétrica em cone que pode atordoar.",
},
```

## Custo total da árvore de clã vs dano entregue

Balanceamento ENTRE clãs (não só entre jutsus dentro de um clã): o custo TOTAL
da árvore de habilidades do clã (soma de `cost` de todos os nós em
`clan-trees/index.ts`) tem que correlacionar com o dano que o clã entrega. Um
clã barato de upar (poucos nós, gates de nível/atributo baixos) sobra ponto
pro jogador investir noutra coisa (elemento, fundamentos, outro atributo) —
por isso ele DEVE dar menos dano que um clã caro. Se dois clãs custam preços
bem diferentes mas entregam dano igual (via `baseDamage` alto ou
`damageMult` de passiva em `clan-trees/passives.ts`), o mais barato está
furando essa relação e precisa ser cortado, não o mais caro elevado — o
barato existe pra ser barato.

Referência (rebalanceamento de 2026-07-28, ver `git log` pra números
anteriores): Uzumaki (14 PN) não dá dano nenhum — puro suporte, é o piso
correto. Nara/Hyuuga/Aburame (33–37 PN) são clãs de controle: dano baixo
(~10–23 de `baseDamage` médio), sem `damageMult` ou com ele nulo. Akimichi
(49 PN, o mais caro) tem `damageMult` 1.3x incondicional — correto, clã caro
dá dano de verdade. Hatake, Hozuki e Chinoike custavam 15–29 PN mas
entregavam dano de clã caro (`baseDamage` 38–42 num único golpe, `damageMult`
1.3x nas passivas de ápice) — foram cortados pra `baseDamage` 20–30 e
`damageMult` 1.15x, pra ficar na curva dos clãs do mesmo custo.

Ao criar ou reforçar uma árvore de clã: some o `cost` de todos os nós, pegue
o `baseDamage` médio/máximo das habilidades concedidas, e compare com um clã
de custo total parecido. Se destoar da curva, ajuste ANTES de commitar — não
espere alguém notar jogando.

## Armadilhas

- Efeito sem `baseDamage` = efeito nunca aplicado (`if (damage > 0 && ability.effects)`).
- `RADIUS` com `range: 1` → `floor(1/2) = 0` → raio 0. Use range par ≥ 2.
- `genjutsu` escala 1.0 e `genjutsuDuration()` **não está ligada na engine**. Jutsu de genjutsu hoje escala mal e a duração é fixa do `AppliedEffect`. Não finja que escala — ou ligue a formula, ou compense no `baseDamage`.
- Novo `EffectId`? Precisa entrar em `EFFECT_IDS` (`src/config/enums.ts`) **e** ganhar comportamento em `src/services/combat/effects.ts` **e** ser consumido na engine. Efeito só no enum não faz nada.
- Não precisa `npm run register` pra jutsu novo — o autocomplete é dinâmico.
