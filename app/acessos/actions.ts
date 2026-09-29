'use server';
import { revalidatePath } from 'next/cache';
import { currentViewer } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { ROLES, isOneOf, isUuid } from '@/lib/enums';

type Result = { ok: boolean; msg: string };

async function owner() {
  const v = await currentViewer();
  if (!v || v === 'no_access' || v.role !== 'owner') throw new Error('Só a administração gerencia acessos.');
  return v;
}

export async function addMember(_: Result | null, f: FormData): Promise<Result> {
  const v = await owner();
  const email = String(f.get('email') ?? '').trim().toLowerCase();
  const role = String(f.get('role') ?? '');
  const brandId = String(f.get('brand_id') ?? '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, msg: 'E-mail inválido.' };
  if (!isOneOf(ROLES, role) || role === 'owner') return { ok: false, msg: 'Perfil inválido.' };
  if (role === 'brand_viewer' && !isUuid(brandId)) return { ok: false, msg: 'Escolha a marca que essa pessoa vai ver.' };
  const db = supabaseAdmin();
  if (role === 'brand_viewer') {
    const { data } = await db.from('brands').select('id').eq('id', brandId).eq('workspace_id', v.workspaceId).maybeSingle();
    if (!data) return { ok: false, msg: 'Marca não encontrada.' };
  }
  // Cria o usuário sem mandar e-mail; a pessoa entra pelo link de acesso da tela de login
  let { data: uid } = await db.rpc('user_id_by_email', { p_email: email });
  if (!uid) {
    const { data: created, error } = await db.auth.admin.createUser({ email, email_confirm: true });
    if (error || !created.user) return { ok: false, msg: error?.message ?? 'não foi possível criar o usuário' };
    uid = created.user.id;
  }
  const { error } = await db.from('memberships').insert({ user_id: uid, workspace_id: v.workspaceId, role, brand_id: role === 'brand_viewer' ? brandId : null });
  if (error) return { ok: false, msg: error.code === '23505' ? 'Essa pessoa já tem esse acesso.' : error.message };
  await db.from('audit_log').insert({ user_id: v.userId, action: 'grant', entity: 'memberships', entity_id: String(uid), diff: { email, role, brandId: brandId || null } });
  revalidatePath('/acessos');
  return { ok: true, msg: `Acesso liberado. Avise ${email} para entrar pela tela de login com esse e-mail.` };
}

export async function removeMember(f: FormData) {
  const v = await owner();
  const id = String(f.get('id') ?? '');
  if (!isUuid(id)) return;
  const db = supabaseAdmin();
  const { data: m } = await db.from('memberships').select('id, user_id, role').eq('id', id).eq('workspace_id', v.workspaceId).maybeSingle();
  if (!m || m.user_id === v.userId) return; // não remove o próprio acesso
  await db.from('memberships').delete().eq('id', id);
  await db.from('audit_log').insert({ user_id: v.userId, action: 'revoke', entity: 'memberships', entity_id: m.user_id, diff: { role: m.role } });
  revalidatePath('/acessos');
}
