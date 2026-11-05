import { useMemo } from 'react';
import { inPeriod, type Period } from '../../domain/periods';
import type { Platform, Post } from '../../domain/types';
import { useClientContext } from '../clients/ClientContext';
import { useFilters } from '../filters/useFilters';
import { useAccounts, useDaily, usePosts } from './queries';

/** Dados do cliente atual, já recortados pelos filtros (período atual e anterior). */
export function useDashboardData(opts: { platform?: Platform } = {}) {
  const { current } = useClientContext();
  const { filters } = useFilters();
  const range: Period = { start: filters.previous.start, end: filters.period.end };
  const accounts = useAccounts(current?.id);
  const posts = usePosts(current?.id, range);
  const daily = useDaily(current?.id, range);

  const platforms = useMemo(() => (opts.platform ? [opts.platform] : filters.platforms), [opts.platform, filters.platforms]);
  const matches = useMemo(() => (p: Post) =>
    (!platforms.length || platforms.includes(p.platform)) && (!filters.format || p.format === filters.format),
  [platforms, filters.format]);

  const cur = useMemo(() => (posts.data ?? []).filter((p) => matches(p) && inPeriod(p.published_at, filters.period)), [posts.data, matches, filters.period]);
  const prev = useMemo(() => (posts.data ?? []).filter((p) => matches(p) && inPeriod(p.published_at, filters.previous)), [posts.data, matches, filters.previous]);
  const activeAccounts = useMemo(() => (accounts.data ?? []).filter((a) => !platforms.length || platforms.includes(a.platform)), [accounts.data, platforms]);

  return {
    client: current,
    filters,
    accounts: accounts.data ?? [],
    activeAccounts,
    cur,
    prev,
    daily: daily.data ?? [],
    isLoading: accounts.isLoading || posts.isLoading || daily.isLoading,
    error: accounts.error ?? posts.error ?? daily.error,
    refetch: () => { void accounts.refetch(); void posts.refetch(); void daily.refetch(); },
  };
}
