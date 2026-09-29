-- Funções de apoio ao app: primeiro acesso, tokens no Vault e agendamento da sincronização.

-- ---------- Primeiro acesso -------------------------------------------
-- Chamada só pelo servidor (service role), depois de conferir que o e-mail é o OWNER_EMAIL.
-- Cria o workspace e torna essa pessoa dona. Os demais usuários entram por convite.
create or replace function public.claim_workspace(p_user uuid, ws_name text default 'Meu painel')
returns uuid language plpgsql security definer set search_path = public as $$
declare ws uuid;
begin
  select workspace_id into ws from memberships where user_id = p_user limit 1;
  if ws is not null then return ws; end if;
  if exists (select 1 from memberships where role = 'owner') then return null; end if;
  insert into workspaces (name) values (ws_name) returning id into ws;
  insert into memberships (user_id, workspace_id, role) values (p_user, ws, 'owner');
  return ws;
end $$;
revoke all on function public.claim_workspace(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_workspace(uuid, text) to service_role;

-- Tela Acessos: encontra o usuário pelo e-mail (só o servidor chama)
create or replace function public.user_id_by_email(p_email text)
returns uuid language sql security definer set search_path = '' as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1 $$;
revoke all on function public.user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.user_id_by_email(text) to service_role;

-- ---------- Tokens das redes no Supabase Vault ------------------------
-- O token (JSON com access_token, refresh_token, expires_at) nunca sai do servidor.
create or replace function public.store_account_token(p_account_id uuid, p_token jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare sid uuid; existing uuid;
begin
  select token_secret_id into existing from public.social_accounts where id = p_account_id;
  if existing is not null then
    perform vault.update_secret(existing, p_token::text);
    sid := existing;
  else
    sid := vault.create_secret(p_token::text, 'social_token_' || p_account_id::text);
    update public.social_accounts set token_secret_id = sid where id = p_account_id;
  end if;
  update public.social_accounts
     set token_expires_at = nullif(p_token->>'expires_at', '')::timestamptz, status = 'connected'
   where id = p_account_id;
  return sid;
end $$;

create or replace function public.read_account_token(secret_id uuid)
returns text language sql security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where id = secret_id $$;

revoke all on function public.store_account_token(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.read_account_token(uuid) from public, anon, authenticated;
grant execute on function public.store_account_token(uuid, jsonb) to service_role;
grant execute on function public.read_account_token(uuid) to service_role;

-- ---------- Agendamento ------------------------------------------------
-- Antes de rodar este bloco, guarde no Vault (SQL Editor do Supabase):
--   select vault.create_secret('https://<seu-projeto>.supabase.co', 'project_url');
--   select vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.invoke_sync(scope text)
returns bigint language sql security definer set search_path = '' as $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/sync-runner',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')),
    body := jsonb_build_object('scope', scope, 'trigger', 'cron')
  ) $$;
revoke all on function public.invoke_sync(text) from public, anon, authenticated;

select cron.schedule('sync-recent',  '0 */3 * * *',  $$ select public.invoke_sync('recent') $$);
select cron.schedule('sync-stories', '15 * * * *',   $$ select public.invoke_sync('stories') $$);
select cron.schedule('sync-daily',   '30 7 * * *',   $$ select public.invoke_sync('account_daily') $$); -- 07:30 UTC = 04:30 em Brasília
select cron.schedule('token-refresh','0 6 * * *',    $$ select public.invoke_sync('refresh_tokens') $$);
