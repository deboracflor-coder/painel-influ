// Coletores das redes com respostas de exemplo no formato da documentação oficial.
// Os números abaixo existem só neste teste.
import { describe, expect, it } from 'vitest';
import { googleError, metaError } from '../../supabase/functions/_shared/collect/errors.ts';
import { collectFacebook, fbFormat } from '../../supabase/functions/_shared/collect/facebook.ts';
import { collectInstagram, igFormat, igMediaMetrics } from '../../supabase/functions/_shared/collect/instagram.ts';
import { type CollectContext, type FetchJson, ProviderError } from '../../supabase/functions/_shared/collect/types.ts';
import { collectYoutube, reportRows } from '../../supabase/functions/_shared/collect/youtube.ts';

const NOW = '2026-11-05T12:00:00.000Z';
const SINCE = '2026-09-21T12:00:00.000Z';

/** fetch falso: a primeira rota cujo trecho aparece na URL responde. */
function fake(routes: [string, unknown | (() => unknown)][]): { fetchJson: FetchJson; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    fetchJson: async (url) => {
      calls.push(url);
      const hit = routes.find(([part]) => url.includes(part));
      if (!hit) throw new Error(`rota não prevista: ${url}`);
      const v = hit[1];
      return typeof v === 'function' ? (v as () => unknown)() : v;
    },
  };
}
const ctx = (fetchJson: FetchJson, externalId: string): CollectContext =>
  ({ externalId, accessToken: 'TOKEN', fetchJson, now: NOW, since: SINCE, warnings: [] });

describe('Instagram', () => {
  it('classifica o formato pela mídia', () => {
    expect(igFormat({ media_product_type: 'REELS', media_type: 'VIDEO' })).toBe('reels');
    expect(igFormat({ media_product_type: 'STORY', media_type: 'IMAGE' })).toBe('story');
    expect(igFormat({ media_product_type: 'FEED', media_type: 'CAROUSEL_ALBUM' })).toBe('carousel');
    expect(igFormat({ media_product_type: 'FEED', media_type: 'IMAGE' })).toBe('photo');
  });

  it('converte insights; métrica ausente fica null e tempo médio vai de ms para s', () => {
    const m = igMediaMetrics([
      { name: 'views', values: [{ value: 1000 }] },
      { name: 'reach', values: [{ value: 800 }] },
      { name: 'ig_reels_avg_watch_time', values: [{ value: 7500 }] },
      { name: 'total_interactions', total_value: { value: 90 } },
    ], { id: '1', timestamp: NOW });
    expect(m.views).toBe(1000);
    expect(m.reach).toBe(800);
    expect(m.avg_watch_time_seconds).toBe(7.5);
    expect(m.saves).toBeNull();
    expect(m.shares).toBeNull();
    expect(m.extra).toEqual({ total_interactions: 90 });
  });

  it('coleta seguidores, alcance diário e publicações dentro do período', async () => {
    const f = fake([
      ['/17841/insights', { data: [{ name: 'reach', values: [{ value: 300, end_time: '2026-11-04T08:00:00+0000' }, { value: 310, end_time: '2026-11-05T08:00:00+0000' }] }] }],
      ['/17841/media', { data: [
        { id: 'm1', media_type: 'VIDEO', media_product_type: 'REELS', timestamp: '2026-11-01T15:00:00+0000', permalink: 'p1', thumbnail_url: 't1', like_count: 5 },
        { id: 'm2', media_type: 'IMAGE', media_product_type: 'FEED', timestamp: '2026-09-01T15:00:00+0000' },
      ], paging: { next: 'NAO-DEVE-SEGUIR' } }],
      ['/m1/insights', { data: [{ name: 'views', values: [{ value: 50 }] }, { name: 'likes', values: [{ value: 7 }] }] }],
      ['/17841?fields', { followers_count: 1234, username: 'conta' }],
    ]);
    const c = ctx(f.fetchJson, '17841');
    const out = await collectInstagram(c, 'https://graph.exemplo/v26.0', 'v26.0');
    expect(out.daily.find((d) => d.day === '2026-11-05')?.followers).toBe(1234);
    expect(out.daily.find((d) => d.day === '2026-11-03')?.reach).toBe(300);
    expect(out.daily.find((d) => d.day === '2026-11-04')?.reach).toBe(310);
    expect(out.posts.map((p) => p.external_post_id)).toEqual(['m1']); // m2 é anterior ao corte
    expect(out.posts[0]!.metrics?.views).toBe(50);
    expect(out.posts[0]!.metrics?.likes).toBe(7);
    expect(out.posts[0]!.format).toBe('reels');
    expect(f.calls.some((u) => u.includes('NAO-DEVE-SEGUIR'))).toBe(false);
  });

  it('story sem visualizações suficientes vira aviso, não falha a coleta', async () => {
    const tooFew = () => { throw metaError(400, { error: { code: 10, message: '(#10) Not enough viewers for the media to show insights' } }); };
    const f = fake([
      ['/1/insights?metric=reach&period', { data: [] }],
      ['/1/media', { data: [{ id: 's1', media_type: 'IMAGE', media_product_type: 'STORY', timestamp: '2026-11-05T01:00:00+0000' }] }],
      ['/s1/insights', tooFew],
      ['/1?fields', { followers_count: 10 }],
    ]);
    const c = ctx(f.fetchJson, '1');
    const out = await collectInstagram(c, 'https://g', 'v26.0');
    expect(out.posts).toHaveLength(1);
    expect(out.posts[0]!.metrics?.views ?? null).toBeNull();
    expect(c.warnings[0]?.code).toBe('metric_unavailable');
  });

  it('token expirado interrompe a coleta', async () => {
    const expired = () => { throw metaError(401, { error: { code: 190, message: 'Error validating access token' } }); };
    const f = fake([['/1?fields', expired]]);
    await expect(collectInstagram(ctx(f.fetchJson, '1'), 'https://g', 'v26.0')).rejects.toMatchObject({ code: 'token_expired' });
  });
});

