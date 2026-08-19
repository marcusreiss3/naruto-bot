---
name: ninjutsu-authoring
description: Use ao criar, editar ou balancear NINJUTSU ELEMENTAL (Katon/Suiton/Fuuton/Doton/Raiton) e os nós da árvore de elementos que os concedem. Cobre a identidade de cada elemento, o contrato Ability com as flags que a engine realmente lê, os 15 efeitos com os números reais de balance.ts, os 5 terrenos, a fórmula de dano (atributo NÃO escala), a regra dos ~2.0x das passivas, os 3 lugares obrigatórios de registro e os testes que travam. Trigger "novo ninjutsu", "jutsu de fogo/agua/vento/terra/raio", "katon", "suiton", "fuuton", "doton", "raiton", "nó da árvore", "passiva de elemento", "balancear ninjutsu".
---

# Criar ninjutsu elemental

Escopo: **só NINJUTSU elemental** (FOGO, AGUA, VENTO, TERRA, RAIO). Para IRYO/TAIJUTSU/GENJUTSU/BUKIJUTSU/CLA, use `jutsu-authoring`.

Fontes de verdade lidas para escrever esta skill: `src/data/types.ts`, `src/config/enums.ts`, `src/config/balance.ts`, `src/data/jutsus/elemental.ts`, `src/data/element-trees/{index,passives}.ts`, `src/services/combat/{combat-engine,passives}.ts`, `docs/arvore-elementos.html`, `docs/handoff-raio.md`.

## Regra 0 — ninjutsu elemental vem da ÁRVORE, não do nível

Hoje as 43 abilities de `elemental.ts` são o roster real: **uma por nó `JUTSU`** das 5 árvores. Nada de auto-unlock.

```ts
requirements: { element: "RAIO", manualOnly: true }   // OBRIGATÓRIO
```

Sem `manualOnly`, o auto-unlock por nível/atributo (`character-service.ts`) entrega o jutsu de graça e a árvore vira enfeite. **`tests/combat-math.test.ts` → "todo jutsu concedido pela árvore é manualOnly" falha se esquecer.**

> O roster elemental é **real** — 81 abilities, uma por nó de JUTSU das 12 árvores. O cabeçalho obsoleto que dizia "PLACEHOLDER — ESTE ROSTER SERA APAGADO" foi corrigido em 09/08/2026, junto com a mesma afirmação no `CLAUDE.md`. O único arquivo descartável hoje é `jutsus/support.ts`.

## Regra 1 — dano NÃO escala com atributo

Em `balance.ts`: `ninjutsuScaling: 0` (idem taijutsu, bukijutsu, iryo). Intencional.

```
dano = baseDamage
     × dmgMult do cenário (scenario.elementModifiers)
     × produto das passivas de dano do elemento (damageMult, damageMultVsEffect)
     × executeBonus (se o alvo estiver abaixo do hpThreshold)
     × multiplicador de BURN (só corta TAI/BUKI)
     + bônus de altura
```

Ninjutsu continua valendo muito: **é o orçamento que compra os nós** (`disponível = ninjutsu − Σ custos dos nós comprados`; 4 pontos de atributo por nível). Mantenha `scalingAttribute: "ninjutsu"` mesmo com escala 0 — é contrato.

## Regra 2 — as passivas de dano de cada elemento multiplicam ~2.0×

`tests/passives.test.ts` **falha fora da faixa 1.8–2.2×**. O teste multiplica `damageMult × damageMultVsEffect.mult` por elemento.

| Elemento | Como fecha os 2× |
|---|---|
| FOGO | `fogo_raiz` 1.30 × `fogo_folego` 1.55 = 2.015 |
| VENTO | `vento_raiz` 1.30 × `vento_corte` 1.55 = 2.015 |
| TERRA | `terra_raiz` 1.30 × `terra_peso` 1.55 = 2.015 |
| AGUA | `agua_raiz` 1.15 × `agua_fio` **vs WET** 1.75 = 2.01 (só com setup) |
| RAIO | `raio_raiz` 1.15 × `raio_nuvens` **vs WET** 1.75 = 2.01 (só com setup) |

