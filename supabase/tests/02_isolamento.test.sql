-- Isolamento entre clientes e organizações (dados fictícios criados só dentro do teste).
--
-- Cenário:
--   Agência A: clientes C1 e C2.  Agência B: cliente C3.
--   admA (admin A) · anaA (analista A, só C1) · vC1 (usuário de C1) · vC2 (usuário de C2)
--   admB (admin B) · semVinculo (logado, sem acesso a nada)
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- ---------- Dados (como postgres, antes de assumir cada perfil) ----------
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000000a1', 'adm.a@teste.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000a2', 'ana.a@teste.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000c1', 'cliente1@teste.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000c2', 'cliente2@teste.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000b1', 'adm.b@teste.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-000000000099', 'sem.vinculo@teste.invalid', 'authenticated', 'authenticated');

insert into public.organizations (id, name) values
  ('0a000000-0000-4000-8000-000000000001', 'Agência A (teste)'),
  ('0b000000-0000-4000-8000-000000000001', 'Agência B (teste)');
insert into public.organization_members (organization_id, user_id, role) values
  ('0a000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 'org_admin'),
  ('0a000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a2', 'org_analyst'),
  ('0b000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b1', 'org_admin');
insert into public.clients (id, organization_id, name, is_demo) values
  ('c1000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000001', 'Cliente 1 (teste)', true),
  ('c2000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000001', 'Cliente 2 (teste)', true),
  ('c3000000-0000-4000-8000-000000000001', '0b000000-0000-4000-8000-000000000001', 'Cliente 3 (teste)', true);
insert into public.client_assignments (client_id, organization_id, user_id) values
  ('c1000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a2');
insert into public.client_users (client_id, organization_id, user_id) values
  ('c1000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c1'),
  ('c2000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c2');

insert into public.social_accounts (id, organization_id, client_id, platform, external_account_id, handle) values
  ('ac100000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'instagram', 'ext-1', '@cliente1'),
  ('ac200000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'youtube', 'ext-2', '@cliente2'),
  ('ac300000-0000-4000-8000-000000000001', '0b000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', 'facebook', 'ext-3', '@cliente3');
select public.store_account_token('ac100000-0000-4000-8000-000000000001', '{"access_token":"fake-test-token"}');

insert into public.posts (id, account_id, client_id, organization_id, platform, external_post_id, published_at) values
  ('f1000000-0000-4000-8000-000000000001', 'ac100000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000001', 'instagram', 'p-1', '2026-10-01'),
  ('f2000000-0000-4000-8000-000000000001', 'ac200000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000001', 'youtube', 'p-2', '2026-10-02'),
  ('f3000000-0000-4000-8000-000000000001', 'ac300000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', '0b000000-0000-4000-8000-000000000001', 'facebook', 'p-3', '2026-10-03');
insert into public.post_metric_snapshots (post_id, client_id, organization_id, collected_at, views) values
  ('f1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000001', '2026-10-05', 10),
  ('f2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000001', '2026-10-05', 20),
  ('f3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', '0b000000-0000-4000-8000-000000000001', '2026-10-05', 30);
insert into public.account_daily_metrics (account_id, client_id, organization_id, day, followers) values
  ('ac100000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000001', '2026-10-05', 100),
  ('ac200000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000001', '2026-10-05', 200),
  ('ac300000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', '0b000000-0000-4000-8000-000000000001', '2026-10-05', 300);
insert into public.sync_runs (id, account_id, client_id, organization_id, trigger, status) values
  ('5e100000-0000-4000-8000-000000000001', 'ac100000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000001', 'cron', 'error'),
  ('5e200000-0000-4000-8000-000000000001', 'ac200000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000001', 'cron', 'success'),
  ('5e300000-0000-4000-8000-000000000001', 'ac300000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', '0b000000-0000-4000-8000-000000000001', 'cron', 'success');
insert into public.sync_errors (sync_run_id, account_id, client_id, organization_id, code, message) values
  ('5e100000-0000-4000-8000-000000000001', 'ac100000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000001', 'rate_limited', 'teste');
insert into public.raw_payloads (sync_run_id, endpoint, body) values
  ('5e100000-0000-4000-8000-000000000001', '/teste', '{}');

-- ---------- Integridade e idempotência (como backend) ----------
select throws_ok($$
  insert into public.posts (account_id, client_id, organization_id, platform, external_post_id, published_at)
  values ('ac100000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000001', 'instagram', 'x', now()) $$,
  '23503', null, 'Post não pode ser gravado com conta de um cliente e client_id de outro');
select throws_ok($$
  insert into public.posts (account_id, client_id, organization_id, platform, external_post_id, published_at)
  values ('ac100000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000001', 'instagram', 'p-1', now()) $$,
  '23505', null, 'Mesmo post da mesma conta não é ingerido duas vezes');
select throws_ok($$
  insert into public.post_metric_snapshots (post_id, client_id, organization_id, collected_at, views)
  values ('f1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000001', '2026-10-05', 11) $$,
  '23505', null, 'Snapshot repetido (mesmo post e horário) não duplica');
select throws_ok($$
  insert into public.account_daily_metrics (account_id, client_id, organization_id, day, followers)
  values ('ac100000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000001', '2026-10-05', 1) $$,
  '23505', null, 'Série diária: uma linha por conta e dia');
select throws_ok($$
  insert into public.social_accounts (organization_id, client_id, platform, external_account_id)
  values ('0a000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'instagram', 'ext-1') $$,
  '23505', null, 'A mesma conta social não é conectada duas vezes na organização');
insert into public.sync_runs (account_id, client_id, organization_id, trigger, status) values
  ('ac100000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000001', 'cron', 'queued');
select throws_ok($$
  insert into public.sync_runs (account_id, client_id, organization_id, trigger, status) values
  ('ac100000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000001', 'manual', 'queued') $$,
  '23505', null, 'Só uma coleta na fila por conta');
select throws_ok($$
  insert into public.organization_members (organization_id, user_id, role)
  values ('0a000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c1', 'org_analyst') $$,
  '23514', null, 'Usuário de cliente não entra na equipe da agência');
select throws_ok($$
  insert into public.client_assignments (client_id, organization_id, user_id)
  values ('c3000000-0000-4000-8000-000000000001', '0b000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a2') $$,
  '23514', null, 'Analista de A não pode ser atribuído a cliente de B');

-- =====================================================================
-- Usuário do Cliente 1
-- =====================================================================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;

select results_eq('select id from public.clients', $$values ('c1000000-0000-4000-8000-000000000001'::uuid)$$, 'Cliente 1 vê só o próprio cadastro');
select results_eq('select id from public.social_accounts', $$values ('ac100000-0000-4000-8000-000000000001'::uuid)$$, 'Cliente 1 vê só as próprias contas');
select results_eq('select id from public.posts', $$values ('f1000000-0000-4000-8000-000000000001'::uuid)$$, 'Cliente 1 vê só os próprios posts');
select results_eq('select views from public.post_metric_snapshots', $$values (10::bigint)$$, 'Cliente 1 vê só as próprias métricas de post');
select results_eq('select followers from public.account_daily_metrics', $$values (100::bigint)$$, 'Cliente 1 vê só a própria série diária');
select is_empty($$select 1 from public.posts where id = 'f2000000-0000-4000-8000-000000000001'$$, 'Cliente 1 não lê post do Cliente 2 nem pelo id');
select is_empty('select 1 from public.sync_runs', 'Cliente não vê histórico de sincronização (só a agência)');
select is_empty('select 1 from public.sync_errors', 'Cliente não vê erros de integração');
select is_empty('select 1 from public.audit_log', 'Cliente não vê auditoria');
select is_empty('select 1 from public.organization_members', 'Cliente não vê a equipe da agência');
select results_eq('select user_id from public.profiles', $$values ('00000000-0000-4000-8000-0000000000c1'::uuid)$$, 'Cliente vê só o próprio perfil');
select results_eq('select count(*) from public.client_users', $$values (1::bigint)$$, 'Cliente vê só o próprio vínculo');
select results_eq('select name from public.organizations', $$values ('Agência A (teste)')$$, 'Cliente vê só o nome da própria agência');

select throws_ok('select token_secret_id from public.social_accounts', '42501', null, 'Cliente não lê referência de token');
select throws_ok('select * from public.raw_payloads', '42501', null, 'Cliente não lê respostas brutas das APIs');
select throws_ok($$select public.read_account_token('ac100000-0000-4000-8000-000000000001')$$, '42501', null, 'Cliente não lê token');
select throws_ok($$insert into public.clients (organization_id, name) values ('0a000000-0000-4000-8000-000000000001', 'Invasor')$$, '42501', null, 'Cliente não cria cliente');
select throws_ok($$insert into public.client_users (client_id, organization_id, user_id) values ('c2000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c1')$$, '42501', null, 'Cliente 1 não se vincula ao Cliente 2');
select throws_ok($$insert into public.posts (account_id, client_id, organization_id, platform, external_post_id, published_at) values ('ac200000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000001', 'youtube', 'falso', now())$$, '42501', null, 'Cliente não grava posts');
select is_empty($$update public.clients set name = 'Alterado' where id = 'c2000000-0000-4000-8000-000000000001' returning 1$$, 'Cliente 1 não altera Cliente 2');
select is_empty($$update public.clients set name = 'Alterado' where id = 'c1000000-0000-4000-8000-000000000001' returning 1$$, 'Cliente não altera nem o próprio cadastro');
select is_empty($$update public.social_accounts set sync_frequency_minutes = 60 returning 1$$, 'Cliente não altera a coleta');
select is_empty($$delete from public.client_users returning 1$$, 'Cliente não remove vínculos');
select throws_ok($$select public.revoke_account_connection('ac100000-0000-4000-8000-000000000001')$$, '42501', null, 'Cliente não desconecta contas');
reset role;

-- =====================================================================
-- Usuário do Cliente 2
-- =====================================================================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c2","role":"authenticated"}', true);
set local role authenticated;
select results_eq('select id from public.posts', $$values ('f2000000-0000-4000-8000-000000000001'::uuid)$$, 'Cliente 2 vê só os próprios posts');
select is_empty($$select 1 from public.clients where id = 'c1000000-0000-4000-8000-000000000001'$$, 'Cliente 2 não vê o Cliente 1');
reset role;

-- =====================================================================
-- Analista da Agência A (atribuído só ao Cliente 1)
-- =====================================================================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
set local role authenticated;
select results_eq('select id from public.clients', $$values ('c1000000-0000-4000-8000-000000000001'::uuid)$$, 'Analista vê só o cliente atribuído');
select results_eq('select count(*) from public.sync_runs', $$values (2::bigint)$$, 'Analista vê o histórico de sincronização do cliente atribuído');
select results_eq('select count(*) from public.sync_errors', $$values (1::bigint)$$, 'Analista vê os erros de integração do cliente atribuído');
select is_empty($$select 1 from public.posts where client_id <> 'c1000000-0000-4000-8000-000000000001'$$, 'Analista não vê posts de clientes não atribuídos');
select isnt_empty($$update public.social_accounts set sync_frequency_minutes = 720 where id = 'ac100000-0000-4000-8000-000000000001' returning 1$$, 'Analista ajusta a frequência de coleta do cliente atribuído');
select is_empty($$update public.social_accounts set sync_frequency_minutes = 720 where id = 'ac200000-0000-4000-8000-000000000001' returning 1$$, 'Analista não altera conta de cliente não atribuído');
select throws_ok($$update public.social_accounts set status = 'connected' where id = 'ac100000-0000-4000-8000-000000000001'$$, '42501', null, 'Status da conexão só muda pelo backend');
select throws_ok($$insert into public.clients (organization_id, name) values ('0a000000-0000-4000-8000-000000000001', 'Novo')$$, '42501', null, 'Analista não cria cliente');
select throws_ok($$insert into public.client_assignments (client_id, organization_id, user_id) values ('c2000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a2')$$, '42501', null, 'Analista não se atribui a outro cliente');
select is_empty($$update public.organization_members set role = 'org_admin' where user_id = '00000000-0000-4000-8000-0000000000a2' returning 1$$, 'Analista não se promove a administrador');
select is_empty('select 1 from public.audit_log', 'Analista não vê auditoria');
select throws_ok($$select public.revoke_account_connection('ac200000-0000-4000-8000-000000000001')$$, '42501', null, 'Analista não desconecta conta de cliente não atribuído');
reset role;

-- =====================================================================
-- Administrador da Agência A
-- =====================================================================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
select results_eq('select count(*) from public.clients', $$values (2::bigint)$$, 'Admin A vê os dois clientes da própria agência');
select is_empty($$select 1 from public.clients where organization_id = '0b000000-0000-4000-8000-000000000001'$$, 'Admin A não vê clientes da Agência B');
select is_empty($$select 1 from public.posts where organization_id = '0b000000-0000-4000-8000-000000000001'$$, 'Admin A não vê posts da Agência B');
select is_empty($$select 1 from public.profiles where user_id = '00000000-0000-4000-8000-0000000000b1'$$, 'Admin A não vê pessoas da Agência B');
select lives_ok($$insert into public.clients (organization_id, name) values ('0a000000-0000-4000-8000-000000000001', 'Cliente novo (teste)')$$, 'Admin A cria cliente na própria agência');
select throws_ok($$insert into public.clients (organization_id, name) values ('0b000000-0000-4000-8000-000000000001', 'Intruso')$$, '42501', null, 'Admin A não cria cliente na Agência B');
select throws_ok($$insert into public.organization_members (organization_id, user_id, role) values ('0b000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 'org_admin')$$, '42501', null, 'Admin A não se adiciona à Agência B');
select is_empty($$update public.clients set name = 'Tomado' where id = 'c3000000-0000-4000-8000-000000000001' returning 1$$, 'Admin A não altera cliente da Agência B');
select is_empty($$delete from public.clients where id = 'c3000000-0000-4000-8000-000000000001' returning 1$$, 'Admin A não apaga cliente da Agência B');
select throws_ok($$delete from public.organization_members where user_id = '00000000-0000-4000-8000-0000000000a1'$$, '23514', null, 'A agência não fica sem administrador');
select isnt_empty($$select 1 from public.audit_log where entity = 'clients' and after ->> 'name' = 'Cliente novo (teste)'$$, 'Criação de cliente fica na auditoria');
select is_empty($$select 1 from public.audit_log where organization_id = '0b000000-0000-4000-8000-000000000001'$$, 'Admin A não vê auditoria da Agência B');
select is_empty($$select 1 from public.audit_log where coalesce(before, '{}') ? 'token_secret_id' or coalesce(after, '{}') ? 'token_secret_id'$$, 'Auditoria nunca guarda referência de token');
select lives_ok($$select public.revoke_account_connection('ac100000-0000-4000-8000-000000000001')$$, 'Admin desconecta conta da própria agência');
select results_eq($$select status::text, sync_enabled from public.social_accounts where id = 'ac100000-0000-4000-8000-000000000001'$$, $$values ('revoked', false)$$, 'Conta desconectada fica revogada e sem coleta');
reset role;

select is_empty($$select 1 from vault.secrets where name = 'social_account:ac100000-0000-4000-8000-000000000001'$$, 'Desconectar apaga o token do Vault');

-- =====================================================================
-- Administrador da Agência B e usuário sem vínculo
-- =====================================================================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
select results_eq('select id from public.clients', $$values ('c3000000-0000-4000-8000-000000000001'::uuid)$$, 'Admin B vê só o cliente da própria agência');
select results_eq('select count(*) from public.post_metric_snapshots', $$values (1::bigint)$$, 'Admin B vê só métricas da própria agência');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000099","role":"authenticated"}', true);
set local role authenticated;
select is_empty('select 1 from public.organizations', 'Sem vínculo: nenhuma organização');
select is_empty('select 1 from public.clients', 'Sem vínculo: nenhum cliente');
select is_empty('select 1 from public.social_accounts', 'Sem vínculo: nenhuma conta');
select is_empty('select 1 from public.posts', 'Sem vínculo: nenhum post');
select is_empty('select 1 from public.post_metric_snapshots', 'Sem vínculo: nenhuma métrica');
select is_empty('select 1 from public.account_daily_metrics', 'Sem vínculo: nenhuma série diária');
reset role;

-- =====================================================================
-- Visitante sem login (anon)
-- =====================================================================
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok('select * from public.clients', '42501', null, 'Sem login: acesso negado a clientes');
select throws_ok('select * from public.posts', '42501', null, 'Sem login: acesso negado a posts');
select throws_ok('select * from public.post_metric_snapshots', '42501', null, 'Sem login: acesso negado a métricas');
reset role;

select * from finish();
rollback;
