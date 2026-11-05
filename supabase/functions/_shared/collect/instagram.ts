// Instagram (API do Instagram com login do Facebook). Métricas conforme
// developers.facebook.com/docs/instagram-platform/reference/instagram-media/insights (2026-11-05).
import { after, type CollectContext, type DailyRow, isoDay, num, type PostFormat, type PostMetrics, type PostRow, ProviderError, type SyncPayload } from './types.ts';

interface IgMedia {
  id: string; caption?: string; media_type?: string; media_product_type?: string; permalink?: string;
  thumbnail_url?: string; media_url?: string; timestamp: string; like_count?: number; comments_count?: number;
}
interface Insight { name: string; values?: { value: unknown; end_time?: string }[]; total_value?: { value: unknown } }

const METRICS: Record<'FEED' | 'REELS' | 'STORY', string[]> = {
  FEED: ['views', 'reach', 'likes', 'comments', 'shares', 'saved', 'profile_visits', 'follows', 'total_interactions'],
  REELS: ['views', 'reach', 'likes', 'comments', 'shares', 'saved', 'ig_reels_avg_watch_time', 'total_interactions'],
  STORY: ['views', 'reach', 'shares', 'profile_visits', 'follows', 'link_clicks', 'replies', 'total_interactions'],
};
const FALLBACK = ['views', 'reach', 'likes', 'comments', 'shares'];

export function igFormat(m: Pick<IgMedia, 'media_type' | 'media_product_type'>): PostFormat {
  if (m.media_product_type === 'REELS') return 'reels';
  if (m.media_product_type === 'STORY') return 'story';
  if (m.media_type === 'CAROUSEL_ALBUM') return 'carousel';
  if (m.media_type === 'VIDEO') return 'video';
  if (m.media_type === 'IMAGE') return 'photo';
  return 'other';
}

const insightValue = (i: Insight) => num(i.total_value?.value ?? i.values?.[0]?.value);

/** Converte a resposta de insights da mídia nas colunas do painel. Métrica ausente fica fora (null). */
export function igMediaMetrics(data: Insight[], media: IgMedia): PostMetrics {
  const v = new Map(data.map((i) => [i.name, insightValue(i)]));
  const get = (k: string) => (v.has(k) ? v.get(k)! : null);
  const avgMs = get('ig_reels_avg_watch_time');
  const extra: Record<string, unknown> = {};
  for (const k of ['total_interactions', 'replies']) if (v.has(k)) extra[k] = v.get(k);
  return {
    views: get('views'), reach: get('reach'),
    likes: get('likes') ?? num(media.like_count), comments: get('comments') ?? num(media.comments_count),
    shares: get('shares'), saves: get('saved'),
    avg_watch_time_seconds: avgMs === null ? null : avgMs / 1000, // a API devolve milissegundos
    profile_visits: get('profile_visits'), follows: get('follows'), link_clicks: get('link_clicks'),
    extra: Object.keys(extra).length ? extra : null,
  };
}

function fatalOnly(e: unknown): ProviderError | null {
  if (!(e instanceof ProviderError)) throw e;
  if (e.code === 'token_expired' || e.code === 'rate_limited' || e.code === 'network') throw e;
  return e;
}

export async function collectInstagram(ctx: CollectContext, graph: string, apiVersion: string): Promise<SyncPayload> {
  const tok = `access_token=${encodeURIComponent(ctx.accessToken)}`;
  const base = `${graph}/${ctx.externalId}`;

  // 1. Seguidores hoje (a API só dá o valor atual)
  const profile = await ctx.fetchJson(`${base}?fields=followers_count,username&${tok}`) as { followers_count?: number };
  const daily = new Map<string, DailyRow>();
  daily.set(isoDay(ctx.now), { day: isoDay(ctx.now), followers: num(profile.followers_count) });

  // 2. Alcance diário dos últimos 28 dias
  const until = Math.floor(new Date(ctx.now).getTime() / 1000);
  const since = until - 28 * 86400;
  try {
    const r = await ctx.fetchJson(`${base}/insights?metric=reach&period=day&metric_type=time_series&since=${since}&until=${until}&${tok}`) as { data?: Insight[] };
    for (const p of r.data?.find((i) => i.name === 'reach')?.values ?? []) {
      if (!p.end_time) continue;
      // end_time marca o fim do dia medido: o dia é o anterior
      const day = isoDay(new Date(new Date(p.end_time).getTime() - 86400_000));
      daily.set(day, { ...(daily.get(day) ?? { day }), reach: num(p.value) });
    }
  } catch (e) {
    const w = fatalOnly(e);
    if (w) ctx.warnings.push({ code: w.code, message: `Alcance diário: ${w.message}`, http_status: w.httpStatus });
  }

  // 3. Publicações desde a data de corte
  const fields = 'id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count';
  const media: IgMedia[] = [];
  let next: string | undefined = `${base}/media?fields=${fields}&limit=50&${tok}`;
  while (next) {
    const page = await ctx.fetchJson(next) as { data?: IgMedia[]; paging?: { next?: string } };
    const items = page.data ?? [];
    media.push(...items.filter((m) => after(m.timestamp, ctx.since)));
    next = items.length && after(items[items.length - 1]!.timestamp, ctx.since) ? page.paging?.next : undefined;
  }

  // 4. Métricas de cada publicação
  const posts: PostRow[] = [];
  for (const m of media) {
    const kind = m.media_product_type === 'REELS' ? 'REELS' : m.media_product_type === 'STORY' ? 'STORY' : 'FEED';
    let metrics: PostMetrics | null = null;
    for (const list of [METRICS[kind], FALLBACK]) {
      try {
        const r = await ctx.fetchJson(`${graph}/${m.id}/insights?metric=${list.join(',')}&${tok}`) as { data?: Insight[] };
        metrics = igMediaMetrics(r.data ?? [], m);
        break;
      } catch (e) {
        const w = fatalOnly(e);
        if (w && list === FALLBACK) {
          ctx.warnings.push({ code: 'metric_unavailable', message: `Publicação ${m.id}: ${w.message}`, http_status: w.httpStatus });
        }
      }
    }
    // Sem insights: só o que vem nos campos públicos da mídia
    metrics ??= { likes: num(m.like_count), comments: num(m.comments_count) };
    posts.push({
      external_post_id: m.id, format: igFormat(m), permalink: m.permalink ?? null, caption: m.caption ?? null,
      thumbnail_url: m.thumbnail_url ?? (m.media_type === 'IMAGE' || m.media_type === 'CAROUSEL_ALBUM' ? m.media_url ?? null : null),
      published_at: new Date(m.timestamp).toISOString(), metrics,
    });
  }

  return { api_version: apiVersion, collected_at: ctx.now, posts, daily: [...daily.values()] };
}
