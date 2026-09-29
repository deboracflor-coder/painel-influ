-- Só para testar as migrações num Postgres comum: imita as partes do Supabase (auth, vault, cron, net).
create schema auth; create table auth.users(id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true),'')::uuid $$;
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema vault;
create table vault.secrets(id uuid primary key default gen_random_uuid(), name text, secret text);
create view vault.decrypted_secrets as select id, name, secret as decrypted_secret from vault.secrets;
create function vault.create_secret(s text, n text default null) returns uuid language sql as $$ insert into vault.secrets(name, secret) values (n, s) returning id $$;
create function vault.update_secret(i uuid, s text) returns void language sql as $$ update vault.secrets set secret = s where id = i $$;
create schema cron; create table cron.job(name text, sched text, cmd text);
create function cron.schedule(n text, s text, c text) returns bigint language sql as $$ insert into cron.job values (n, s, c); select 1::bigint $$;
create schema net;
create function net.http_post(url text, headers jsonb, body jsonb) returns bigint language sql as $$ select 1::bigint $$;
