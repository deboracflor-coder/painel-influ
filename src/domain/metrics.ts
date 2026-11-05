/**
 * Fórmulas do dashboard (portadas do protótipo, lib/calc.js).
 * Regra geral: métrica indisponível é null, nunca 0. Somas ignoram null e
 * devolvem null quando nenhum item tem o dado.
 */
import { addDays, type Period } from './periods';
import { METRIC_KEYS, type DailyRow, type MetricKey, type Platform, type Post, type PostMetrics } from './types';

export const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function sum<T>(items: readonly T[], get: (it: T) => number | null | undefined): number | null {
  let total = 0;
  let found = false;
  for (const it of items) {
    const v = get(it);
    if (isNum(v)) { total += v; found = true; }
  }
  return found ? total : null;
}

/** Engajamento = curtidas + comentários + compartilhamentos + salvamentos (componentes disponíveis). */
export function engagement(m: PostMetrics): number | null {
  const parts = [m.likes, m.comments, m.shares, m.saves].filter(isNum);
  return parts.length ? parts.reduce((a, b) => a + b, 0) : null;
}

/**
 * Métricas que a API oficial da rede não entrega (iguais aos coletores em
 * supabase/functions/_shared/collect). Na tela aparecem como "Indisponível", não como "Sem dado".
 */
export const NOT_PROVIDED: Partial<Record<Platform, readonly MetricKey[]>> = {
  instagram: [],
  facebook: ['saves'],
  youtube: ['reach', 'saves'],
};
export const notProvided = (platform: Platform, key: MetricKey): string | undefined =>
  (NOT_PROVIDED[platform] ?? []).includes(key) ? 'A rede não fornece esta métrica' : undefined;

export type ErBase = 'reach' | 'views' | 'impressions';
/** Base da taxa de engajamento por rede. */
export const ER_BASE: Record<Platform, ErBase> = {
  instagram: 'reach', facebook: 'reach', tiktok: 'views', youtube: 'views', x: 'impressions', linkedin: 'impressions',
};

/** Taxa de engajamento de um post (%): engajamento / base da rede × 100. */
export function postER(post: Pick<Post, 'platform' | 'metrics'>): number | null {
  const base = post.metrics[ER_BASE[post.platform]];
  const eng = engagement(post.metrics);
  if (!isNum(base) || base <= 0 || !isNum(eng)) return null;
  return (eng / base) * 100;
}

/** Taxa agregada (%): Σ engajamentos / Σ bases. Ponderada; não é média de taxas. */
export function aggregateER(posts: readonly Pick<Post, 'platform' | 'metrics'>[]): number | null {
  let eng = 0, base = 0, n = 0;
  for (const p of posts) {
    const b = p.metrics[ER_BASE[p.platform]];
    const e = engagement(p.metrics);
    if (isNum(b) && b > 0 && isNum(e)) { eng += e; base += b; n++; }
  }
  return n ? (eng / base) * 100 : null;
}

/** Variação percentual; null quando não há base de comparação. */
export function pctChange(cur: number | null, prev: number | null): number | null {
  if (!isNum(cur) || !isNum(prev) || prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

export type Totals = Record<MetricKey, number | null> & {
  posts: number;
  engagement: number | null;
  er: number | null;
  avgViews: number | null;
  avgEngagement: number | null;
};

export function totals(posts: readonly Post[]): Totals {
  const t = { posts: posts.length } as Totals;
  for (const k of METRIC_KEYS) t[k] = sum(posts, (p) => p.metrics[k]);
  t.engagement = sum(posts, (p) => engagement(p.metrics));
  t.er = aggregateER(posts);
  const withViews = posts.filter((p) => isNum(p.metrics.views)).length;
  t.avgViews = withViews && isNum(t.views) ? t.views / withViews : null;
  const withEng = posts.filter((p) => isNum(engagement(p.metrics))).length;
  t.avgEngagement = withEng && isNum(t.engagement) ? t.engagement / withEng : null;
  return t;
}

/** Último valor de seguidores da conta até a data (inclusive). */
export function followersAt(daily: readonly DailyRow[], accountId: string, iso: string): number | null {
  let best: DailyRow | null = null;
  for (const r of daily) {
    if (r.account_id !== accountId || r.day > iso || !isNum(r.followers)) continue;
    if (!best || r.day > best.day) best = r;
  }
  return best ? best.followers : null;
}

/** Seguidores no fim do período e ganho líquido (só contas com dado no início e no fim). */
export function followerGrowth(daily: readonly DailyRow[], accountIds: readonly string[], period: Period) {
  let endTotal = 0, startTotal = 0, ok = false;
  const dayBefore = addDays(period.start, -1);
  for (const id of accountIds) {
    const e = followersAt(daily, id, period.end);
    const s = followersAt(daily, id, dayBefore);
    if (isNum(e) && isNum(s)) { endTotal += e; startTotal += s; ok = true; }
  }
  if (!ok) return { followers: null, gained: null, pct: null };
  return { followers: endTotal, gained: endTotal - startTotal, pct: pctChange(endTotal, startTotal) };
}

export type SortKey = MetricKey | 'engagement' | 'er';

export function metricValue(p: Pick<Post, 'platform' | 'metrics'>, key: SortKey): number | null {
  if (key === 'engagement') return engagement(p.metrics);
  if (key === 'er') return postER(p);
  return p.metrics[key];
}

/** Ranking: ordena por métrica, do maior para o menor; sem dado sempre por último. */
export function rank<T extends Pick<Post, 'platform' | 'metrics'>>(posts: readonly T[], key: SortKey): T[] {
  return [...posts].sort((a, b) => {
    const va = metricValue(a, key), vb = metricValue(b, key);
    if (!isNum(va) && !isNum(vb)) return 0;
    if (!isNum(va)) return 1;
    if (!isNum(vb)) return -1;
    return vb - va;
  });
}
