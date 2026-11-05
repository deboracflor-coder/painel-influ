# 0001 — Fase 1: diagnóstico e decisões propostas (Social Media Intelligence)

- Data: 2026-11-04
- Status: **aprovada pela Débora em 2026-11-04** (recomendações 1, 2 e 3 aceitas)
- Documento completo: https://claude.ai/artifact/Xq16uoK8MzG2FXarMWH1Lj

## Contexto

O código atual (Next.js + Supabase, protótipo em `public/painel`) foi desenhado para um perfil de
influenciador com marcas parceiras. O novo produto é uma plataforma para agência com vários clientes,
com stack definida: React + Vite + TypeScript na Vercel, Supabase (Postgres, Auth, RLS, Edge Functions,
Cron, Vault). V1 só orgânica; integrações na ordem Instagram, Facebook, YouTube e depois TikTok e X.

## Decisões já tomadas pela Débora

- Stack React + Vite + TypeScript (substitui Next.js). Rotas de servidor do Next viram Edge Functions.
- Google Sheets só para exportação, nunca como banco.
- Nenhum dado privado por link público (a tabela `share_links` sai).

## Decisões aprovadas

1. Modelo do produto: organização (agência) → clientes → perfis sociais. Camada de parcerias
   (marcas, entregas, campanhas, valores, EMV) fora da V1, preservada na branch `legado/v0-nextjs`.
2. LinkedIn fora da V1 (valor mantido no enum de plataformas).
3. Importação manual CSV/Excel: manter só para métricas que a API não entrega, marcada "Dado manual",
   ou retirar da V1.

## Decisões técnicas propostas

- `revoke all` de `anon`/`authenticated` em todas as tabelas, depois `grant` mínimo por papel.
- Funções auxiliares de permissão em schema privado (fora da API REST).
- Papéis: org_admin, org_analyst (só clientes atribuídos), client_admin, client_viewer.
- Snapshots de métricas com chave única (post, momento da coleta); séries diárias com chave (conta, dia).
- Catálogo de métricas por rede; métrica ausente é `null` e aparece como "Indisponível", nunca zero.
- Coleta: Cron a cada 15 min → `sync-scheduler` enfileira contas vencidas (padrão 6 h por conta) →
  `sync-worker` com trava por conta, retry com espera crescente, respeito aos limites da API.
- OAuth em Edge Functions (`oauth-start`/`oauth-callback`) com `state` de uso único; token só no Vault.
- Tela relê o banco a cada 60 s (não chama APIs sociais).
- Auditoria por gatilhos no banco.
- Testes de isolamento com pgTAP (Supabase local) e pela API REST com JWT de cada papel, no CI.
