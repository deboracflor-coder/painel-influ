// Ações da equipe sobre uma conta conectada: coletar agora ou desconectar.
// Permissão conferida com o token de quem chama (can_operate); a execução usa a service role.
import { z } from 'npm:zod@4.6.7';
import { requireUser, serviceClient } from '../_shared/clients.ts';
import { corsHeaders, json } from '../_shared/http.ts';
import { revokeGoogle } from '../_shared/providers.ts';
import { ACCOUNT_COLUMNS, type AccountRow, syncAccount } from '../_shared/sync.ts';

const Body = z.object({ account_id: z.uuid(), action: z.enum(['sync', 'disconnect']) });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Método não permitido' });
  const who = await requireUser(req);
  if (!who) return json(401, { error: 'Sessão inválida' });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json(400, { error: 'Dados inválidos' });
  const { account_id, action } = parsed.data;

  const admin = serviceClient();
  const { data: acc } = await admin.from('social_accounts').select(ACCOUNT_COLUMNS).eq('id', account_id).maybeSingle();
  if (!acc) return json(404, { error: 'Conta não encontrada' });
  const { data: canOperate } = await who.caller.rpc('can_operate', { p_client: acc.client_id });
  if (!canOperate) return json(403, { error: 'Só a equipe responsável pelo cliente opera esta conta' });

  if (action === 'disconnect') {
    // Revoga no Google (o Meta não oferece revogação com token de página) e apaga o token do Vault.
    if (acc.platform === 'youtube') {
      const { data: token } = await admin.rpc('read_account_token', { p_account_id: account_id });
      if (token) await revokeGoogle(token as Record<string, unknown>);
    }
    const { error } = await who.caller.rpc('revoke_account_connection', { p_account_id: account_id });
    if (error) return json(403, { error: 'Sem permissão para desconectar esta conta' });
    return json(200, { status: 'revoked' });
  }

  if (acc.status !== 'connected') return json(409, { error: 'A conta precisa ser conectada de novo antes de coletar' });
  const out = await syncAccount(admin, acc as AccountRow, 'manual', who.userId);
  if (out.status === 'busy') return json(409, { error: 'Já existe uma coleta em andamento para esta conta' });
  return json(200, out);
});
