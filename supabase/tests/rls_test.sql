-- Teste de permissões (RLS): uma marca não pode ver dados de outra.
-- Roda num Postgres local com um stub de auth.users/auth.uid() (ver README).
\set ON_ERROR_STOP on
begin;
insert into workspaces (id,name) values ('00000000-0000-0000-0000-0000000000aa','Demo');
insert into auth.users(id) values ('00000000-0000-0000-0000-000000000001'),  -- equipe
                              ('00000000-0000-0000-0000-000000000002'),  -- marca A
                              ('00000000-0000-0000-0000-000000000003');  -- marca B
insert into brands (id,workspace_id,name,is_demo) values
 ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000aa','Marca A (fictícia)',true),
 ('00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-0000000000aa','Marca B (fictícia)',true);
insert into memberships (user_id,workspace_id,role,brand_id) values
 ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000aa','analyst',null),
 ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000aa','brand_viewer','00000000-0000-0000-0000-00000000000a'),
 ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-0000000000aa','brand_viewer','00000000-0000-0000-0000-00000000000b');
insert into social_accounts (id,workspace_id,platform,external_account_id,handle) values
 ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000aa','instagram','ig1','@perfil.demo');
insert into campaigns (id,workspace_id,brand_id,name,start_date,end_date) values
 ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000aa','00000000-0000-0000-0000-00000000000a','Camp A','2026-08-01','2026-08-31'),
 ('00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000aa','00000000-0000-0000-0000-00000000000b','Camp B','2026-09-01','2026-09-30');
insert into campaign_financials (campaign_id,contract_value) values
 ('00000000-0000-0000-0000-0000000000d1',1000),('00000000-0000-0000-0000-0000000000d2',2000);
insert into posts (account_id,platform,external_post_id,published_at,format,brand_id,campaign_id,is_sponsored) values
 ('00000000-0000-0000-0000-0000000000c1','instagram','p1','2026-08-05','reels','00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000d1',true),
 ('00000000-0000-0000-0000-0000000000c1','instagram','p2','2026-09-05','reels','00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-0000000000d2',true),
 ('00000000-0000-0000-0000-0000000000c1','instagram','p3','2026-09-06','photo',null,null,false);

create role app_user nologin;
grant usage on schema public, auth to app_user;
grant select on all tables in schema public to app_user;
grant select on auth.users to app_user;
set local role app_user;

create temp table results (who text, check_name text, got bigint, expected bigint);

-- Equipe interna
set local app.uid = '00000000-0000-0000-0000-000000000001';
insert into results select 'equipe','posts', count(*), 3 from posts;
insert into results select 'equipe','marcas', count(*), 2 from brands;
insert into results select 'equipe','contas', count(*), 1 from social_accounts;

-- Marca A
set local app.uid = '00000000-0000-0000-0000-000000000002';
insert into results select 'marca A','posts (só os dela)', count(*), 1 from posts;
insert into results select 'marca A','posts da marca B', count(*), 0 from posts where external_post_id = 'p2';
insert into results select 'marca A','post orgânico', count(*), 0 from posts where external_post_id = 'p3';
insert into results select 'marca A','marcas visíveis', count(*), 1 from brands;
insert into results select 'marca A','financeiro visível', count(*), 1 from campaign_financials;
insert into results select 'marca A','contas sociais', count(*), 0 from social_accounts;

-- Marca B
set local app.uid = '00000000-0000-0000-0000-000000000003';
insert into results select 'marca B','posts (só os dela)', count(*), 1 from posts;
insert into results select 'marca B','campanhas', count(*), 1 from campaigns;

-- Usuário sem vínculo
set local app.uid = '00000000-0000-0000-0000-000000000099';
insert into results select 'anônimo','posts', count(*), 0 from posts;
insert into results select 'anônimo','marcas', count(*), 0 from brands;

reset role;
select who, check_name, got, expected, case when got = expected then 'OK' else 'FALHOU' end as resultado from results;
select case when bool_and(got = expected) then 'RLS: TODOS OS TESTES PASSARAM' else 'RLS: HÁ FALHAS' end from results;
rollback;
