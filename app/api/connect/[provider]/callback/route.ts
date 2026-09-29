import { NextResponse, type NextRequest } from 'next/server';
import { requireEditor } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { exchange, readState, PROVIDERS, type Provider } from '@/lib/oauth';

// Retorno da rede: troca o código, grava as contas e guarda o token no Vault.
export async function GET(request: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const back = (msg: string) => {
    const res = NextResponse.redirect(new URL(`/?aviso=${encodeURIComponent(msg)}#integracoes`, request.url));
    res.cookies.delete({ name: 'oauth_nonce', path: '/api/connect' });
    return res;
  };
  if (!PROVIDERS.includes(provider as Provider)) return back('Rede desconhecida.');
  const v = await requireEditor();
  if (v instanceof Response) return v;
  const sp = request.nextUrl.searchParams;
  if (sp.get('error')) return back('A conexão foi cancelada na rede social.');
  const st = readState(sp.get('state') ?? '', request.cookies.get('oauth_nonce')?.value);
  if (!st || st.uid !== v.userId || st.ws !== v.workspaceId || st.p !== provider) return back('Link de conexão expirado. Tente de novo.');

  try {
    const accounts = await exchange(provider as Provider, sp.get('code') ?? '');
    const db = supabaseAdmin();
    for (const a of accounts) {
      // Reaproveita a conta da mesma rede no workspace (ex.: criada por importação manual)
      const base = () => db.from('social_accounts').select('id').eq('workspace_id', v.workspaceId).eq('platform', a.platform);
      const existing = (await base().eq('external_account_id', a.externalId).maybeSingle()).data
        ?? (await base().eq('status', 'not_configured').limit(1).maybeSingle()).data;
      const row = { workspace_id: v.workspaceId, platform: a.platform, external_account_id: a.externalId, handle: a.handle, display_name: a.name, scopes: a.scopes, status: 'connected' };
      const { data: saved, error } = existing
        ? await db.from('social_accounts').update(row).eq('id', existing.id).select('id').single()
        : await db.from('social_accounts').insert(row).select('id').single();
      if (error || !saved) throw new Error(error?.message ?? 'não foi possível salvar a conta');
      const { error: vaultErr } = await db.rpc('store_account_token', { p_account_id: saved.id, p_token: a.token });
      if (vaultErr) throw new Error(vaultErr.message);
      await db.from('audit_log').insert({ user_id: v.userId, action: 'connect', entity: 'social_accounts', entity_id: saved.id, diff: { platform: a.platform, handle: a.handle } });
    }
    return back(`Conectado: ${accounts.map((a) => a.handle).join(', ')}. Clique em "Atualizar dados" para a primeira coleta.`);
  } catch (e) {
    return back(`A conexão falhou: ${(e as Error).message}`);
  }
}
