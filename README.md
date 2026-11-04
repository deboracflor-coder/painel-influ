# Painel Influ · Social Media Intelligence

Plataforma para uma agência acompanhar o desempenho orgânico das redes sociais dos seus clientes.
A equipe da agência vê os clientes que tem autorização; cada cliente vê só os próprios dados.

**Situação:** Fase 2 (fundação) concluída: banco, permissões, testes de isolamento e login.
Indicadores e gráficos chegam na Fase 3; conexão com as redes, na Fase 4.
A versão anterior (Next.js, influenciador + marcas parceiras) está na branch `legado/v0-nextjs`.

Regras do projeto: nenhuma métrica é inventada; métrica que a API não fornece aparece como
indisponível, nunca como zero; dados fictícios só no ambiente local e sempre marcados.

## Stack

React + Vite + TypeScript (Vercel) · Supabase: PostgreSQL, Auth, RLS, Edge Functions, Cron, Vault.

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `src/app` | rotas, layout e configuração de dados (atualização da tela a cada 60 s) |
| `src/features` | `auth` (login, recuperação de senha), `clients` (seleção de cliente e papel), `home` |
| `src/components` | estados de carregamento, erro e vazio |
| `src/styles` | `prototipo.css` (identidade visual do protótipo) + `app.css` |
| `src/types/database.ts` | tipos gerados do banco (`npm run db:types`) |
| `supabase/migrations` | estrutura, segurança (privilégios + RLS) e auditoria |
| `supabase/tests` | testes pgTAP de privilégios e isolamento |
| `tests/unit`, `tests/api` | testes do app e de isolamento pela API REST |
| `docs/decisions`, `docs/runbooks` | decisões técnicas e passo a passo de configuração |

## Rodar no computador

Requer Node 22 e Docker.

```bash
npm install
npm run db:start                       # sobe o Supabase local
npx supabase status -o env             # mostra API_URL, ANON_KEY e SERVICE_ROLE_KEY locais
cp .env.example .env.local             # preencha VITE_SUPABASE_ANON_KEY com a ANON_KEY local
SUPABASE_URL=<API_URL> SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY> npx tsx scripts/seed-local.ts
npm run dev                            # http://127.0.0.1:5173
```

O `seed-local` cria uma agência e dois clientes **fictícios** com três usuários
(administração, analista e cliente). Ele se recusa a rodar fora do Supabase local.

## Testes

```bash
npm run lint && npm run typecheck && npm test   # app
npm run db:test                                  # pgTAP: privilégios e isolamento no banco
SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... npm run test:api
```

O CI (`.github/workflows/ci.yml`) roda tudo isso em cada PR, sobe o Supabase local, confere se os
tipos do banco estão em dia e se a service role não aparece no bundle.

## Publicar

Veja `docs/runbooks/supabase-e-primeiro-acesso.md`. Na Vercel só entram `VITE_SUPABASE_URL` e
`VITE_SUPABASE_ANON_KEY`; nenhum segredo vai para o navegador nem para o GitHub.
