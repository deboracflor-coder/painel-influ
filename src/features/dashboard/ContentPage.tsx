import { useState } from 'react';
import { ContentCard } from '../../components/ContentCard';
import { EmptyState } from '../../components/States';
import { isNum, metricValue, rank, type SortKey } from '../../domain/metrics';
import { FilterBar } from '../filters/FilterBar';
import { useDashboardData } from '../data/useDashboardData';
import { dataGate } from './PageStates';

const SORTS: [SortKey, string][] = [
  ['views', 'Mais visualizações'], ['reach', 'Maior alcance'], ['engagement', 'Mais engajamento'],
  ['er', 'Maior taxa de engajamento'], ['shares', 'Mais compartilhamentos'], ['saves', 'Mais salvamentos'],
  ['comments', 'Mais comentários'], ['follows', 'Mais seguidores ganhos'],
];
const PAGE = 24;

export function ContentPage() {
  const d = useDashboardData();
  const [sort, setSort] = useState<SortKey>('views');
  const [limit, setLimit] = useState(PAGE);
  const platforms = [...new Set(d.accounts.map((a) => a.platform))];
  const gate = dataGate({ ...d, hasClient: !!d.client, hasAccounts: d.accounts.length > 0 });
  if (gate) return <>{gate}</>;

  const ranked = rank(d.cur, sort);
  const withVal = ranked.filter((p) => isNum(metricValue(p, sort))).length;
  const label = SORTS.find((s) => s[0] === sort)?.[1].toLowerCase();
  return (
    <>
      <FilterBar platforms={platforms} />
      <div className="section-head">
        <p className="section-sub">
          {d.cur.length} publicações no período com os filtros aplicados.
          {withVal < d.cur.length && ` ${d.cur.length - withVal} não têm "${label}" disponível e ficam no fim da lista.`}
        </p>
        <label className="filter" htmlFor="sort-select"><span>Ordenar por</span>
          <select id="sort-select" value={sort} onChange={(e) => { setSort(e.target.value as SortKey); setLimit(PAGE); }}>
            {SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
      </div>
      {ranked.length
        ? <div className="content-grid">{ranked.slice(0, limit).map((p, i) => <ContentCard key={p.id} post={p} rank={i + 1} highlight={sort} />)}</div>
        : <EmptyState title="Nenhuma publicação encontrada">Nenhuma publicação corresponde ao período e aos filtros selecionados.</EmptyState>}
      {ranked.length > limit && (
        <button className="btn" type="button" style={{ alignSelf: 'center' }} onClick={() => setLimit((l) => l + PAGE)}>
          Mostrar mais ({ranked.length - limit} restantes)
        </button>
      )}
      <p className="small muted">"Seguid." = seguidores ganhos pela publicação, quando a rede fornece. Traço (—) = a rede não informou o dado.</p>
    </>
  );
}
