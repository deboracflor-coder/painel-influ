// Configuração e OAuth dos provedores. Endereços podem ser trocados por variável de
// ambiente só para os testes automatizados apontarem para um servidor de teste.
import { googleError, metaError } from './collect/errors.ts';
import { type FetchJson, type Platform, ProviderError } from './collect/types.ts';

export type Provider = 'meta' | 'google' | 'google_sheets';

export interface MetaConfig { appId: string; appSecret: string; version: string; graph: string; dialog: string }
export interface GoogleConfig { clientId: string; clientSecret: string; auth: string; token: string; revoke: string; data: string; analytics: string; sheets: string }

const get = (name: string) => Deno.env.get(name) ?? '';

/** null quando o app da Meta ainda não foi configurado no projeto. */
export function metaConfig(): MetaConfig | null {
  const appId = get('META_APP_ID'), appSecret = get('META_APP_SECRET');
  if (!appId || !appSecret) return null;
  const version = get('META_GRAPH_VERSION') || 'v26.0';
  return {
    appId, appSecret, version,
    graph: `${get('META_GRAPH_URL') || 'https://graph.facebook.com'}/${version}`,
    dialog: `${get('META_DIALOG_URL') || 'https://www.facebook.com'}/${version}/dialog/oauth`,
  };
}

export function googleConfig(): GoogleConfig | null {
  const clientId = get('GOOGLE_CLIENT_ID'), clientSecret = get('GOOGLE_CLIENT_SECRET');
  if (!clientId || !clientSecret) return null;
  return {
    clientId, clientSecret,
    auth: get('GOOGLE_AUTH_URL') || 'https://accounts.google.com/o/oauth2/v2/auth',
    token: get('GOOGLE_TOKEN_URL') || 'https://oauth2.googleapis.com/token',
    revoke: get('GOOGLE_REVOKE_URL') || 'https://oauth2.googleapis.com/revoke',
    data: get('YOUTUBE_DATA_URL') || 'https://www.googleapis.com/youtube/v3',
    analytics: get('YOUTUBE_ANALYTICS_URL') || 'https://youtubeanalytics.googleapis.com/v2',
    sheets: get('SHEETS_API_URL') || 'https://sheets.googleapis.com/v4',
  };
}

export const META_SCOPES = ['pages_show_list', 'pages_read_engagement', 'read_insights', 'business_management', 'instagram_basic', 'instagram_manage_insights'];
export const GOOGLE_SCOPES = ['https://www.googleapis.com/auth/youtube.readonly', 'https://www.googleapis.com/auth/yt-analytics.readonly'];
/** drive.file: o app só acessa as planilhas que ele mesmo criar. */
export const SHEETS_SCOPES = ['https://www.googleapis.com/auth/drive.file'];

/** fetch que devolve JSON ou lança erro classificado do provedor. */
export function makeFetchJson(provider: 'meta' | 'google', onRaw?: (url: string, body: unknown) => void): FetchJson {
  return async (url, init) => {
    let res: Response;
    try {
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
    } catch (e) {
      throw new ProviderError('network', `Falha de rede: ${(e as Error).message}`, null, true);
    }
    const body = await res.json().catch(() => null);
    onRaw?.(url, body);
    if (!res.ok || (provider === 'meta' && body && typeof body === 'object' && 'error' in body)) {
      throw provider === 'meta' ? metaError(res.status, body) : googleError(res.status, body);
    }
    return body;
  };
}

