-- Fase 6 · Índices apontados pelo advisor de desempenho do Supabase.
-- Só onde não existe índice começando pela coluna da chave estrangeira e a tabela cresce
-- com a coleta: excluir uma conta ou limpar coletas antigas não varre a tabela inteira,
-- e a busca das coletas de uma conta (monitoramento, novas tentativas) usa índice.
create index if not exists sync_runs_account_idx on public.sync_runs (account_id, queued_at desc);
create index if not exists sync_errors_account_idx on public.sync_errors (account_id, created_at desc);
create index if not exists sync_errors_run_idx on public.sync_errors (sync_run_id);
create index if not exists raw_payloads_run_idx on public.raw_payloads (sync_run_id);
