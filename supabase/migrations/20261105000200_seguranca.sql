-- =====================================================================
-- Segurança: privilégios do banco + Row Level Security
--
-- Princípio: nada é permitido por padrão. O Supabase concede, por padrão,
-- todos os privilégios nas tabelas de "public" aos papéis anon e
-- authenticated; a RLS sozinha não basta. Aqui revogamos tudo e concedemos
-- de volta, tabela por tabela e coluna por coluna, só o que a aplicação usa.
--
-- Papéis da aplicação:
--   org_admin     → tudo na própria organização (clientes, pessoas, conexões)
--   org_analyst   → lê e opera só os clientes atribuídos a ele
--   client_viewer → lê só os dados do próprio cliente
-- Escrita de métricas, posts e sincronizações: só a service role (Edge Functions).
-- =====================================================================

-- ---------- 1. Revogar tudo ---------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;

revoke all on schema private from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
alter default privileges in schema private revoke all on functions from public, anon, authenticated;
-- as políticas chamam funções de "private" com o papel de quem consulta
grant usage on schema private to authenticated;

-- ---------- 2. Funções de permissão (fora da API) -----------------------
create or replace function private.is_org_member(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org and m.user_id = (select auth.uid()));
$$;

create or replace function private.is_org_admin(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org and m.user_id = (select auth.uid()) and m.role = 'org_admin');
$$;

-- Equipe da agência que pode operar o cliente: admin da organização ou analista atribuído
create or replace function private.can_operate_client(p_client uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.clients c
    join public.organization_members m
      on m.organization_id = c.organization_id and m.user_id = (select auth.uid())
    where c.id = p_client
      and (m.role = 'org_admin'
           or exists (select 1 from public.client_assignments a
                      where a.client_id = c.id and a.user_id = m.user_id)));
$$;