/** Remove tokens e segredos de uma URL antes de gravar em log ou em raw_payloads. */
export const redact = (text: string) =>
  text.replace(/(access_token|client_secret|fb_exchange_token|code|refresh_token)=[^&"\\\s]+/g, '$1=***');

async function pkce() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const verifier = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const challenge = btoa(String.fromCharCode(...digest)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return { verifier, challenge };
}

export async function authorizationUrl(provider: Provider, state: string, redirectUri: string): Promise<{ url: string; verifier: string | null }> {
  if (provider === 'meta') {
    const c = metaConfig()!;
    const q = new URLSearchParams({ client_id: c.appId, redirect_uri: redirectUri, state, response_type: 'code', scope: META_SCOPES.join(',') });
    return { url: `${c.dialog}?${q}`, verifier: null };
  }
  const c = googleConfig()!;
  const { verifier, challenge } = await pkce();
  const q = new URLSearchParams({
    client_id: c.clientId, redirect_uri: redirectUri, state, response_type: 'code',
    scope: (provider === 'google_sheets' ? SHEETS_SCOPES : GOOGLE_SCOPES).join(' '),
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', code_challenge: challenge, code_challenge_method: 'S256',
  });
  return { url: `${c.auth}?${q}`, verifier };
}

/** Conta encontrada depois da autorização, pronta para gravar. */
export interface Discovered {
  platform: Platform; external_account_id: string; handle: string | null; display_name: string | null;
  token: Record<string, unknown>; token_expires_at: string | null; scopes: string[];
}

export async function discoverMeta(code: string, redirectUri: string): Promise<Discovered[]> {
  const c = metaConfig()!;
  const f = makeFetchJson('meta');
  const short = await f(`${c.graph}/oauth/access_token?${new URLSearchParams({ client_id: c.appId, client_secret: c.appSecret, redirect_uri: redirectUri, code })}`) as { access_token: string };
  const long = await f(`${c.graph}/oauth/access_token?${new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: c.appId, client_secret: c.appSecret, fb_exchange_token: short.access_token })}`) as { access_token: string };
  const userToken = long.access_token;
  const perms = await f(`${c.graph}/me/permissions?access_token=${encodeURIComponent(userToken)}`) as { data?: { permission: string; status: string }[] };
  const scopes = (perms.data ?? []).filter((p) => p.status === 'granted').map((p) => p.permission);

  const out: Discovered[] = [];
  let next: string | undefined = `${c.graph}/me/accounts?fields=${encodeURIComponent('id,name,access_token,instagram_business_account{id,username,name}')}&limit=100&access_token=${encodeURIComponent(userToken)}`;
  while (next) {
    const r = await f(next) as { data?: { id: string; name?: string; access_token: string; instagram_business_account?: { id: string; username?: string; name?: string } }[]; paging?: { next?: string } };
    for (const p of r.data ?? []) {
      // Token de página derivado de token de usuário de longa duração: não expira por prazo.
      const token = { provider: 'meta', access_token: p.access_token, page_id: p.id };
      out.push({ platform: 'facebook', external_account_id: p.id, handle: p.name ?? null, display_name: p.name ?? null, token, token_expires_at: null, scopes });
      const ig = p.instagram_business_account;
      if (ig) out.push({ platform: 'instagram', external_account_id: ig.id, handle: ig.username ? `@${ig.username}` : null, display_name: ig.name ?? ig.username ?? null, token, token_expires_at: null, scopes });
    }
    next = r.paging?.next;
  }
  return out;
}

/** Troca o código do Google por tokens (com PKCE). */
export async function googleExchange(code: string, redirectUri: string, verifier: string) {
  const c = googleConfig()!;
  const t = await makeFetchJson('google')(c.token, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: c.clientId, client_secret: c.clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: verifier }),
  }) as { access_token: string; refresh_token?: string; expires_in: number; scope?: string };
  if (!t.refresh_token) throw new Error('O Google não devolveu acesso permanente (refresh token). Tente conectar de novo.');
  return { ...t, refresh_token: t.refresh_token, token: { provider: 'google', refresh_token: t.refresh_token, access_token: t.access_token, expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString() } };
}

export async function discoverGoogle(code: string, redirectUri: string, verifier: string): Promise<Discovered[]> {
  const c = googleConfig()!;
  const f = makeFetchJson('google');
  const t = await googleExchange(code, redirectUri, verifier);
  const ch = await f(`${c.data}/channels?part=snippet&mine=true`, { headers: { Authorization: `Bearer ${t.access_token}` } }) as { items?: { id: string; snippet?: { title?: string; customUrl?: string } }[] };
  const token = t.token;
  return (ch.items ?? []).map((x) => ({
    platform: 'youtube' as const, external_account_id: x.id, handle: x.snippet?.customUrl ?? null, display_name: x.snippet?.title ?? null,
    token, token_expires_at: null, scopes: (t.scope ?? '').split(' ').filter(Boolean),
  }));
}

/** Renova o access token do Google quando falta menos de 5 minutos. */
export async function freshGoogleToken(token: Record<string, unknown>): Promise<{ token: Record<string, unknown>; changed: boolean }> {
  const exp = Date.parse(String(token.expires_at ?? ''));
  if (token.access_token && Number.isFinite(exp) && exp - Date.now() > 5 * 60_000) return { token, changed: false };
  const c = googleConfig();
  if (!c) throw new Error('Integração com o Google não configurada');
  const t = await makeFetchJson('google')(c.token, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, refresh_token: String(token.refresh_token), grant_type: 'refresh_token' }),
  }) as { access_token: string; expires_in: number };
  return { token: { ...token, access_token: t.access_token, expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString() }, changed: true };
}

export async function revokeGoogle(token: Record<string, unknown>): Promise<void> {
  const c = googleConfig();
  if (!c || !token.refresh_token) return;
  await fetch(`${c.revoke}?token=${encodeURIComponent(String(token.refresh_token))}`, { method: 'POST' }).catch(() => undefined);
}
