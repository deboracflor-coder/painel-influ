-- =====================================================================
-- Social Media Intelligence · Estrutura do banco (Fase 2)
--
-- Hierarquia: organizations (agência) → clients → social_accounts → posts
-- Convenções:
--   * Toda tabela de dados carrega organization_id e client_id, amarrados por
--     chaves estrangeiras compostas: não existe linha de um cliente apontando
--     para conta, post ou organização de outro.
--   * Métrica indisponível = NULL. Zero só quando a API informou zero.
--   * Métricas de post são snapshots acumulados (um post continua crescendo);
--     o valor atual é o snapshot mais recente.
--   * Toda métrica guarda a origem (api | manual | import | calc) e a versão da API.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- Tipos ----------------------------------------------------
create type public.platform_t as enum ('instagram', 'facebook', 'youtube', 'tiktok', 'x', 'linkedin');
create type public.data_source_t as enum ('api', 'manual', 'import', 'calc');
create type public.org_role_t as enum ('org_admin', 'org_analyst');
create type public.client_role_t as enum ('client_viewer');
create type public.connection_status_t as enum ('connected', 'expired', 'revoked', 'error');
create type public.sync_status_t as enum ('queued', 'running', 'success', 'partial', 'error');
create type public.sync_trigger_t as enum ('cron', 'manual', 'retry');
create type public.post_format_t as enum ('reels', 'story', 'carousel', 'photo', 'video', 'short', 'long_video', 'live', 'text', 'other');
create type public.metric_scope_t as enum ('account', 'post');

-- ---------- Organização, clientes e pessoas ---------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  created_at timestamptz not null default now()
);

-- Espelho mínimo de auth.users para mostrar nome/e-mail sem expor o schema auth
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text check (full_name is null or length(full_name) <= 120),
  created_at timestamptz not null default now()
);

-- Equipe da agência
create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.org_role_t not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members (user_id);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 120),
  notes text check (notes is null or length(notes) <= 2000),
  is_demo boolean not null default false,          -- dado fictício, nunca em produção
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name),
  unique (id, organization_id)                      -- alvo das chaves compostas
);
create index clients_org_idx on public.clients (organization_id);

-- Quais clientes cada analista da agência pode ver (admin vê todos da organização)
create table public.client_assignments (
  client_id uuid not null,
  organization_id uuid not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (client_id, user_id),
  foreign key (client_id, organization_id) references public.clients (id, organization_id) on delete cascade,
  foreign key (organization_id, user_id) references public.organization_members (organization_id, user_id) on delete cascade
);
create index client_assignments_user_idx on public.client_assignments (user_id);

-- Pessoas do lado do cliente: só enxergam a própria empresa
create table public.client_users (
  client_id uuid not null,
  organization_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.client_role_t not null default 'client_viewer',
  created_at timestamptz not null default now(),
  primary key (client_id, user_id),
  foreign key (client_id, organization_id) references public.clients (id, organization_id) on delete cascade
);
create index client_users_user_idx on public.client_users (user_id);

-- ---------- Contas sociais -------------------------------------------
create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_id uuid not null,
  platform public.platform_t not null,
  external_account_id text not null,               -- id na plataforma
  handle text,
  display_name text,
  status public.connection_status_t not null default 'connected',
  token_secret_id uuid,                            -- referência ao Supabase Vault (nunca o token)
  token_expires_at timestamptz,
  scopes text[],
  sync_enabled boolean not null default true,
  sync_frequency_minutes integer not null default 360 check (sync_frequency_minutes between 60 and 10080),
  next_sync_at timestamptz,
  last_synced_at timestamptz,
  last_error text,
  connected_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (client_id, organization_id) references public.clients (id, organization_id) on delete cascade,
  -- a mesma conta não pode ser conectada duas vezes na organização
  unique (organization_id, platform, external_account_id),
  unique (id, client_id, organization_id)
);
create index social_accounts_client_idx on public.social_accounts (client_id);
create index social_accounts_due_idx on public.social_accounts (next_sync_at) where sync_enabled and status = 'connected';

-- Série diária da conta (seguidores, alcance da conta etc.)
create table public.account_daily_metrics (
  account_id uuid not null,
  client_id uuid not null,
  organization_id uuid not null,
  day date not null,
  followers bigint,
  followers_gained integer,
  followers_lost integer,
  reach bigint,
  impressions bigint,
  views bigint,
  profile_visits integer,
  extra jsonb,
  source public.data_source_t not null default 'api',
  api_version text,
  collected_at timestamptz not null default now(),
  primary key (account_id, day),                    -- idempotência: uma linha por conta e dia
  foreign key (account_id, client_id, organization_id)
    references public.social_accounts (id, client_id, organization_id) on delete cascade
);
create index account_daily_client_day_idx on public.account_daily_metrics (client_id, day);

