-- =====================================================================
-- Auditoria: quem criou, alterou ou removeu cadastros, acessos e conexões.
-- Gravada por gatilho (o navegador não escreve em audit_log).
-- =====================================================================
create or replace function private.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_org uuid;
begin
  -- nunca copiar referência de segredo para a auditoria
  v_old := v_old - 'token_secret_id';
  v_new := v_new - 'token_secret_id';
  if tg_op = 'UPDATE' and v_old = v_new then
    return new;
  end if;
  v_org := case when tg_table_name = 'organizations' then (v_row ->> 'id')::uuid
                else (v_row ->> 'organization_id')::uuid end;
  insert into public.audit_log (organization_id, client_id, actor_id, action, entity, entity_id, before, after)
  values (
    v_org,
    case when tg_table_name = 'clients' then (v_row ->> 'id')::uuid else (v_row ->> 'client_id')::uuid end,
    auth.uid(),
    tg_op,
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'user_id'),
    v_old,
    v_new);
  return coalesce(new, old);
end $$;

create trigger audit_organizations after insert or update or delete on public.organizations
  for each row execute function private.audit_row();
create trigger audit_organization_members after insert or update or delete on public.organization_members
  for each row execute function private.audit_row();
create trigger audit_clients after insert or update or delete on public.clients
  for each row execute function private.audit_row();
create trigger audit_client_assignments after insert or update or delete on public.client_assignments
  for each row execute function private.audit_row();
create trigger audit_client_users after insert or update or delete on public.client_users
  for each row execute function private.audit_row();
-- Contas sociais: só mudanças de conexão e configuração (não cada coleta)
create trigger audit_social_accounts after insert or delete
  or update of status, sync_enabled, sync_frequency_minutes, revoked_at, client_id
  on public.social_accounts
  for each row execute function private.audit_row();

revoke all on function private.audit_row() from public, anon, authenticated;