-- Quem pode ler os dados do cliente: a equipe acima + as pessoas do próprio cliente
create or replace function private.can_read_client(p_client uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_operate_client(p_client)
      or exists (select 1 from public.client_users u
                 where u.client_id = p_client and u.user_id = (select auth.uid()));
$$;

-- Usuário de algum cliente desta organização (para ver o nome da agência)
create or replace function private.is_client_user_in_org(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.client_users u
                 where u.organization_id = p_org and u.user_id = (select auth.uid()));
$$;

-- Perfis visíveis: o próprio; para a equipe, as pessoas da mesma organização
create or replace function private.can_see_profile(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user = (select auth.uid())
      or exists (
        select 1 from public.organization_members me
        where me.user_id = (select auth.uid())
          and (exists (select 1 from public.organization_members o
                       where o.organization_id = me.organization_id and o.user_id = p_user)
               or exists (select 1 from public.client_users u
                          where u.organization_id = me.organization_id and u.user_id = p_user)));
$$;


-- ---------- 3. RLS ligada em todas as tabelas ---------------------------
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.clients enable row level security;
alter table public.client_assignments enable row level security;
alter table public.client_users enable row level security;
alter table public.social_accounts enable row level security;
alter table public.account_daily_metrics enable row level security;
alter table public.posts enable row level security;
alter table public.post_metric_snapshots enable row level security;
alter table public.metric_catalog enable row level security;
alter table public.sync_runs enable row level security;
alter table public.sync_errors enable row level security;
alter table public.raw_payloads enable row level security;
alter table public.oauth_states enable row level security;
alter table public.audit_log enable row level security;

-- ---------- 4. Privilégios concedidos + políticas -----------------------
-- organizations: leitura por quem participa; admin renomeia
grant select, update (name) on public.organizations to authenticated;
create policy organizations_select on public.organizations for select to authenticated
  using (private.is_org_member(id) or private.is_client_user_in_org(id));
create policy organizations_update on public.organizations for update to authenticated
  using (private.is_org_admin(id)) with check (private.is_org_admin(id));

-- profiles
grant select, update (full_name) on public.profiles to authenticated;
create policy profiles_select on public.profiles for select to authenticated
  using (private.can_see_profile(user_id));
create policy profiles_update_own on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- organization_members: equipe vê a equipe; só admin altera
grant select, insert (organization_id, user_id, role), update (role), delete
  on public.organization_members to authenticated;
create policy org_members_select on public.organization_members for select to authenticated
  using (user_id = (select auth.uid()) or private.is_org_member(organization_id));
create policy org_members_insert on public.organization_members for insert to authenticated
  with check (private.is_org_admin(organization_id));
create policy org_members_update on public.organization_members for update to authenticated
  using (private.is_org_admin(organization_id)) with check (private.is_org_admin(organization_id));
create policy org_members_delete on public.organization_members for delete to authenticated
  using (private.is_org_admin(organization_id));

-- clients
grant select, insert (organization_id, name, notes), update (name, notes), delete
  on public.clients to authenticated;
create policy clients_select on public.clients for select to authenticated
  using (private.can_read_client(id));
create policy clients_insert on public.clients for insert to authenticated
  with check (private.is_org_admin(organization_id));
create policy clients_update on public.clients for update to authenticated
  using (private.is_org_admin(organization_id)) with check (private.is_org_admin(organization_id));
create policy clients_delete on public.clients for delete to authenticated
  using (private.is_org_admin(organization_id));

-- client_assignments
grant select, insert (client_id, organization_id, user_id), delete
  on public.client_assignments to authenticated;
create policy assignments_select on public.client_assignments for select to authenticated
  using (user_id = (select auth.uid()) or private.is_org_admin(organization_id));
create policy assignments_insert on public.client_assignments for insert to authenticated
  with check (private.is_org_admin(organization_id));
create policy assignments_delete on public.client_assignments for delete to authenticated
  using (private.is_org_admin(organization_id));

-- client_users
grant select, insert (client_id, organization_id, user_id, role), delete
  on public.client_users to authenticated;
create policy client_users_select on public.client_users for select to authenticated
  using (user_id = (select auth.uid()) or private.can_operate_client(client_id));
create policy client_users_insert on public.client_users for insert to authenticated
  with check (private.is_org_admin(organization_id));
create policy client_users_delete on public.client_users for delete to authenticated
  using (private.is_org_admin(organization_id));

-- social_accounts: token_secret_id fica fora da lista de colunas legíveis.
-- Conexão nova só pelo backend (OAuth). Equipe ajusta frequência e liga/desliga a coleta.
grant select (id, organization_id, client_id, platform, external_account_id, handle, display_name,
              status, token_expires_at, scopes, sync_enabled, sync_frequency_minutes, next_sync_at,
              last_synced_at, last_error, connected_by, revoked_at, created_at, updated_at),
      update (sync_enabled, sync_frequency_minutes)
  on public.social_accounts to authenticated;
create policy social_accounts_select on public.social_accounts for select to authenticated
  using (private.can_read_client(client_id));
create policy social_accounts_update on public.social_accounts for update to authenticated
  using (private.can_operate_client(client_id)) with check (private.can_operate_client(client_id));

-- Dados coletados: só leitura, recortada por cliente
grant select on public.account_daily_metrics, public.posts, public.post_metric_snapshots to authenticated;
create policy daily_select on public.account_daily_metrics for select to authenticated
  using (private.can_read_client(client_id));
create policy posts_select on public.posts for select to authenticated
  using (private.can_read_client(client_id));
create policy snapshots_select on public.post_metric_snapshots for select to authenticated
  using (private.can_read_client(client_id));

-- Catálogo de métricas: referência pública para quem está logado
grant select on public.metric_catalog to authenticated;
create policy metric_catalog_select on public.metric_catalog for select to authenticated using (true);

-- Histórico de sincronização e erros: só a equipe da agência
grant select on public.sync_runs, public.sync_errors to authenticated;
create policy sync_runs_select on public.sync_runs for select to authenticated
  using (private.can_operate_client(client_id));
create policy sync_errors_select on public.sync_errors for select to authenticated
  using (private.can_operate_client(client_id));

-- Auditoria: só administradores da organização
grant select on public.audit_log to authenticated;
create policy audit_select on public.audit_log for select to authenticated
  using (organization_id is not null and private.is_org_admin(organization_id));

-- raw_payloads e oauth_states: nenhum privilégio e nenhuma política → só service role.

-- ---------- 5. Regras que a RLS não expressa ----------------------------
-- a) Pessoa do cliente não pode estar na equipe da agência (e vice-versa)
create or replace function private.check_member_separation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'organization_members' then
    if exists (select 1 from public.client_users u where u.user_id = new.user_id) then
      raise exception 'Usuário de cliente não pode fazer parte da equipe da agência' using errcode = '23514';
    end if;
  else
    if exists (select 1 from public.organization_members m where m.user_id = new.user_id) then
      raise exception 'Integrante da agência não pode ser cadastrado como usuário de cliente' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger org_members_separation before insert or update on public.organization_members
  for each row execute function private.check_member_separation();
create trigger client_users_separation before insert or update on public.client_users
  for each row execute function private.check_member_separation();

-- b) A organização nunca fica sem administrador
create or replace function private.keep_one_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'org_admin'
     and (tg_op = 'DELETE' or new.role <> 'org_admin')
     and not exists (select 1 from public.organization_members m
                     where m.organization_id = old.organization_id and m.role = 'org_admin'
                       and m.user_id <> old.user_id)
     and exists (select 1 from public.organizations o where o.id = old.organization_id) then
    raise exception 'A organização precisa de pelo menos um administrador' using errcode = '23514';
  end if;
  return coalesce(new, old);
