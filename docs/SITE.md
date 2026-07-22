# Site da Árvore de Habilidades

Site que roda **no mesmo processo do bot** (Fastify). O jogador loga com Discord,
vê as 5 árvores elementais e compra jutsus/passivas. Toda validação é no servidor —
o front só manda o `nodeId`; nada de pontos/desbloqueio fica no navegador.

## Como funciona

- **Login**: OAuth2 do Discord (`scope=identify`). O cookie de sessão guarda só o
  `discordId`, assinado com `SESSION_SECRET` (o cliente não forja).
- **Identidade do char**: `(discordId, guildId=DISCORD_GUILD_ID)`. Um servidor = um guild.
- **Moeda**: os nós custam `attributePoints` (os mesmos pontos ganhos por nível, 4/nível
  em `balance.ts`). A compra debita e grava numa transação, revalidando contra o banco.
- **Efeito no bot**: nó do tipo JUTSU cria um `CharacterJutsu` → o `/jutsu` do bot já
  enxerga ao vivo. Passiva fica registrada em `CharacterSkillNode` (será lida pela engine
  quando o sistema de passivas for ligado).

## Arquivos

```
src/data/element-trees/index.ts        definição das 5 árvores (nós, custo, requisitos, posição)
src/services/characters/skill-tree.ts  estado + compra AUTORITATIVA (transação)
src/server/index.ts                    bootstrap Fastify (só sobe se HAS_WEB)
src/server/auth.ts                     OAuth Discord + sessão por cookie assinado
src/server/api.ts                      GET /api/state, POST /api/buy
public/                                front (index.html, app.js, style.css) — tema ninja
```

## Variáveis de ambiente (novas)

Sem estas, o site NÃO sobe e o bot roda normal.

```
DISCORD_CLIENT_SECRET=...        # Discord Dev Portal > OAuth2
WEB_BASE_URL=https://naruto-rp.squareweb.app   # URL pública (sem barra no fim)
SESSION_SECRET=<random longo>    # ex.: openssl rand -hex 32
DISCORD_GUILD_ID=...             # já usado pelo bot; obrigatório p/ o site achar o char
# PORT é injetada pela Square automaticamente (fallback 8080)
```

## Configurar no Discord Dev Portal

1. Application > OAuth2 > **Redirects**: adicione exatamente
   `https://naruto-rp.squareweb.app/auth/callback`
2. Copie o **Client Secret** → `DISCORD_CLIENT_SECRET`.

## Deploy na Square Cloud

- Config em [`squarecloud.app`](../squarecloud.app): `SUBDOMAIN=naruto-rp` gera a URL,
  `START=npm run start:prod` roda `prisma db push` (cria a tabela nova) + sobe o bot/site.
- Setar as env vars acima no painel da Square (não no git).
- SQLite: garanta que `DATABASE_URL` aponte para a pasta persistente do app
  (ex.: `file:./data/bot.db`), não `/tmp`. **Faça backup do `.sqlite`.**
- Um processo só = bot + API + site no mesmo Prisma, sem disputa pelo arquivo.

## Rodar local (teste)

```
DISCORD_CLIENT_SECRET=... WEB_BASE_URL=http://localhost:8080 \
SESSION_SECRET=devsecret DISCORD_GUILD_ID=... npm run dev
```

Redirect de teste no Dev Portal: `http://localhost:8080/auth/callback`.
Abra `http://localhost:8080`.

## Segurança (o que impede injeção de pontos)

- Cookie de sessão **assinado** — trocar o `discordId` invalida a assinatura.
- `state` anti-CSRF no fluxo OAuth.
- `POST /api/buy` só aceita `nodeId`. Custo, requisitos de nível/ninjutsu/elemento,
  pré-requisitos e saldo de pontos são conferidos **no servidor, contra o banco, dentro
  de uma transação**. Mexer no HTML/JS do navegador não muda nada.
- `@@unique([charId, nodeId])` no banco barra compra dupla mesmo em corrida.
