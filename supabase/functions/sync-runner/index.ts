// Supabase Edge Function: sync-runner. Ainda não executada contra as APIs reais (exige apps aprovados e tokens).
// Chamada pelo pg_cron (scope: recent | stories | account_daily | refresh_tokens) e pelo botão "Atualizar dados" (trigger: manual).
// Cada conta sincroniza isolada: falha em uma rede não interrompe as outras.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { CONNECTORS, ApiError, type NormalizedPost } from './connectors.ts';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!); // chave só no servidor

const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  // Só o agendamento (pg_cron) e o servidor do site chamam esta função, sempre com a service role
  if (req.headers.get('Authorization') !== `Bearer ${SERVICE_KEY}`) return new Response('forbidden', { status: 403 });
  const { scope = 'recent', accountId, workspaceId, trigger = 'cron' } = await req.json().catch(() => ({}));
  let q = supabase.from('social_accounts').select('*').in('status', ['connected', 'error']).not('token_secret_id', 'is', null);
  if (accountId) q = q.eq('id', accountId);
  if (workspaceId) q = q.eq('workspace_id', workspaceId);
  if (scope === 'stories') q = q.eq('platform', 'instagram'); // stories só existem no Instagram
  const { data: accounts } = await q;
  const summary = [];
  for (const acc of accounts ?? []) {
    summary.push(scope === 'refresh_tokens' ? await refreshOnly(acc) : await syncAccount(acc, scope, trigger === 'manual' ? 'manual' : 'cron'));
  }
  return Response.json(summary);
});

async function syncAccount(acc: any, scope: string, trigger: string) {
  const connector = CONNECTORS[acc.platform as keyof typeof CONNECTORS];
  const { data: run } = await supabase.from('sync_runs').insert({ account_id: acc.id, trigger, status: 'running' }).select().single();
  let posts = 0, snaps = 0;
  try {
    if (!connector) throw new ApiError('unknown', `Sem conector para ${acc.platform}`);
    const token = await readToken(acc);
    if (scope === 'account_daily' || scope === 'recent') {
      const a = await connector.fetchAccount(token, acc.external_account_id);
      await supabase.from('account_daily').upsert({ account_id: acc.id, day: a.day, followers: a.followers, reach: a.reach ?? null, views: a.views ?? null, source: 'api' });
    }
    if (scope !== 'account_daily') {
      const days = scope === 'stories' ? 1 : 30;
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const list = await connector.listRecentPosts(token, acc.external_account_id, since);
      for (const p of list) { await savePost(acc, p, run.id); posts++; snaps++; }
    }
    await supabase.from('sync_runs').update({ status: 'success', finished_at: new Date().toISOString(), posts_upserted: posts, snapshots_written: snaps }).eq('id', run.id);
    await supabase.from('social_accounts').update({ last_synced_at: new Date().toISOString(), status: 'connected' }).eq('id', acc.id);
    return { account: acc.handle, ok: true, posts };
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError('network', String(e));
    await supabase.from('sync_errors').insert({ sync_run_id: run.id, code: err.code, message: err.message });
    await supabase.from('sync_runs').update({ status: posts ? 'partial' : 'error', finished_at: new Date().toISOString(), posts_upserted: posts }).eq('id', run.id);
    if (err.code === 'token_expired') await supabase.from('social_accounts').update({ status: 'expired' }).eq('id', acc.id);
    await supabase.from('alerts').insert({ workspace_id: acc.workspace_id, severity: 'critical', message: `${acc.platform}: ${err.code} · ${err.message}` });
    return { account: acc.handle, ok: false, code: err.code };
  }
}

