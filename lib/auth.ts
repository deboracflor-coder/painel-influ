import 'server-only';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { secrets } from '@/lib/secrets';

export type Role = 'owner' | 'analyst' | 'viewer' | 'brand_viewer';
export type Viewer = {
  userId: string;
  email: string;
  workspaceId: string;
  role: Role;
  brandId: string | null;
};

const RANK: Record<Role, number> = { owner: 1, analyst: 2, viewer: 3, brand_viewer: 4 };

/** Usuário logado + papel. `null` = não logado; `'no_access'` = logado sem convite. */
export async function currentViewer(): Promise<Viewer | null | 'no_access'> {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  let { data: rows } = await sb.from('memberships').select('workspace_id, role, brand_id').eq('user_id', user.id);
  if (!rows?.length && user.email && user.email.toLowerCase() === secrets.ownerEmail()) {
    // Primeiro acesso da dona do painel: cria o workspace
    await supabaseAdmin().rpc('claim_workspace', { p_user: user.id, ws_name: 'Meu painel' });
    ({ data: rows } = await sb.from('memberships').select('workspace_id, role, brand_id').eq('user_id', user.id));
  }
  if (!rows?.length) return 'no_access';
  const m = [...rows].sort((a, b) => RANK[a.role as Role] - RANK[b.role as Role])[0];
  return { userId: user.id, email: user.email ?? '', workspaceId: m.workspace_id, role: m.role as Role, brandId: m.brand_id };
}

export const canEdit = (v: Viewer) => v.role === 'owner' || v.role === 'analyst';

/** Para rotas de API: devolve o viewer ou uma Response de erro. */
export async function requireEditor(): Promise<Viewer | Response> {
  const v = await currentViewer();
  if (!v) return Response.json({ error: 'Faça login novamente.' }, { status: 401 });
  if (v === 'no_access' || !canEdit(v)) return Response.json({ error: 'Seu perfil não tem permissão para esta ação.' }, { status: 403 });
  return v;
}
