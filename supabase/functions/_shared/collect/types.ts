// Tipos comuns da coleta. Sem dependência de Deno: o mesmo código roda nos testes (Node).

export type Platform = 'instagram' | 'facebook' | 'youtube';
export type PostFormat = 'reels' | 'story' | 'carousel' | 'photo' | 'video' | 'short' | 'long_video' | 'live' | 'text' | 'other';

/** Métricas de uma publicação. Ausente/null = a API não entregou (nunca vira zero). */
export interface PostMetrics {
  views?: number | null; reach?: number | null; impressions?: number | null;
  likes?: number | null; comments?: number | null; shares?: number | null; saves?: number | null;
  watch_time_seconds?: number | null; avg_watch_time_seconds?: number | null;
  profile_visits?: number | null; follows?: number | null; link_clicks?: number | null;
  extra?: Record<string, unknown> | null;
}

export interface PostRow {
  external_post_id: string;
  format: PostFormat;
  permalink: string | null;
  caption: string | null;
  thumbnail_url: string | null;
  published_at: string;
  metrics: PostMetrics | null;
}

export interface DailyRow {
  day: string; // AAAA-MM-DD
  followers?: number | null; followers_gained?: number | null; followers_lost?: number | null;
  reach?: number | null; impressions?: number | null; views?: number | null; profile_visits?: number | null;
  extra?: Record<string, unknown> | null;
}

export interface SyncPayload {
  api_version: string;
  collected_at: string;
  posts: PostRow[];
  daily: DailyRow[];
}

export type ErrorCode = 'token_expired' | 'rate_limited' | 'permission_missing' | 'metric_unavailable' | 'network' | 'unknown';

/** Erro de API já classificado. `fatal` interrompe a coleta da conta. */
export class ProviderError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public httpStatus: number | null = null,
    public retryable = false,
    public fatal = true,
  ) { super(message); }
}

/** Aviso não fatal (ex.: uma métrica indisponível para um post). */
export interface SyncWarning { code: ErrorCode; message: string; http_status: number | null }

/** Chamada HTTP que já devolve JSON ou lança ProviderError. Gravação do bruto fica a cargo de quem injeta. */
export type FetchJson = (url: string, init?: RequestInit) => Promise<unknown>;

export interface CollectContext {
  /** Id da conta na plataforma (IG user id, Page id, Channel id). */
  externalId: string;
  accessToken: string;
  fetchJson: FetchJson;
  /** Agora, em ISO. Injetado para os testes serem determinísticos. */
  now: string;
  /** Publicações a partir desta data entram na coleta. */
  since: string;
  warnings: SyncWarning[];
}

export const isoDay = (d: Date | string) => new Date(d).toISOString().slice(0, 10);
export const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};
/** a ≥ b, comparando instantes (a Meta usa "+0000", nós usamos "Z"). */
export const after = (a: string, b: string) => Date.parse(a) >= Date.parse(b);
