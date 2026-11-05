// Integrações de ponta a ponta: OAuth, coleta, idempotência, erros e desconexão.
// As Edge Functions rodam de verdade; Meta e Google são substituídos por um servidor
// de teste local (porta 54399) com respostas no formato da documentação oficial.
// Requer: npx supabase functions serve --env-file supabase/functions/.env.test
import { createClient } from '@supabase/supabase-js';
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const url = process.env.SUPABASE_URL!;
const anon = process.env.SUPABASE_ANON_KEY!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, service, { auth: { persistSession: false } });
const APP = 'http://127.0.0.1:5173';
const CRON = 'segredo-do-cron-de-teste';
const run = Date.now().toString(36);

// ---------- Servidor de teste no lugar de Meta e Google ----------
const seen: string[] = [];
const bodies: Record<string, unknown> = {};
function provider(req: import('node:http').IncomingMessage, body: string): [number, unknown] {
  const u = new URL(req.url!, 'http://x');
  const p = u.pathname.replace('/graph/v26.0', '');
  const tok = u.searchParams.get('access_token');
  seen.push(u.pathname);
  if (tok === 'PAGE-TOKEN-EXP') return [400, { error: { code: 190, message: 'Error validating access token: Session has expired' } }];
  if (p === '/oauth/access_token') return [200, { access_token: u.searchParams.get('grant_type') ? 'USER-TOKEN-LONG' : 'USER-TOKEN-SHORT' }];
  if (p === '/me/permissions') return [200, { data: [{ permission: 'instagram_basic', status: 'granted' }, { permission: 'read_insights', status: 'granted' }] }];
  if (p === '/me/accounts') return [200, { data: [
    { id: `pg-${run}`, name: 'Página de teste', access_token: 'PAGE-TOKEN-1', instagram_business_account: { id: `ig-${run}`, username: 'perfil_teste' } },
    { id: `pgexp-${run}`, name: 'Página com acesso vencido', access_token: 'PAGE-TOKEN-EXP' },
  ] }];
  if (p === `/ig-${run}`) return [200, { followers_count: 1500, username: 'perfil_teste' }];
  if (p === `/ig-${run}/insights`) return [200, { data: [{ name: 'reach', values: [{ value: 210, end_time: new Date().toISOString() }] }] }];
  if (p === `/ig-${run}/media`) return [200, { data: [
    { id: `igm1-${run}`, media_type: 'VIDEO', media_product_type: 'REELS', timestamp: new Date(Date.now() - 2 * 86400_000).toISOString(), permalink: 'https://instagram.exemplo/p/1', like_count: 9, comments_count: 2 },
    { id: `igm2-${run}`, media_type: 'IMAGE', media_product_type: 'FEED', timestamp: new Date(Date.now() - 5 * 86400_000).toISOString(), like_count: 3, comments_count: 0 },
  ] }];
  if (p === `/igm1-${run}/insights`) return [200, { data: [{ name: 'views', values: [{ value: 400 }] }, { name: 'reach', values: [{ value: 300 }] }, { name: 'saved', values: [{ value: 4 }] }] }];
  if (p === `/igm2-${run}/insights`) return [400, { error: { code: 100, message: 'Metric not supported' } }];
  if (p === `/pg-${run}`) return [200, { followers_count: 800 }];
  if (p === `/pg-${run}/insights`) return [200, { data: [{ name: 'page_media_view', values: [{ value: 90, end_time: new Date().toISOString() }] }] }];
  if (p === `/pg-${run}/posts`) return [200, { data: [{ id: `pg-${run}_1`, created_time: new Date(Date.now() - 86400_000).toISOString(), message: 'Post de teste', reactions: { summary: { total_count: 5 } }, comments: { summary: { total_count: 1 } } }] }];
  if (p === `/pg-${run}_1/insights`) return [200, { data: [{ name: 'post_media_view', values: [{ value: 70 }] }] }];
  if (p === '/google/token') return [200, { access_token: 'G-ACCESS', refresh_token: 'G-REFRESH', expires_in: 3600, scope: 'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly' }];
  if (p === '/google/revoke') return [200, {}];
  if (p === '/sheets/spreadsheets') { bodies.create = JSON.parse(body); return [200, { spreadsheetId: `sh-${run}`, spreadsheetUrl: `https://docs.google.com/spreadsheets/d/sh-${run}` }]; }
  if (p === `/sheets/spreadsheets/sh-${run}/values:batchUpdate`) { bodies.values = JSON.parse(body); return [200, {}]; }
  if (p === '/yt/channels') return [200, { items: [{ id: `uc-${run}`, snippet: { title: 'Canal de teste', customUrl: '@canalteste' }, statistics: { subscriberCount: '320' }, contentDetails: { relatedPlaylists: { uploads: 'UU-teste' } } }] }];
  if (p === '/yt/playlistItems') return [200, { items: [{ contentDetails: { videoId: `vid-${run}`, videoPublishedAt: new Date(Date.now() - 3 * 86400_000).toISOString() } }] }];
  if (p === '/yt/videos') return [200, { items: [{ id: `vid-${run}`, snippet: { title: 'Vídeo de teste', publishedAt: new Date(Date.now() - 3 * 86400_000).toISOString(), thumbnails: {} }, statistics: { viewCount: '150', likeCount: '12', commentCount: '1' } }] }];
  if (p === '/yta/reports') {
    return u.searchParams.get('dimensions') === 'video'
      ? [200, { columnHeaders: [{ name: 'video' }, { name: 'estimatedMinutesWatched' }, { name: 'averageViewDuration' }, { name: 'shares' }], rows: [[`vid-${run}`, 10, 40, 2]] }]
      : [200, { columnHeaders: [{ name: 'day' }, { name: 'views' }, { name: 'subscribersGained' }, { name: 'subscribersLost' }], rows: [] }];
  }
  return [404, { error: { code: 803, message: `rota de teste inexistente: ${p}` } }];
}
let server: Server;