Água e Raio são de propósito fracos no seco: ganham por **montar a jogada**. É o combo assinatura do jogo.

## Identidade dos 5 elementos

| Elemento | Papel | Ferramentas que ele "possui" |
|---|---|---|
| 🔥 FOGO | Incinerador: maior dano bruto, único dano que cresce sozinho | `BURN` + explosão, terreno `FIRE`, `SMOKE`, `FLEE_LOCK`, `clearsTerrain: "WATER"` |
| 🪨 TERRA | Fortaleza: decide onde a luta acontece | `SHIELD`, terreno `OBSTACLE`/`SWAMP`, `ROOT`, `CHAKRA_DRAIN`, `push` negativo, invocações |
| 💧 AGUA | Controlador/setup: molha o campo | `WET`, terreno `WATER`, `push` ±, `SLOW`, `BLEED`, invocação que estoura em WET |
| 🌪️ VENTO | Lâmina de precisão | `undodgeable`/`unblockable`, `BLEED`, `push` positivo, `armorPierce`, maior alcance |
| ⚡ RAIO | Assassino/finalizador | `STUN`, `pierceObstacles`, `chainWetTargets`, `HASTE`, `oncePerCombat`, execução |

Ao criar um jutsu, **fique dentro do vocabulário do elemento**. Fogo não empurra; Vento não cria terreno; Terra não atordoa.

## Contrato `Ability` — só o que a engine lê

Obrigatórios: `id`, `name`, `category`, `tier`, `resource`, `cost`, `actionType`, `range`, `shape`, `tags`, `description`.

```ts
category: "NINJUTSU"           // sempre; faz NINJUTSU_BLOCK travar o uso
element: "FOGO" | "AGUA" | "VENTO" | "TERRA" | "RAIO"
tier: 1 | 2 | 3                // profundidade na árvore (≠ rank do nó)
resource: "chakra"
cost: number                   // % de um pool de 100; final = cost × maestria × costMult das passivas
actionType: "COMUM" | "BONUS" | "MOVIMENTO" | "REACAO"
baseDamage?: number
baseHeal?: number
scalingAttribute: "ninjutsu"   // manter, mesmo com escala 0
range: number                  // células, distância Chebyshev (diagonal = 1)
shape: Shape
effects?: [{ effectId, stacks?, duration?, chance? }]
cleanses?: EffectId[]          // remove efeitos do alvo (usado na Armadura de Raio)
requirements: { element, manualOnly: true }
```

Flags especiais — **todas verificadas como consumidas pela engine**:

| Flag | O que faz | Onde é lida |
|---|---|---|
| `unblockable` | ignora BLOCK, PARRY **e** DODGE | `resolveHit` |
| `undodgeable` | ignora só DODGE | `resolveHit` |
| `pierceObstacles` | a linha de visão atravessa muro/árvore/fumaça | `useAbility` (checagem de linha) |
| `chainWetTargets` | exige alvo inicial `WET`; salta para todos os outros `WET` do campo | `useAbility` + `abilityPreview` |
| `requiresStorm` | exige nó `raio_nuvens` comprado **ou** terreno `FIRE` ativo | `useAbility` |
| `oncePerCombat` | 1 uso por combate (`flags.usedOnceAbility`) | `useAbility` |
| `terrain: { kind, duration? }` | deixa terreno nas células atingidas | `useAbility` |
| `clearsTerrain: TerrainKind` | remove terreno das células (Fogo evapora água) | `useAbility` |
| `push: number` | `>0` empurra, `<0` puxa; teto `BALANCE.push.maxCells` = 4 | `resolveHit` |
| `summon: { templateId, onHit?, onDeath? }` | invoca aliado que age com a IA de NPC | `useAbility` |
| `reactionKind` | jutsu usável como reação | reação |

