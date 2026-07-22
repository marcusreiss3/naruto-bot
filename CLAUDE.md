# Naruto RP Bot

Bot de Discord: RPG de Naruto, combate tático em grid, mapas por canal, clãs, missões.
Stack: Node + TypeScript (ESM) + discord.js v14 + Prisma (SQLite) + sharp + Vitest.

## Comandos

```bash
npm run dev          # tsx watch
npm run typecheck    # tsc --noEmit — rode SEMPRE antes de terminar
npm test             # vitest run
npm run register     # registra slash commands (após mudar SlashCommandBuilder)
npm run prisma:push  # aplica schema.prisma no SQLite
npm run seed         # grava MissionDef no banco (após editar src/data/missions)
```

## ⚠️ Os jutsus de jogador são descartáveis

As 39 habilidades **de jogador** em `src/data/jutsus/` e `src/data/clans/index.ts` são **placeholder de teste** e serão **apagadas** — não substituídas, apagadas. Existem só para exercitar o sistema de efeitos. Vale inclusive para nomes canon (`chidori`, `fuuton_rasenshuriken`, `uchiha_sharingan1`).

**Habilidades de NPC ficam** — são conteúdo real: `pombo_bicada` e `vespa_ferroada`. Como distinguir: NPC não tem requisito de desbloqueio e custa 0; jogador tem `level`/`element`/`clanId`/`attributes`. (NPCs também *reusam* jutsus de jogador — estar em `NpcTemplate.abilityIds` não faz a habilidade ser de NPC.)

O que fica é o sistema: o contrato `Ability`, a engine de combate, os efeitos e os números de `balance.ts`.

Na prática: **não invista em balanceamento fino** (dano, custo, tier, requisitos) dos jutsus de jogador sem pedido explícito. Não trate os ids como contrato estável. Jutsu de jogador novo também é descartável.

## Regras do código

- **ESM**: todo import relativo termina em `.js`, mesmo apontando pra `.ts`. `import { x } from "./y.js"`.
- **Conteúdo vs engine**: números e definições ficam em `src/config/balance.ts` e `src/data/`. Engine (`src/services/`) lê deles, nunca hardcoda. Ao ajustar balanceamento, mexa em `balance.ts`, não na engine.
- **Idioma**: identificadores e comentários em português sem acento (`missao`, `nivel`). Strings de usuário em português **com** acento e emoji. Slash commands em português (`/jutsu ninjutsu`, `/combate iniciar`).
- **Lógica pura testável**: regras de missão/combate ficam em funções puras; Prisma fica na borda. Testes em `tests/` cobrem só a parte pura.
- **`as const`**: enums são arrays `as const` + tipo derivado em `src/config/enums.ts`. Prisma guarda string.

## Arquitetura

```
src/config/      enums.ts (Element/Attribute/Category/Shape/EffectId), balance.ts (TODOS os números), env.ts
src/data/        jutsus/, clans/, scenarios/, missions/, npcs.ts, types.ts  <- conteúdo editável
src/services/
  characters/    formulas.ts (maxHp, moveRange, costAfterMastery), progressão, requisitos
  combat/        combat-engine.ts (estado+DB), combat-math.ts (puro), effects.ts (puro), npc-combat.ts (IA)
  missions/      mission-service.ts, mission-runtime.ts, um arquivo por missão
  npc-ai/        Groq + fallback local (personas.ts)
  maps/          renderer SVG -> PNG (sharp)
src/commands/    slash commands (perfil, mapa, combate, jutsu, missoes, admin, ...)
```

## Fluxo de combate (resumo)

`useAbility()` valida (posse do jutsu, economia de ação, STUN/NINJUTSU_BLOCK, custo, alcance),
deduz recurso, e retorna `hits[]` **sem aplicar dano**. `resolveHit()` aplica reação
(DODGE/BLOCK/PARRY), dano, efeitos on-hit e morte. Separado porque o alvo tem 20s de
botão de reação no Discord entre os dois.

## Gotchas

- Mudou `SlashCommandBuilder`? Rode `npm run register`.
- Mudou `MissionDef` em `src/data/missions/`? Rode `npm run seed`.
- `getAttr()` lê NPC do template e player de `flags.attrs` (snapshot). Jutsus possuídos do player são lidos ao vivo do DB, não do snapshot.
- Channel IDs dos cenários são hardcoded em `src/data/scenarios/index.ts` — específicos do servidor.
- `.env` nunca vai pro git. `GROQ_API_KEY` vazia = NPCs usam `fallbackLines`.
