-- Importação manual e acesso ao Google Sheets por pessoa.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000000f1', 'adm.imp@teste.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000f2', 'ana.imp@teste.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000f3', 'cli.imp@teste.invalid', 'authenticated', 'authenticated');
insert into public.organizations (id, name) values ('0f000000-0000-4000-8000-000000000001', 'Agência importação (teste)');
insert into public.organization_members (organization_id, user_id, role) values
  ('0f000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000f1', 'org_admin'),
  ('0f000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000f2', 'org_analyst');
insert into public.clients (id, organization_id, name, is_demo) values
  ('cf000000-0000-4000-8000-000000000001', '0f000000-0000-4000-8000-000000000001', 'Cliente importação (teste)', true);
insert into public.client_users (client_id, organization_id, user_id) values
  ('cf000000-0000-4000-8000-000000000001', '0f000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000f3');
insert into public.social_accounts (id, organization_id, client_id, platform, external_account_id) values
  ('af000000-0000-4000-8000-000000000001', '0f000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001', 'instagram', 'ext-imp');
insert into public.account_daily_metrics (account_id, client_id, organization_id, day, followers, source) values
  ('af000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000001', '0f000000-0000-4000-8000-000000000001', '2026-10-03', 1000, 'api');

-- Pessoa do cliente e analista sem atribuição não importam
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f3","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.import_daily_metrics('af000000-0000-4000-8000-000000000001', '[{"day":"2026-10-01","followers":900}]')$$,
  '42501', null, 'Pessoa do cliente não lança dado manual');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f2","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.import_daily_metrics('af000000-0000-4000-8000-000000000001', '[{"day":"2026-10-01","followers":900}]')$$,
  '42501', null, 'Analista sem o cliente atribuído não lança dado manual');
reset role;

-- Admin importa
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f1","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.import_daily_metrics('af000000-0000-4000-8000-000000000001', '[{"day":"2026-10-04"}]')$$,
  '22023', null, 'Linha sem nenhum valor é recusada');
select throws_ok($$select public.import_daily_metrics('af000000-0000-4000-8000-000000000001', '[{"day":"2099-01-01","followers":1}]')$$,
  '22023', null, 'Data futura é recusada');
select throws_ok($$select public.import_daily_metrics('af000000-0000-4000-8000-000000000001', '[{"day":"2026-10-01","followers":-1}]')$$,
  '22023', null, 'Valor negativo é recusado');
select is(public.import_daily_metrics('af000000-0000-4000-8000-000000000001',
  '[{"day":"2026-10-01","followers":900},{"day":"2026-10-02","followers":950,"reach":40},{"day":"2026-10-03","followers":1}]'::jsonb),
  '{"inserted": 2, "updated": 0, "skipped_api": 1}'::jsonb, 'Importa dias novos e pula o dia que veio da API');
select is(public.import_daily_metrics('af000000-0000-4000-8000-000000000001', '[{"day":"2026-10-01","followers":901}]'::jsonb),
  '{"inserted": 0, "updated": 1, "skipped_api": 0}'::jsonb, 'Reimportar substitui o lançamento manual');
reset role;

select results_eq($$select day::text, followers, source::text from public.account_daily_metrics
                    where account_id = 'af000000-0000-4000-8000-000000000001' order by day$$,
  $$values ('2026-10-01', 901::bigint, 'manual'), ('2026-10-02', 950::bigint, 'manual'), ('2026-10-03', 1000::bigint, 'api')$$,
  'Dado da API intacto; manual marcado como manual');
select is((select count(*) from public.audit_log where action = 'IMPORT_MANUAL'
           and client_id = 'cf000000-0000-4000-8000-000000000001' and actor_id = '00000000-0000-4000-8000-0000000000f1'),
  2::bigint, 'Cada importação fica na auditoria com o autor');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f1","role":"authenticated"}', true);
set local role authenticated;
select is(public.delete_manual_daily('af000000-0000-4000-8000-000000000001', '2026-10-01', '2026-10-31'), 2,
  'Apagar remove só os lançamentos manuais');
reset role;
select is((select count(*) from public.account_daily_metrics where account_id = 'af000000-0000-4000-8000-000000000001'),
  1::bigint, 'Linha da API continua');

-- Google Sheets: token por pessoa, só service role mexe
select ok(not has_function_privilege('authenticated', 'public.read_user_token(uuid, text)', 'execute'), 'Leitura de token do Google: só service role');
select ok(not has_function_privilege('authenticated', 'public.store_user_token(uuid, text, jsonb)', 'execute'), 'Gravação de token do Google: só service role');
select ok(not has_column_privilege('authenticated', 'public.user_integrations', 'token_secret_id', 'select'), 'Referência do token não é legível');
select public.store_user_token('00000000-0000-4000-8000-0000000000f1', 'google_sheets', '{"refresh_token":"r"}');
select public.store_user_token('00000000-0000-4000-8000-0000000000f2', 'google_sheets', '{"refresh_token":"r2"}');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f1","role":"authenticated"}', true);
set local role authenticated;
select results_eq('select user_id from public.user_integrations',
  $$values ('00000000-0000-4000-8000-0000000000f1'::uuid)$$, 'Cada pessoa só vê a própria conexão com o Google');
reset role;
select public.delete_user_token('00000000-0000-4000-8000-0000000000f1', 'google_sheets');
select is(public.read_user_token('00000000-0000-4000-8000-0000000000f1', 'google_sheets'), null, 'Desconectar apaga o token');

select * from finish();
rollback;