async function savePost(acc: any, p: NormalizedPost, runId: string) {
  await supabase.from('raw_payloads').insert({ sync_run_id: runId, endpoint: `${acc.platform}:post`, body: p.raw });
  const { data: row } = await supabase.from('posts').upsert({
    account_id: acc.id, platform: acc.platform, external_post_id: p.externalId, published_at: p.publishedAt, format: p.format,
    title: p.title, url: p.url, thumbnail_url: p.thumbnailUrl, source: 'api',
    expires_at: p.format === 'story' ? new Date(Date.parse(p.publishedAt) + 86400000).toISOString() : null,
  }, { onConflict: 'platform,external_post_id', ignoreDuplicates: false }).select('id, campaign_id').single();
  await supabase.from('metric_snapshots').insert({ post_id: row!.id, captured_at: new Date().toISOString(), ...p.metrics, source: 'api' });
  // Vínculo automático com campanha: sugere por hashtag/@menção cadastradas; confirmação é manual (link_confirmed)
  if (!row!.campaign_id && p.title) {
    const { data: camps } = await supabase.from('campaigns').select('id, brand_id, tracking_hashtags, tracking_mentions, start_date, end_date').eq('workspace_id', acc.workspace_id)
      .lte('start_date', p.publishedAt.slice(0, 10)).gte('end_date', p.publishedAt.slice(0, 10));
    const hit = (camps ?? []).find((c: any) => [...(c.tracking_hashtags ?? []), ...(c.tracking_mentions ?? [])].some((t: string) => p.title!.toLowerCase().includes(t.toLowerCase())));
    if (hit) await supabase.from('posts').update({ campaign_id: hit.id, brand_id: hit.brand_id, is_sponsored: true, link_confirmed: false }).eq('id', row!.id);
  }
}

type TokenJSON = { provider: 'meta' | 'tiktok' | 'google'; access_token: string; refresh_token?: string; expires_at?: string | null };

// Supabase Vault: o token nunca sai do servidor. Renova sozinho quando está perto de expirar.
async function readToken(acc: any): Promise<string> {
  const { data, error } = await supabase.rpc('read_account_token', { secret_id: acc.token_secret_id });
  if (error || !data) throw new ApiError('token_expired', 'Token não encontrado no Vault. Reconecte a conta.');
  let tok: TokenJSON;
  try { tok = JSON.parse(data as string); } catch { return data as string; } // formato antigo: token puro
  const soon = tok.expires_at && Date.parse(tok.expires_at) - Date.now() < 10 * 60 * 1000;
  if (soon) tok = await refresh(acc, tok);
  return tok.access_token;
}

async function refresh(acc: any, tok: TokenJSON): Promise<TokenJSON> {
  if (!tok.refresh_token) throw new ApiError('token_expired', 'O acesso expirou e não há como renovar sozinho. Reconecte a conta.');
  let res: Response;
  if (tok.provider === 'tiktok') {
    res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_key: Deno.env.get('TIKTOK_CLIENT_KEY')!, client_secret: Deno.env.get('TIKTOK_CLIENT_SECRET')!, grant_type: 'refresh_token', refresh_token: tok.refresh_token }) });
  } else if (tok.provider === 'google') {
    res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: Deno.env.get('GOOGLE_CLIENT_ID')!, client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!, grant_type: 'refresh_token', refresh_token: tok.refresh_token }) });
  } else {
    throw new ApiError('token_expired', 'Token da Meta expirado. Reconecte a conta.');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) throw new ApiError('token_expired', `Renovação recusada: ${body.error_description || body.error || res.status}. Reconecte a conta.`);
  const next: TokenJSON = { ...tok, access_token: body.access_token, refresh_token: body.refresh_token ?? tok.refresh_token, expires_at: body.expires_in ? new Date(Date.now() + body.expires_in * 1000).toISOString() : null };
  const { error } = await supabase.rpc('store_account_token', { p_account_id: acc.id, p_token: next });
  if (error) throw new ApiError('unknown', `Não foi possível guardar o token renovado: ${error.message}`);
  return next;
}

async function refreshOnly(acc: any) {
  try { await readToken(acc); return { account: acc.handle, ok: true }; }
  catch (e) {
    const err = e instanceof ApiError ? e : new ApiError('network', String(e));
    if (err.code === 'token_expired') {
      await supabase.from('social_accounts').update({ status: 'expired' }).eq('id', acc.id);
      await supabase.from('alerts').insert({ workspace_id: acc.workspace_id, severity: 'critical', message: `${acc.platform}: ${err.message}` });
    }
    return { account: acc.handle, ok: false, code: err.code };
  }
}
