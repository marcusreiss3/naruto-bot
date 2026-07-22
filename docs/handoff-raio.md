# Tarefa: implementar o elemento RAIO (último dos 5) — bot de RPG Naruto

Você vai continuar um trabalho já em andamento. **Fogo, Água, Vento e Terra já estão prontos e funcionando.** Falta só Raio. Siga os padrões que já existem no código — não invente estrutura nova.

## Stack e regras do projeto

- Node + TypeScript **ESM** + discord.js v14 + Prisma (SQLite) + Vitest.
- **Todo import relativo termina em `.js`**, mesmo apontando pra `.ts`: `import { x } from "./y.js"`.
- **Identificadores e comentários em português SEM acento** (`missao`, `nivel`). **Strings de usuário em português COM acento.**
- **Números ficam em `src/config/balance.ts`**, nunca hardcoded na engine.
- **Lógica pura fica em módulo testável**; Prisma só na borda (`combat-engine.ts`).
- Enums são arrays `as const` em `src/config/enums.ts` + tipo derivado.

Comandos:
```bash
npm run typecheck   # tsc --noEmit — rode SEMPRE antes de terminar
npm test            # vitest run — 200 testes passando hoje; não pode quebrar
```

## Como o sistema funciona (leia antes de codar)

Existe uma **árvore de habilidades** por elemento em `src/data/element-trees/index.ts`. Cada nó é `JUTSU` ou `PASSIVE`.

- **Nó JUTSU** concede uma `Ability` ao ser comprado. O mapeamento nó→ability fica no objeto `NODE_ABILITY` no fim desse arquivo.
- **Nó PASSIVE** não é `Ability`. É um modificador declarativo em `src/data/element-trees/passives.ts`, agregado por `src/services/combat/passives.ts` e consumido pela engine.

### REGRA CRÍTICA 1 — todo jutsu da árvore é `manualOnly`

```ts
requirements: { element: "RAIO", manualOnly: true }
```

Sem `manualOnly`, o auto-unlock por nível/atributo entrega o jutsu de graça e a árvore vira enfeite. **Já existe um teste que falha se você esquecer.**

### REGRA CRÍTICA 2 — dano NÃO escala com atributo

Em `balance.ts`, `ninjutsuScaling`/`taijutsuScaling`/`bukijutsuScaling`/`iryoNinjutsuScaling` estão todos em **0**. Isso é intencional.

```
dano = baseDamage × (multiplicadores das passivas de dano do elemento)
```

O crescimento vem da **árvore**, não de acumular atributo. Ninjutsu continua valendo muito: é o **orçamento** que compra os nós.

### REGRA CRÍTICA 3 — as passivas de dano de cada elemento devem multiplicar ~2.0×

Existe teste que **falha** se ficar fora da faixa **1.8–2.2×**. Os outros 4 elementos usam duas passivas: uma de `1.30` e outra de `1.55` (= 2.015).

Água é a exceção elegante: tem só `1.15` fixo, mas `damageMultVsEffect: { effectId: "WET", mult: 1.75 }` — ou seja, bate fraco em alvo seco e **2.01× contra alvo Encharcado**. Ela ganha por *montar a jogada*. O teste conta o condicional junto.

## Contrato `Ability` (`src/data/types.ts`)

Obrigatórios: `id`, `name`, `category`, `tier`, `resource`, `cost`, `actionType`, `range`, `shape`, `tags`, `description`.

```ts
category: "NINJUTSU"          // Raio é sempre NINJUTSU
element: "RAIO"
tier: 1 | 2 | 3               // C→1, B→2, A/S→3
resource: "chakra"
cost: number                  // % de um pool de 100
actionType: "COMUM" | "BONUS" | "MOVIMENTO" | "REACAO"
baseDamage?: number
scalingAttribute: "ninjutsu"  // mantenha, mesmo com escala 0
range: number                 // em casas
shape: "SINGLE_TARGET" | "MELEE" | "LINE" | "CONE" | "RADIUS" | "SELF" | "ALLY"
effects?: [{ effectId, stacks?, duration?, chance? }]
requirements: { element: "RAIO", manualOnly: true }

// flags especiais
unblockable?: boolean         // ignora BLOCK/PARRY (e DODGE)
undodgeable?: boolean         // ignora só DODGE
terrain?: { kind: TerrainKind; duration?: number }
clearsTerrain?: TerrainKind
push?: number                 // >0 empurra, <0 puxa (em casas)
summon?: { templateId: string; onDeath?: { effectId, radius, duration? } }
```

