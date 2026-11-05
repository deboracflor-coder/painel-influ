import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase/client';
import { useAuth } from '../auth/AuthProvider';

/** Clientes que a pessoa pode ver. Quem filtra é a RLS no banco. */
export function useClients() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['clients', session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, organization_id, is_demo')
        .order('name');
      if (error) throw error;
      return data;
    },
  });
}

export type AccessKind = 'org_admin' | 'org_analyst' | 'client_viewer' | 'none';

export const ACCESS_LABEL: Record<AccessKind, string> = {
  org_admin: 'Agência · administração',
  org_analyst: 'Agência · análise',
  client_viewer: 'Cliente',
  none: 'Sem acesso liberado',
};

export interface Access {
  kind: AccessKind;
  /** Só para a equipe da agência. */
  organizationId: string | null;
  organizationName: string | null;
}

/** Papel da pessoa logada (para rótulos e menus; a permissão real está no banco). */
export function useAccess() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ['access', uid],
    enabled: !!uid,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Access> => {
      const [members, clientUsers] = await Promise.all([
        supabase.from('organization_members').select('role, organization_id, organizations(name)').eq('user_id', uid!),
        supabase.from('client_users').select('client_id').eq('user_id', uid!).limit(1),
      ]);
      if (members.error) throw members.error;
      if (clientUsers.error) throw clientUsers.error;
      const m = members.data[0];
      if (m) return { kind: m.role, organizationId: m.organization_id, organizationName: m.organizations?.name ?? null };
      if (clientUsers.data.length) return { kind: 'client_viewer', organizationId: null, organizationName: null };
      return { kind: 'none', organizationId: null, organizationName: null };
    },
  });
}
