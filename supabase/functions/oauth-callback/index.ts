// Retorno do OAuth (chamado pelo navegador da pessoa, vindo da Meta ou do Google).
// Valida o estado, troca o código pelo token, grava as contas e o token no Vault e
// devolve a pessoa para a tela de contas. Nenhum token aparece na URL de retorno.
import { serviceClient, redirectUri } from '../_shared/clients.ts';
import { type Discovered, discoverGoogle, discoverMeta } from '../_shared/providers.ts';

const back = (origin: string, client: string, params: Record<string, string>) =>
  Response.redirect(`${origin}/contas?${new URLSearchParams({ cliente: client, ...params })}`, 303);

Deno.serve(async (req) => {
  const u = new URL(req.url);
  const state = u.searchParams.get('state') ?? '';
  const code = u.searchParams.get('code');
  const denied = u.searchParams.get('error');
  const admin = serviceClient();

  // Uso único: marca como usado no mesmo comando que lê
  const { data: st } = await admin.from('oauth_states').update({ used_at: new Date().toISOString() })
    .eq('state', state).is('used_at', null).gt('expires_at', new Date().toISOString())
    .select('organization_id, client_id, provider, user_id, code_verifier, return_to').maybeSingle();
  if (!st || !st.return_to) return new Response('Link de conexão inválido ou vencido. Volte ao painel e tente de novo.', { status: 400 });
  if (denied || !code) return back(st.return_to, st.client_id, { conexao: 'cancelada' });

  let found: Discovered[];
  try {
    found = st.provider === 'meta' ? await discoverMeta(code, redirectUri()) : await discoverGoogle(code, redirectUri(), st.code_verifier ?? '');
  } catch (e) {
    console.error('oauth-callback', st.provider, (e as Error).message);
    return back(st.return_to, st.client_id, { conexao: 'erro' });
  }
  if (!found.length) return back(st.return_to, st.client_id, { conexao: 'nenhuma' });

  let ok = 0, conflict = 0;
  for (const d of found) {
    const { data: existing } = await admin.from('social_accounts').select('id, client_id')
      .eq('organization_id', st.organization_id).eq('platform', d.platform).eq('external_account_id', d.external_account_id).maybeSingle();
    if (existing && existing.client_id !== st.client_id) { conflict++; continue; } // já pertence a outro cliente
    const fields = {
      handle: d.handle, display_name: d.display_name, status: 'connected', token_expires_at: d.token_expires_at, scopes: d.scopes,
      sync_enabled: true, next_sync_at: new Date().toISOString(), last_error: null, revoked_at: null, connected_by: st.user_id,
    };
    const { data: acc, error } = existing
      ? await admin.from('social_accounts').update(fields).eq('id', existing.id).select('id').single()
      : await admin.from('social_accounts').insert({ ...fields, organization_id: st.organization_id, client_id: st.client_id, platform: d.platform, external_account_id: d.external_account_id }).select('id').single();
    if (error || !acc) { console.error('oauth-callback grava conta', error?.message); continue; }
    const { error: tErr } = await admin.rpc('store_account_token', { p_account_id: acc.id, p_token: d.token });
    if (tErr) { console.error('oauth-callback grava token', tErr.message); continue; }
    ok++;
  }
  return back(st.return_to, st.client_id, { conexao: ok ? 'ok' : 'erro', contas: String(ok), ...(conflict ? { outras: String(conflict) } : {}) });
});
