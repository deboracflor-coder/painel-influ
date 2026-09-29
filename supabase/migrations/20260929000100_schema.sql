-- =====================================================================
-- Dashboard de performance social + marcas parceiras
-- Schema PostgreSQL / Supabase  (Etapa 3)
-- Convenções:
--   * Toda métrica guarda a ORIGEM (api | manual | import | sheets | calc)
--   * Métrica indisponível = NULL (nunca 0). 0 significa "a API disse zero".
--   * Métricas de post são SNAPSHOTS no tempo (um post continua crescendo
--     depois de publicado), o valor "atual" é o snapshot mais recente.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Tipos ----------------------------------------------------
create type platform_t as enum ('instagram','tiktok','youtube','facebook','linkedin');
create type data_source_t as enum ('api','manual','import','sheets','calc');
create type post_format_t as enum ('reels','story','carousel','photo','video','short','long_video','live','text','other');
create type delivery_status_t as enum ('planejado','em_producao','aguardando_aprovacao','publicado','entregue','pendente','cancelado');
create type member_role_t as enum ('owner','analyst','viewer','brand_viewer');
create type sync_status_t as enum ('running','success','partial','error');
create type emv_basis_t as enum ('impressions','views','reach','engagements');

-- ---------- Organização e acesso -------------------------------------
create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'America/Sao_Paulo',
  settings jsonb not null default '{}'::jsonb,   -- base da taxa de engajamento e limites de alertas
  created_at timestamptz not null default now()
);

create table brands (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  logo_url text,
  segment text,
  contact_name text,
  contact_email text,
  notes text,
  is_demo boolean not null default false,        -- dado fictício
  created_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  role member_role_t not null,
  brand_id uuid references brands(id) on delete cascade, -- obrigatório p/ brand_viewer
  created_at timestamptz not null default now(),
  check (role <> 'brand_viewer' or brand_id is not null),
  check (role = 'brand_viewer' or brand_id is null)
);
create unique index memberships_unique on memberships
  (user_id, workspace_id, coalesce(brand_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ---------- Contas sociais -------------------------------------------
create table social_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  platform platform_t not null,
  external_account_id text not null,            -- id na plataforma
  handle text not null,
  display_name text,
  token_secret_id uuid,                         -- referência ao Supabase Vault (NUNCA o token)
  token_expires_at timestamptz,
  scopes text[],
  status text not null default 'connected',     -- connected | expired | revoked | error | not_configured
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  unique (platform, external_account_id)
);

-- Série diária da conta (seguidores, alcance da conta, etc.)
create table account_daily (
  account_id uuid not null references social_accounts(id) on delete cascade,
  day date not null,
  followers bigint,
  followers_gained integer,
  followers_lost integer,
  reach bigint,
  impressions bigint,
  views bigint,
  profile_visits integer,
  link_clicks integer,
  watch_time_minutes numeric,
  source data_source_t not null default 'api',
  collected_at timestamptz not null default now(),
  primary key (account_id, day)
);

-- ---------- Campanhas e contratos ------------------------------------
create table campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  brand_id uuid references brands(id) on delete set null,  -- null = campanha própria
  name text not null,
  objective text,
  start_date date not null,
  end_date date not null,
  tracking_hashtags text[],                     -- usados para sugerir vínculo automático
  tracking_mentions text[],
  goal_views bigint,                            -- meta de visualizações (manual, opcional)
  notes text,
  check (end_date >= start_date)
);

