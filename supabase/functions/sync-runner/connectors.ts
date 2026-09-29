// Conectores das plataformas (Etapa 4) — código de referência para a implementação real.
// NÃO foi executado contra as APIs: exige apps aprovados e tokens. Os nomes de endpoints e
// métricas seguem a documentação oficial, mas as plataformas mudam versões e métricas com
// frequência: confirme a lista vigente antes de ativar e ajuste METRICS_* abaixo.
//
// Regra de ouro: métrica que a API não devolveu vira null (nunca 0), e a ausência é registrada.

export type Platform = 'instagram' | 'tiktok' | 'youtube' | 'facebook' | 'linkedin';

export interface AccountSnapshot { followers: number | null; day: string; reach?: number | null; views?: number | null; followersGained?: number | null; }
export interface NormalizedPost {
  externalId: string; publishedAt: string; format: string; title: string | null; url: string | null; thumbnailUrl: string | null;
  metrics: Partial<Record<'reach' | 'impressions' | 'views' | 'likes' | 'comments' | 'shares' | 'saves' | 'clicks' | 'follows' | 'watch_time_minutes' | 'avg_view_pct' | 'thumb_ctr', number | null>>;
  raw: unknown;
}
export interface Connector {
  platform: Platform;
  fetchAccount(token: string, accountId: string): Promise<AccountSnapshot>;
  listRecentPosts(token: string, accountId: string, sinceISO: string): Promise<NormalizedPost[]>;
}
export class ApiError extends Error {
  constructor(public code: 'token_expired' | 'rate_limited' | 'permission_missing' | 'metric_deprecated' | 'network' | 'unknown', message: string, public retryAfterSec?: number) { super(message); }
}

async function getJSON(url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, init);
  if (res.status === 429) throw new ApiError('rate_limited', `HTTP 429 em ${new URL(url).pathname}`, Number(res.headers.get('retry-after')) || 900);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.error?.message || body?.error?.code || res.statusText;
    if (res.status === 401 || body?.error?.code === 190) throw new ApiError('token_expired', msg);
    if (res.status === 403 || body?.error?.code === 10 || body?.error?.code === 200) throw new ApiError('permission_missing', msg);
    if (body?.error?.code === 100 && /metric/i.test(msg)) throw new ApiError('metric_deprecated', msg);
    throw new ApiError('unknown', `${res.status}: ${msg}`);
  }
  return body;
}
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// ---------------------------------------------------------------------------
// INSTAGRAM · Instagram Graph API (conta Profissional ligada a uma Página, login via Facebook)
// Token de longa duração: 60 dias (renovar antes de expirar). Stories: insights só por 24 h.
// ---------------------------------------------------------------------------
const GRAPH = 'https://graph.facebook.com/v23.0'; // confirme a versão vigente
const METRICS_IG_MEDIA = ['reach', 'views', 'likes', 'comments', 'shares', 'saved', 'total_interactions'];
const METRICS_IG_REELS_EXTRA = ['ig_reels_avg_watch_time'];
const METRICS_IG_FOLLOWS = ['follows']; // disponível para parte dos tipos de mídia; tratado como opcional

export const instagram: Connector = {
  platform: 'instagram',
  async fetchAccount(token, igUserId) {
    const u = await getJSON(`${GRAPH}/${igUserId}?fields=followers_count&access_token=${token}`);
    const day = new Date().toISOString().slice(0, 10);
    let reach: number | null = null, views: number | null = null;
    try {
      const ins = await getJSON(`${GRAPH}/${igUserId}/insights?metric=reach,views&period=day&metric_type=total_value&access_token=${token}`);
      for (const m of ins.data ?? []) { if (m.name === 'reach') reach = num(m.total_value?.value); if (m.name === 'views') views = num(m.total_value?.value); }
    } catch (e) { if (!(e instanceof ApiError) || e.code !== 'metric_deprecated') throw e; }
    return { followers: num(u.followers_count), day, reach, views };
  },
  async listRecentPosts(token, igUserId, sinceISO) {
    const fields = 'id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp';
    const posts: NormalizedPost[] = [];
    let url: string | null = `${GRAPH}/${igUserId}/media?fields=${fields}&limit=50&access_token=${token}`;
    while (url) {
      const page = await getJSON(url);
      for (const m of page.data ?? []) {
        if (m.timestamp < sinceISO) { url = null; break; }
        posts.push(await igMedia(token, m));
      }
      url = url && page.paging?.next ? page.paging.next : null;
    }
    const stories = await getJSON(`${GRAPH}/${igUserId}/stories?fields=${fields}&access_token=${token}`);
    for (const s of stories.data ?? []) posts.push(await igMedia(token, s));
    return posts;
  },
};
async function igMedia(token: string, m: any): Promise<NormalizedPost> {
  const format = m.media_product_type === 'STORY' ? 'story' : m.media_product_type === 'REELS' ? 'reels' : m.media_type === 'CAROUSEL_ALBUM' ? 'carousel' : m.media_type === 'VIDEO' ? 'video' : 'photo';
  const wanted = [...METRICS_IG_MEDIA.filter((x) => !(format === 'story' && x === 'saved')), ...(format === 'reels' ? METRICS_IG_REELS_EXTRA : [])];
  const metrics: NormalizedPost['metrics'] = {};
  const read = async (list: string[]) => {
    const r = await getJSON(`${GRAPH}/${m.id}/insights?metric=${list.join(',')}&access_token=${token}`);
    const v: Record<string, number | null> = {};
    for (const x of r.data ?? []) v[x.name] = num(x.values?.[0]?.value ?? x.total_value?.value);
    return v;
  };
  const v = await read(wanted);
  try { Object.assign(v, await read(METRICS_IG_FOLLOWS)); } catch { v.follows = null; }
  metrics.reach = v.reach ?? null; metrics.views = v.views ?? null; metrics.likes = v.likes ?? null; metrics.comments = v.comments ?? null;
  metrics.shares = v.shares ?? null; metrics.saves = v.saved ?? null; metrics.follows = v.follows ?? null;
  metrics.impressions = null; // descontinuada pela Meta em 2025: substituída por views
  metrics.clicks = null;      // não existe por post: Dado manual ou link rastreável
  return { externalId: m.id, publishedAt: m.timestamp, format, title: (m.caption ?? '').slice(0, 140) || null, url: m.permalink ?? null, thumbnailUrl: m.thumbnail_url ?? m.media_url ?? null, metrics, raw: { m, v } };
}

