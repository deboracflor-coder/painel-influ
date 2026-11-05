-- Fase 3 — Gestão de equipe pela tela "Pessoas".
-- Impede que a agência fique sem nenhum administrador: o próprio admin não
-- pode se rebaixar nem se remover se for o último. Operações de sistema
-- (service role, exclusão da organização em cascata) não passam por aqui.

create or replace function private.keep_one_org_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    return coalesce(new, old);
  end if;
  if old.role = 'org_admin'
     and (tg_op = 'DELETE' or new.role <> 'org_admin')
     and not exists (
       select 1 from public.organization_members o
       where o.organization_id = old.organization_id
         and o.role = 'org_admin'
         and o.user_id <> old.user_id)
  then
    raise exception 'A agência precisa de pelo menos um administrador'
      using errcode = '23514';
  end if;
  return coalesce(new, old);
end $$;

create trigger organization_members_keep_admin
  before update of role or delete on public.organization_members
  for each row execute function private.keep_one_org_admin();

revoke all on function private.keep_one_org_admin() from public, anon, authenticated;