-- Valores financeiros da parceria (tudo manual, com origem)
create table campaign_financials (
  campaign_id uuid primary key references campaigns(id) on delete cascade,
  contract_value numeric(14,2),                 -- valor contratado
  media_value numeric(14,2),                    -- valor de mídia (impulsionamento)
  product_value numeric(14,2),                  -- produtos / permutas
  estimated_delivery_value numeric(14,2),       -- valor estimado das entregas (tabela de preços)
  currency char(3) not null default 'BRL',
  source data_source_t not null default 'manual',
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
-- investimento_total = contract_value + media_value + product_value (view)

create table deliverables (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  platform platform_t,                          -- null p/ entregas fora das redes (evento)
  format post_format_t,
  label text not null,                          -- ex.: "Reels", "Presença em evento"
  quantity_expected integer not null check (quantity_expected >= 0),
  due_date date,
  quantity_delivered_manual integer,            -- só para entregas sem post (evento)
  quantity_cancelled integer not null default 0, -- canceladas em comum acordo: saem do contratado
  status delivery_status_t not null default 'planejado',
  notes text
);

-- ---------- Posts e métricas -----------------------------------------
-- (delivery_items vem depois de posts, porque referencia posts)
create table posts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references social_accounts(id) on delete cascade,
  platform platform_t not null,
  external_post_id text not null,
  published_at timestamptz not null,
  format post_format_t not null,
  title text,
  caption text,
  url text,
  thumbnail_url text,                           -- cópia no Storage (URLs das APIs expiram)
  is_sponsored boolean not null default false,
  campaign_id uuid references campaigns(id) on delete set null,
  brand_id uuid references brands(id) on delete set null,
  deliverable_id uuid references deliverables(id) on delete set null,
  link_confirmed boolean not null default false, -- vínculo sugerido x confirmado
  expires_at timestamptz,                        -- stories: janela de 24h
  source data_source_t not null default 'api',
  unique (platform, external_post_id)
);
create index on posts (published_at);
create index on posts (brand_id, published_at);
create index on posts (campaign_id);

-- Controle de entregas: uma linha por unidade contratada
create table delivery_items (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid not null references deliverables(id) on delete cascade,
  post_id uuid references posts(id) on delete set null,
  expected_date date,
  delivered_date date,
  status delivery_status_t not null default 'planejado',
  notes text,                                    -- visível para a marca
  internal_notes text,                           -- só equipe (não vai para o portal)
  created_at timestamptz not null default now()
);
create index on delivery_items (deliverable_id);

-- Snapshots: 1 linha por post por coleta (histórico de crescimento)
create table metric_snapshots (
  post_id uuid not null references posts(id) on delete cascade,
  captured_at timestamptz not null,
  reach bigint,
  impressions bigint,
  views bigint,
  likes bigint,
  comments bigint,
  shares bigint,
  saves bigint,
  clicks bigint,
  follows integer,                              -- seguidores ganhos pelo post
  watch_time_minutes numeric,
  avg_view_duration_s numeric,
  avg_view_pct numeric,                         -- retenção média (%)
  thumb_ctr numeric,                            -- YouTube
  source data_source_t not null default 'api',
  primary key (post_id, captured_at)
) partition by range (captured_at);
create table metric_snapshots_2026 partition of metric_snapshots
  for values from ('2026-01-01') to ('2027-01-01');

-- Valores manuais pontuais que sobrescrevem/complementam a API
create table manual_metric_overrides (
  post_id uuid not null references posts(id) on delete cascade,
  metric text not null check (metric in ('reach','impressions','views','likes','comments','shares','saves','clicks','follows')),
  value numeric not null,
  reason text not null,                          -- obrigatório: por que é manual
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (post_id, metric)
);

-- Último snapshot + overrides manuais = métricas "atuais" do post
create view post_metrics_current with (security_invoker = true) as
select p.id as post_id,
       coalesce(o_reach.value, s.reach)        as reach,
       s.impressions,
       coalesce(o_views.value, s.views)        as views,
       s.likes, s.comments, s.shares,
       coalesce(o_saves.value, s.saves)        as saves,
       coalesce(o_clicks.value, s.clicks)      as clicks,
       s.follows, s.watch_time_minutes, s.avg_view_pct, s.thumb_ctr,
       s.captured_at,
       (o_reach.value is not null or o_views.value is not null
        or o_saves.value is not null or o_clicks.value is not null) as has_manual_data
from posts p
left join lateral (select * from metric_snapshots m where m.post_id = p.id
                   order by captured_at desc limit 1) s on true
left join manual_metric_overrides o_reach  on o_reach.post_id = p.id  and o_reach.metric = 'reach'
left join manual_metric_overrides o_views  on o_views.post_id = p.id  and o_views.metric = 'views'
left join manual_metric_overrides o_saves  on o_saves.post_id = p.id  and o_saves.metric = 'saves'
left join manual_metric_overrides o_clicks on o_clicks.post_id = p.id and o_clicks.metric = 'clicks';

