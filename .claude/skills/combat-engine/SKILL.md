---
name: combat-engine
description: Use ao mexer na engine de combate — dano, esquiva/bloqueio/aparar, efeitos de status (BURN/POISON/BLEED/STUN/SLOW/ROOT/CONFUSION/DISARM), economia de ação, turnos, IA de NPC, terreno (água/altura/árvore), ou balanceamento global. Cobre o pipeline useAbility→resolveHit, o que é puro vs DB, onde cada número mora, e os pontos já sabidos como não-ligados. Trigger: "combate", "dano", "esquiva", "efeito de status", "turno", "IA do NPC", "balanceamento", "engine".
---

# Engine de combate

## Mapa dos arquivos

| Arquivo | Papel | Puro? |
|---|---|---|
| `src/config/balance.ts` | **todos** os números | — |
| `src/services/combat/combat-math.ts` | `computeDamage`, `computeHeal`, `dodgeChance`, `resolveAreaCells`, `cellDistance` | puro |
| `src/services/combat/effects.ts` | ticks, stacks, multiplicadores de status | puro |
| `src/services/characters/formulas.ts` | `maxHp`, `moveRange`, `costAfterMastery`, `genjutsuDuration` | puro |
| `src/services/combat/combat-engine.ts` | estado + Prisma + orquestração (825 linhas) | **não** |
| `src/services/combat/npc-combat.ts` | IA de turno de NPC | não |
| `src/commands/combate.ts` | slash commands + botões de reação | não |
| `src/utils/grid.ts` | célula ↔ coord, linha, cone, raio, vizinhos | puro |

**Regra**: número novo → `balance.ts`. Cálculo novo → `combat-math.ts` ou `effects.ts` (puro, testável). Só a costura vai pra `combat-engine.ts`.

## Pipeline de um ataque

```
useAbility(session, actorId, abilityId, targetCell, targetId?)
  valida: existe / vivo / possui o jutsu (player: lê DB ao vivo; NPC: snapshot jutsuIdsJson)
  valida: economia de ação (actedCommon/actedBonus/actedMove)
  valida: NINJUTSU_BLOCK (só NINJUTSU), STUN (tudo)
  valida: custo após maestria vs pool (chakra/energia)
  CONFUSION: redireciona alvo p/ alguém aleatório
  valida: alcance (MELEE usa max(1,range))
  deduz recurso + marca ação          <-- efeitos colaterais acontecem AQUI
  aplica cura/cleanse/buff-self na hora
  monta hits[] com rawDamage           <-- dano NÃO aplicado ainda
      ↓ (Discord mostra botões de reação por 20s)
resolveHit(sessionId, hit, attackerId, { reaction, reactionAbilityId })
  DODGE  -> dodgeChance(); acerto = dano 0
  BLOCK  -> dano * (1 - 0.5)
  PARRY  -> dano * (1 - 0.6)
  aplica dano, efeitos on-hit (só se damage > 0), DISARM, morte
```

Por que separado: o alvo reage entre os dois passos. `useAbility` **recarrega nada** — quem chama passa a `session`; `resolveHit` refaz o fetch por id. NPC chama os dois em sequência com `reaction: "NONE"`.

## Fórmulas

```
dano   = (baseDamage + attr * SCALE[attr]) * burnTaiMult? * scenarioDmgMult? * (heightBonus ? 1.1 : 1)
         + weaponDamage (só KENJUTSU)
SCALE  = ninjutsu 2.0 | iryo 2.5 | taijutsu 1.8 | kenjutsu 1.8 | genjutsu 1.0
cura   = (baseHeal + iryo * 2.5) * (sangrando ? 0.5 : 1)
esquiva físico  = 0.05 + tai * 0.01   (cap 0.35)
esquiva ninjutsu= 0.03 + nin * 0.008  (cap 0.30)
  modificadores: +0.1 reactionBuff, -0.15 DEFENSE_DOWN, -0.1 atacante elevado
hp     = 100 + nivel * 5 + taijutsu * 3
mover  = 2 + floor(tai / 15)   (SLOW: * 0.5)
custo  = cost * (BASICO 1.0 | CONTROLADO 0.7 | MESTRE 0.55)
```

## Efeitos

| Efeito | Comportamento | Stacka? |
|---|---|---|
| BURN | 8 dmg/turno; -5% dano TAI/KEN por stack; **5 stacks = explode 40 e zera** | sim |
| POISON | `2 + (stacks-1) * 1` por turno | sim |
| BLEED | 5 dmg/turno; corta cura pela metade; portador perde 6 HP ao usar TAI/KEN | sim |
| STUN | não pode agir | **não** (só estende duração) |
| SLOW | movimento * 0.5 | sim (sem efeito extra) |
| ROOT | não pode mover | sim |
| CONFUSION | redireciona alvo | sim |
| NINJUTSU_BLOCK | trava categoria NINJUTSU | sim |
| DEFENSE_DOWN | -15% esquiva | sim |
| DISARM | dropa arma na célula (`DroppedItem`) | — |

Ao adicionar efeito: `EFFECT_IDS` em `enums.ts` → número em `BALANCE.effects` → comportamento puro em `effects.ts` → consumo na engine (`useAbility` p/ modificador de dano, `resolveHit` p/ on-hit, `endTurn` p/ tick). Pular qualquer passo = efeito inerte.

## Terreno

- **Altura/árvore**: só conta se `flags.elevated === true` (subiu), não por pisar na célula. Dá +10% dano e -10% esquiva do alvo.
- **Água**: `waterWalkUpkeepPerTurn` 5% chakra/turno; sem chakra, cai.
- **Obstáculos/árvores**: bloqueiam linha de visão via `scenario.cells`.
- **`elementModifiers` do cenário**: `dmgMult`/`costMult` por elemento. Só `dmgMult` está ligado — `costMult` não é lido pela engine.
- **Empilhamento**: `MAX_PER_CELL = 3`, contado por lado (NPC vs player separadamente).

## Pontas soltas conhecidas (verificado)

Não são teoria — são gaps reais. Se o pedido tocar num deles, avise ou conserte:

1. **`genjutsuDuration()` nunca chamada pela engine.** Genjutsu escala 1.0 e não estende duração. O atributo genjutsu praticamente não faz nada em combate hoje (só resistência Yamanaka). **Maior gap aberto.**
2. **`heightAttackRangeBonus: 1` nunca lido.** Altura não dá alcance.
3. **`tickEffect` retorna `exploded: false` sempre** — a explosão de BURN só acontece em `applyBurnStacks`, no on-hit. Queimadura nunca explode por tick.
4. **`elementModifiers.costMult`** definido no tipo, nunca aplicado.

Já corrigidos: DISARM disparava com dano 0 (desarmava quem esquivou); `bleedExtraOnPhysical` estava importada mas nunca chamada — agora o atacante que sangra perde `BLEED.extraOnTaiKen` HP ao usar TAI/KEN.

## Testar

Lógica pura tem teste em `tests/` (`combat-math.test.ts`, `effects.test.ts`, `formulas.test.ts`). Mexeu em fórmula/efeito → atualize ou adicione teste lá. Engine com Prisma não é testada — mantenha a regra nova na camada pura pra ela ser testável.

```bash
npm run typecheck && npm test
```
