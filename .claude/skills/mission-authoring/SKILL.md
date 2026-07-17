---
name: mission-authoring
description: Use ao criar ou editar missões (rank D/C/B/A) — MissionDef, handler de runtime, estado persistido, objetivos, recompensas, entidades no mapa, e o registro nos 4 lugares obrigatórios. Trigger: "nova missão", "missão rank C", "cria missão", "handler de missão", "objetivo da missão".
---

# Criar missão

## Registrar em 4 lugares — pular um = missão morta

1. **Tipo**: adicionar a string na union `MissionDef["type"]` em `src/data/types.ts`.
2. **Definição**: `MissionDef` em `src/data/missions/index.ts`.
3. **Handler**: `src/services/missions/<slug>.ts`, um arquivo por missão.
4. **Dispatch**: ligar o `type` ao handler em `src/services/missions/mission-runtime.ts`.

Depois: `npm run seed` (as MissionDef vão pro banco) e `npm run typecheck && npm test`.

## MissionDef

```ts
{
  id: "armadilha_rota_comercial",        // snake_case, é a chave de getMission()
  name: "Armadilhas na Rota Comercial",
  rank: "C",                              // D | C | B | A
  description: "...",
  channelId: ROTA_COMERCIAL_KONOHA_CHANNEL_ID,  // importar de data/scenarios, nunca literal
  objectives: [{ id: "desarmar_fio_disparo", description: "..." }],
  rewards: { xp: 300, ryo: 150 },
  type: "ROUTE_TRAPS",
  data: { variantId: "KONOHA", maxMistakes: 3 },  // knobs da missão, tipado como Record<string, unknown>
}
```

- **`channelId`** amarra a missão a um cenário. Importe a const de `src/data/scenarios/index.ts`.
- **`data`** é onde vão números ajustáveis (turnos de briefing, tolerância a erro, timeouts, variante). Handler lê com fallback: `def.data?.maxMistakes as number ?? 3`. Serve pra reusar um handler em várias missões via `variantId`.
- **`objectives[].id`** é a chave de `markObjective()`. Os testes checam essa lista.

## Handler

Serviços compartilhados de `mission-service.ts`:

| Função | Uso |
|---|---|
| `getInstance` / `getActiveMissions` | pegar a missão ativa no canal |
| `readState` / `setState` | estado da missão (JSON serializado no DB) |
| `markObjective` | marcar objetivo cumprido |
| `completeMission` + `buildMissionCompleteEmbed` | fechar e premiar |
| `partyMemberIds` (`party/party-service.js`) | ações valem pra party toda, não só quem digitou |

Padrão dos handlers existentes:

```ts
export interface XState { step: number; mistakes: number; /* ... */ }
function ensureState(raw: string): XState { /* defaults p/ estado novo ou corrompido */ }
async function findContextByCharId(charId, channelId?): Promise<XContext | null> { /* ... */ }
export async function resolveX(...) { /* entrada chamada pelo runtime */ }
```

Estado vive em JSON no banco e sobrevive a restart. Sempre passe por `ensureState` — nunca confie no shape do JSON lido.

## Entidades no mapa

Handler exporta `RenderEntity[]` (`services/maps/renderer.ts`) pro `/mapa` desenhar gato/NPC/tronco na célula. Combate de missão: monta `StartNpc[]` com `NpcTemplate` de `src/data/npcs.ts`.

## Diálogo

NPC que fala precisa de `Persona` em `personas.ts` + `NpcTemplate.aiPersona`. Ver skill `npc-persona`.

## Teste obrigatório

Todo handler novo tem teste em `tests/<slug>.test.ts`. O padrão mínimo (copiado de `route-traps.test.ts`) valida o **registro**, não a IA:

```ts
it("registers a rank C mission on <cenário>", () => {
  const mission = getMission("<id>");
  expect(mission?.rank).toBe("C");
  expect(mission?.type).toBe("<TYPE>");
  expect(mission?.channelId).toBe(<CHANNEL_CONST>);
});
it("tracks objectives", () => {
  const ids = getMission("<id>")?.objectives.map((o) => o.id) ?? [];
  expect(ids).toContain("<objetivo>");
});
it("registers the persona", () => {
  expect(getPersona("<persona_key>")).toBeDefined();
});
```

Lógica pura (contagem de passos, erros, transição de estado) → função pura exportada + teste. Não teste caminho com Prisma.

## Armadilhas

- Esqueceu `npm run seed` = missão não existe no banco, `/admin missao adicionar` falha.
- Esqueceu o dispatch no `mission-runtime.ts` = missão existe, handler nunca roda, sem erro.
- `channelId` literal em vez da const = missão em canal errado no servidor de quem clonar.
- Ação de um membro deve valer pra party (`partyMemberIds`) — missões existentes fazem isso.