describe('Facebook', () => {
  it('classifica o formato pelo anexo', () => {
    expect(fbFormat({})).toBe('text');
    expect(fbFormat({ attachments: { data: [{ media_type: 'video_inline' }] } })).toBe('video');
    expect(fbFormat({ attachments: { data: [{ media_type: 'photo' }] } })).toBe('photo');
  });

  it('coleta página e posts; salvamentos ficam sem dado, compartilhamento ausente também', async () => {
    const f = fake([
      ['/99/insights', { data: [
        { name: 'page_media_view', values: [{ value: 900, end_time: '2026-11-05T08:00:00+0000' }] },
        { name: 'page_total_media_view_unique', values: [{ value: 400, end_time: '2026-11-05T08:00:00+0000' }] },
      ] }],
      ['/99/posts', { data: [
        { id: '99_1', created_time: '2026-11-02T10:00:00+0000', message: 'olá', reactions: { summary: { total_count: 12 } }, comments: { summary: { total_count: 3 } }, shares: { count: 2 } },
        { id: '99_2', created_time: '2026-11-03T10:00:00+0000', reactions: { summary: { total_count: 1 } }, comments: { summary: { total_count: 0 } } },
      ] }],
      ['/99_1/insights', { data: [{ name: 'post_media_view', values: [{ value: 500 }] }, { name: 'post_total_media_view_unique', values: [{ value: 320 }] }] }],
      ['/99_2/insights', { data: [] }],
      ['/99?fields', { followers_count: 777 }],
    ]);
    const out = await collectFacebook(ctx(f.fetchJson, '99'), 'https://g', 'v26.0');
    expect(out.daily.find((d) => d.day === '2026-11-05')?.followers).toBe(777);
    expect(out.daily.find((d) => d.day === '2026-11-04')).toMatchObject({ views: 900, reach: 400 });
    const p1 = out.posts.find((p) => p.external_post_id === '99_1')!;
    expect(p1.metrics).toMatchObject({ views: 500, reach: 320, likes: 12, comments: 3, shares: 2, saves: null });
    const p2 = out.posts.find((p) => p.external_post_id === '99_2')!;
    expect(p2.metrics).toMatchObject({ views: null, reach: null, comments: 0, shares: null });
  });
});

