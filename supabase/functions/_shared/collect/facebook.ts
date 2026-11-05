// Página do Facebook. Métricas conforme a documentação da Pages API (2026-11-05):
// post_impressions* e page_impressions* foram descontinuadas em 2025; usamos *_media_view.
import { after, type CollectContext, type DailyRow, isoDay, num, type PostFormat, type PostRow, ProviderError, type SyncPayload } from './types.ts';

interface FbPost {
  id: string; message?: string; created_time: string; permalink_url?: string; full_picture?: string;
  attachments?: { data?: { media_type?: string }[] };
  shares?: { count?: number };
  reactions?: { summary?: { total_count?: number } };
  comments?: { summary?: { total_count?: number } };
}
interface Insight { name: string; values?: { value: unknown; end_time?: string }[] }

export function fbFormat(p: Pick<FbPost, 'attachments'>): PostFormat {
  const t = p.attachments?.data?.[0]?.media_type;
  if (!t) return 'text';
  if (t === 'photo') return 'photo';
  if (t.startsWith('video')) return 'video';
  if (t === 'album') return 'carousel';
  return 'other';
}

function fatalOnly(e: unknown): ProviderError {
  if (!(e instanceof ProviderError)) throw e;
  if (e.code === 'token_expired' || e.code === 'rate_limited' || e.code === 'network') throw e;
  return e;
}

export async function collectFacebook(ctx: CollectContext, graph: string, apiVersion: string): Promise<SyncPayload> {
  const tok = `access_token=${encodeURIComponent(ctx.accessToken)}`;
  const base = `${graph}/${ctx.externalId}`;

  const page = await ctx.fetchJson(`${base}?fields=followers_count,name&${tok}`) as { followers_count?: number };
  const daily = new Map<string, DailyRow>();
  daily.set(isoDay(ctx.now), { day: isoDay(ctx.now), followers: num(page.followers_count) });

  const until = Math.floor(new Date(ctx.now).getTime() / 1000);
  const since = until - 28 * 86400;
  try {
    const r = await ctx.fetchJson(`${base}/insights?metric=page_media_view,page_total_media_view_unique&period=day&since=${since}&until=${until}&${tok}`) as { data?: Insight[] };
    for (const serie of r.data ?? []) {
      const col = serie.name === 'page_media_view' ? 'views' : serie.name === 'page_total_media_view_unique' ? 'reach' : null;
      if (!col) continue;
      for (const p of serie.values ?? []) {
        if (!p.end_time) continue;
        const day = isoDay(new Date(new Date(p.end_time).getTime() - 86400_000));
        daily.set(day, { ...(daily.get(day) ?? { day }), [col]: num(p.value) });
      }
    }
  } catch (e) {
    const w = fatalOnly(e);
    ctx.warnings.push({ code: w.code, message: `Série diária da página: ${w.message}`, http_status: w.httpStatus });
  }

  const fields = 'id,message,created_time,permalink_url,full_picture,attachments{media_type},shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)';
  const list: FbPost[] = [];
  let next: string | undefined = `${base}/posts?fields=${encodeURIComponent(fields)}&limit=50&${tok}`;
  while (next) {
    const r = await ctx.fetchJson(next) as { data?: FbPost[]; paging?: { next?: string } };
    const items = r.data ?? [];
    list.push(...items.filter((p) => after(p.created_time, ctx.since)));
    next = items.length && after(items[items.length - 1]!.created_time, ctx.since) ? r.paging?.next : undefined;
  }

  const posts: PostRow[] = [];
  for (const p of list) {
    let views: number | null = null, reach: number | null = null;
    try {
      const r = await ctx.fetchJson(`${graph}/${p.id}/insights?metric=post_media_view,post_total_media_view_unique&${tok}`) as { data?: Insight[] };
      for (const i of r.data ?? []) {
        if (i.name === 'post_media_view') views = num(i.values?.[0]?.value);
        if (i.name === 'post_total_media_view_unique') reach = num(i.values?.[0]?.value);
      }
    } catch (e) {
      const w = fatalOnly(e);
      ctx.warnings.push({ code: 'metric_unavailable', message: `Publicação ${p.id}: ${w.message}`, http_status: w.httpStatus });
    }
    posts.push({
      external_post_id: p.id, format: fbFormat(p), permalink: p.permalink_url ?? null, caption: p.message ?? null,
      thumbnail_url: p.full_picture ?? null, published_at: new Date(p.created_time).toISOString(),
      metrics: {
        views, reach,
        likes: num(p.reactions?.summary?.total_count), comments: num(p.comments?.summary?.total_count),
        // sem objeto "shares" a API não informou compartilhamentos: fica sem dado
        shares: p.shares ? num(p.shares.count) : null,
        saves: null,
      },
    });
  }
  return { api_version: apiVersion, collected_at: ctx.now, posts, daily: [...daily.values()] };
}
