import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { secrets } from '@/lib/secrets';

// Fluxos de conexão das redes. Os tokens trocados aqui vão direto para o Supabase Vault
// (função store_account_token) e nunca chegam ao navegador.

export type Provider = 'meta' | 'tiktok' | 'google';
export const PROVIDERS: Provider[] = ['meta', 'tiktok', 'google'];
const GRAPH = 'https://graph.facebook.com/v23.0';

export type TokenJSON = { provider: Provider; access_token: string; refresh_token?: string; expires_at?: string | null };
export type ConnectedAccount = { platform: 'instagram' | 'facebook' | 'tiktok' | 'youtube'; externalId: string; handle: string; name: string; token: TokenJSON; scopes: string[] };

const redirectUri = (p: Provider) => `${secrets.siteUrl()}/api/connect/${p}/callback`;
const inSeconds = (s?: number) => (s ? new Date(Date.now() + s * 1000).toISOString() : null);

// ---------- state assinado (protege contra CSRF no retorno da rede) ----------
export function makeState(payload: { ws: string; uid: string; p: Provider }) {
  const nonce = randomBytes(16).toString('hex');
  const body = Buffer.from(JSON.stringify({ ...payload, nonce, exp: Date.now() + 10 * 60 * 1000 })).toString('base64url');
  const sig = createHmac('sha256', secrets.stateSecret()).update(body).digest('base64url');
  return { state: `${body}.${sig}`, nonce };
}
export function readState(state: string, nonceCookie: string | undefined) {
  const [body, sig] = state.split('.');
  if (!body || !sig) return null;
  const expected = createHmac('sha256', secrets.stateSecret()).update(body).digest();
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
  const data = JSON.parse(Buffer.from(body, 'base64url').toString());
  if (data.exp < Date.now() || !nonceCookie || data.nonce !== nonceCookie) return null;
  return data as { ws: string; uid: string; p: Provider };
}

// ---------- URL de autorização ----------
export function authorizeUrl(p: Provider, state: string) {
  if (p === 'meta') {
    const q = new URLSearchParams({
      client_id: secrets.meta().id, redirect_uri: redirectUri(p), state, response_type: 'code',
      scope: 'instagram_basic,instagram_manage_insights,pages_show_list,pages_read_engagement,read_insights,business_management',
    });
    return `https://www.facebook.com/v23.0/dialog/oauth?${q}`;
  }
  if (p === 'tiktok') {
    const q = new URLSearchParams({ client_key: secrets.tiktok().id, redirect_uri: redirectUri(p), state, response_type: 'code', scope: 'user.info.basic,user.info.stats,video.list' });
    return `https://www.tiktok.com/v2/auth/authorize/?${q}`;
  }
  const q = new URLSearchParams({
    client_id: secrets.google().id, redirect_uri: redirectUri(p), state, response_type: 'code', access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true',
    scope: 'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

async function json(res: Response) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) throw new Error(body.error?.message || body.error_description || body.error || `HTTP ${res.status}`);
  return body;
}

// ---------- Troca do código pelas contas conectadas ----------
export async function exchange(p: Provider, code: string): Promise<ConnectedAccount[]> {
  if (p === 'meta') {
    const { id, secret } = secrets.meta();
    const short = await json(await fetch(`${GRAPH}/oauth/access_token?${new URLSearchParams({ client_id: id, client_secret: secret, redirect_uri: redirectUri(p), code })}`));
    const long = await json(await fetch(`${GRAPH}/oauth/access_token?${new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: id, client_secret: secret, fb_exchange_token: short.access_token })}`));
    // Token de Página gerado a partir do token de longa duração não expira (enquanto a permissão existir)
    const pages = await json(await fetch(`${GRAPH}/me/accounts?${new URLSearchParams({ fields: 'id,name,access_token,instagram_business_account{id,username}', access_token: long.access_token })}`));
    const list: any[] = pages.data ?? [];
    const page = list.find((x) => x.instagram_business_account) ?? list[0];
    if (!page) throw new Error('Nenhuma Página do Facebook foi autorizada. Refaça a conexão marcando a Página ligada ao Instagram.');
    const scopes = ['instagram_basic', 'instagram_manage_insights', 'pages_show_list', 'pages_read_engagement', 'read_insights'];
    const token: TokenJSON = { provider: 'meta', access_token: page.access_token, expires_at: null };
    const out: ConnectedAccount[] = [{ platform: 'facebook', externalId: page.id, handle: page.name, name: page.name, token, scopes }];
    const ig = page.instagram_business_account;
    if (ig) out.push({ platform: 'instagram', externalId: ig.id, handle: ig.username ? `@${ig.username}` : ig.id, name: ig.username ?? page.name, token, scopes });
    return out;
  }
  if (p === 'tiktok') {
    const { id, secret } = secrets.tiktok();
    const t = await json(await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_key: id, client_secret: secret, code, grant_type: 'authorization_code', redirect_uri: redirectUri(p) }),
    }));
    const u = await json(await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name', { headers: { Authorization: `Bearer ${t.access_token}` } }));
    const name = u.data?.user?.display_name ?? 'TikTok';
    return [{ platform: 'tiktok', externalId: t.open_id, handle: name, name, scopes: String(t.scope ?? '').split(','), token: { provider: 'tiktok', access_token: t.access_token, refresh_token: t.refresh_token, expires_at: inSeconds(t.expires_in) } }];
  }
  const { id, secret } = secrets.google();
  const t = await json(await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: id, client_secret: secret, code, grant_type: 'authorization_code', redirect_uri: redirectUri(p) }),
  }));
  const ch = await json(await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { headers: { Authorization: `Bearer ${t.access_token}` } }));
  const c = ch.items?.[0];
  if (!c) throw new Error('Esta conta Google não tem canal no YouTube.');
  return [{ platform: 'youtube', externalId: c.id, handle: c.snippet?.customUrl ?? c.snippet?.title, name: c.snippet?.title, scopes: String(t.scope ?? '').split(' '), token: { provider: 'google', access_token: t.access_token, refresh_token: t.refresh_token, expires_at: inSeconds(t.expires_in) } }];
}