-- ---------- Parâmetros de valor (EMV) --------------------------------
create table benchmark_parameters (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  platform platform_t not null,
  format post_format_t,                          -- null = vale para todos os formatos
  basis emv_basis_t not null,                    -- base do cálculo
  rate numeric(12,4) not null,                   -- CPM (R$/1000) ou R$ por engajamento
  methodology text not null,                     -- texto obrigatório: de onde veio o valor
  reference_source text,                         -- ex.: "tabela de mídia 2026 da agência X"
  valid_from date not null,
  valid_to date,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ---------- Alertas ---------------------------------------------------
create table alert_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  kind text not null,          -- reach_drop | follower_drop | campaign_ending | delivery_late | api_disconnected | sync_error | missing_metrics | goal_missed
  threshold numeric,           -- ex.: -20 (%), 7 (dias)
  enabled boolean not null default true,
  notify_channels text[] default array['in_app']
);

create table alerts (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid references alert_rules(id) on delete set null,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  brand_id uuid references brands(id) on delete cascade,
  severity text not null check (severity in ('info','warning','critical')),
  message text not null,
  context jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- ---------- Sincronização e auditoria --------------------------------
create table sync_runs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references social_accounts(id) on delete cascade,
  trigger text not null,                         -- cron | manual | webhook
  status sync_status_t not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  posts_upserted integer default 0,
  snapshots_written integer default 0,
  api_calls integer default 0
);