// ---------------------------------------------------------------------------
// TIKTOK · Display API (open.tiktokapis.com v2): perfil + vídeos com views/curtidas/comentários/compart.
// Alcance, tempo médio e % assistido exigem TikTok API for Business (conta Business, escopos aprovados):
// quando o app tiver esses escopos, preencha fetchBusinessInsights. Token de acesso: 24 h (usar refresh token).
// ---------------------------------------------------------------------------
const TT = 'https://open.tiktokapis.com/v2';
export const tiktok: Connector = {
  platform: 'tiktok',
  async fetchAccount(token) {
    const r = await getJSON(`${TT}/user/info/?fields=follower_count,likes_count,video_count`, { headers: { Authorization: `Bearer ${token}` } });
    return { followers: num(r.data?.user?.follower_count), day: new Date().toISOString().slice(0, 10) };
  },
  async listRecentPosts(token, _id, sinceISO) {
    const fields = 'id,title,video_description,create_time,cover_image_url,share_url,view_count,like_count,comment_count,share_count,duration';
    const out: NormalizedPost[] = [];
    let cursor: number | undefined; let more = true;
    while (more) {
      const r = await getJSON(`${TT}/video/list/?fields=${fields}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ max_count: 20, ...(cursor ? { cursor } : {}) }) });
      for (const v of r.data?.videos ?? []) {
        const at = new Date(v.create_time * 1000).toISOString();
        if (at < sinceISO) { more = false; break; }
        out.push({ externalId: v.id, publishedAt: at, format: 'video', title: v.title || v.video_description || null, url: v.share_url ?? null, thumbnailUrl: v.cover_image_url ?? null,
          metrics: { views: num(v.view_count), likes: num(v.like_count), comments: num(v.comment_count), shares: num(v.share_count), reach: null, saves: null, impressions: null, clicks: null }, raw: v });
      }
      more = more && !!r.data?.has_more; cursor = r.data?.cursor;
    }
    return out; // saves e reach: null aqui → Dado manual ou Business API
  },
};

// ---------------------------------------------------------------------------
// YOUTUBE · Data API v3 (inscritos, lista de vídeos) + Analytics API (watch time, retenção, inscritos por vídeo).
// Cota Data API: 10.000 unidades/dia. Analytics tem atraso de 1 a 3 dias: recoletar os últimos 7 dias sempre.
// ---------------------------------------------------------------------------
const YT = 'https://www.googleapis.com/youtube/v3';
const YTA = 'https://youtubeanalytics.googleapis.com/v2/reports';
export const youtube: Connector = {
  platform: 'youtube',
  async fetchAccount(token) {
    const r = await getJSON(`${YT}/channels?part=statistics,contentDetails&mine=true`, { headers: { Authorization: `Bearer ${token}` } });
    return { followers: num(Number(r.items?.[0]?.statistics?.subscriberCount)), day: new Date().toISOString().slice(0, 10) };
  },
  async listRecentPosts(token, _id, sinceISO) {
    const h = { headers: { Authorization: `Bearer ${token}` } };
    const ch = await getJSON(`${YT}/channels?part=contentDetails&mine=true`, h);
    const uploads = ch.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    const ids: string[] = []; let pageToken: string | undefined; let done = false;
    do {
      const pl = await getJSON(`${YT}/playlistItems?part=contentDetails&maxResults=50&playlistId=${uploads}${pageToken ? `&pageToken=${pageToken}` : ''}`, h);
      for (const it of pl.items ?? []) { if (it.contentDetails.videoPublishedAt < sinceISO) { done = true; break; } ids.push(it.contentDetails.videoId); }
      pageToken = pl.nextPageToken;
    } while (pageToken && !done);
    if (!ids.length) return [];
    const vids = { items: [] as any[] };
    for (let i = 0; i < ids.length; i += 50) vids.items.push(...((await getJSON(`${YT}/videos?part=snippet,statistics,contentDetails&id=${ids.slice(i, i + 50).join(',')}`, h)).items ?? [])); // máx. 50 ids por chamada
    const start = sinceISO.slice(0, 10), end = new Date().toISOString().slice(0, 10);
    const an = await getJSON(`${YTA}?ids=channel==MINE&startDate=${start}&endDate=${end}&dimensions=video&metrics=views,estimatedMinutesWatched,averageViewPercentage,subscribersGained,shares&filters=video==${ids.join(',')}`, h);
    const col = (name: string) => an.columnHeaders?.findIndex((c: any) => c.name === name);
    const byVideo = new Map<string, any[]>((an.rows ?? []).map((row: any[]) => [row[0], row]));
    return (vids.items ?? []).map((v: any) => {
      const row = byVideo.get(v.id);
      const isShort = parseDuration(v.contentDetails.duration) <= 180;
      return { externalId: v.id, publishedAt: v.snippet.publishedAt, format: isShort ? 'short' : 'long_video', title: v.snippet.title, url: `https://www.youtube.com/watch?v=${v.id}`, thumbnailUrl: v.snippet.thumbnails?.high?.url ?? null,
        metrics: { views: num(Number(v.statistics.viewCount)), likes: num(Number(v.statistics.likeCount)), comments: num(Number(v.statistics.commentCount)),
          shares: row ? num(row[col('shares')]) : null, watch_time_minutes: row ? num(row[col('estimatedMinutesWatched')]) : null,
          avg_view_pct: row ? num(row[col('averageViewPercentage')]) : null, follows: row ? num(row[col('subscribersGained')]) : null,
          reach: null, saves: null, clicks: null,
          impressions: null, thumb_ctr: null }, // impressões/CTR de miniatura: preencher com a métrica do Analytics se disponível na versão vigente
        raw: { v, row } } as NormalizedPost;
    });
  },
};
function parseDuration(iso: string) { const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/) || []; return (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0)); }

