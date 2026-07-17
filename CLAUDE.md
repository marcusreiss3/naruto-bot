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