create table sync_errors (
  id bigserial primary key,
  sync_run_id uuid references sync_runs(id) on delete cascade,
  code text,                                     -- token_expired | rate_limited | permission_missing | metric_deprecated | network
  message text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

create table raw_payloads (
  id bigserial primary key,
  sync_run_id uuid references sync_runs(id) on delete cascade,
  endpoint text not null,
  body jsonb not null,
  fetched_at timestamptz not null default now()
);

create table import_batches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  origin text not null,                          -- csv | xlsx | google_sheets
  file_name text,
  column_mapping jsonb not null,
  rows_total integer, rows_imported integer, rows_duplicated integer, rows_rejected integer,
  errors jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table audit_log (
  id bigserial primary key,
  user_id uuid references auth.users(id),
  action text not null,
  entity text not null,
  entity_id text,
  diff jsonb,
  created_at timestamptz not null default now()
);

create table share_links (
  token text primary key default encode(gen_random_bytes(24),'hex'),
  brand_id uuid references brands(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid references auth.users(id)
);

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
create or replace function public.user_role(ws uuid) returns member_role_t
language sql stable security definer set search_path = public as $$
  select role from memberships where user_id = auth.uid() and workspace_id = ws
  order by case role when 'owner' then 1 when 'analyst' then 2 when 'viewer' then 3 else 4 end
  limit 1 $$;

create or replace function public.user_brand_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select brand_id from memberships where user_id = auth.uid() and role = 'brand_viewer' $$;

create or replace function public.is_internal(ws uuid) returns boolean
language sql stable as $$ select public.user_role(ws) in ('owner','analyst','viewer') $$;

alter table brands enable row level security;
alter table campaigns enable row level security;
alter table campaign_financials enable row level security;
alter table deliverables enable row level security;
alter table posts enable row level security;
alter table metric_snapshots enable row level security;
alter table social_accounts enable row level security;
alter table account_daily enable row level security;
alter table benchmark_parameters enable row level security;
alter table sync_runs enable row level security;
alter table sync_errors enable row level security;
alter table delivery_items enable row level security;
alter table workspaces enable row level security;
alter table memberships enable row level security;
alter table manual_metric_overrides enable row level security;
alter table alerts enable row level security;
alter table import_batches enable row level security;
alter table audit_log enable row level security;
alter table raw_payloads enable row level security;
alter table share_links enable row level security;
alter table alert_rules enable row level security;

-- Equipe interna vê tudo do workspace; marca vê só a própria
create policy brands_read on brands for select using (
  is_internal(workspace_id) or id in (select user_brand_ids()));
create policy campaigns_read on campaigns for select using (
  is_internal(workspace_id) or brand_id in (select user_brand_ids()));
create policy deliverables_read on deliverables for select using (
  exists (select 1 from campaigns c where c.id = campaign_id and
          (is_internal(c.workspace_id) or c.brand_id in (select user_brand_ids()))));
-- Marca vê o investimento DA PRÓPRIA campanha (é dela), nunca de outras
create policy fin_read on campaign_financials for select using (
  exists (select 1 from campaigns c where c.id = campaign_id and
          (is_internal(c.workspace_id) or c.brand_id in (select user_brand_ids()))));
-- Posts: marca só vê posts vinculados a ela (nunca orgânicos ou de outra marca)
create policy posts_read on posts for select using (
  exists (select 1 from social_accounts a where a.id = account_id and is_internal(a.workspace_id))
  or brand_id in (select user_brand_ids()));
create policy snapshots_read on metric_snapshots for select using (
  exists (select 1 from posts p where p.id = post_id));   -- herda a policy de posts
-- Tabelas só internas
create policy accounts_read on social_accounts for select using (is_internal(workspace_id));
create policy daily_read on account_daily for select using (
  exists (select 1 from social_accounts a where a.id = account_id and is_internal(a.workspace_id)));
create policy bench_read on benchmark_parameters for select using (is_internal(workspace_id));
create policy runs_read on sync_runs for select using (
  exists (select 1 from social_accounts a where a.id = account_id and is_internal(a.workspace_id)));

create policy items_read on delivery_items for select using (
  exists (select 1 from deliverables d join campaigns c on c.id = d.campaign_id where d.id = deliverable_id and
          (is_internal(c.workspace_id) or c.brand_id in (select user_brand_ids()))));
create policy errors_read on sync_errors for select using (
  exists (select 1 from sync_runs r where r.id = sync_run_id));   -- herda a policy de sync_runs
create policy overrides_read on manual_metric_overrides for select using (
  exists (select 1 from posts p where p.id = post_id));
create policy workspaces_read on workspaces for select using (
  exists (select 1 from memberships m where m.workspace_id = workspaces.id and m.user_id = auth.uid()));
create policy memberships_read_own on memberships for select using (user_id = auth.uid());
create policy alerts_read on alerts for select using (
  is_internal(workspace_id) or brand_id in (select user_brand_ids()));
-- raw_payloads, import_batches, audit_log, share_links, alert_rules: sem policy de leitura = só service role

-- Escrita: só owner/analyst (as funções de sync usam a service role, que ignora RLS)
create policy campaigns_write on campaigns for all
  using (user_role(workspace_id) in ('owner','analyst'))
  with check (user_role(workspace_id) in ('owner','analyst'));
create policy bench_write on benchmark_parameters for all
  using (user_role(workspace_id) in ('owner','analyst'))
  with check (user_role(workspace_id) in ('owner','analyst'));

-- =====================================================================
-- AGENDAMENTO (pg_cron + pg_net chamando a Edge Function)
-- =====================================================================
-- select cron.schedule('sync-recent', '0 */3 * * *',  -- a cada 3h: posts dos últimos 30 dias
--   $$ select net.http_post(url := '<SUPABASE_URL>/functions/v1/sync-runner',
--        headers := jsonb_build_object('Authorization','Bearer ' || '<SERVICE_ROLE via Vault>'),
--        body := '{"scope":"recent"}'::jsonb) $$);
-- select cron.schedule('sync-stories', '0 * * * *', ...  {"scope":"stories"} );  -- stories expiram em 24h
-- select cron.schedule('sync-daily',   '30 4 * * *', ... {"scope":"account_daily"} );
-- select cron.schedule('sync-sheets',  '*/30 * * * *', ... functions/v1/import-sheets );

-- =====================================================================
-- TOKENS (Supabase Vault) — só a service role (Edge Functions) lê o token.
-- Comentado porque depende da extensão supabase_vault, presente só no Supabase.
-- =====================================================================
-- create or replace function public.read_account_token(secret_id uuid) returns text
-- language sql security definer set search_path = '' as $$
--   select decrypted_secret from vault.decrypted_secrets where id = secret_id $$;
-- revoke all on function public.read_account_token(uuid) from public, anon, authenticated;
-- grant execute on function public.read_account_token(uuid) to service_role;
