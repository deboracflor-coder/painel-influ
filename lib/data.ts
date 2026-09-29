import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { Viewer } from '@/lib/auth';

// Monta o conjunto de dados no mesmo formato do protótipo (public/painel/data/demo-data.js).
// Tudo é lido com a sessão do usuário, então as regras de acesso (RLS) já recortam o que cada um vê.

const PLATFORMS = ['instagram', 'tiktok', 'youtube', 'facebook'] as const;
const METRIC_COLS: Record<string, string> = {
  reach: 'reach', impressions: 'impressions', views: 'views', likes: 'likes', comments: 'comments', shares: 'shares',
  saves: 'saves', clicks: 'clicks', follows: 'follows', watch_time_min: 'watch_time_minutes', avg_view_pct: 'avg_view_pct', thumb_ctr: 'thumb_ctr',
};
const HISTORY_DAYS = 400; // série e posts carregados: ~13 meses, para comparar com o período anterior

type Row = Record<string, any>;

async function all(query: () => any, pageSize = 1000): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await query().range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < pageSize) return out;
  }
}

async function inChunks(ids: string[], fn: (chunk: string[]) => Promise<Row[]>): Promise<Row[]> {
  const out: Row[] = [];
  for (let i = 0; i < ids.length; i += 200) out.push(...await fn(ids.slice(i, i + 200)));
  return out;
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** Data e hora "agora" no fuso de Brasília. */
export function nowSP() {
  const now = new Date();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
  return { now: now.toISOString(), today };
}

export async function loadDataset(v: Viewer) {
  const sb: SupabaseClient = await supabaseServer();
  const internal = v.role !== 'brand_viewer';
  const { now, today } = nowSP();
  const since = new Date(Date.now() - HISTORY_DAYS * 86400000).toISOString().slice(0, 10);

  const [accountsRaw, brandsRaw, campaignsRaw, finRaw, delivRaw, itemsRaw, postsRaw, dailyRaw, runsRaw, wsRaw] = await Promise.all([
    internal ? all(() => sb.from('social_accounts').select('id, platform, handle, display_name, status, last_synced_at').eq('workspace_id', v.workspaceId).order('created_at')) : Promise.resolve([]),
    all(() => sb.from('brands').select('id, name, segment, is_demo').eq('workspace_id', v.workspaceId).order('name')),
    all(() => sb.from('campaigns').select('id, brand_id, name, objective, start_date, end_date, goal_views').eq('workspace_id', v.workspaceId).order('start_date')),
    all(() => sb.from('campaign_financials').select('campaign_id, contract_value, media_value, product_value, source')),
    all(() => sb.from('deliverables').select('id, campaign_id, platform, format, label, quantity_expected, quantity_cancelled, quantity_delivered_manual, due_date, status')),
    all(() => sb.from('delivery_items').select('id, deliverable_id, post_id, expected_date, delivered_date, status, notes, internal_notes').order('expected_date')),
    all(() => sb.from('posts').select('id, account_id, platform, external_post_id, published_at, format, title, url, is_sponsored, campaign_id, brand_id, deliverable_id, source').gte('published_at', since).order('published_at')),
    internal ? all(() => sb.from('account_daily').select('account_id, day, followers, followers_gained, views, reach, source').gte('day', since).order('day')) : Promise.resolve([]),
    internal ? all(() => sb.from('sync_runs').select('id, account_id, trigger, status, started_at, finished_at, posts_upserted, sync_errors(code, message)').order('started_at', { ascending: false }).limit(200), 200) : Promise.resolve([]),
    sb.from('workspaces').select('name, settings').eq('id', v.workspaceId).single(),
  ]);

  const postIds = postsRaw.map((p) => p.id);
  const [metricsRaw, overridesRaw] = await Promise.all([
    inChunks(postIds, async (c) => (await sb.from('post_metrics_current').select('*').in('post_id', c)).data ?? []),
    inChunks(postIds, async (c) => (await sb.from('manual_metric_overrides').select('post_id, metric').in('post_id', c)).data ?? []),
  ]);
  // Qual snapshot é o atual e de onde veio (API x importação)
  const snapSource = new Map<string, string>();
  if (postIds.length) {
    const snaps = await inChunks(postIds, async (c) => (await sb.from('metric_snapshots').select('post_id, captured_at, source').in('post_id', c).order('captured_at', { ascending: false })).data ?? []);
    for (const s of snaps) if (!snapSource.has(s.post_id)) snapSource.set(s.post_id, s.source);
  }
  const metricsBy = new Map(metricsRaw.map((m) => [m.post_id, m]));
  const overridesBy = new Map<string, string[]>();
  for (const o of overridesRaw) overridesBy.set(o.post_id, [...(overridesBy.get(o.post_id) ?? []), o.metric]);

  // Parâmetros de valor: a marca também precisa deles para ver o valor estimado da própria parceria
  const paramsRaw = internal
    ? await all(() => sb.from('benchmark_parameters').select('id, platform, format, basis, rate, methodology, valid_from, valid_to').eq('workspace_id', v.workspaceId))
    : (await supabaseAdmin().from('benchmark_parameters').select('id, platform, format, basis, rate, methodology, valid_from, valid_to').eq('workspace_id', v.workspaceId)).data ?? [];

  const accounts = accountsRaw.map((a) => ({ id: a.id, platform: a.platform, handle: a.handle, name: a.display_name || a.handle, status: a.status, last_synced_at: a.last_synced_at }));
  if (internal) for (const p of PLATFORMS) if (!accounts.some((a) => a.platform === p)) {
    accounts.push({ id: `nc_${p}`, platform: p, handle: '—', name: 'Não configurado', status: 'not_configured', last_synced_at: null });
  }
  const accPlatform = new Map(accounts.map((a) => [a.id, a.platform]));

  const posts = postsRaw.map((p, i) => {
    const m = metricsBy.get(p.id) ?? {};
    const metrics: Record<string, number | null> = {};
    for (const [k, col] of Object.entries(METRIC_COLS)) metrics[k] = num(m[col]);
    const fromImport = p.source !== 'api' || (snapSource.get(p.id) ?? 'api') !== 'api';
    const manualFields = fromImport ? Object.keys(metrics).filter((k) => metrics[k] !== null) : (overridesBy.get(p.id) ?? []);
    return {
      id: p.id, platform: p.platform, account_id: p.account_id, external_id: p.external_post_id, published_at: p.published_at,
      format: p.format, title: p.title || '(sem título)', url: p.url, brand_id: p.brand_id, campaign_id: p.campaign_id,
      deliverable_id: p.deliverable_id, sponsored: p.is_sponsored, metrics, manualFields,
      source: fromImport ? 'import' : 'api', hue: (i * 47) % 360,
    };
  });
  const postById = new Map(posts.map((p) => [p.id, p]));

  const campaignById = new Map(campaignsRaw.map((c) => [c.id, c]));
  const deliverables = delivRaw.map((d) => ({
    id: d.id, campaign_id: d.campaign_id, platform: d.platform, format: d.format, label: d.label, expected: d.quantity_expected,
    due_date: d.due_date, delivered_manual: d.quantity_delivered_manual, status: d.status, cancelled: d.quantity_cancelled || 0,
  }));
  const deliverableById = new Map(deliverables.map((d) => [d.id, d]));
  const deliveryItems = itemsRaw.map((it) => {
    const d = deliverableById.get(it.deliverable_id);
    const c = d && campaignById.get(d.campaign_id);
    const p = it.post_id ? postById.get(it.post_id) : null;
    return {
      id: it.id, campaign_id: d?.campaign_id ?? null, deliverable_id: it.deliverable_id, brand_id: c?.brand_id ?? null,
      platform: d?.platform ?? null, format: d?.format ?? null, label: d?.label ?? '', expected_date: it.expected_date,
      post_id: it.post_id, delivered_date: it.delivered_date ?? (p ? p.published_at.slice(0, 10) : null), url: p?.url ?? null,
      status: it.status, notes: it.notes ?? '', internal_notes: internal ? (it.internal_notes ?? '') : '',
    };
  });

  const campaigns = campaignsRaw.map((c) => ({
    id: c.id, brand_id: c.brand_id, name: c.name, objective: c.objective ?? '', start_date: c.start_date, end_date: c.end_date,
    platforms: [...new Set(deliverables.filter((d) => d.campaign_id === c.id && d.platform).map((d) => d.platform))],
    ...(c.goal_views ? { goal_views: Number(c.goal_views) } : {}),
  }));

  const syncRuns = runsRaw.map((r) => {
    const e = (r.sync_errors ?? [])[0];
    return {
      id: r.id, account_id: r.account_id, platform: accPlatform.get(r.account_id) ?? '', trigger: r.trigger, started_at: r.started_at,
      finished_at: r.finished_at, status: r.status === 'running' ? 'success' : r.status === 'partial' ? 'error' : r.status,
      posts: r.posts_upserted ?? 0, error: e ? `${e.code}: ${e.message}` : null,
    };
  }).reverse();

  const lastSync = accounts.map((a) => a.last_synced_at).filter(Boolean).sort().pop() ?? null;
  const ws = wsRaw.data;
  return {
    data: {
      accounts,
      daily: dailyRaw.map((d) => ({ account_id: d.account_id, day: d.day, followers: num(d.followers), followers_gained: num(d.followers_gained), views: num(d.views), reach: num(d.reach), source: d.source })),
      posts,
      brands: brandsRaw.map((b, i) => ({ id: b.id, name: b.name, segment: b.segment ?? '', color: i % 5, demo: b.is_demo })),
      campaigns,
      financials: finRaw.map((f) => ({ campaign_id: f.campaign_id, contract_value: num(f.contract_value), media_value: num(f.media_value), product_value: num(f.product_value), source: f.source })),
      deliverables,
      deliveryItems,
      params: paramsRaw.map((p: Row) => ({ id: p.id, platform: p.platform, format: p.format, basis: p.basis, rate: num(p.rate), methodology: p.methodology, valid_from: p.valid_from, valid_to: p.valid_to })),
      syncRuns,
      meta: { now, today, dataStart: since, demo: false, lastSync },
    },
    workspaceName: ws?.name ?? '',
    settings: { erBase: ws?.settings?.erBase, alerts: ws?.settings?.alerts },
  };
}