`shape` e como `resolveAreaCells` resolve:

- `SINGLE_TARGET` / `MELEE` — só o participante escolhido, não a célula inteira.
- `LINE` — traçado origem→alvo até `range`.
- `CONE` — cone na direção do alvo, meio-ângulo `BALANCE.coneHalfAngleDeg` = 45° (leque de 90°).
- `RADIUS` — raio `floor(range / 2)` **em volta do alvo**. Range 6 = raio 3.
- `SELF` — sem alvo (buff, invocação).
- `ALLY` — cura/cleanse.
- `GLOBAL_OR_SCENARIO` — **não resolve célula nenhuma**. Só com lógica custom.

## Efeitos — números reais de `balance.ts`

| Efeito | Rótulo | Número atual |
|---|---|---|
| `BURN` | Queimadura | 8 dano/turno; −5% dano TAI/BUKI por stack; explode em **5** stacks por **40** |
| `POISON` | Veneno | 2 + 1/stack por turno; duração máx 5 |
| `BLEED` | Sangramento | 5/turno; +6 se o alvo usar TAI/BUKI; corta cura em 50% |
| `STUN` | Atordoamento | perde o turno; padrão 1 rodada |
| `SLOW` | Lentidão | movimento × 0.5 |
| `ROOT` | Imobilização | não move (pode agir); padrão 1 |
| `CONFUSION` | Confusão | mira alvo aleatório; padrão 2 |
| `DISARM` | Desarme | derruba a arma no mapa |
| `NINJUTSU_BLOCK` | Bloqueio de Ninjutsu | trava categoria NINJUTSU; padrão 2 |
| `DEFENSE_DOWN` | Defesa Reduzida | −15% de esquiva |
| `FLEE_LOCK` | Bloqueio de Fuga | não pode tentar `/fugir`; padrão 2 |
| `WET` | Encharcado | marcador, padrão 2; sem dano próprio — o pivô do combo Água→Raio |
| `SHIELD` | Barreira | stacks **são** os pontos de dano absorvidos; padrão 3, +1 ao defender (Terra) |
| `CHAKRA_DRAIN` | Dreno de Chakra | 10% de chakra/turno; padrão 2 |
| `HASTE` | Aceleração | +2 movimento, +10 p.p. esquiva, +25 p.p. fuga, 8 de dano de contato; 3 rodadas |

Terrenos (`TERRAIN_KINDS`), padrão 2 rodadas (`BALANCE.terrain.defaultDuration`):

`FIRE` (8 dano por terminar o turno) · `WATER` (move pela metade, conta como molhado) · `OBSTACLE` (barra passagem e visão) · `SMOKE` (barra visão, deixa passar) · `SWAMP` (move pela metade)

Fuga (`BALANCE.flee`): base 50%, +1 p.p. por Taijutsu, −15 p.p. por inimigo adjacente, teto 90%, piso 10%, custa 15 de energia e a ação comum mesmo falhando.

## Tabela de balanceamento por rank

**Medida direto no roster real em 06/08/2026** (todas as 43+ abilities de
`elemental.ts`, básicos + kekkei genkai, resolvidas via `NODE_ABILITY`). A
tabela anterior era uma referência de projeto que nunca bateu com o que foi
publicado, principalmente em A e S — ficou substituída pelos números reais
abaixo. `chance` de efeito sobe com o rank: C ~0.15–0.6, B ~0.7, A/S
garantido (omitir `chance`).

| Rank do nó | Custo do nó (PN) | `cost` de chakra | `baseDamage` núcleo¹ | `baseDamage` faixa completa² |
|---|---|---|---|---|
| D | 1 | 12 | — (1 amostra só: 14) | 14 |
| C | 3 | 16–22 | 14–22 | 10–26 |
| B | 4 | 24–32 | 22–32 | 10–32 |
| A | 6 | 36–48 | 20–40 | 10–40 |
| S | 10 | **50–83** | 34–48 | 34–48³ |

