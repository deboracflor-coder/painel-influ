import { describe, expect, it } from 'vitest';
import { parseFilters } from '../../src/features/filters/useFilters';

const today = '2026-11-05';

describe('filtros pela URL', () => {
  it('padrão: últimos 30 dias, sem comparação', () => {
    const f = parseFilters(new URLSearchParams(''), today);
    expect(f.period).toEqual({ start: '2026-10-07', end: '2026-11-05' });
    expect(f.compare).toBe(false);
  });
  it('período personalizado válido, sem passar de hoje', () => {
    const f = parseFilters(new URLSearchParams('periodo=personalizado&de=2026-10-01&ate=2026-12-31'), today);
    expect(f.period).toEqual({ start: '2026-10-01', end: today });
  });
  it('ignora datas inválidas e redes desconhecidas', () => {
    const f = parseFilters(new URLSearchParams('periodo=personalizado&de=xx&ate=2026-10-01&redes=instagram,orkut'), today);
    expect(f.period.end).toBe(today);
    expect(f.platforms).toEqual(['instagram']);
  });
});
