import { describe, expect, it } from 'vitest';
import { aggregateER, engagement, followerGrowth, pctChange, postER, rank, sum, totals } from '../../src/domain/metrics';
import { previousPeriod, presetPeriod, weekStarts } from '../../src/domain/periods';
import type { Post, PostMetrics } from '../../src/domain/types';

const empty: PostMetrics = { views: null, reach: null, impressions: null, likes: null, comments: null, shares: null, saves: null, link_clicks: null, follows: null, watch_time_seconds: null };
const post = (id: string, platform: Post['platform'], m: Partial<PostMetrics>): Post => ({
  id, account_id: 'a', platform, format: 'reels', permalink: null, caption: null, thumbnail_url: null,
  published_at: '2026-10-01T12:00:00Z', collected_at: null, source: 'api', metrics: { ...empty, ...m },
});

describe('métrica ausente nunca vira zero', () => {
  it('soma sem nenhum dado é null', () => {
    expect(sum([{ v: null }, { v: null }], (x) => x.v)).toBeNull();
  });
  it('soma ignora ausentes', () => {
    expect(sum([{ v: 2 }, { v: null }, { v: 3 }], (x) => x.v)).toBe(5);
  });
  it('zero informado pela API continua zero', () => {
    expect(sum([{ v: 0 }], (x) => x.v)).toBe(0);
  });
  it('engajamento sem componentes é null', () => {
    expect(engagement(empty)).toBeNull();
  });
  it('totais de lista vazia não inventam valores', () => {
    const t = totals([]);
    expect(t.posts).toBe(0);
    expect(t.views).toBeNull();
    expect(t.er).toBeNull();
    expect(t.avgViews).toBeNull();
  });
});

describe('taxa de engajamento', () => {
  it('usa a base da rede (alcance no Instagram, views no YouTube)', () => {
    expect(postER(post('1', 'instagram', { reach: 1000, likes: 50, comments: 10 }))).toBeCloseTo(6);
    expect(postER(post('2', 'youtube', { views: 200, reach: 999, likes: 20 }))).toBeCloseTo(10);
  });
  it('sem base é null', () => {
    expect(postER(post('1', 'instagram', { likes: 50 }))).toBeNull();
  });
  it('agregada é ponderada, não média de taxas', () => {
    const ps = [post('1', 'instagram', { reach: 100, likes: 50 }), post('2', 'instagram', { reach: 900, likes: 50 })];
    expect(aggregateER(ps)).toBeCloseTo(10); // 100/1000, e não (50% + 5,6%)/2
  });
});

describe('comparação e períodos', () => {
  it('variação sem base é null', () => {
    expect(pctChange(10, 0)).toBeNull();
    expect(pctChange(10, null)).toBeNull();
    expect(pctChange(15, 10)).toBeCloseTo(50);
  });
  it('período anterior tem o mesmo tamanho e termina na véspera', () => {
    expect(previousPeriod({ start: '2026-10-01', end: '2026-10-31' })).toEqual({ start: '2026-08-31', end: '2026-09-30' });
  });
  it('mês anterior', () => {
    expect(presetPeriod('mes_anterior', '2026-03-15')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
  });
  it('semanas cobrem o período', () => {
    expect(weekStarts({ start: '2026-10-01', end: '2026-10-15' })).toEqual(['2026-10-01', '2026-10-08', '2026-10-15']);
  });
});

describe('seguidores', () => {
  const daily = [
    { account_id: 'a', day: '2026-09-30', followers: 100, reach: null, views: null, impressions: null, source: 'api' as const },
    { account_id: 'a', day: '2026-10-31', followers: 130, reach: null, views: null, impressions: null, source: 'api' as const },
  ];
  it('ganho líquido no período', () => {
    expect(followerGrowth(daily, ['a'], { start: '2026-10-01', end: '2026-10-31' })).toEqual({ followers: 130, gained: 30, pct: 30 });
  });
  it('sem dado no início, não calcula ganho', () => {
    expect(followerGrowth(daily, ['a'], { start: '2026-09-01', end: '2026-10-31' }).gained).toBeNull();
  });
});

describe('ranking', () => {
  it('ordena do maior para o menor e deixa sem dado por último', () => {
    const ps = [post('a', 'instagram', { views: 5 }), post('b', 'instagram', {}), post('c', 'instagram', { views: 9 })];
    expect(rank(ps, 'views').map((p) => p.id)).toEqual(['c', 'a', 'b']);
  });
});
