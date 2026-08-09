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

## Não existe mais placeholder

**Todas as 258 habilidades do projeto são conteúdo real.** Balanceie normalmente: números, custo, requisitos, texto. Rode `npx tsx scripts/audit-jutsu-costs.ts` antes de commitar custo novo — ele mostra o desvio contra a régua e, ao lado, os freios que a fórmula não vê (uso único, dojutsu ativo, gate de nível). Desvio grande **com** freio está explicado; desvio grande com a coluna vazia é dívida.

> Histórico, para ninguém reintroduzir a confusão: até 09/08/2026 esta seção dizia que as "39 habilidades de jogador em `src/data/jutsus/` e `clans/index.ts`" eram placeholder descartável, citando `chidori`/`fuuton_rasenshuriken`/`uchiha_sharingan1`. Era verdade quando o projeto tinha 39 abilities no total. O último arquivo realmente descartável era o `jutsus/support.ts`, **apagado em 09/08/2026**: as 18 de jogador sumiram, as 5 de bicho e as 7 que os NPCs usavam foram para `jutsus/npc.ts`, e as reações básicas para `jutsus/fundamentals.ts`.

**Arsenal de NPC** (`src/data/jutsus/npc.ts`): a marca é **não ter `requirements`** — `autoUnlockJutsus()` pula essas, então nunca caem no arsenal de jogador. Entram em combate só via `NpcTemplate.abilityIds`. Os ids do kit genérico usam prefixo `npc_`. (NPCs também *reusam* jutsu de jogador — estar em `NpcTemplate.abilityIds` não faz a habilidade ser de NPC.)

⚠️ **Reações básicas:** `tai_defesa` (BLOCK), `ken_aparar` (PARRY) e `tecnica_substituicao` (DODGE), em `jutsus/fundamentals.ts`, são as únicas reações **genéricas** — o contra-jogo que qualquer personagem tem. As outras (Muralha de Água, Palma Rotativa, Método de Interseção…) exigem elemento, clã ou árvore. Não apague as três sem substituir: a engine escolhe a reação por `reactionKind`, não por id, então nada quebra ao compilar e o jogador só perde a opção.

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
