# 0003 · Fase 3: painel, filtros e gestão de acesso

Situação: entregue para validação (2026-11-05).

## Leitura dos dados

- O painel lê as publicações pela função `public.client_posts(cliente, de, até)`: devolve cada post
  com a **coleta mais recente** de métricas. É `security invoker`, então a RLS de `posts` e
  `post_metric_snapshots` continua decidindo o que cada pessoa vê. Só usuários logados executam.
- Séries diárias (`account_daily_metrics`), contas e histórico de coleta são lidos direto das tabelas,
  também sob RLS. O navegador nunca recebe token de rede social nem a service role.
- A tela se atualiza a cada 60 s (TanStack Query). Isso **não** dispara coleta nas redes; a coleta
  segue a agenda de cada conta (Fase 4). O topo da tela deixa essa diferença escrita.

## Regras de cálculo (portadas do protótipo)

- Métrica que a rede não entrega é `null` e aparece como **“Sem dado”** ou **“Indisponível”**, nunca 0.
  Somas ignoram `null` e só devolvem `null` quando nenhum item tem o dado.
- Engajamento = curtidas + comentários + compartilhamentos + salvamentos (os componentes disponíveis).
- Taxa de engajamento usa a base de cada rede: alcance (Instagram, Facebook), visualizações
  (YouTube, TikTok), impressões (X). A taxa agregada é ponderada (Σ engajamento ÷ Σ base).
- Crescimento de seguidores = seguidores no fim do período − seguidores no início, por conta.
- Período anterior para comparação: mesmo número de dias, imediatamente antes. Datas no fuso
  America/Sao_Paulo.
- Qualquer número que vem de lançamento manual ou importação recebe o selo **“Dado manual”**.

## Telas

| Rota | Quem vê | Conteúdo |
|---|---|---|
| `/` | todos | visão executiva: audiência, engajamento, produção, gráficos, top 3 |
| `/redes/:rede` | todos | uma rede: situação da conta, KPIs, seguidores por dia, melhores posts |
| `/publicacoes` | todos | todas as publicações com ordenação e “Mostrar mais” |
| `/historico` | agência | coletas e erros de coleta por conta |
| `/clientes` | admin da agência | criar, editar, excluir (pede o nome do cliente para confirmar) |
| `/pessoas` | admin da agência | convidar, trocar papel, liberar clientes para analista, remover |

Filtros (período, redes, formato, comparar) ficam na URL, então um link copiado abre a mesma visão
para quem tiver permissão. Não existe link público.

## Convites

- Feitos pela Edge Function `admin-users`, a única peça com service role. Ela confere que quem chama
  é admin da organização e que o cliente é da mesma organização. A criação dos vínculos usa o token
  de quem chamou, então RLS e auditoria valem como em qualquer outra alteração.
- Cadastro aberto continua desligado: só entra quem foi convidado.
- Remover alguém tira o acesso (vínculos), mas mantém o usuário no Auth, para não apagar o rastro
  de auditoria.

## Regra nova no banco

- A agência nunca fica sem administrador: o último admin não pode se rebaixar nem se remover
  (trigger `organization_members_keep_admin`, erro 23514). Testado no pgTAP.

## Ambiente local

- `scripts/seed-local.ts` gera números **fictícios** e determinísticos, só para os clientes marcados
  como demonstração, e se recusa a rodar fora do Supabase local.
- Atrás de proxy corporativo, o runtime local das Edge Functions pode não baixar pacotes npm.
  Solução local: `npx supabase functions serve --env-file <arquivo>` com `DENO_CERT` e `HTTPS_PROXY`.
  No CI e no Supabase hospedado isso não é necessário.