¹ "Núcleo" exclui jutsu de puro controle (ver bullet abaixo) — é a faixa útil pra calibrar um jutsu de dano novo.
² Faixa completa inclui os de controle, que puxam o piso pra baixo.
³ Golem Defensor (Terra, rank S) fica de fora: `baseDamage` 0, é parede/utilidade, não finalizador.

**C e B batem com a tabela antiga.** A e S NÃO batiam: nenhuma ability A
chega nos 44 do teto antigo (a mais forte é 40); em S só o Kirin (48, Raio)
chega perto de 45 — Vento e Explosão ficam em 34, bem abaixo do piso antigo.
Rank D tem amostra única (Choro Celestial, Água, 14) — não dá pra confiar
numa faixa com 1 dado só, trate como estimativa.

Proporções:
- Rank S é freado **economicamente**: 50–83% do pool de 100, remedido em
  12/08/2026 contra as 12 linhagens reais (5 básicos + 7 KKG) —
  `Água 50, Fogo 52, Gelo 59, Vento 67, Lava 67, Vapor 65, Calor 69, Terra 70,
  Raio 70, Cristal 73, Poeira 76, Explosão 83`, média 67%. O "70–80" antigo
  já estava errado quando foi escrito (a nota logo acima já dizia que só o
  Kirin chegava perto de 45 de baseDamage, mas ninguém conferiu o `cost` na
  época) e ficou mais errado ainda depois do corte de Fogo/Água pra 50–52.
  Pode ter trava extra (Kirin: `requiresStorm` + `oncePerCombat`).
- Área (CONE/RADIUS/LINE) paga com `baseDamage` menor que single-target do mesmo rank.
- Jutsu de puro controle troca dano por efeito, e é isso que puxa o piso da faixa completa pra baixo do núcleo: Corrida de Fogo (B) tem 12 de dano e entrega `FLEE_LOCK`; Prisão dos Quatro Pilares (A) tem 12 e entrega STUN 2 + ROOT 2 + FLEE_LOCK 2 + terreno; Prisão de Água/Prisão Cristal de Jade (B, 10) e Prisão Cúpula de Terra/Pântano do Submundo (A, 10–14) seguem o mesmo padrão.

## Checklist — 3 lugares obrigatórios

1. **Ability** em `src/data/jutsus/elemental.ts`, no bloco do elemento (`// ---------------- RAIO ----------------`). Id com prefixo de família: `katon_*`, `suiton_*`, `fuuton_*`, `doton_*`, `raiton_*`.
2. **Nó** em `src/data/element-trees/index.ts`, via a fábrica do elemento (`const R = make("RAIO")` → `R.jutsu(...)` ou `R.pass(...)`). O nó define `col` (−1/0/+1), `row`, `requires` (nó anterior no tronco ou no ramo), `reqLevel`, `reqNinjutsu`.
3. **`NODE_ABILITY`** no fim de `element-trees/index.ts`: `nodeId: "abilityId"`. **Sem isso o nó concede `grantsAbilityId = seu próprio id`** (default da fábrica), que não existe como ability — o jogador compra o nó e não recebe nada.

Se o jutsu invoca: **4º lugar** — `NpcTemplate` em `src/data/npcs.ts` (siga `summon_clone_agua`). `tests/summon.test.ts` exige que o template exista, tenha HP e pelo menos um jutsu válido.

Se for **passiva**, não é Ability: `PassiveDef` em `src/data/element-trees/passives.ts`. Campos disponíveis (todos já consumidos): `damageMult`, `damageMultVsEffect`, `costMult`+`costShapes`, `pushBonus`, `effectDurationBonus`, `armorPierce`, `rangeBonus`+`rangeShapes`, `spreadsBurn`, `summonHpBonus`, `terrainDurationBonus`, `ignoresShield`, `effectChanceBonus`, `executeBonus`, `ninjutsuDodgeBonus`, `initiativePriority`, `extraBurnStacks`, `burnExplodeAtStacks`/`burnExplodeDamage`, `terrainOnHit`.

