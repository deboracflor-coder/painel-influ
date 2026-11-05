export type Platform = 'instagram' | 'facebook' | 'youtube' | 'tiktok' | 'x' | 'linkedin';
export type PostFormat = 'reels' | 'story' | 'carousel' | 'photo' | 'video' | 'short' | 'long_video' | 'live' | 'text' | 'other';
export type DataSource = 'api' | 'manual' | 'import' | 'calc';

/** Métricas de uma publicação. null = indisponível (nunca vira zero). */
export interface PostMetrics {
  views: number | null;
  reach: number | null;
  impressions: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  link_clicks: number | null;
  follows: number | null;
  watch_time_seconds: number | null;
}

export interface Post {
  id: string;
  account_id: string;
  platform: Platform;
  format: PostFormat;
  permalink: string | null;
  caption: string | null;
  thumbnail_url: string | null;
  published_at: string;
  collected_at: string | null;
  source: DataSource | null;
  metrics: PostMetrics;
}

export interface DailyRow {
  account_id: string;
  day: string;
  followers: number | null;
  reach: number | null;
  views: number | null;
  impressions: number | null;
  source: DataSource;
}

export const METRIC_KEYS = ['views', 'reach', 'impressions', 'likes', 'comments', 'shares', 'saves', 'link_clicks', 'follows', 'watch_time_seconds'] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];