-- ---------- Publicações e métricas -----------------------------------
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  client_id uuid not null,
  organization_id uuid not null,
  platform public.platform_t not null,
  external_post_id text not null,
  format public.post_format_t not null default 'other',
  permalink text,
  caption text,
  thumbnail_url text,
  published_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, external_post_id),            -- idempotência da ingestão
  unique (id, client_id, organization_id),
  foreign key (account_id, client_id, organization_id)
    references public.social_accounts (id, client_id, organization_id) on delete cascade
);
create index posts_client_published_idx on public.posts (client_id, published_at desc);

create table public.post_metric_snapshots (
  id bigint generated always as identity primary key,
  post_id uuid not null,
  client_id uuid not null,
  organization_id uuid not null,
  collected_at timestamptz not null,
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
  extra jsonb,                                      -- métricas específicas da rede, pelo nome original
  source public.data_source_t not null default 'api',
  api_version text,
  unique (post_id, collected_at),                   -- idempotência: repetir a coleta não duplica
  foreign key (post_id, client_id, organization_id)
    references public.posts (id, client_id, organization_id) on delete cascade
);
create index post_snapshots_client_idx on public.post_metric_snapshots (client_id, collected_at desc);

-- O que cada API entrega. Preenchido na Fase 4 a partir da documentação oficial.
create table public.metric_catalog (
  platform public.platform_t not null,
  scope public.metric_scope_t not null,
  metric text not null,
  available boolean not null,
  api_metric_name text,
  note text,
  verified_at date,
  primary key (platform, scope, metric)
);

-- ---------- Sincronização --------------------------------------------
create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  client_id uuid not null,
  organization_id uuid not null,
  trigger public.sync_trigger_t not null,
  status public.sync_status_t not null default 'queued',
  attempt integer not null default 1 check (attempt >= 1),
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  next_retry_at timestamptz,
  api_calls integer not null default 0,
  posts_upserted integer not null default 0,
  snapshots_written integer not null default 0,
  requested_by uuid references auth.users (id) on delete set null,
  foreign key (account_id, client_id, organization_id)
    references public.social_accounts (id, client_id, organization_id) on delete cascade
);
-- no máximo uma coleta na fila ou rodando por conta
create unique index sync_runs_one_active_idx on public.sync_runs (account_id) where status in ('queued', 'running');
create index sync_runs_client_idx on public.sync_runs (client_id, queued_at desc);

create table public.sync_errors (
  id bigint generated always as identity primary key,
  sync_run_id uuid not null references public.sync_runs (id) on delete cascade,
  account_id uuid not null,
  client_id uuid not null,
  organization_id uuid not null,
  code text not null,          -- token_expired | rate_limited | permission_missing | metric_unavailable | network | unknown
  message text not null,
  http_status integer,
  retryable boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (account_id, client_id, organization_id)
    references public.social_accounts (id, client_id, organization_id) on delete cascade
);
create index sync_errors_client_idx on public.sync_errors (client_id, created_at desc);

-- Respostas brutas das APIs, para auditoria e reprocessamento. Só o backend lê.
create table public.raw_payloads (
  id bigint generated always as identity primary key,
  sync_run_id uuid not null references public.sync_runs (id) on delete cascade,
  endpoint text not null,
  body jsonb not null,
  fetched_at timestamptz not null default now()
);

-- Estado temporário do fluxo OAuth (uso único, validade curta). Só o backend lê.
create table public.oauth_states (
  state text primary key,
  organization_id uuid not null,
  client_id uuid not null,
  platform public.platform_t not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  code_verifier text,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (client_id, organization_id) references public.clients (id, organization_id) on delete cascade
);

-- ---------- Auditoria -------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  organization_id uuid,
  client_id uuid,
  actor_id uuid,               -- null = sistema (service role, cron)
  action text not null,        -- INSERT | UPDATE | DELETE | ação nomeada
  entity text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_org_idx on public.audit_log (organization_id, created_at desc);

-- ---------- updated_at ------------------------------------------------
-- Funções internas ficam no schema "private", que não é exposto pela API.
create schema if not exists private;

create or replace function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger clients_touch before update on public.clients
  for each row execute function private.touch_updated_at();
create trigger social_accounts_touch before update on public.social_accounts
  for each row execute function private.touch_updated_at();
create trigger posts_touch before update on public.posts
  for each row execute function private.touch_updated_at();

-- Perfil criado junto com o usuário do Supabase Auth
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, email, full_name)
  values (new.id, new.email, nullif(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (user_id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();
