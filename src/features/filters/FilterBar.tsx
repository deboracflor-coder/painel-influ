import { useState } from 'react';
import { FORMAT_LABEL, PLATFORM_LABEL, PLATFORM_ORDER } from '../../domain/format';
import { PRESET_LABEL, type PresetKey } from '../../domain/periods';
import type { Platform, PostFormat } from '../../domain/types';
import { useFilters } from './useFilters';

export function FilterBar({ platforms, showPlatforms = true }: { platforms: Platform[]; showPlatforms?: boolean }) {
  const { filters, update, today } = useFilters();
  const [open, setOpen] = useState(false);
  const active = [filters.platforms.length, filters.format].filter(Boolean).length;
  const available = PLATFORM_ORDER.filter((p) => platforms.includes(p));

  function togglePlatform(p: Platform) {
    const set = new Set(filters.platforms);
    if (set.has(p)) set.delete(p); else set.add(p);
    update({ redes: [...set].join(',') || null });
  }

  return (
    <section className={`filters${open ? ' open' : ''}`} aria-label="Filtros">
      <button className="btn btn-sm filters-toggle" type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        Filtros{active ? ` (${active})` : ''}
      </button>
      <label className="filter" htmlFor="f-preset">
        <span>Período</span>
        <select id="f-preset" value={filters.preset} onChange={(e) => {
          const v = e.target.value as PresetKey;
          update(v === 'personalizado'
            ? { periodo: v, de: filters.period.start, ate: filters.period.end }
            : { periodo: v === 'ultimos_30' ? null : v, de: null, ate: null });
        }}>
          {Object.entries(PRESET_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      {filters.preset === 'personalizado' && (
        <>
          <label className="filter" htmlFor="f-start"><span>De</span>
            <input type="date" id="f-start" value={filters.period.start} max={filters.period.end} onChange={(e) => e.target.value && update({ de: e.target.value })} />
          </label>
          <label className="filter" htmlFor="f-end"><span>Até</span>
            <input type="date" id="f-end" value={filters.period.end} min={filters.period.start} max={today} onChange={(e) => e.target.value && update({ ate: e.target.value })} />
          </label>
        </>
      )}
      {showPlatforms && available.length > 1 && (
        <div className="filter"><span>Rede</span>
          <div className="chips">
            {available.map((p) => (
              <button key={p} type="button" className="chip" aria-pressed={filters.platforms.includes(p)} onClick={() => togglePlatform(p)}>
                <i className="dot" style={{ background: `var(--p-${p})` }} />{PLATFORM_LABEL[p]}
              </button>
            ))}
          </div>
        </div>
      )}
      <label className="filter" htmlFor="f-format"><span>Formato</span>
        <select id="f-format" value={filters.format} onChange={(e) => update({ formato: e.target.value || null })}>
          <option value="">Todos</option>
          {(Object.keys(FORMAT_LABEL) as PostFormat[]).map((k) => <option key={k} value={k}>{FORMAT_LABEL[k]}</option>)}
        </select>
      </label>
      <label className="compare-toggle" htmlFor="f-compare">
        <input type="checkbox" id="f-compare" checked={filters.compare} onChange={(e) => update({ comparar: e.target.checked ? '1' : null })} />
        Comparar com período anterior
      </label>
      {active > 0 && (
        <button className="btn btn-sm filter-clear" type="button" onClick={() => update({ redes: null, formato: null })}>Limpar filtros</button>
      )}
    </section>
  );
}