**ARMADILHA:** efeito só é aplicado se `damage > 0`. Jutsu de puro controle precisa de pelo menos 1 de `baseDamage`, senão o efeito nunca entra.

**ARMADILHA:** `RADIUS` usa `floor(range / 2)` como raio. `range: 1` vira raio 0. Use range par ≥ 2.

## Contrato `PassiveDef` (`src/data/element-trees/passives.ts`)

Todos os campos abaixo **já existem e já são consumidos pela engine**:

```ts
{
  nodeId: string;
  element: Element;
  damageMult?: number;                                    // 1.3 = +30%
  damageMultVsEffect?: { effectId: EffectId; mult: number }; // dano condicional
  costMult?: number;
  costShapes?: Shape[];
  pushBonus?: number;
  effectDurationBonus?: { effectId: EffectId; bonus: number };
  armorPierce?: number;        // corta % da redução de BLOCK/PARRY
  rangeBonus?: number;
  rangeShapes?: Shape[];
  spreadsBurn?: boolean;
  summonHpBonus?: number;
  terrainDurationBonus?: number;
  ignoresShield?: boolean;     // <<< JÁ EXISTE, feito pensando na Ponta Perfurante
  extraBurnStacks?: number;
  burnExplodeAtStacks?: number;
  burnExplodeDamage?: number;
  terrainOnHit?: { kind: TerrainKind; duration: number };
}
```

**Se um campo novo não for consumido pela engine, a passiva é morta** — o jogador paga o nó e não ganha nada. Há teste de integridade que exige que todo nó PASSIVE tenha definição.

## Efeitos existentes (`EFFECT_IDS` em `src/config/enums.ts`)

`BURN` · `POISON` · `BLEED` · `STUN` · `SLOW` · `DISARM` · `CONFUSION` · `ROOT` · `NINJUTSU_BLOCK` · `DEFENSE_DOWN` · `FLEE_LOCK` · `WET` · `SHIELD` · `CHAKRA_DRAIN`

Terreno (`TERRAIN_KINDS`): `FIRE` · `WATER` · `OBSTACLE` · `SMOKE` · `SWAMP`

Para criar efeito novo: entrar em `EFFECT_IDS` **E** ganhar número em `BALANCE.effects` **E** comportamento em `effects.ts` **E** ser consumido na engine. Pular qualquer passo = efeito inerte.

---

# A ÁRVORE DE RAIO — 12 nós

Estão **todos já definidos** em `src/data/element-trees/index.ts` (procure por `const RAIO`). **Não mude os ids** — eles estão no banco. Você só precisa criar as `Ability` e as `PassiveDef`.

## 8 jutsus (criar em `src/data/jutsus/elemental.ts`, bloco `// ---- RAIO ----`)

| id do nó | Nome | Rank | O que a descrição promete |
|---|---|---|---|
| `raio_esfera` | Esfera de Relâmpago | C | Esferas de relâmpago. 25% de Atordoar. Dano extra em alvo Encharcado. |
| `raio_ataque` | Ataque de Raio | C | Fluxo elétrico em linha longa que **atravessa obstáculos e rochas**. Pode Atordoar. Dano extra em Encharcado. |
| `raio_pilares` | Prisão dos Quatro Pilares | A | Ergue 4 pilares de pedra em volta e eletrocuta: Atordoamento longo, preso ao chão, sem fugir. |
| `raio_clone` | Clone de Raio | B | Invocação. Ao ser ferido, se desfaz em relâmpago e **Atordoa quem o atacou**. |
| `raio_armadura` | Armadura do Ataque Relâmpago | B | Cobre o corpo: mais rápido, esquiva mais, **+25 pontos percentuais na chance de fuga**, eletrocuta quem encostar, solta de amarras de metal. |
| `raio_assassinato` | Assassinato Eletromagnético | B | Manda eletricidade por um condutor (água/metal): **atinge em cadeia todos os alvos Encharcados** e Atordoa com certeza. |
| `raio_pararaios` | Para-Raios | A | **Precisa encostar no alvo primeiro.** Descarrega um raio pelo próprio corpo até o dele: indefensável, dano alto num alvo só, Atordoa. |
| `raio_kirin` | Kirin | S | Raio de verdade das nuvens: quase instantâneo, indefensável, dano enorme em área. **Precisa de nuvens de tempestade (criadas por jutsus de Fogo) e só 1× por combate.** |