end $$;
create trigger org_members_keep_admin before update or delete on public.organization_members
  for each row execute function private.keep_one_admin();

-- c) Atribuição de cliente só para analistas (admin já vê tudo)
create or replace function private.check_assignment_role() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.organization_members m
                 where m.organization_id = new.organization_id and m.user_id = new.user_id
                   and m.role = 'org_analyst') then
    raise exception 'Só analistas da organização recebem clientes atribuídos' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger client_assignments_role before insert or update on public.client_assignments
  for each row execute function private.check_assignment_role();

-- ---------- 6. Funções chamáveis -----------------------------------------
-- Criação da organização e do primeiro administrador: só service role (script de implantação)
create or replace function public.bootstrap_organization(p_name text, p_admin uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  insert into public.organizations (name) values (p_name) returning id into v_org;
  insert into public.organization_members (organization_id, user_id, role) values (v_org, p_admin, 'org_admin');
  return v_org;
end $$;
revoke all on function public.bootstrap_organization(text, uuid) from public, anon, authenticated;
grant execute on function public.bootstrap_organization(text, uuid) to service_role;

-- Tokens OAuth no Supabase Vault: gravar e ler só pela service role (Edge Functions)
create or replace function public.store_account_token(p_account_id uuid, p_token jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_secret uuid; v_existing uuid;
begin
  select token_secret_id into v_existing from public.social_accounts where id = p_account_id for update;
  if not found then raise exception 'Conta social inexistente' using errcode = 'P0002'; end if;
  if v_existing is not null then
    perform vault.update_secret(v_existing, p_token::text);
    v_secret := v_existing;
  else
    v_secret := vault.create_secret(p_token::text, 'social_account:' || p_account_id::text, 'Token OAuth de conta social');
    update public.social_accounts set token_secret_id = v_secret where id = p_account_id;
  end if;
  return v_secret;
end $$;

create or replace function public.read_account_token(p_account_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select s.decrypted_secret::jsonb
  from public.social_accounts a
  join vault.decrypted_secrets s on s.id = a.token_secret_id
  where a.id = p_account_id and a.status <> 'revoked';
$$;
revoke all on function public.store_account_token(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.read_account_token(uuid) from public, anon, authenticated;
grant execute on function public.store_account_token(uuid, jsonb) to service_role;
grant execute on function public.read_account_token(uuid) to service_role;

-- Desconectar: apaga o token do Vault, marca como revogada e para a coleta.
-- Chamável pela equipe que opera o cliente. (A revogação na plataforma de origem
-- é feita pela Edge Function na Fase 4, quando a rede oferece esse endpoint.)
create or replace function public.revoke_account_connection(p_account_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_client uuid; v_secret uuid;
begin
  select client_id, token_secret_id into v_client, v_secret
  from public.social_accounts where id = p_account_id for update;
  if v_client is null or not (auth.role() = 'service_role' or private.can_operate_client(v_client)) then
    raise exception 'Sem permissão para desconectar esta conta' using errcode = '42501';
  end if;
  if v_secret is not null then
    delete from vault.secrets where id = v_secret;
  end if;
  update public.social_accounts
     set status = 'revoked', token_secret_id = null, token_expires_at = null,
         sync_enabled = false, next_sync_at = null, revoked_at = now()
   where id = p_account_id;
end $$;
revoke all on function public.revoke_account_connection(uuid) from public, anon;
grant execute on function public.revoke_account_connection(uuid) to authenticated, service_role;

-- ---------- 7. Fechamento ---------------------------------------------------
-- O Supabase concede EXECUTE em funções novas a anon/authenticated por um
-- default global, que não é removido pelo revoke por schema. Por isso o
-- revoke explícito depois de criar tudo, e o grant só do necessário.
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function
  private.is_org_member(uuid), private.is_org_admin(uuid), private.can_operate_client(uuid),
  private.can_read_client(uuid), private.is_client_user_in_org(uuid), private.can_see_profile(uuid)
to authenticated;