// ---------- Pessoas e cliente de teste ----------
const ids: Record<string, string> = {};
const tokens: Record<string, string> = {};

async function user(key: string) {
  const email = `${key}-${run}@teste.invalid`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: 'senha-teste-123', email_confirm: true });
  if (error) throw error;
  ids[key] = data.user.id;
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const s = await c.auth.signInWithPassword({ email, password: 'senha-teste-123' });
  tokens[key] = s.data.session!.access_token;
}

async function call(fn: string, who: string | null, body: unknown, extra: Record<string, string> = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', apikey: anon, ...extra };
  if (who) headers.Authorization = `Bearer ${tokens[who]}`;
  const res = await fetch(`${url}/functions/v1/${fn}`, { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => ({})) as Record<string, unknown> };
}
async function connect(provider: 'meta' | 'google') {
  const start = await call('oauth-start', 'adm', { client_id: ids.client, provider, app_origin: APP });
  expect(start.status).toBe(200);
  const state = new URL(String(start.body.url)).searchParams.get('state')!;
  const res = await fetch(`${url}/functions/v1/oauth-callback?code=codigo-de-teste&state=${state}`, { redirect: 'manual' });
  return { state, status: res.status, location: res.headers.get('location') ?? '' };
}
const account = async (platform: string) => {
  const { data } = await admin.from('social_accounts').select('id, status, token_secret_id, last_error, external_account_id')
    .eq('client_id', ids.client!).eq('platform', platform).like('external_account_id', `%${run}`);
  return data ?? [];
};

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const [status, body] = provider(req, raw);
      res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
    });
  });
  await new Promise<void>((r) => server.listen(54399, '0.0.0.0', r));
  await Promise.all(['adm', 'ana', 'viewer'].map(user));
  const { data: org } = await admin.rpc('bootstrap_organization', { p_name: `Agência integração ${run}`, p_admin: ids.adm });
  ids.org = org as string;
  const { data: c } = await admin.from('clients').insert({ organization_id: ids.org, name: `Cliente integração ${run}`, is_demo: true }).select('id').single();
  ids.client = c!.id;
  await admin.from('organization_members').insert({ organization_id: ids.org, user_id: ids.ana, role: 'org_analyst' });
  await admin.from('client_users').insert({ organization_id: ids.org, client_id: ids.client, user_id: ids.viewer });
});
afterAll(async () => {
  await admin.from('organizations').delete().eq('id', ids.org!);
  await new Promise((r) => server.close(r));
});

