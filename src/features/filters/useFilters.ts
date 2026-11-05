import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PRESET_LABEL, presetPeriod, previousPeriod, todayISO, type Period, type PresetKey } from '../../domain/periods';
import type { Platform, PostFormat } from '../../domain/types';

export interface Filters {
  preset: PresetKey;
  period: Period;
  previous: Period;
  platforms: Platform[];
  format: PostFormat | '';
  compare: boolean;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const PLATFORMS: Platform[] = ['instagram', 'facebook', 'youtube', 'tiktok', 'x', 'linkedin'];

/** Lê e grava os filtros na URL, para que o endereço reproduza a mesma visão. */
export function parseFilters(params: URLSearchParams, today: string): Filters {
  const raw = params.get('periodo') as PresetKey | null;
  const preset: PresetKey = raw && raw in PRESET_LABEL ? raw : 'ultimos_30';
  let period: Period;
  const de = params.get('de'), ate = params.get('ate');
  if (preset === 'personalizado' && de && ate && ISO.test(de) && ISO.test(ate) && de <= ate) {
    period = { start: de, end: ate > today ? today : ate };
  } else {
    period = presetPeriod(preset === 'personalizado' ? 'ultimos_30' : preset, today);
  }
  const platforms = (params.get('redes') ?? '').split(',').filter((p): p is Platform => PLATFORMS.includes(p as Platform));
  const format = (params.get('formato') ?? '') as PostFormat | '';
  return { preset, period, previous: previousPeriod(period), platforms, format, compare: params.get('comparar') === '1' };
}

export function useFilters() {
  const [params, setParams] = useSearchParams();
  const today = todayISO();
  const filters = useMemo(() => parseFilters(params, today), [params, today]);
  const update = useCallback((patch: Record<string, string | null>) => {
    setParams((p) => {
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '') p.delete(k); else p.set(k, v);
      }
      return p;
    }, { replace: true });
  }, [setParams]);
  return { filters, update, today };
}
