-- =====================================================================
-- Leitura do dashboard: posts do cliente com o snapshot mais recente.
-- SECURITY INVOKER: roda com o papel de quem chama, então a RLS de posts e
-- snapshots continua valendo (um cliente não lê posts de outro por aqui).
-- =====================================================================
create or replace function public.client_posts(p_client uuid, p_from timestamptz, p_to timestamptz)
returns table (
  id uuid,
  account_id uuid,
  platform public.platform_t,
  format public.post_format_t,
  permalink text,
  caption text,
  thumbnail_url text,
  published_at timestamptz,
  collected_at timestamptz,
  views bigint,
  reach bigint,
  impressions bigint,
  likes bigint,
  comments bigint,
  shares bigint,
  saves bigint,
  watch_time_seconds numeric,
  avg_watch_time_seconds numeric,
  profile_visits integer,
  follows integer,
  link_clicks integer,
  source public.data_source_t
)
language sql stable security invoker set search_path = '' as $$
  select p.id, p.account_id, p.platform, p.format, p.permalink, p.caption, p.thumbnail_url, p.published_at,
         s.collected_at, s.views, s.reach, s.impressions, s.likes, s.comments, s.shares, s.saves,
         s.watch_time_seconds, s.avg_watch_time_seconds, s.profile_visits, s.follows, s.link_clicks, s.source
  from public.posts p
  left join lateral (
    select * from public.post_metric_snapshots x
    where x.post_id = p.id
    order by x.collected_at desc
    limit 1
  ) s on true
  where p.client_id = p_client
    and p.published_at >= p_from
    and p.published_at < p_to
  order by p.published_at desc
  limit 5000;
$$;

revoke all on function public.client_posts(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.client_posts(uuid, timestamptz, timestamptz) to authenticated;
