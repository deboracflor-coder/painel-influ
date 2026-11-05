-- Privilégios do banco: a RLS só protege se os privilégios também estiverem fechados.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select is_empty($$
  select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity $$,
  'RLS está ligada em todas as tabelas de public');

select is_empty($$
  select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('v', 'm') $$,
  'Não há views em public (views ignorariam a RLS)');

select is_empty($$
  select table_name || ':' || privilege_type from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'anon' $$,
  'Visitante sem login (anon) não tem privilégio em nenhuma tabela');

select is_empty($$
  select table_name || '.' || column_name from information_schema.column_privileges
  where table_schema = 'public' and grantee = 'anon' $$,
  'anon não tem privilégio em nenhuma coluna');

select is_empty($$
  select n.nspname || '.' || p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and has_function_privilege('anon', p.oid, 'execute') $$,
  'anon não executa nenhuma função da aplicação');

select ok(not has_schema_privilege('anon', 'private', 'usage'), 'anon não acessa o schema private');

select is_empty($$
  select table_name || ':' || privilege_type from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'authenticated'
    and table_name in ('posts', 'post_metric_snapshots', 'account_daily_metrics', 'sync_runs',
                       'sync_errors', 'audit_log', 'metric_catalog', 'profiles', 'organizations',
                       'social_accounts')
    and privilege_type in ('INSERT', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER') $$,
  'Usuário logado não insere nem apaga métricas, posts, sincronizações, auditoria ou contas');

select is_empty($$
  select table_name || ':' || privilege_type from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'authenticated'
    and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER') $$,
  'Usuário logado não tem TRUNCATE, REFERENCES ou TRIGGER em nenhuma tabela');

select is_empty($$
  select table_name || ':' || privilege_type from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'authenticated'
    and table_name in ('raw_payloads', 'oauth_states') $$,
  'raw_payloads e oauth_states: só o backend');

select ok(not has_column_privilege('authenticated', 'public.social_accounts', 'token_secret_id', 'select'),
  'Referência do token no Vault não é legível pelo navegador');

select ok(not has_function_privilege('authenticated', 'public.ingest_sync_batch(uuid, jsonb)', 'execute'),
  'Gravação da coleta: só service role');
select ok(has_function_privilege('authenticated', 'public.can_operate(uuid)', 'execute'),
  'Consulta de permissão de operação: usuário logado');
select ok(not has_function_privilege('authenticated', 'private.dispatch_sync()', 'execute'),
  'Disparo do agendador: só o banco');

select ok(not has_function_privilege('authenticated', 'public.read_account_token(uuid)', 'execute'),
  'Leitura de token: só service role');
select ok(not has_function_privilege('authenticated', 'public.store_account_token(uuid, jsonb)', 'execute'),
  'Gravação de token: só service role');
select ok(not has_function_privilege('authenticated', 'public.bootstrap_organization(text, uuid)', 'execute'),
  'Criação de organização: só service role');

select is_empty($$
  select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and c.relname not in ('raw_payloads', 'oauth_states')
    and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) $$,
  'Toda tabela acessível tem política de RLS');

select is_empty($$
  select tablename || '.' || policyname from pg_policies
  where schemaname = 'public' and roles <> '{authenticated}' $$,
  'Toda política vale só para usuários logados');

select is_empty($$
  select n.nspname || '.' || p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prosecdef
    and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%') $$,
  'Toda função security definer fixa o search_path');

select * from finish();
rollback;
