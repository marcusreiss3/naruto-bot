# Naruto RP Bot

Bot de Discord para RPG de Naruto com combate tático em grid, mapas por canal, atributos, jutsus, efeitos de status, clãs e missões (rank D e C). Stack: **Node + TypeScript + discord.js v14 + Prisma (SQLite) + sharp + Vitest**.

> MVP jogável e extensível. Todo o balanceamento, jutsus, clãs, cenários e missões ficam em arquivos editáveis.

---

## 1. Instalar dependências

```bash
npm install
```

> `sharp` baixa binários nativos automaticamente. Em caso de erro, rode `npm rebuild sharp`.

## 2. Configurar `.env`

Copie o exemplo e preencha:

```bash
cp .env.example .env
```

```env
DISCORD_TOKEN=          # token do bot (Discord Developer Portal)
DISCORD_CLIENT_ID=      # Application ID
DISCORD_GUILD_ID=       # ID do servidor (registro instantâneo de comandos). Vazio = global (~1h)
DATABASE_URL="file:./dev.db"
ADMIN_ROLE_IDS=         # IDs de cargos admin separados por vírgula (além de quem tem permissão Administrator)
GROQ_API_KEY=           # opcional: IA dos NPCs. Vazio = fallback local roteirizado
GROQ_MODEL=llama-3.3-70b-versatile
```

**Nunca** faça commit do `.env` (já está no `.gitignore`).

## 3. Migrations e seed

```bash
npm run prisma:generate     # gera o client
npm run prisma:push         # cria as tabelas no SQLite (ou: npm run prisma:migrate)
npm run seed                # grava as definições de missão no banco
```

## 4. Registrar slash commands

```bash
npm run register
```

Com `DISCORD_GUILD_ID` preenchido o registro é imediato. Sem ele, é global (propaga em ~1h).

## 5. Iniciar o bot

```bash
npm run dev      # desenvolvimento (tsx watch)
# ou
npm run build && npm start
```

## 6. Testar

```bash
npm run typecheck
npm test
```

---

## 7. Criar personagem de teste

O personagem é criado automaticamente no primeiro uso de qualquer comando (`/perfil ver`, `/mapa`, etc.). Para deixá-lo jogável:

```text
/admin nivel-set usuario:@você valor:15
/admin elemento-set usuario:@você elemento:fogo
/admin atributo set usuario:@você atributo:ninjutsu valor:12
/admin cla-set usuario:@você cla:uchiha
/admin jutsu adicionar usuario:@você jutsu:katon_goukakyuu
```

Jutsus elementais são desbloqueados **automaticamente** ao atingir os requisitos (elemento + nível + atributo).

## 8. Iniciar combate

No canal de um cenário (Floresta / Rio / Praça):

```text
/combate iniciar jogadores:@a @b @c     # até 25 participantes
/combate status
/combate mover destino:B5
/combate usar habilidade:katon_goukakyuu alvo:C5
/combate fim-turno
/combate pegar-arma
/combate agua                            # andar sobre a água (cenário Rio)
```

Ao ser atacado, aparecem **botões de reação** (Esquivar / Bloquear / Aparar / Sem reação) por 20s.

## 9. Usar `/mapa`

```text
/mapa
```

Mostra o cenário do canal. Em combate, exibe posições, NPCs, armas dropadas (🔴) e a rodada. Com missão ativa no canal, carrega entidades da missão (ex.: o gato 🐱).

## 10. Setar missão via `/admin`

```text
/admin missao adicionar usuario:@jogador missao:gato_perdido          # canal: Praça
/admin missao adicionar usuario:@jogador missao:lider_bandidos        # canal: Centro Comercial
/admin missao adicionar usuario:@jogador missao:escolta_comerciante   # canal: Rota Comercial de Konoha
/admin missao concluir usuario:@jogador missao:gato_perdido
```

- **Gato (rank D, Praça):** `/mapa` posiciona o gato; persiga com `/missoes mover destino:<célula>`. Captura é automática ao alcançar a célula do gato.
- **Bandidos (rank C, Centro Comercial → Floresta):** `/interagir npc` conversa com o mercador e a criança para descobrir as pistas; depois vá à Floresta e use `/mapa` para enfrentar o líder + capangas.
- **Escolta do Comerciante (rank C, Rota Comercial de Konoha → Deserto):** encontre o comerciante e fale com ele via `/interagir npc` (qualquer membro da party). Após ~3 interações um **tronco** bloqueia a estrada — movam-se até ele e o destruam em combate (ele tem vida, mas não ataca). O comerciante agradece e manda seguir ao **Deserto**; lá, use `/mapa` para liberar a conversa. Após ~3 ações um **bandido** (≈ 4 capangas juntos) embosca a caravana. Derrotado o bandido, mais 2 interações e o bot narra a chegada à rota comercial de Sunagakure — missão completa.

---

## 11. Onde editar conteúdo e balanceamento

| O quê | Arquivo |
|---|---|
| Fórmulas, caps, custos, números de efeitos | [src/config/balance.ts](src/config/balance.ts) |
| Jutsus elementais | [src/data/jutsus/elemental.ts](src/data/jutsus/elemental.ts) |
| Iryo / Taijutsu / Genjutsu / Kenjutsu | [src/data/jutsus/support.ts](src/data/jutsus/support.ts) |
| Clãs e habilidades de clã | [src/data/clans/index.ts](src/data/clans/index.ts) |
| Cenários, channel IDs, água/árvores/obstáculos | [src/data/scenarios/index.ts](src/data/scenarios/index.ts) |
| Missões | [src/data/missions/index.ts](src/data/missions/index.ts) |
| NPCs | [src/data/npcs.ts](src/data/npcs.ts) |
| Personas/prompts de IA | [src/services/npc-ai/personas.ts](src/services/npc-ai/personas.ts) |

Os channel IDs dos cenários estão em [src/data/scenarios/index.ts](src/data/scenarios/index.ts) — troque pelos IDs do seu servidor.

## 12. Configurar Groq para NPCs

Preencha `GROQ_API_KEY` e `GROQ_MODEL` no `.env`. Sem a chave, o bot usa respostas locais roteirizadas (`fallbackLines` em cada persona). A IA é limitada a 1–3 frases e presa ao contexto da missão; após 3 trocas força o combate.

---

## Arquitetura (resumo)

```
src/
  config/        enums, balance, env
  data/          jutsus, clans, scenarios, missions, npcs (conteúdo editável)
  db/            client Prisma
  services/
    characters/  progressão, atributos, recursos, maestria, requisitos
    combat/      engine, math, efeitos, IA de NPC em combate
    maps/        renderer SVG->PNG
    missions/    serviço, lógica do gato (pura), runtime (bandidos)
    npc-ai/      Groq + fallback
  commands/      perfil, mapa, combate, missoes, admin
  utils/         grid, random, permissões, logger
prisma/          schema + seed
tests/           Vitest (lógica pura)
```

## Próximos passos recomendados

- Persistir efeitos/posições por personagem fora de combate (atualmente o estado de combate é persistido em DB e sobrevive a restart).
- Adicionar mais clãs e jutsus (basta editar `src/data/`).
- Mover combate de cat-mission para um sistema de turnos compartilhado com o combate principal.
- Trocar SQLite por PostgreSQL: ajuste `provider` em `prisma/schema.prisma` e `DATABASE_URL`.