Depois:

```bash
npm run typecheck && npm test
```

Não precisa `npm run register` (autocomplete é dinâmico) nem `npm run seed` (isso é missão).

## Exemplo completo

```ts
// 1. src/data/jutsus/elemental.ts
{
  id: "suiton_trombeta",
  name: "Trombeta de Água",
  category: "NINJUTSU",
  element: "AGUA",
  tier: 1,
  resource: "chakra",
  cost: 22,
  actionType: "COMUM",
  baseDamage: 22,
  scalingAttribute: "ninjutsu",
  range: 5,
  shape: "LINE",
  effects: [{ effectId: "WET", duration: 2 }],
  requirements: { element: "AGUA", manualOnly: true },
  tags: ["agua", "linha", "encharcado"],
  description: "Jato pressurizado que deixa o alvo Encharcado.",
},

// 2. src/data/element-trees/index.ts (dentro do array AGUA)
A.jutsu("agua_trombeta", "Trombeta de Água", "🎺", "C", "Maré", 0, 6, ["agua_ondas"], 8, 8,
  "Jato pressurizado que deixa o alvo Encharcado."),

// 3. NODE_ABILITY
agua_trombeta: "suiton_trombeta",
```

## Armadilhas

- **Efeito sem `baseDamage` nunca é aplicado** (`if (damage > 0 && ability.effects)`). Jutsu de puro controle precisa de ao menos 1 de dano. Exceção: `SELF`/`ALLY` de buff, que passa pelo ramo de cura/cleanse.
- **`RADIUS` com `range: 1` → raio 0.** Use range par ≥ 2.
- **Descrição do nó e descrição da ability precisam bater.** Regra de ouro do projeto: se não der para implementar o que a descrição promete, **mude a descrição** — não deixe o texto mentindo. Anote a limitação em `docs/arvore-elementos.html`, como já foi feito com o BLEED do Vento, o HP dos muros de Terra e a imitação de técnica do Vínculo de Barro.
- **Novo `EffectId`** exige 4 passos: `EFFECT_IDS` + `EFFECT_LABELS` (`enums.ts`) → número em `BALANCE.effects` → comportamento em `services/combat/effects.ts` → consumo na engine. Pular qualquer um = efeito inerte.
- **Campo novo em `PassiveDef` sem consumo na engine = passiva morta**: o jogador paga o nó e não ganha nada.
- **Passiva cross-elemento não existe.** Uma passiva de Água não consegue buffar dano de Raio. Foi por isso que o +75% vs Encharcado ficou em `raio_nuvens`, não em `agua_condutora`.
- **Ids de nó são estáveis** (persistidos em `CharacterSkillNode`). Ids de ability podem mudar; a ponte é o `NODE_ABILITY`.
- **`RANKS` em `enums.ts` é `["D","C","B","A"]` — não tem `"S"`,** e `Ability` **não tem campo `rank`**. O rank S existe só como `NodeRank` na árvore (`element-trees/index.ts`). Não tente pôr `rank:` numa Ability.
- **O apêndice do `docs/arvore-elementos.html` está desatualizado** em relação ao código: ele descreve `knockback`/`pull` (viraram um único `push` com sinal), `terrainMods: {water, obstacles, swamp, smoke}` (virou `terrain: { kind, duration }` de um tipo só), `requiresWet` (é `chainWetTargets`), `requiresCloud` (é `requiresStorm`), `summonId` (é `summon: {...}`) e `multiDir`/`twoStage`/`spreadBurn` **que não existem na `Ability`** (`spreadsBurn` existe só como passiva). Use o HTML para **design e intenção**; use `src/data/types.ts` para o **contrato**.