## 4 passivas (criar em `src/data/element-trees/passives.ts`)

| id do nó | Nome | O que promete |
|---|---|---|
| `raio_raiz` | Sinapse Acelerada | Esquiva mais de Ninjutsu; age mais cedo no turno. |
| `raio_sobrecarga` | Sobrecarga | +20% de chance dos jutsus de Raio Atordoarem. |
| `raio_nuvens` | Nuvens de Tempestade | Libera o Kirin sem depender de aliado de Fogo; alvos Encharcados tomam +75% de dano de Raio. |
| `raio_perfurante` | Ponta Perfurante | Ignora a **Barreira** do alvo; +25% de dano em quem está abaixo de 30% de vida. |

**Você precisa acomodar os ~2.0× de dano nessas 4 passivas.** Sugestão forte, seguindo o padrão da Água (Raio é o parceiro de combo dela):

- `raio_raiz`: `damageMult: 1.15`
- `raio_nuvens`: `damageMultVsEffect: { effectId: "WET", mult: 1.75 }` → fecha 2.01× contra Encharcado

Isso torna Raio o espelho da Água: fraco sozinho, devastador com o setup. **É o combo assinatura do jogo.**

---

# O QUE JÁ EXISTE vs O QUE VOCÊ PRECISA CONSTRUIR

## ✅ Já pronto, é só usar

- `WET` (Encharcado) como efeito
- `damageMultVsEffect` — dano condicional por efeito do alvo, **recalculado por alvo**
- `ignoresShield` no `PassiveMods` — **já existe no agregador**, feito pra Ponta Perfurante. Verifique se a engine já consome (`resolveHit` checa `atkMods?.ignoresShield` antes de descontar a Barreira). Você só precisa pôr o campo na `PassiveDef` do `raio_perfurante`.
- Sistema de invocação completo — Clone de Raio é só um `NpcTemplate` em `src/data/npcs.ts` + campo `summon` no jutsu. **Zero engine nova.**
- `terrain: { kind: "OBSTACLE" }` — use nos Quatro Pilares
- `FLEE_LOCK`, `STUN`, `ROOT` — todos funcionam
- `attemptFlee` aceita bônus aditivo de chance. A Armadura usa `+25` pontos percentuais, respeitando `FLEE_LOCK` e o teto normal de fuga.

## ⚠️ Você precisa construir

1. **`pierceObstacles`** (Ataque de Raio) — hoje a linha de visão é bloqueada por `OBSTACLE`/`SMOKE`/árvore. Veja `effectiveLineBlockers` + `lineIsClear` em `src/services/combat/terrain.ts`, e a checagem em `useAbility` (`combat-engine.ts`, procure "linha de visão"). Adicione uma flag na `Ability` que pula essa checagem. **É o counter das defesas de Terra** — importante.

2. **Chance de efeito +20%** (Sobrecarga) — hoje `chance` é fixo no `AppliedEffect`. Precisa de um campo tipo `effectChanceBonus` na `PassiveDef` somado na hora de rolar (`resolveHit`, procure `if (ae.chance !== undefined && !chance(ae.chance)) continue;`).

3. **Bônus de execução** (Ponta Perfurante, +25% abaixo de 30% de vida) — dano condicional por **vida do alvo**, não por efeito. Precisa de campo novo tipo `executeBonus: { hpThreshold: 0.3, mult: 1.25 }`.

4. **`HASTE`** (Armadura) — efeito novo: +movimento, +esquiva e +25 pontos percentuais na chance de fuga, sem garantia. Respeita `FLEE_LOCK` e o teto normal da fuga.

