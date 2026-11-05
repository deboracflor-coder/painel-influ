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
const trilha = clients.find((c) => c.name.startsWith('Trilha'))!.id;

// ---------- Séries e publicações FICTÍCIAS (só para ver as telas funcionando) ----------
// Gerador determinístico: o mesmo seed produz sempre os mesmos números.
let seed = 20261105;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const between = (a: number, b: number) => Math.round(a + rnd() * (b - a));
const DAY = 86_400_000;
const now = Date.now();
const iso = (t: number) => new Date(t).toISOString();
const dayStr = (t: number) => iso(t).slice(0, 10);

type Plat = 'instagram' | 'facebook' | 'youtube';
const FORMATS: Record<Plat, ('reels' | 'carousel' | 'photo' | 'story' | 'video' | 'short' | 'long_video')[]> = {
  instagram: ['reels', 'carousel', 'photo', 'story'],
  facebook: ['video', 'photo'],
  youtube: ['short', 'long_video'],
};
const accounts: { client: string; platform: Plat; handle: string; status: 'connected' | 'expired'; base: number }[] = [
  { client: aurora, platform: 'instagram', handle: '@aurora.ficticio', status: 'expired', base: 48_000 },
  { client: aurora, platform: 'facebook', handle: 'Aurora (fictício)', status: 'connected', base: 21_000 },
  { client: aurora, platform: 'youtube', handle: '@aurora-ficticio', status: 'connected', base: 9_400 },
  { client: trilha, platform: 'instagram', handle: '@trilha.ficticio', status: 'connected', base: 15_500 },
];

for (const a of accounts) {
  const lastSync = a.status === 'expired' ? now - 2 * DAY : now - between(1, 5) * 3_600_000;
  const acc = ok(await admin.from('social_accounts').insert({
    organization_id: org, client_id: a.client, platform: a.platform,
    external_account_id: `ficticio-${a.platform}-${a.handle}`, handle: a.handle, display_name: `${a.handle} (fictício)`,
    status: a.status, last_synced_at: iso(lastSync),
    last_error: a.status === 'expired' ? 'Acesso expirado (exemplo fictício)' : null,
  }).select('id').single());
  const ids = { account_id: acc.id, client_id: a.client, organization_id: org };

  // Série diária de 120 dias, parando na última coleta.
  const daily = [];
  let followers = a.base;
  for (let d = 120; d >= 0; d--) {
    const t = now - d * DAY;
    if (t > lastSync) break;
    const gained = between(20, 140), lost = between(5, 60);
    followers += gained - lost;
    daily.push({
      ...ids, day: dayStr(t), followers, followers_gained: gained, followers_lost: lost,
      reach: a.platform === 'youtube' ? null : between(a.base * 0.05, a.base * 0.25),
      impressions: a.platform === 'youtube' ? null : between(a.base * 0.08, a.base * 0.4),
      views: between(a.base * 0.1, a.base * 0.6),
      profile_visits: a.platform === 'instagram' ? between(80, 600) : null,
      source: 'api' as const, collected_at: iso(t),
    });
  }
  ok(await admin.from('account_daily_metrics').insert(daily));

  // Publicações a cada 2–4 dias, com uma coleta de métricas cada.
  const posts = [];
  for (let t = now - 110 * DAY, n = 1; t < lastSync - DAY; t += between(2, 4) * DAY, n++) {
    const format = FORMATS[a.platform][between(0, FORMATS[a.platform].length - 1)];
    posts.push({ ...ids, platform: a.platform, external_post_id: `ficticio-${n}`, format,
      caption: `[Fictício] Publicação de exemplo nº ${n} — ${a.handle}`, published_at: iso(t + between(9, 20) * 3_600_000) });
  }
  const created = ok(await admin.from('posts').insert(posts).select('id, published_at, format'));
  const snaps = created.map((p, i) => {
    const views = between(a.base * 0.05, a.base * 0.9);
    const yt = a.platform === 'youtube';
    return {
      post_id: p.id, client_id: a.client, organization_id: org,
      collected_at: iso(Math.min(lastSync, new Date(p.published_at).getTime() + 7 * DAY)),
      views,
      reach: yt ? null : Math.round(views * (0.55 + rnd() * 0.3)),
      impressions: yt ? null : Math.round(views * (1.05 + rnd() * 0.3)),
      likes: Math.round(views * (0.02 + rnd() * 0.06)),
      comments: Math.round(views * (0.001 + rnd() * 0.006)),
      shares: Math.round(views * (0.001 + rnd() * 0.01)),
      // Facebook e YouTube não entregam salvamentos: fica sem dado, nunca zero.
      saves: a.platform !== 'instagram' ? null : Math.round(views * (0.002 + rnd() * 0.02)),
      watch_time_seconds: yt ? views * between(20, 240) : null,
      avg_watch_time_seconds: yt ? between(20, 240) : null,
      // Um em cada dez traz uma métrica lançada à mão, para exibir o selo "Dado manual".
      source: i % 10 === 4 ? ('manual' as const) : ('api' as const),
    };
  });
  ok(await admin.from('post_metric_snapshots').insert(snaps));

  // Histórico de coleta: algumas execuções; a conta expirada termina com erro.
  for (let k = 3; k >= 0; k--) {
    const start = lastSync - k * 6 * 3_600_000;
    const failed = a.status === 'expired' && k === 0;
    const run = ok(await admin.from('sync_runs').insert({
      ...ids, trigger: 'cron', status: failed ? 'error' : 'success',
      queued_at: iso(start), started_at: iso(start), finished_at: iso(start + 40_000),
      api_calls: failed ? 1 : between(4, 12), posts_upserted: failed ? 0 : between(0, 3), snapshots_written: failed ? 0 : between(5, 30),
    }).select('id').single());
    if (failed) ok(await admin.from('sync_errors').insert({
      sync_run_id: run.id, ...ids, code: 'token_expired', http_status: 401, retryable: false,
      message: 'Exemplo fictício: o acesso à conta expirou e precisa ser reconectado.',
    }));
  }
}

console.log(`Pronto. Senha de todos os usuários fictícios: ${PASSWORD}
  admin@agencia.exemplo     → administração da agência (vê os 2 clientes)
  analista@agencia.exemplo  → analista (só Aurora)
  cliente@aurora.exemplo    → usuário do cliente Aurora
Todos os números são fictícios e os clientes estão marcados como demonstração.`);
