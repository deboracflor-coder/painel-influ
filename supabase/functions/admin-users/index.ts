// Convite de pessoas para a agência ou para um cliente.
// Só administradores da organização. O convite (Auth Admin API) usa a service role;
// o vínculo é gravado com o token de quem chama, então a RLS e a auditoria valem.
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import { z } from 'npm:zod@4.6.7';
import { corsHeaders, env, json } from '../_shared/http.ts';

const Body = z.object({
  organization_id: z.uuid(),
  email: z.email().max(254).transform((s) => s.trim().toLowerCase()),
  full_name: z.string().trim().max(120).optional(),
  kind: z.enum(['org_admin', 'org_analyst', 'client_viewer']),
  client_id: z.uuid().optional(),
  assign_client_ids: z.array(z.uuid()).max(500).optional(),
  redirect_to: z.url().optional(),
}).refine((b) => b.kind !== 'client_viewer' || !!b.client_id, { message: 'client_id é obrigatório para usuário de cliente' });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Método não permitido' });

  const authorization = req.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) return json(401, { error: 'Sessão ausente' });

  const url = env('SUPABASE_URL');
  const caller = createClient(url, env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: who, error: whoErr } = await caller.auth.getUser();
  if (whoErr || !who.user) return json(401, { error: 'Sessão inválida' });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json(400, { error: 'Dados inválidos', detail: parsed.error.issues.map((i) => i.message) });
  const b = parsed.data;

  // Quem chama precisa ser administrador da organização (lido com a RLS de quem chama).
  const { data: me } = await caller.from('organization_members').select('role')
    .eq('organization_id', b.organization_id).eq('user_id', who.user.id).maybeSingle();
  if (me?.role !== 'org_admin') return json(403, { error: 'Só administradores da agência convidam pessoas' });

  if (b.client_id) {
    const { data: cl } = await caller.from('clients').select('id')
      .eq('id', b.client_id).eq('organization_id', b.organization_id).maybeSingle();
    if (!cl) return json(403, { error: 'Cliente não pertence a esta agência' });
  }

  const admin = createClient(url, env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: existing } = await admin.from('profiles').select('user_id').eq('email', b.email).maybeSingle();
  let userId = existing?.user_id as string | undefined;
  let invited = false;
  if (!userId) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(b.email, {
      data: b.full_name ? { full_name: b.full_name } : undefined,
      redirectTo: b.redirect_to,
    });
    if (error || !data.user) return json(502, { error: 'Não foi possível enviar o convite', detail: error?.message });
    userId = data.user.id;
    invited = true;
  }

  const fail = (e: { code?: string; message: string }) => {
    if (e.code === '23505') return json(409, { error: 'Esta pessoa já tem esse acesso' });
    if (e.code === '23514') return json(409, { error: e.message });
    if (e.code === '42501') return json(403, { error: 'Sem permissão' });
    return json(500, { error: 'Falha ao gravar o acesso' });
  };

  if (b.kind === 'client_viewer') {
    const { error } = await caller.from('client_users').insert({ client_id: b.client_id!, organization_id: b.organization_id, user_id: userId });
    if (error) return fail(error);
  } else {
    const { error } = await caller.from('organization_members').insert({ organization_id: b.organization_id, user_id: userId, role: b.kind });
    if (error) return fail(error);
    if (b.kind === 'org_analyst' && b.assign_client_ids?.length) {
      const { error: aErr } = await caller.from('client_assignments').insert(
        b.assign_client_ids.map((client_id) => ({ client_id, organization_id: b.organization_id, user_id: userId! })),
      );
      if (aErr) return fail(aErr);
    }
  }
  return json(200, { user_id: userId, invited });
});