describe('YouTube', () => {
  it('lê relatórios do Analytics pelas colunas', () => {
    expect(reportRows({ columnHeaders: [{ name: 'day' }, { name: 'views' }], rows: [['2026-11-01', 10]] }))
      .toEqual([{ day: '2026-11-01', views: 10 }]);
  });

  it('coleta canal, série diária e vídeos; alcance e salvamentos ficam sem dado', async () => {
    const f = fake([
      ['/channels?', { items: [{ statistics: { subscriberCount: '5000' }, contentDetails: { relatedPlaylists: { uploads: 'UU1' } } }] }],
      ['dimensions=day', { columnHeaders: [{ name: 'day' }, { name: 'views' }, { name: 'subscribersGained' }, { name: 'subscribersLost' }], rows: [['2026-11-01', 120, 4, 1]] }],
      ['/playlistItems?', { items: [
        { contentDetails: { videoId: 'v1', videoPublishedAt: '2026-10-30T12:00:00Z' } },
        { contentDetails: { videoId: 'v0', videoPublishedAt: '2026-01-01T12:00:00Z' } },
      ], nextPageToken: 'NAO-DEVE-SEGUIR' }],
      ['/videos?', { items: [{ id: 'v1', snippet: { title: 'Vídeo', publishedAt: '2026-10-30T12:00:00Z', thumbnails: { medium: { url: 'thumb' } } }, statistics: { viewCount: '900', likeCount: '40', commentCount: '6' } }] }],
      ['dimensions=video', { columnHeaders: [{ name: 'video' }, { name: 'estimatedMinutesWatched' }, { name: 'averageViewDuration' }, { name: 'shares' }], rows: [['v1', 30, 95, 3]] }],
    ]);
    const out = await collectYoutube(ctx(f.fetchJson, 'UC1'), { data: 'https://yt', analytics: 'https://yta' });
    expect(out.daily.find((d) => d.day === '2026-11-05')?.followers).toBe(5000);
    expect(out.daily.find((d) => d.day === '2026-11-01')).toMatchObject({ views: 120, followers_gained: 4, followers_lost: 1 });
    expect(out.posts).toHaveLength(1);
    expect(out.posts[0]!.metrics).toMatchObject({ views: 900, likes: 40, comments: 6, shares: 3, watch_time_seconds: 1800, avg_watch_time_seconds: 95, reach: null, saves: null });
    expect(f.calls.some((u) => u.includes('NAO-DEVE-SEGUIR'))).toBe(false);
  });

  it('inscritos ocultos ficam sem dado', async () => {
    const f = fake([
      ['/channels?', { items: [{ statistics: { subscriberCount: '0', hiddenSubscriberCount: true }, contentDetails: { relatedPlaylists: {} } }] }],
      ['dimensions=day', { rows: [] }],
    ]);
    const out = await collectYoutube(ctx(f.fetchJson, 'UC1'), { data: 'https://yt', analytics: 'https://yta' });
    expect(out.daily[0]!.followers).toBeNull();
  });
});

describe('Classificação de erros', () => {
  it('Meta', () => {
    expect(metaError(400, { error: { code: 190 } }).code).toBe('token_expired');
    expect(metaError(400, { error: { code: 17 } })).toMatchObject({ code: 'rate_limited', retryable: true });
    expect(metaError(403, { error: { code: 200 } }).code).toBe('permission_missing');
    expect(metaError(400, { error: { code: 100 } })).toMatchObject({ code: 'metric_unavailable', fatal: false });
    expect(metaError(503, null)).toMatchObject({ code: 'network', retryable: true });
  });
  it('Google', () => {
    expect(googleError(400, { error: 'invalid_grant' }).code).toBe('token_expired');
    expect(googleError(403, { error: { errors: [{ reason: 'quotaExceeded' }] } })).toMatchObject({ code: 'rate_limited', retryable: true });
    expect(googleError(403, { error: { errors: [{ reason: 'forbidden' }] } }).code).toBe('permission_missing');
    expect(googleError(401, {}).code).toBe('token_expired');
    expect(googleError(500, {}) instanceof ProviderError).toBe(true);
  });
});
