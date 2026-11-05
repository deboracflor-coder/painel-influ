import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase/client';

/** Mensagem legível para erros do banco ou da função de convite. */
export async function errorMessage(err: unknown): Promise<string> {
  if (err instanceof FunctionsHttpError) {
    const body = await err.context.json().catch(() => null) as { error?: string } | null;
    return body?.error ?? 'Não foi possível concluir a operação';
  }
  const e = err as { code?: string; message?: string } | null;
  if (e?.code === '23505') return 'Já existe um registro com esse nome ou esse acesso';
  if (e?.code === '23514') return e.message ?? 'Operação não permitida';
  if (e?.code === '42501') return 'Sem permissão para esta operação';
  return 'Não foi possível concluir a operação. Tente de novo.';
}

export interface ClientRow { id: string; name: string; notes: string | null; is_demo: boolean; created_at: string }

export function useAdminClients(orgId: string | null) {
  return useQuery({
    queryKey: ['admin-clients', orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<ClientRow[]> => {
      const { data, error } = await supabase.from('clients')
        .select('id, name, notes, is_demo, created_at').eq('organization_id', orgId!).order('name');
      if (error) throw error;
      return data;
    },
  });
}

/** Invalida tudo que depende da lista de clientes ou da equipe. */
function useInvalidate() {
  const qc = useQueryClient();
  return () => Promise.all(['admin-clients', 'clients', 'team'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
}

export function useClientMutations(orgId: string | null) {
  const invalidate = useInvalidate();
  const create = useMutation({
    mutationFn: async (v: { name: string; notes: string }) => {
      const { error } = await supabase.from('clients')
        .insert({ organization_id: orgId!, name: v.name.trim(), notes: v.notes.trim() || null });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: async (v: { id: string; name: string; notes: string }) => {
      const { error } = await supabase.from('clients')
        .update({ name: v.name.trim(), notes: v.notes.trim() || null }).eq('id', v.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('clients').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  return { create, update, remove };
}

export interface Person { user_id: string; email: string | null; full_name: string | null }
export interface Member extends Person { role: 'org_admin' | 'org_analyst'; clientIds: string[] }
export interface ClientUser extends Person { client_id: string }

export function useTeam(orgId: string | null) {
  return useQuery({
    queryKey: ['team', orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<{ members: Member[]; clientUsers: ClientUser[] }> => {
      const [m, a, cu] = await Promise.all([
        supabase.from('organization_members').select('user_id, role').eq('organization_id', orgId!),
        supabase.from('client_assignments').select('user_id, client_id').eq('organization_id', orgId!),
        supabase.from('client_users').select('user_id, client_id').eq('organization_id', orgId!),
      ]);
      for (const r of [m, a, cu]) if (r.error) throw r.error;
      const ids = [...new Set([...m.data!, ...cu.data!].map((r) => r.user_id))];
      const p = ids.length
        ? await supabase.from('profiles').select('user_id, email, full_name').in('user_id', ids)
        : { data: [], error: null };
      if (p.error) throw p.error;
      const prof = new Map(p.data.map((x) => [x.user_id, x]));
      const person = (id: string): Person => ({ user_id: id, email: prof.get(id)?.email ?? null, full_name: prof.get(id)?.full_name ?? null });
      const byName = (x: Person, y: Person) => (x.full_name ?? x.email ?? '').localeCompare(y.full_name ?? y.email ?? '', 'pt-BR');
      return {
        members: m.data!.map((r) => ({ ...person(r.user_id), role: r.role, clientIds: a.data!.filter((x) => x.user_id === r.user_id).map((x) => x.client_id) })).sort(byName),
        clientUsers: cu.data!.map((r) => ({ ...person(r.user_id), client_id: r.client_id })).sort(byName),
      };
    },
  });
}

export type InviteKind = 'org_admin' | 'org_analyst' | 'client_viewer';

export function useTeamMutations(orgId: string | null) {
  const invalidate = useInvalidate();
  const invite = useMutation({
    mutationFn: async (v: { email: string; full_name: string; kind: InviteKind; client_id?: string; assign_client_ids?: string[] }) => {
      const { data, error } = await supabase.functions.invoke<{ invited: boolean }>('admin-users', {
        body: {
          organization_id: orgId, email: v.email.trim().toLowerCase(), full_name: v.full_name.trim() || undefined,
          kind: v.kind, client_id: v.client_id, assign_client_ids: v.assign_client_ids,
          redirect_to: `${window.location.origin}/redefinir-senha`,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
  const setRole = useMutation({
    mutationFn: async (v: { user_id: string; role: 'org_admin' | 'org_analyst' }) => {
      const { error } = await supabase.from('organization_members').update({ role: v.role })
        .eq('organization_id', orgId!).eq('user_id', v.user_id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const removeMember = useMutation({
    mutationFn: async (user_id: string) => {
      const { error } = await supabase.from('organization_members').delete()
        .eq('organization_id', orgId!).eq('user_id', user_id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const assign = useMutation({
    mutationFn: async (v: { user_id: string; client_id: string; on: boolean }) => {
      const q = v.on
        ? supabase.from('client_assignments').insert({ organization_id: orgId!, user_id: v.user_id, client_id: v.client_id })
        : supabase.from('client_assignments').delete().eq('user_id', v.user_id).eq('client_id', v.client_id);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const removeClientUser = useMutation({
    mutationFn: async (v: { user_id: string; client_id: string }) => {
      const { error } = await supabase.from('client_users').delete().eq('user_id', v.user_id).eq('client_id', v.client_id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  return { invite, setRole, removeMember, assign, removeClientUser };
}
