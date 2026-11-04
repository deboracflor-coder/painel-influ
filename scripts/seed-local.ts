/**
 * Dados FICTÍCIOS para o ambiente local. Nunca rode contra produção:
 * o script recusa qualquer URL que não seja 127.0.0.1/localhost.
 *
 *   npx supabase status -o env   # pega API_URL e SERVICE_ROLE_KEY
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed-local.ts
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL ?? '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url)) {
  throw new Error('seed-local só roda contra o Supabase local');
}
const admin = createClient(url, key, { auth: { persistSession: false } });
const PASSWORD = 'senha-local-123';

async function user(email: string, fullName: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: fullName },
  });
  if (error) throw error;
  return data.user.id;
}
function ok<T>(r: { data: T; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data;
}

const adminId = await user('admin@agencia.exemplo', 'Admin (fictício)');
const analystId = await user('analista@agencia.exemplo', 'Analista (fictício)');
const clientUserId = await user('cliente@aurora.exemplo', 'Cliente Aurora (fictício)');

const org = ok(await admin.rpc('bootstrap_organization', { p_name: 'Agência Exemplo (fictícia)', p_admin: adminId })) as string;
ok(await admin.from('organization_members').insert({ organization_id: org, user_id: analystId, role: 'org_analyst' }));
const clients = ok(await admin.from('clients').insert([
  { organization_id: org, name: 'Aurora Cosméticos', is_demo: true },
  { organization_id: org, name: 'Trilha Esportes', is_demo: true },
]).select('id, name'))!;
const aurora = clients.find((c) => c.name.startsWith('Aurora'))!.id;
ok(await admin.from('client_assignments').insert({ client_id: aurora, organization_id: org, user_id: analystId }));
ok(await admin.from('client_users').insert({ client_id: aurora, organization_id: org, user_id: clientUserId }));
ok(await admin.from('social_accounts').insert({
  organization_id: org, client_id: aurora, platform: 'instagram',
  external_account_id: 'ficticio-aurora', handle: '@aurora.ficticio', status: 'expired',
}));

console.log(`Pronto. Senha de todos os usuários fictícios: ${PASSWORD}
  admin@agencia.exemplo     → administração da agência (vê os 2 clientes)
  analista@agencia.exemplo  → analista (só Aurora)
  cliente@aurora.exemplo    → usuário do cliente Aurora`);
