-- Fase 4 — Integrações com Instagram, Facebook e YouTube.
-- Conexão OAuth, gravação idempotente da coleta e agendamento.

-- ---------- 0. Correção: gatilho duplicado da Fase 3 -----------------------
-- A regra "a agência nunca fica sem administrador" já existia desde a Fase 2
-- (org_members_keep_admin). O gatilho criado na Fase 3 repetia a mesma regra.
drop trigger if exists organization_members_keep_admin on public.organization_members;
drop function if exists private.keep_one_org_admin();

-- ---------- 1. Estado do OAuth ------------------------------------------------
-- Uma autorização da Meta conecta Instagram e Facebook de uma vez; por isso o
-- estado guarda o provedor, não a rede.
alter table public.oauth_states
  add column provider text check (provider in ('meta', 'google')),
  add column return_to text,
  alter column platform drop not null;
create index oauth_states_expires_idx on public.oauth_states (expires_at);

-- ---------- 2. Permissão consultável pelas Edge Functions ---------------------
-- Envelope público (security invoker) da regra que já existe no schema private.
create or replace function public.can_operate(p_client uuid) returns boolean
language sql stable security invoker set search_path = '' as $$
  select private.can_operate_client(p_client);
$$;

-- ---------- 3. Gravação da coleta (só service role) ---------------------------
-- Uma chamada por lote, numa transação. Repetir o mesmo lote não duplica nada:
--   posts      → chave (account_id, external_post_id)
--   snapshots  → chave (post_id, collected_at)
--   diário     → chave (account_id, day); valor ausente não apaga valor já gravado,
--                e linha lançada à mão (manual/import) não é sobrescrita pela API.
create or replace function public.ingest_sync_batch(p_account uuid, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a record;
  v_collected timestamptz := coalesce((p_payload->>'collected_at')::timestamptz, now());
  v_version text := p_payload->>'api_version';
  v_posts int := 0; v_snaps int := 0; v_daily int := 0;
begin
  select id, client_id, organization_id, platform into a from public.social_accounts where id = p_account;
  if not found then raise exception 'Conta social inexistente' using errcode = 'P0002'; end if;

  with src as (
    select * from jsonb_to_recordset(coalesce(p_payload->'posts', '[]')) as x(
      external_post_id text, format public.post_format_t, permalink text, caption text,
      thumbnail_url text, published_at timestamptz, metrics jsonb)
  ), up as (
    insert into public.posts (account_id, client_id, organization_id, platform, external_post_id,
                              format, permalink, caption, thumbnail_url, published_at)
    select a.id, a.client_id, a.organization_id, a.platform, s.external_post_id,
           coalesce(s.format, 'other'), s.permalink, left(s.caption, 5000), s.thumbnail_url, s.published_at
    from src s
    on conflict (account_id, external_post_id) do update
      set format = excluded.format, permalink = excluded.permalink, caption = excluded.caption,
          thumbnail_url = excluded.thumbnail_url, published_at = excluded.published_at, updated_at = now()
    returning id, external_post_id
  ), snaps as (
    insert into public.post_metric_snapshots (post_id, client_id, organization_id, collected_at,
      views, reach, impressions, likes, comments, shares, saves, watch_time_seconds,
      avg_watch_time_seconds, profile_visits, follows, link_clicks, extra, source, api_version)
    select up.id, a.client_id, a.organization_id, v_collected,
      (m->>'views')::bigint, (m->>'reach')::bigint, (m->>'impressions')::bigint,
      (m->>'likes')::bigint, (m->>'comments')::bigint, (m->>'shares')::bigint, (m->>'saves')::bigint,
      (m->>'watch_time_seconds')::numeric, (m->>'avg_watch_time_seconds')::numeric,
      (m->>'profile_visits')::int, (m->>'follows')::int, (m->>'link_clicks')::int,
      m->'extra', 'api', v_version
    from up join src s on s.external_post_id = up.external_post_id
    cross join lateral (select s.metrics as m) mm
    where s.metrics is not null
    on conflict (post_id, collected_at) do update
      set views = excluded.views, reach = excluded.reach, impressions = excluded.impressions,
          likes = excluded.likes, comments = excluded.comments, shares = excluded.shares,
          saves = excluded.saves, watch_time_seconds = excluded.watch_time_seconds,
          avg_watch_time_seconds = excluded.avg_watch_time_seconds, profile_visits = excluded.profile_visits,
          follows = excluded.follows, link_clicks = excluded.link_clicks, extra = excluded.extra,
          api_version = excluded.api_version
      where public.post_metric_snapshots.source = 'api'
    returning 1
  )
  select (select count(*) from up), (select count(*) from snaps) into v_posts, v_snaps;

  with src as (
    select * from jsonb_to_recordset(coalesce(p_payload->'daily', '[]')) as x(
      day date, followers bigint, followers_gained int, followers_lost int,
      reach bigint, impressions bigint, views bigint, profile_visits int, extra jsonb)
  ), ins as (
    insert into public.account_daily_metrics as t (account_id, client_id, organization_id, day,
      followers, followers_gained, followers_lost, reach, impressions, views, profile_visits,
      extra, source, api_version, collected_at)
    select a.id, a.client_id, a.organization_id, s.day, s.followers, s.followers_gained, s.followers_lost,
           s.reach, s.impressions, s.views, s.profile_visits, s.extra, 'api', v_version, v_collected
    from src s
    on conflict (account_id, day) do update
      set followers = coalesce(excluded.followers, t.followers),
          followers_gained = coalesce(excluded.followers_gained, t.followers_gained),
          followers_lost = coalesce(excluded.followers_lost, t.followers_lost),
          reach = coalesce(excluded.reach, t.reach),
          impressions = coalesce(excluded.impressions, t.impressions),
          views = coalesce(excluded.views, t.views),
          profile_visits = coalesce(excluded.profile_visits, t.profile_visits),
          extra = coalesce(t.extra, '{}'::jsonb) || coalesce(excluded.extra, '{}'::jsonb),
          api_version = excluded.api_version, collected_at = excluded.collected_at
      where t.source = 'api'
    returning 1
  )
  select count(*) into v_daily from ins;

  return jsonb_build_object('posts', v_posts, 'snapshots', v_snaps, 'daily', v_daily);
end $$;

-- ---------- 4. Agendamento (pg_cron + pg_net) ---------------------------------
-- O banco chama a Edge Function sync-worker a cada 15 minutos. Endereço e segredo
-- ficam no Vault (veja docs/runbooks/integracoes.md); sem eles, nada é chamado.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function private.dispatch_sync() returns void
language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'sync_worker_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'sync_cron_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    timeout_milliseconds := 5000);
end $$;