5. **Kirin: 1× por combate + exige nuvens** — precisa de estado. Sugestão: flag no participante (`flags.kirinUsado`) validada em `useAbility`. O "exige nuvens" pode ser: ter o nó `raio_nuvens` comprado **ou** existir terreno `FIRE` no mapa (um Katon aliado criou as nuvens). Isso fecha o **combo Fogo→Raio**.

6. **Cadeia** (Assassinato Eletromagnético) — atinge todos os alvos com `WET`. Pode ser resolvido como `RADIUS` filtrando só quem tem `WET`, ou lógica própria. Escolha o mais simples que funcione.

---

# COMBOS ENTRE ELEMENTOS (o coração do design)

Raio é o **finalizador** dos combos dos outros:

1. **Água → Raio** (principal): Água aplica `WET` em quase tudo que faz. Raio bate **+75%** em alvo Encharcado e encadeia entre eles. O Clone de Água, ao morrer, Encharca a área inteira — é setup de graça pro Raio.
2. **Fogo → Raio**: Katon cria terreno `FIRE`; isso pode habilitar o Kirin (nuvens de tempestade).
3. **Raio → Terra**: o Ataque de Raio atravessa obstáculos, então é o counter natural das paredes e cúpulas de Terra.

**PENDÊNCIA CONHECIDA:** a passiva de Água **Maré Condutora** originalmente prometia *"alvos Encharcados tomam +40% de dano de Raio"*. Isso é passiva de um elemento mexendo no dano de outro (cross-elemento) e **o sistema não suporta**. Foi removida da descrição e anotada no doc. **A decisão de onde colocar esse bônus é sua**: o mais simples é pôr no próprio Raio (via `damageMultVsEffect` do `raio_nuvens`, como sugeri acima), e aí não precisa de suporte cross-elemento nenhum.

---

# ARQUIVOS QUE VOCÊ VAI MEXER

| Arquivo | O quê |
|---|---|
| `src/data/jutsus/elemental.ts` | Os 8 jutsus, no bloco `// ---- RAIO ----` (substitua os placeholders que estiverem lá) |
| `src/data/element-trees/passives.ts` | As 4 `PassiveDef` de Raio |
| `src/data/element-trees/index.ts` | Adicionar as 8 entradas no `NODE_ABILITY` (nó → id da ability). Ajustar descrições dos nós **se** o que você implementou divergir do prometido |
| `src/data/npcs.ts` | `NpcTemplate` do Clone de Raio (siga `summon_clone_agua`) |
| `src/config/enums.ts` | `HASTE` no `EFFECT_IDS` |
| `src/config/balance.ts` | Números de `HASTE`, bônus de execução, chance de stun |
| `src/services/combat/effects.ts` | Comportamento de `HASTE` |
| `src/services/combat/passives.ts` | Campos novos no agregador |
| `src/services/combat/combat-engine.ts` | Consumo: pierceObstacles, chance de efeito, execução, HASTE |
| `tests/passives.test.ts` | Testes das passivas de Raio (siga o bloco `describe("passivas: Terra")`) |
| `docs/arvore-elementos.html` | Atualizar a seção de Raio se algo divergir |

Convenção de id de ability: prefixo de família — **`raiton_*`** (ex: `raiton_jibashi`). Os ids **de nó** (`raio_*`) não mudam; a ponte é o `NODE_ABILITY`.

---

# REGRA DE OURO DESTE PROJETO

**Se você não conseguir implementar algo que a descrição do nó promete, MUDE A DESCRIÇÃO — não deixe o texto mentindo pro jogador.**

Foi exatamente isso que fizemos em 3 casos:
- Vento "Sangramento tira 8/turno" → não dava sem mudar o schema, virou "+55% de dano e +1 rodada"
- Terra "muros +50% de HP" → terreno não tem HP, virou só "+1 rodada"
- Terra "invocações imitam sua última técnica" → cortado

Em todos, a limitação foi anotada no `docs/arvore-elementos.html`. Faça o mesmo.

# ANTES DE TERMINAR

```bash
npm run typecheck && npm test
```

200 testes passam hoje. Se algum quebrar, conserte — não comente o teste.
