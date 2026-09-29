\set ON_ERROR_STOP on
begin;
insert into auth.users values ('00000000-0000-0000-0000-0000000000f1','dona@exemplo.invalid'),('00000000-0000-0000-0000-0000000000f2','outra@exemplo.invalid');
-- 1. primeiro usuário vira dono; segundo não recebe workspace
select public.claim_workspace('00000000-0000-0000-0000-0000000000f1', 'Teste') is not null as "1a dona criada";
select public.claim_workspace('00000000-0000-0000-0000-0000000000f2', 'Outro') is null as "1b segundo sem convite";
select public.claim_workspace('00000000-0000-0000-0000-0000000000f1', 'X') = (select workspace_id from memberships where user_id='00000000-0000-0000-0000-0000000000f1') as "1c idempotente";
select count(*) = 1 as "1d um workspace" from workspaces;
-- 2. token no vault
insert into social_accounts (id, workspace_id, platform, external_account_id, handle, status)
  select '00000000-0000-0000-0000-0000000000c9', id, 'tiktok', 'tt1', 'x', 'not_configured' from workspaces;
select public.store_account_token('00000000-0000-0000-0000-0000000000c9', '{"provider":"tiktok","access_token":"a1","expires_at":"2026-10-01T00:00:00Z"}') is not null as "2a token guardado";
select status = 'connected' and token_expires_at = '2026-10-01T00:00:00Z' as "2b conta conectada" from social_accounts where id='00000000-0000-0000-0000-0000000000c9';
select public.store_account_token('00000000-0000-0000-0000-0000000000c9', '{"provider":"tiktok","access_token":"a2"}') = token_secret_id as "2c atualiza o mesmo segredo" from social_accounts where id='00000000-0000-0000-0000-0000000000c9';
select public.read_account_token(token_secret_id)::jsonb->>'access_token' = 'a2' as "2d leitura" from social_accounts where id='00000000-0000-0000-0000-0000000000c9';
select count(*) = 1 as "2e um segredo só" from vault.secrets where name like 'social_token_%';
select public.user_id_by_email('DONA@exemplo.invalid') = '00000000-0000-0000-0000-0000000000f1' as "3 busca por e-mail";
-- 4. usuários logados não executam as funções sensíveis
select not has_function_privilege('authenticated', 'public.claim_workspace(uuid,text)', 'execute')
   and not has_function_privilege('authenticated', 'public.read_account_token(uuid)', 'execute')
   and not has_function_privilege('authenticated', 'public.store_account_token(uuid,jsonb)', 'execute')
   and not has_function_privilege('authenticated', 'public.user_id_by_email(text)', 'execute')
   and not has_function_privilege('anon', 'public.invoke_sync(text)', 'execute')
   and has_function_privilege('service_role', 'public.read_account_token(uuid)', 'execute') as "4 permissões das funções";
select count(*) = 4 as "5 quatro rotinas agendadas" from cron.job;
rollback;