-- Limpeza: respostas brutas guardadas por 30 dias; estados OAuth vencidos.
create or replace function private.cleanup_integrations() returns void
language sql security definer set search_path = '' as $$
  delete from public.raw_payloads where fetched_at < now() - interval '30 days';
  delete from public.oauth_states where expires_at < now() - interval '1 day';
$$;

select cron.schedule('coleta-redes', '*/15 * * * *', 'select private.dispatch_sync()');
select cron.schedule('limpeza-integracoes', '17 3 * * *', 'select private.cleanup_integrations()');

-- ---------- 5. Catálogo de métricas -------------------------------------------
-- O que cada API entrega hoje, conforme a documentação oficial (verificado em 2026-11-05).
-- O painel usa este catálogo para dizer "Indisponível" em vez de mostrar zero.
insert into public.metric_catalog (platform, scope, metric, available, api_metric_name, note, verified_at) values
  ('instagram', 'post', 'views', true, 'views', null, '2026-11-05'),
  ('instagram', 'post', 'reach', true, 'reach', 'Estimado pela Meta', '2026-11-05'),
  ('instagram', 'post', 'impressions', false, 'impressions', 'Descontinuada para publicações após 02/07/2024', '2026-11-05'),
  ('instagram', 'post', 'likes', true, 'likes', 'Só orgânico', '2026-11-05'),
  ('instagram', 'post', 'comments', true, 'comments', 'Só orgânico', '2026-11-05'),
  ('instagram', 'post', 'shares', true, 'shares', null, '2026-11-05'),
  ('instagram', 'post', 'saves', true, 'saved', 'Não existe para stories', '2026-11-05'),
  ('instagram', 'post', 'avg_watch_time_seconds', true, 'ig_reels_avg_watch_time', 'Só reels', '2026-11-05'),
  ('instagram', 'post', 'profile_visits', true, 'profile_visits', 'Feed e stories', '2026-11-05'),
  ('instagram', 'post', 'follows', true, 'follows', 'Feed e stories', '2026-11-05'),
  ('instagram', 'post', 'link_clicks', true, 'link_clicks', 'Só stories', '2026-11-05'),
  ('instagram', 'account', 'followers', true, 'followers_count', 'Valor do dia da coleta; dias anteriores à conexão não existem', '2026-11-05'),
  ('instagram', 'account', 'reach', true, 'reach', 'Série diária', '2026-11-05'),
  ('instagram', 'account', 'impressions', false, 'impressions', 'Removida em 21/04/2025', '2026-11-05'),
  ('facebook', 'post', 'views', true, 'post_media_view', 'Substitui post_impressions', '2026-11-05'),
  ('facebook', 'post', 'reach', true, 'post_total_media_view_unique', 'Substitui post_impressions_unique', '2026-11-05'),
  ('facebook', 'post', 'likes', true, 'reactions.summary', 'Total de reações', '2026-11-05'),
  ('facebook', 'post', 'comments', true, 'comments.summary', null, '2026-11-05'),
  ('facebook', 'post', 'shares', true, 'shares', null, '2026-11-05'),
  ('facebook', 'post', 'saves', false, null, 'A API não fornece salvamentos', '2026-11-05'),
  ('facebook', 'account', 'followers', true, 'followers_count', 'Valor do dia da coleta', '2026-11-05'),
  ('facebook', 'account', 'views', true, 'page_media_view', 'Série diária', '2026-11-05'),
  ('facebook', 'account', 'reach', true, 'page_total_media_view_unique', 'Série diária', '2026-11-05'),
  ('youtube', 'post', 'views', true, 'viewCount', 'Total acumulado do vídeo', '2026-11-05'),
  ('youtube', 'post', 'likes', true, 'likeCount', null, '2026-11-05'),
  ('youtube', 'post', 'comments', true, 'commentCount', null, '2026-11-05'),
  ('youtube', 'post', 'shares', true, 'shares', 'YouTube Analytics', '2026-11-05'),
  ('youtube', 'post', 'watch_time_seconds', true, 'estimatedMinutesWatched', 'YouTube Analytics, convertido para segundos', '2026-11-05'),
  ('youtube', 'post', 'avg_watch_time_seconds', true, 'averageViewDuration', 'YouTube Analytics', '2026-11-05'),
  ('youtube', 'post', 'reach', false, null, 'O YouTube não fornece alcance', '2026-11-05'),
  ('youtube', 'post', 'saves', false, null, 'O YouTube não fornece salvamentos', '2026-11-05'),
  ('youtube', 'account', 'followers', true, 'subscriberCount', 'Valor do dia da coleta', '2026-11-05'),
  ('youtube', 'account', 'followers_gained', true, 'subscribersGained', 'YouTube Analytics, por dia', '2026-11-05'),
  ('youtube', 'account', 'views', true, 'views', 'YouTube Analytics, por dia', '2026-11-05')
on conflict (platform, scope, metric) do update
  set available = excluded.available, api_metric_name = excluded.api_metric_name,
      note = excluded.note, verified_at = excluded.verified_at;

-- ---------- 6. Privilégios ----------------------------------------------------
revoke all on function public.can_operate(uuid) from public, anon, authenticated;
grant execute on function public.can_operate(uuid) to authenticated;
revoke all on function public.ingest_sync_batch(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_sync_batch(uuid, jsonb) to service_role;
revoke all on function private.dispatch_sync() from public, anon, authenticated;
revoke all on function private.cleanup_integrations() from public, anon, authenticated;
