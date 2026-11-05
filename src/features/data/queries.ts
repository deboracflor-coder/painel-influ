import { useQuery } from '@tanstack/react-query';
import { addDays, type Period } from '../../domain/periods';
import type { DailyRow, Post } from '../../domain/types';
import { supabase } from '../../lib/supabase/client';

export function useAccounts(clientId: string | undefined) {
  return useQuery({
    queryKey: ['social_accounts', clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('social_accounts')
        .select('id, platform, handle, display_name, status, last_synced_at, last_error, sync_enabled, sync_frequency_minutes, token_expires_at, next_sync_at')
        .eq('client_id', clientId!)
        .order('platform');
      if (error) throw error;
      return data;
    },
  });
}
export type Account = NonNullable<ReturnType<typeof useAccounts>['data']>[number];

/** Posts publicados no intervalo, com o snapshot de métricas mais recente de cada um. */
export function usePosts(clientId: string | undefined, range: Period) {
  return useQuery({
    queryKey: ['posts', clientId, range.start, range.end],
    enabled: !!clientId,
    queryFn: async (): Promise<Post[]> => {
      const { data, error } = await supabase.rpc('client_posts', {
        p_client: clientId!,
        p_from: `${range.start}T00:00:00-03:00`,
        p_to: `${addDays(range.end, 1)}T00:00:00-03:00`,
      });
      if (error) throw error;
      return data.map((r) => ({
        id: r.id,
        account_id: r.account_id,
        platform: r.platform,
        format: r.format,
        permalink: r.permalink,
        caption: r.caption,
        thumbnail_url: r.thumbnail_url,
        published_at: r.published_at,
        collected_at: r.collected_at,
        source: r.source,
        metrics: {
          views: r.views, reach: r.reach, impressions: r.impressions, likes: r.likes, comments: r.comments,
          shares: r.shares, saves: r.saves, link_clicks: r.link_clicks, follows: r.follows,
          watch_time_seconds: r.watch_time_seconds,
        },
      }));
    },
  });
}

/** Série diária das contas do cliente no intervalo (inclui a véspera para calcular crescimento). */
export function useDaily(clientId: string | undefined, range: Period) {
  return useQuery({
    queryKey: ['daily', clientId, range.start, range.end],
    enabled: !!clientId,
    queryFn: async (): Promise<DailyRow[]> => {
      const { data, error } = await supabase
        .from('account_daily_metrics')
        .select('account_id, day, followers, reach, views, impressions, source')
        .eq('client_id', clientId!)
        .gte('day', addDays(range.start, -1))
        .lte('day', range.end)
        .order('day');
      if (error) throw error;
      return data;
    },
  });
}

export function useSyncHistory(clientId: string | undefined) {
  return useQuery({
    queryKey: ['sync_history', clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const [runs, errors] = await Promise.all([
        supabase.from('sync_runs')
          .select('id, account_id, trigger, status, attempt, queued_at, started_at, finished_at, api_calls, posts_upserted, snapshots_written')
          .eq('client_id', clientId!).order('queued_at', { ascending: false }).limit(100),
        supabase.from('sync_errors')
          .select('id, sync_run_id, account_id, code, message, http_status, retryable, created_at')
          .eq('client_id', clientId!).order('created_at', { ascending: false }).limit(100),
      ]);
      if (runs.error) throw runs.error;
      if (errors.error) throw errors.error;
      return { runs: runs.data, errors: errors.data };
    },
  });
}