// ---------------------------------------------------------------------------
// FACEBOOK · Página via Graph API. A Meta descontinuou várias métricas de Página em 2025:
// mantenha a lista em configuração e trate métrica ausente como null.
// ---------------------------------------------------------------------------
const METRICS_FB_POST = ['post_impressions_unique', 'post_reactions_by_type_total'];
export const facebook: Connector = {
  platform: 'facebook',
  async fetchAccount(token, pageId) {
    const r = await getJSON(`${GRAPH}/${pageId}?fields=followers_count&access_token=${token}`);
    return { followers: num(r.followers_count), day: new Date().toISOString().slice(0, 10) };
  },
  async listRecentPosts(token, pageId, sinceISO) {
    const since = Math.floor(Date.parse(sinceISO) / 1000);
    const r = await getJSON(`${GRAPH}/${pageId}/posts?fields=id,message,created_time,permalink_url,full_picture,shares,comments.summary(true)&since=${since}&limit=100&access_token=${token}`);
    const out: NormalizedPost[] = [];
    for (const p of r.data ?? []) {
      let reach: number | null = null, likes: number | null = null;
      try {
        const ins = await getJSON(`${GRAPH}/${p.id}/insights?metric=${METRICS_FB_POST.join(',')}&access_token=${token}`);
        for (const m of ins.data ?? []) {
          if (m.name === 'post_impressions_unique') reach = num(m.values?.[0]?.value);
          if (m.name === 'post_reactions_by_type_total') likes = Object.values(m.values?.[0]?.value ?? {}).reduce((a: number, b: any) => a + (+b || 0), 0) as number;
        }
      } catch (e) { if (!(e instanceof ApiError) || e.code !== 'metric_deprecated') throw e; }
      out.push({ externalId: p.id, publishedAt: p.created_time, format: 'photo', title: (p.message ?? '').slice(0, 140) || null, url: p.permalink_url ?? null, thumbnailUrl: p.full_picture ?? null,
        metrics: { reach, likes, comments: num(p.comments?.summary?.total_count), shares: num(p.shares?.count), views: null, saves: null, impressions: null, clicks: null }, raw: p });
    }
    return out;
  },
};

export const CONNECTORS: Partial<Record<Platform, Connector>> = { instagram, tiktok, youtube, facebook };
// LinkedIn: adicionar aqui quando houver Página de empresa aprovada na Community Management API.
