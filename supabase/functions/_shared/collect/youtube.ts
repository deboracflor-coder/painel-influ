// YouTube: Data API v3 (vídeos e totais públicos) + YouTube Analytics API v2 (tempo de exibição,
// compartilhamentos e séries diárias). Escopos: youtube.readonly e yt-analytics.readonly.
import { type CollectContext, type DailyRow, isoDay, num, type PostRow, ProviderError, type SyncPayload } from './types.ts';

export interface YoutubeBases { data: string; analytics: string }

interface Report { columnHeaders?: { name: string }[]; rows?: unknown[][] }
interface Video {
  id: string;
  snippet?: { title?: string; publishedAt?: string; thumbnails?: Record<string, { url?: string }> };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
}

/** Linhas do relatório do Analytics como objetos {coluna: valor}. */
export function reportRows(r: Report): Record<string, unknown>[] {
  const cols = (r.columnHeaders ?? []).map((c) => c.name);
  return (r.rows ?? []).map((row) => Object.fromEntries(cols.map((c, i) => [c, row[i]])));
}

const chunks = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

export async function collectYoutube(ctx: CollectContext, bases: YoutubeBases): Promise<SyncPayload> {
  const init = { headers: { Authorization: `Bearer ${ctx.accessToken}` } };
  const get = (url: string) => ctx.fetchJson(url, init);
  const today = isoDay(ctx.now);
  const sinceDay = isoDay(ctx.since);

  // 1. Canal: inscritos hoje e playlist de envios
  const ch = await get(`${bases.data}/channels?part=statistics,contentDetails&id=${ctx.externalId}`) as {
    items?: { statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean }; contentDetails?: { relatedPlaylists?: { uploads?: string } } }[];
  };
  const channel = ch.items?.[0];
  if (!channel) throw new ProviderError('permission_missing', 'Canal não encontrado para este acesso', 404, false);
  const daily = new Map<string, DailyRow>();
  daily.set(today, { day: today, followers: channel.statistics?.hiddenSubscriberCount ? null : num(channel.statistics?.subscriberCount) });

  // 2. Série diária (Analytics). Os dados do YouTube Analytics chegam com 2 a 3 dias de atraso.
  const start28 = isoDay(new Date(new Date(ctx.now).getTime() - 28 * 86400_000));
  try {
    const r = await get(`${bases.analytics}/reports?ids=channel==MINE&startDate=${start28}&endDate=${today}&metrics=views,subscribersGained,subscribersLost&dimensions=day&sort=day`) as Report;
    for (const row of reportRows(r)) {
      const day = String(row.day);
      daily.set(day, { ...(daily.get(day) ?? { day }), views: num(row.views), followers_gained: num(row.subscribersGained), followers_lost: num(row.subscribersLost) });
    }
  } catch (e) {
    if (!(e instanceof ProviderError) || e.code === 'token_expired' || e.code === 'rate_limited' || e.code === 'network') throw e;
    ctx.warnings.push({ code: e.code, message: `Série diária do canal: ${e.message}`, http_status: e.httpStatus });
  }

  // 3. Vídeos enviados desde a data de corte
  const uploads = channel.contentDetails?.relatedPlaylists?.uploads;
  const ids: string[] = [];
  let pageToken = '';
  while (uploads) {
    const r = await get(`${bases.data}/playlistItems?part=contentDetails&playlistId=${uploads}&maxResults=50${pageToken ? `&pageToken=${pageToken}` : ''}`) as {
      items?: { contentDetails?: { videoId?: string; videoPublishedAt?: string } }[]; nextPageToken?: string;
    };
    const items = r.items ?? [];
    let reachedOld = false;
    for (const it of items) {
      const at = it.contentDetails?.videoPublishedAt;
      if (!it.contentDetails?.videoId || !at) continue;
      if (Date.parse(at) < Date.parse(ctx.since)) { reachedOld = true; continue; }
      ids.push(it.contentDetails.videoId);
    }
    if (reachedOld || !r.nextPageToken) break;
    pageToken = r.nextPageToken;
  }

  // 4. Totais públicos de cada vídeo + métricas do Analytics
  const videos: Video[] = [];
  for (const part of chunks(ids, 50)) {
    const r = await get(`${bases.data}/videos?part=snippet,statistics&id=${part.join(',')}`) as { items?: Video[] };
    videos.push(...(r.items ?? []));
  }
  const analytics = new Map<string, Record<string, unknown>>();
  for (const part of chunks(ids, 50)) {
    try {
      const r = await get(`${bases.analytics}/reports?ids=channel==MINE&startDate=${sinceDay}&endDate=${today}&metrics=estimatedMinutesWatched,averageViewDuration,shares&dimensions=video&filters=video==${part.join(',')}`) as Report;
      for (const row of reportRows(r)) analytics.set(String(row.video), row);
    } catch (e) {
      if (!(e instanceof ProviderError) || e.code === 'token_expired' || e.code === 'rate_limited' || e.code === 'network') throw e;
      ctx.warnings.push({ code: 'metric_unavailable', message: `Métricas de vídeos: ${e.message}`, http_status: e.httpStatus });
    }
  }

  const posts: PostRow[] = videos.map((v) => {
    const a = analytics.get(v.id);
    const minutes = a ? num(a.estimatedMinutesWatched) : null;
    const th = v.snippet?.thumbnails ?? {};
    return {
      external_post_id: v.id,
      // A API não diz se o vídeo é Short; não adivinhamos.
      format: 'video',
      permalink: `https://www.youtube.com/watch?v=${v.id}`,
      caption: v.snippet?.title ?? null,
      thumbnail_url: th.medium?.url ?? th.high?.url ?? th.default?.url ?? null,
      published_at: new Date(v.snippet?.publishedAt ?? ctx.now).toISOString(),
      metrics: {
        views: num(v.statistics?.viewCount), likes: num(v.statistics?.likeCount), comments: num(v.statistics?.commentCount),
        shares: a ? num(a.shares) : null,
        watch_time_seconds: minutes === null ? null : minutes * 60,
        avg_watch_time_seconds: a ? num(a.averageViewDuration) : null,
        reach: null, saves: null,
      },
    };
  });

  return { api_version: 'youtube-data-v3+analytics-v2', collected_at: ctx.now, posts, daily: [...daily.values()] };
}
