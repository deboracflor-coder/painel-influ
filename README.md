# Painel Influ · Social Media Intelligence

Plataforma para uma agência acompanhar o desempenho orgânico das redes sociais dos seus clientes.
A equipe da agência vê os clientes que tem autorização; cada cliente vê só os próprios dados.

**Situação:** Fase 6 entregue para validação: homologação (testes de ponta a ponta no navegador,
desempenho e segurança) e preparação para publicar na Vercel (`docs/runbooks/publicar-na-vercel.md`).
Conectar contas reais depende dos apps da Meta e do Google (`docs/runbooks/integracoes.md`) e pode
ser feito depois, sem mudar o código. Roteiro de homologação: `docs/homologacao.md`.

Regras do projeto: nenhuma métrica é inventada; métrica que a API não fornece aparece como
indisponível, nunca como zero; dados fictícios só no ambiente local e sempre marcados.

## Stack

React + Vite + TypeScript (Vercel) · Supabase: PostgreSQL, Auth, RLS, Edge Functions, Cron, Vault.

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `src/app` | rotas, layout e configuração de dados (atualização da tela a cada 60 s) |
| `src/features` | `auth`, `clients` (seleção e papel), `filters`, `data` (consultas), `dashboard` (visão executiva, por rede, publicações), `sync` (histórico), `admin` (clientes e pessoas) |
| `src/domain` | cálculo de métricas, períodos, formatação, relatório e leitura do CSV de importação, sem dependência de tela |
| `src/components` | KPIs, cards de publicação, gráficos SVG, estados de carregamento/erro/vazio |
| `src/styles` | `prototipo.css` (identidade visual do protótipo) + `app.css` |
| `src/types/database.ts` | tipos gerados do banco (`npm run db:types`) |
| `supabase/migrations` | estrutura, segurança (privilégios + RLS), auditoria, leitura do painel e regra de equipe |
| `supabase/functions` | `admin-users` (convites), `oauth-start`/`oauth-callback` (conexão), `account-actions` (coletar/desconectar), `sync-worker` (coleta agendada); `_shared/collect` tem os coletores de cada rede |
| `supabase/tests` | testes pgTAP de privilégios e isolamento |
| `tests/unit`, `tests/api` | testes do app e de isolamento pela API REST |
| `tests/e2e` | testes de ponta a ponta no navegador (Playwright) contra o site compilado |
| `docs/decisions`, `docs/runbooks` | decisões técnicas e passo a passo de configuração |

## Rodar no computador

Requer Node 22 e Docker.

```bash
npm install
npm run db:start                       # sobe o Supabase local
npx supabase status -o env             # mostra API_URL, ANON_KEY e SERVICE_ROLE_KEY locais
cp .env.example .env.local             # preencha VITE_SUPABASE_ANON_KEY com a ANON_KEY local
SUPABASE_URL=<API_URL> SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY> npx tsx scripts/seed-local.ts
npx supabase functions serve           # em outro terminal: convites e integrações
npm run dev                            # http://127.0.0.1:5173
```

E-mails de convite no ambiente local caem no Mailpit: http://127.0.0.1:54324.

O `seed-local` cria uma agência e dois clientes **fictícios** com três usuários
(administração, analista e cliente), quatro contas de exemplo, 120 dias de séries diárias,
publicações com métricas e um histórico de coleta com um erro de token expirado. Tudo marcado
como demonstração (selo “Dados fictícios”). Ele se recusa a rodar fora do Supabase local.

## Testes

```bash
npm run lint && npm run typecheck && npm test   # app
npm run db:test                                  # pgTAP: privilégios e isolamento no banco
npx supabase functions serve --env-file supabase/functions/.env.test   # outro terminal
SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... npm run test:api
npm run typecheck:functions                      # tipos das Edge Functions (Deno)
npx playwright install chromium                  # uma vez
SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... npm run test:e2e
npm run build && npm run check:bundle            # orçamento de tamanho
```

Os testes de integração trocam Meta e Google por um servidor de teste local; os valores em
`supabase/functions/.env.test` são só de teste.

O CI (`.github/workflows/ci.yml`) roda tudo isso em cada PR, sobe o Supabase local e as Edge Functions, confere se os
tipos do banco estão em dia e se a service role não aparece no bundle.

## Publicar

Veja `docs/runbooks/supabase-e-primeiro-acesso.md` e depois `docs/runbooks/publicar-na-vercel.md`.
Na Vercel só entram `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`; nenhum segredo vai para o
navegador nem para o GitHub.
