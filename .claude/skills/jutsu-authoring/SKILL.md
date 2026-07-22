---
name: jutsu-authoring
description: Use ao criar, editar ou balancear jutsus/habilidades (Ability) — ninjutsu elemental, iryo, taijutsu, genjutsu, kenjutsu, habilidade de clã. Cobre o contrato do campo Ability, tabela de balanceamento por tier, quais flags a engine realmente lê, requisitos/desbloqueio automático, e o teste obrigatório. Trigger: "adiciona jutsu", "novo jutsu", "cria habilidade", "balancear jutsu", "jutsu de raio/agua/vento", "jutsu do clã X".
---

# Criar jutsu

## ⚠️ Leia antes: os jutsus de jogador são descartáveis

As 39 habilidades **de jogador** hoje no projeto (15 elementais, 18 de support, 6 de clã) são **placeholder** e serão **apagadas** — não substituídas, apagadas. Existem só para exercitar o sistema de efeitos e de área. Vale até para `chidori`, `fuuton_rasenshuriken` e `uchiha_sharingan1`.

**Habilidades de NPC ficam** — são conteúdo real: `pombo_bicada`, `vespa_ferroada`.

Como distinguir (verificado, só essas 2 das 41):

| | Requisitos | Custo |
|---|---|---|
| **Jogador** (descartável) | tem `level`/`element`/`clanId`/`attributes` | > 0 |
| **NPC** (fica) | sem `requirements` de desbloqueio | 0 |

Estar em `NpcTemplate.abilityIds` **não** faz a habilidade ser de NPC — 13 ids aparecem lá, mas NPCs reusam jutsu de jogador (`katon_goukakyuu`, `tai_soco_forte`...). O teste é o requisito, não quem usa.

O que fica é o sistema: o contrato `Ability`, a engine, os efeitos, os números de `balance.ts`.

Consequências práticas:
- **Não invista em balanceamento fino** de jutsu de jogador sem pedido explícito. A tabela de tier abaixo serve pra manter os placeholders coerentes, não é balanceamento final.
- **Não trate os ids como contrato estável.** Código que dependa de `katon_goukakyuu` existir é frágil.
- Jutsu de jogador novo também é descartável — diga isso ao propor um.
- Habilidade de NPC é conteúdo de verdade: trate normal, balanceie normal.
- Ao mexer nos placeholders, priorize o que valida o sistema (o efeito novo funciona? a forma de área está certa?), não o feel do jogo.
- **Ao apagar em massa:** 13 ids são referenciados por `NpcTemplate.abilityIds` (`src/data/npcs.ts`) e as 6 de clã por `ClanDef.passiveIds`/`activeIds`. NPC que fica sem habilidade de dano vira inanimado — a IA o deixa parado.

## Onde

| Categoria | Arquivo |
|---|---|
| NINJUTSU elemental (FOGO/AGUA/VENTO/TERRA/RAIO) | `src/data/jutsus/elemental.ts` (`ELEMENTAL[]`) |
| IRYO, TAIJUTSU, GENJUTSU, KENJUTSU | `src/data/jutsus/support.ts` (`SUPPORT[]`) |
| CLA | `src/data/clans/index.ts` + registrar id em `passiveIds`/`activeIds` do clã |

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

## Armadilhas

- Efeito sem `baseDamage` = efeito nunca aplicado (`if (damage > 0 && ability.effects)`).
- `RADIUS` com `range: 1` → `floor(1/2) = 0` → raio 0. Use range par ≥ 2.
- `genjutsu` escala 1.0 e `genjutsuDuration()` **não está ligada na engine**. Jutsu de genjutsu hoje escala mal e a duração é fixa do `AppliedEffect`. Não finja que escala — ou ligue a formula, ou compense no `baseDamage`.
- Novo `EffectId`? Precisa entrar em `EFFECT_IDS` (`src/config/enums.ts`) **e** ganhar comportamento em `src/services/combat/effects.ts` **e** ser consumido na engine. Efeito só no enum não faz nada.
- Não precisa `npm run register` pra jutsu novo — o autocomplete é dinâmico.
