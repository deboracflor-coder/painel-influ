-- Fase 5 — Exportação para Google Sheets e importação manual de métricas.

-- ---------- 1. Google Sheets: acesso por pessoa -----------------------------
-- Cada pessoa conecta a própria conta Google (escopo drive.file: o app só enxerga
-- as planilhas que ele mesmo criar). O token fica no Vault; a linha só aponta para ele.
alter table public.oauth_states drop constraint if exists oauth_states_provider_check;
alter table public.oauth_states add constraint oauth_states_provider_check
  check (provider in ('meta', 'google', 'google_sheets'));

create table public.user_integrations (
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('google_sheets')),
  token_secret_id uuid,
  connected_at timestamptz not null default now(),
  primary key (user_id, provider)
);
alter table public.user_integrations enable row level security;
grant select (user_id, provider, connected_at) on public.user_integrations to authenticated;
create policy user_integrations_own on public.user_integrations for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.store_user_token(p_user uuid, p_provider text, p_token jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_secret uuid;
begin
  select token_secret_id into v_secret from public.user_integrations
   where user_id = p_user and provider = p_provider for update;
  if v_secret is not null then
    perform vault.update_secret(v_secret, p_token::text);
  else
    v_secret := vault.create_secret(p_token::text, 'user:' || p_user::text || ':' || p_provider, 'Token OAuth de pessoa');
    insert into public.user_integrations (user_id, provider, token_secret_id) values (p_user, p_provider, v_secret)
    on conflict (user_id, provider) do update set token_secret_id = excluded.token_secret_id, connected_at = now();
  end if;
end $$;

create or replace function public.read_user_token(p_user uuid, p_provider text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select s.decrypted_secret::jsonb
  from public.user_integrations i join vault.decrypted_secrets s on s.id = i.token_secret_id
  where i.user_id = p_user and i.provider = p_provider;
$$;

create or replace function public.delete_user_token(p_user uuid, p_provider text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_secret uuid;
begin
  delete from public.user_integrations where user_id = p_user and provider = p_provider
  returning token_secret_id into v_secret;
  if v_secret is not null then delete from vault.secrets where id = v_secret; end if;
end $$;

-- ---------- 2. Importação manual da série diária -----------------------------
-- Para o que a API não entrega (ex.: seguidores antes da conexão). Regras:
--   * só quem opera o cliente (admin ou analista atribuído);
--   * nunca sobrescreve dia coletado pela API (a linha é pulada e contada);
--   * reimportar o mesmo dia substitui o lançamento manual anterior;
--   * tudo fica marcado como 'manual' e vai para a auditoria.
create or replace function public.import_daily_metrics(p_account uuid, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a record;
  v_ins int := 0; v_upd int := 0; v_skip int := 0;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select id, client_id, organization_id into a from public.social_accounts where id = p_account;
  if not found or not private.can_operate_client(a.client_id) then
    raise exception 'Sem permissão para lançar dados nesta conta' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 or jsonb_array_length(p_rows) > 1000 then
    raise exception 'Envie de 1 a 1000 linhas' using errcode = '22023';
  end if;

  drop table if exists pg_temp._imp;
  create temp table _imp on commit drop as
  select * from jsonb_to_recordset(p_rows) as x(day date, followers bigint, reach bigint, impressions bigint, views bigint, profile_visits int);

  if exists (select 1 from _imp where day is null or day > v_today) then
    raise exception 'Há linha sem data ou com data futura' using errcode = '22023';
  end if;
  if exists (select 1 from _imp where followers < 0 or reach < 0 or impressions < 0 or views < 0 or profile_visits < 0) then
    raise exception 'Valores negativos não são aceitos' using errcode = '22023';
  end if;
  if exists (select 1 from _imp group by day having count(*) > 1) then
    raise exception 'Há datas repetidas no arquivo' using errcode = '22023';
  end if;
  if exists (select 1 from _imp where followers is null and reach is null and impressions is null and views is null and profile_visits is null) then
    raise exception 'Há linha sem nenhum valor' using errcode = '22023';
  end if;

  select count(*) into v_skip from _imp i join public.account_daily_metrics t
    on t.account_id = a.id and t.day = i.day and t.source = 'api';
  select count(*) into v_upd from _imp i join public.account_daily_metrics t
    on t.account_id = a.id and t.day = i.day and t.source <> 'api';

  insert into public.account_daily_metrics as t (account_id, client_id, organization_id, day,
    followers, reach, impressions, views, profile_visits, source, collected_at)
  select a.id, a.client_id, a.organization_id, i.day, i.followers, i.reach, i.impressions, i.views, i.profile_visits, 'manual', now()
  from _imp i
  where not exists (select 1 from public.account_daily_metrics t
                    where t.account_id = a.id and t.day = i.day and t.source = 'api')
  on conflict (account_id, day) do update
    set followers = excluded.followers, reach = excluded.reach, impressions = excluded.impressions,
        views = excluded.views, profile_visits = excluded.profile_visits, source = 'manual', collected_at = now()
    where t.source <> 'api';
  v_ins := (select count(*) from _imp) - v_skip - v_upd;

  insert into public.audit_log (organization_id, client_id, actor_id, action, entity, entity_id, after)
  values (a.organization_id, a.client_id, auth.uid(), 'IMPORT_MANUAL', 'account_daily_metrics', a.id::text,
          jsonb_build_object('linhas', jsonb_array_length(p_rows), 'novas', v_ins, 'substituidas', v_upd, 'puladas_api', v_skip,
                             'de', (select min(day) from _imp), 'ate', (select max(day) from _imp)));

  return jsonb_build_object('inserted', v_ins, 'updated', v_upd, 'skipped_api', v_skip);
end $$;

-- Desfazer: apaga só lançamentos manuais da conta num intervalo.
create or replace function public.delete_manual_daily(p_account uuid, p_from date, p_to date) returns int
language plpgsql security definer set search_path = '' as $$
declare a record; v_n int;
begin
  select id, client_id, organization_id into a from public.social_accounts where id = p_account;
  if not found or not private.can_operate_client(a.client_id) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  delete from public.account_daily_metrics
   where account_id = a.id and source in ('manual', 'import') and day between p_from and p_to;
  get diagnostics v_n = row_count;
  insert into public.audit_log (organization_id, client_id, actor_id, action, entity, entity_id, after)
  values (a.organization_id, a.client_id, auth.uid(), 'DELETE_MANUAL', 'account_daily_metrics', a.id::text,
          jsonb_build_object('de', p_from, 'ate', p_to, 'linhas', v_n));
  return v_n;
end $$;

-- ---------- 3. Privilégios ----------------------------------------------------
revoke all on function public.store_user_token(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.read_user_token(uuid, text) from public, anon, authenticated;
revoke all on function public.delete_user_token(uuid, text) from public, anon, authenticated;
grant execute on function public.store_user_token(uuid, text, jsonb), public.read_user_token(uuid, text),
  public.delete_user_token(uuid, text) to service_role;
revoke all on function public.import_daily_metrics(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.delete_manual_daily(uuid, date, date) from public, anon, authenticated;
grant execute on function public.import_daily_metrics(uuid, jsonb), public.delete_manual_daily(uuid, date, date) to authenticated;