describe('Conexão de contas (OAuth)', () => {
  it('pessoa do cliente não inicia conexão', async () => {
    expect((await call('oauth-start', 'viewer', { client_id: ids.client, provider: 'meta', app_origin: APP })).status).toBe(403);
  });
  it('analista sem o cliente atribuído não inicia conexão', async () => {
    expect((await call('oauth-start', 'ana', { client_id: ids.client, provider: 'meta', app_origin: APP })).status).toBe(403);
  });
  it('endereço de retorno fora da lista é recusado', async () => {
    expect((await call('oauth-start', 'adm', { client_id: ids.client, provider: 'meta', app_origin: 'https://site-estranho.exemplo' })).status).toBe(400);
  });
  it('admin conecta Meta: Facebook e Instagram gravados, token no Vault, retorno sem token na URL', async () => {
    const r = await connect('meta');
    expect(r.status).toBe(303);
    expect(r.location.startsWith(`${APP}/contas?`)).toBe(true);
    expect(r.location).toContain('conexao=ok');
    expect(r.location).not.toMatch(/TOKEN|access_token|code=/);
    const [ig] = await account('instagram');
    const fb = await account('facebook');
    expect(ig?.token_secret_id).toBeTruthy();
    expect(fb).toHaveLength(2);
    const { data: tok } = await admin.rpc('read_account_token', { p_account_id: ig!.id });
    expect((tok as { access_token: string }).access_token).toBe('PAGE-TOKEN-1');
    // estado é de uso único
    const again = await fetch(`${url}/functions/v1/oauth-callback?code=x&state=${r.state}`, { redirect: 'manual' });
    expect(again.status).toBe(400);
  });
  it('navegador não lê a referência do token', async () => {
    const c = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${tokens.adm}` } }, auth: { persistSession: false } });
    const { error } = await c.from('social_accounts').select('token_secret_id').eq('client_id', ids.client!);
    expect(error).not.toBeNull();
  });
});

describe('Coleta', () => {
  it('pessoa do cliente não dispara coleta', async () => {
    const [ig] = await account('instagram');
    expect((await call('account-actions', 'viewer', { account_id: ig!.id, action: 'sync' })).status).toBe(403);
  });

  it('coleta do Instagram grava posts e métricas; métrica que falhou fica sem dado', async () => {
    const [ig] = await account('instagram');
    const r = await call('account-actions', 'adm', { account_id: ig!.id, action: 'sync' });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('partial'); // igm2 sem insights → aviso
    const { data: posts } = await admin.from('posts').select('id, external_post_id, format').eq('account_id', ig!.id).order('external_post_id');
    expect(posts!.map((p) => p.format)).toEqual(['reels', 'photo']);
    const { data: snaps } = await admin.from('post_metric_snapshots').select('post_id, views, reach, saves, likes, source').in('post_id', posts!.map((p) => p.id));
    const reel = snaps!.find((s) => s.post_id === posts![0]!.id)!;
    expect(reel).toMatchObject({ views: 400, reach: 300, saves: 4, source: 'api' });
    const photo = snaps!.find((s) => s.post_id === posts![1]!.id)!;
    expect(photo).toMatchObject({ views: null, reach: null, likes: 3 });
    const { data: daily } = await admin.from('account_daily_metrics').select('followers').eq('account_id', ig!.id).not('followers', 'is', null);
    expect(daily![0]!.followers).toBe(1500);
    const { data: errs } = await admin.from('sync_errors').select('code').eq('account_id', ig!.id);
    expect(errs!.map((e) => e.code)).toContain('metric_unavailable');
  });

  it('repetir a coleta não duplica publicações', async () => {
    const [ig] = await account('instagram');
    const r = await call('account-actions', 'adm', { account_id: ig!.id, action: 'sync' });
    expect(r.status).toBe(200);
    const { count } = await admin.from('posts').select('id', { count: 'exact', head: true }).eq('account_id', ig!.id);
    expect(count).toBe(2);
  });

  it('respostas brutas guardadas sem token', async () => {
    const { data } = await admin.from('raw_payloads').select('endpoint, body, sync_runs!inner(client_id)').eq('sync_runs.client_id', ids.client!);
    expect(data!.length).toBeGreaterThan(0);
    expect(JSON.stringify(data)).not.toMatch(/PAGE-TOKEN|USER-TOKEN|G-ACCESS|G-REFRESH/);
  });

  it('agendador exige o segredo', async () => {
    expect((await call('sync-worker', null, {})).status).toBe(401);
    expect((await call('sync-worker', null, {}, { 'x-cron-secret': 'errado' })).status).toBe(401);
  });

  it('agendador coleta as contas vencidas; acesso vencido marca a conta como expirada', async () => {
    const r = await call('sync-worker', null, {}, { 'x-cron-secret': CRON });
    expect(r.status).toBe(200);
    const fb = await account('facebook');
    const ok = fb.find((a) => a.external_account_id === `pg-${run}`)!;
    const exp = fb.find((a) => a.external_account_id === `pgexp-${run}`)!;
    expect(ok.status).toBe('connected');
    const { data: fbPost } = await admin.from('posts').select('id, post_metric_snapshots(views, likes, shares, saves)').eq('account_id', ok.id).single();
    expect(fbPost!.post_metric_snapshots[0]).toMatchObject({ views: 70, likes: 5, shares: null, saves: null });
    expect(exp.status).toBe('expired');
    const { data: errs } = await admin.from('sync_errors').select('code').eq('account_id', exp.id);
    expect(errs!.map((e) => e.code)).toContain('token_expired');
  });

  it('conta expirada não coleta até ser reconectada', async () => {
    const exp = (await account('facebook')).find((a) => a.status === 'expired')!;
    expect((await call('account-actions', 'adm', { account_id: exp.id, action: 'sync' })).status).toBe(409);
  });
});

describe('YouTube', () => {
  it('conecta pelo Google e coleta vídeos', async () => {
    const r = await connect('google');
    expect(r.location).toContain('conexao=ok');
    const [yt] = await account('youtube');
    const s = await call('account-actions', 'adm', { account_id: yt!.id, action: 'sync' });
    expect(s.body.status).toBe('success');
    const { data } = await admin.from('posts').select('format, post_metric_snapshots(views, shares, watch_time_seconds, reach)').eq('account_id', yt!.id).single();
    expect(data!.format).toBe('video');
    expect(data!.post_metric_snapshots[0]).toMatchObject({ views: 150, shares: 2, watch_time_seconds: 600, reach: null });
  });

  it('desconectar revoga no Google e apaga o token do Vault', async () => {
    const [yt] = await account('youtube');
    const r = await call('account-actions', 'adm', { account_id: yt!.id, action: 'disconnect' });
    expect(r.status).toBe(200);
    const [after] = await account('youtube');
    expect(after).toMatchObject({ status: 'revoked', token_secret_id: null });
    expect(seen).toContain('/google/revoke');
    const { data: tok } = await admin.rpc('read_account_token', { p_account_id: yt!.id });
    expect(tok).toBeNull();
  });
});


describe('Google Sheets (exportação)', () => {
  const tables = [{ name: 'Resumo', rows: [['Indicador', 'Valor'], ['Visualizações', 4500], ['Salvamentos', null], ['=1+1', 'texto']] }];
  it('sem conta Google conectada, pede conexão', async () => {
    const r = await call('sheets-export', 'viewer', { action: 'export', title: 'Relatório', tables });
    expect(r.status).toBe(409);
    expect(r.body.needs_connection).toBe(true);
  });
  it('pessoa do cliente conecta a própria conta Google e volta para o relatório', async () => {
    const start = await call('oauth-start', 'viewer', { client_id: ids.client, provider: 'google_sheets', app_origin: APP });
    expect(start.status).toBe(200);
    expect(String(start.body.url)).toContain('drive.file');
    const state = new URL(String(start.body.url)).searchParams.get('state')!;
    const res = await fetch(`${url}/functions/v1/oauth-callback?code=codigo&state=${state}`, { redirect: 'manual' });
    expect(res.headers.get('location')).toContain(`${APP}/relatorio?`);
    expect(res.headers.get('location')).toContain('sheets=ok');
  });
  it('exporta: planilha nova com valores crus (nada vira fórmula) e vazio para sem dado', async () => {
    const r = await call('sheets-export', 'viewer', { action: 'export', title: 'Relatório teste', tables });
    expect(r.status).toBe(200);
    expect(r.body.url).toBe(`https://docs.google.com/spreadsheets/d/sh-${run}`);
    expect(bodies.create).toMatchObject({ properties: { title: 'Relatório teste', locale: 'pt_BR' }, sheets: [{ properties: { title: 'Resumo' } }] });
    expect(bodies.values).toMatchObject({ valueInputOption: 'RAW', data: [{ range: "'Resumo'!A1", values: [['Indicador', 'Valor'], ['Visualizações', 4500], ['Salvamentos', ''], ['=1+1', 'texto']] }] });
  });
  it('conexão do Google é de cada pessoa: o admin não usa a do cliente', async () => {
    expect((await call('sheets-export', 'adm', { action: 'export', title: 'x', tables })).status).toBe(409);
  });
  it('desconectar revoga e apaga o acesso', async () => {
    const before = seen.filter((x) => x === '/google/revoke').length;
    expect((await call('sheets-export', 'viewer', { action: 'disconnect' })).status).toBe(200);
    expect(seen.filter((x) => x === '/google/revoke').length).toBe(before + 1);
    const { data } = await admin.from('user_integrations').select('user_id').eq('user_id', ids.viewer!);
    expect(data).toEqual([]);
  });
});

describe('Importação manual pela API', () => {
  it('pessoa do cliente não importa; admin importa e o dado aparece como manual', async () => {
    const [ig] = await account('instagram');
    const as = (who: string) => createClient(url, anon, { global: { headers: { Authorization: `Bearer ${tokens[who]}` } }, auth: { persistSession: false } });
    const rows = [{ day: '2025-01-01', followers: 10 }];
    const denied = await as('viewer').rpc('import_daily_metrics', { p_account: ig!.id, p_rows: rows });
    expect(denied.error?.code).toBe('42501');
    const ok = await as('adm').rpc('import_daily_metrics', { p_account: ig!.id, p_rows: rows });
    expect(ok.data).toEqual({ inserted: 1, updated: 0, skipped_api: 0 });
    const { data } = await as('viewer').from('account_daily_metrics').select('followers, source').eq('account_id', ig!.id).eq('day', '2025-01-01').single();
    expect(data).toEqual({ followers: 10, source: 'manual' });
  });
});
