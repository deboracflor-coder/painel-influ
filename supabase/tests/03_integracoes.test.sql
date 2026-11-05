-- Gravação da coleta: idempotente, sem apagar valor existente e sem sobrescrever dado manual.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000000e1', 'adm.int@teste.invalid', 'authenticated', 'authenticated');
insert into public.organizations (id, name) values ('0e000000-0000-4000-8000-000000000001', 'Agência integração (teste)');
insert into public.organization_members (organization_id, user_id, role) values
  ('0e000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000e1', 'org_admin');
insert into public.clients (id, organization_id, name, is_demo) values
  ('ce000000-0000-4000-8000-000000000001', '0e000000-0000-4000-8000-000000000001', 'Cliente integração (teste)', true);
insert into public.social_accounts (id, organization_id, client_id, platform, external_account_id) values
  ('ae000000-0000-4000-8000-000000000001', '0e000000-0000-4000-8000-000000000001', 'ce000000-0000-4000-8000-000000000001', 'instagram', 'ext-int');

select is(public.ingest_sync_batch('ae000000-0000-4000-8000-000000000001', '{
  "api_version": "v26.0", "collected_at": "2026-11-05T12:00:00Z",
  "posts": [{"external_post_id": "p1", "format": "reels", "published_at": "2026-11-01T10:00:00Z",
             "metrics": {"views": 100, "reach": null, "likes": 5}}],
  "daily": [{"day": "2026-11-05", "followers": 900}, {"day": "2026-11-04", "reach": 50}]
}'::jsonb), '{"posts": 1, "snapshots": 1, "daily": 2}'::jsonb, 'Primeira gravação');

select is(public.ingest_sync_batch('ae000000-0000-4000-8000-000000000001', '{
  "api_version": "v26.0", "collected_at": "2026-11-05T12:00:00Z",
  "posts": [{"external_post_id": "p1", "format": "reels", "published_at": "2026-11-01T10:00:00Z",
             "metrics": {"views": 120, "likes": 6}}],
  "daily": [{"day": "2026-11-05", "reach": 70}]
}'::jsonb)->>'posts', '1', 'Mesmo lote de novo');

select is((select count(*) from public.posts where account_id = 'ae000000-0000-4000-8000-000000000001'), 1::bigint,
  'Repetir não duplica publicação');
select is((select count(*) from public.post_metric_snapshots s join public.posts p on p.id = s.post_id
           where p.account_id = 'ae000000-0000-4000-8000-000000000001'), 1::bigint,
  'Mesmo horário de coleta não duplica métrica');
select is((select views from public.post_metric_snapshots s join public.posts p on p.id = s.post_id
           where p.account_id = 'ae000000-0000-4000-8000-000000000001'), 120::bigint, 'Métrica atualizada');
select is((select reach from public.post_metric_snapshots s join public.posts p on p.id = s.post_id
           where p.account_id = 'ae000000-0000-4000-8000-000000000001'), null::bigint,
  'Métrica não entregue continua sem dado (não vira zero)');
select results_eq('select followers, reach from public.account_daily_metrics
                   where account_id = ''ae000000-0000-4000-8000-000000000001'' and day = ''2026-11-05''',
                  'values (900::bigint, 70::bigint)', 'Valor ausente na nova coleta não apaga o já gravado');

update public.account_daily_metrics set source = 'manual', reach = 55
  where account_id = 'ae000000-0000-4000-8000-000000000001' and day = '2026-11-04';
select public.ingest_sync_batch('ae000000-0000-4000-8000-000000000001',
  '{"api_version": "v26.0", "collected_at": "2026-11-06T12:00:00Z", "posts": [], "daily": [{"day": "2026-11-04", "reach": 999}]}'::jsonb);
select is((select reach from public.account_daily_metrics
           where account_id = 'ae000000-0000-4000-8000-000000000001' and day = '2026-11-04'),
  55::bigint, 'Dado manual não é sobrescrito pela API');

select lives_ok('select private.dispatch_sync()', 'Agendador sem endereço configurado não faz nada e não falha');
select isnt_empty('select 1 from cron.job where jobname = ''coleta-redes''', 'Coleta agendada a cada 15 minutos');

select * from finish();
rollback;
