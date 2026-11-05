import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { LineChart } from '../../components/charts/LineChart';
import { ContentCard } from '../../components/ContentCard';
import { Kpi } from '../../components/Kpi';
import { EmptyState } from '../../components/States';
import { fmtDateTime, fmtHours, fmtPct, fmtSigned, PLATFORM_LABEL, PLATFORM_ORDER } from '../../domain/format';
import { ER_BASE, followerGrowth, isNum, rank, totals } from '../../domain/metrics';
import type { Platform } from '../../domain/types';
import { FilterBar } from '../filters/FilterBar';
import { useDashboardData } from '../data/useDashboardData';
import { dataGate } from './PageStates';
import { TIPS } from './tips';

const BASE_LABEL = { reach: 'alcance', views: 'visualizações', impressions: 'impressões' } as const;
const STATUS_MSG: Record<string, string> = {
  expired: 'O acesso a esta conta expirou. Os números param na última coleta até a conta ser reconectada.',
  revoked: 'Esta conta foi desconectada. Os números mostram só o que foi coletado antes.',
  error: 'A última coleta desta conta falhou. Os números podem estar desatualizados.',
};

export function NetworkPage() {
  const { platform: param } = useParams();
  const { search } = useLocation();
  const platform = (PLATFORM_ORDER as string[]).includes(param ?? '') ? (param as Platform) : null;
  const d = useDashboardData({ platform: platform ?? undefined });
  const connected = PLATFORM_ORDER.filter((p) => d.accounts.some((a) => a.platform === p));
  const gate = dataGate({ ...d, hasClient: !!d.client, hasAccounts: d.accounts.length > 0 });
  if (gate) return <>{gate}</>;
  if (!platform || !connected.includes(platform)) {
    const first = connected[0];
    return first ? <Navigate to={{ pathname: `/redes/${first}`, search }} replace /> : null;
  }

  const accs = d.accounts.filter((a) => a.platform === platform);
  const { filters, cur, prev } = d;
  const c = filters.compare;
  const t = totals(cur), tp = totals(prev);
  const ids = accs.map((a) => a.id);
  const g = followerGrowth(d.daily, ids, filters.period);
  const gp = followerGrowth(d.daily, ids, filters.previous);
  const fLabel = platform === 'youtube' ? 'Inscritos' : 'Seguidores';
  const rows = d.daily.filter((r) => ids.includes(r.account_id) && r.day >= filters.period.start && r.day <= filters.period.end);
  const labels = [...new Set(rows.map((r) => r.day))].sort();
  const daySum = (day: string, k: 'followers' | 'views') => {
    const vals = rows.filter((r) => r.day === day).map((r) => r[k]).filter(isNum);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  };
  const color = `var(--p-${platform})`;

  return (
    <>
      <div className="tabs" role="tablist" aria-label="Redes">
        {connected.map((p) => (
          <Link key={p} className="tab" role="tab" aria-selected={p === platform} to={{ pathname: `/redes/${p}`, search }} style={{ textDecoration: 'none' }}>
            <i className="dot" style={{ background: `var(--p-${p})` }} /> {PLATFORM_LABEL[p]}
          </Link>
        ))}
      </div>
      <FilterBar platforms={[platform]} showPlatforms={false} />
      {accs.map((a) => (
        <div key={a.id} className="panel account-head">
          <i className="dot" style={{ background: color, width: 14, height: 14 }} />
          <b>{a.handle ?? a.display_name ?? PLATFORM_LABEL[platform]}</b>
          {a.display_name && a.handle && <span className="muted">{a.display_name}</span>}
          <span className="badge badge-api">API</span>
          <span className="muted small">Última coleta: {a.last_synced_at ? fmtDateTime(a.last_synced_at) : 'ainda não houve'}</span>
          {STATUS_MSG[a.status] && <div className="callout callout-bad" style={{ width: '100%' }}><p>{STATUS_MSG[a.status]}</p></div>}
        </div>
      ))}
      <div className="grid grid-kpi">
        <Kpi label={fLabel} value={g.followers} prev={gp.followers} compare={c} tip={TIPS.followers} />
        <Kpi label={`Novos ${fLabel.toLowerCase()} (líquido)`} value={g.gained} prev={gp.gained} compare={c} tip={TIPS.growth} fmt={fmtSigned}
          extra={isNum(g.pct) ? <span>{fmtPct(g.pct)}</span> : null} />
        <Kpi label="Alcance" value={t.reach} prev={tp.reach} compare={c} tip={TIPS.reach} />
        <Kpi label="Visualizações" value={t.views} prev={tp.views} compare={c} tip={TIPS.views} />
        <Kpi label="Visualizações médias" value={t.avgViews} prev={tp.avgViews} compare={c} tip={TIPS.avgViews} />
        <Kpi label={platform === 'facebook' ? 'Reações' : 'Curtidas'} value={t.likes} prev={tp.likes} compare={c} tip={TIPS.likes} />
        <Kpi label="Comentários" value={t.comments} prev={tp.comments} compare={c} tip={TIPS.comments} />
        <Kpi label="Compartilhamentos" value={t.shares} prev={tp.shares} compare={c} tip={TIPS.shares} />
        <Kpi label="Salvamentos" value={t.saves} prev={tp.saves} compare={c} tip={TIPS.saves} />
        <Kpi label="Engajamentos" value={t.engagement} prev={tp.engagement} compare={c} tip={TIPS.engagement} />
        <Kpi label="Taxa de engajamento" value={t.er} prev={tp.er} compare={c} tip={TIPS.er} fmt={(v) => fmtPct(v, 2)}
          extra={<span>base: {BASE_LABEL[ER_BASE[platform]]}</span>} />
        <Kpi label="Cliques em links" value={t.link_clicks} prev={tp.link_clicks} compare={c} tip={TIPS.clicks} />
        {platform === 'youtube' && <Kpi label="Tempo assistido" value={t.watch_time_seconds} prev={tp.watch_time_seconds} compare={c} tip={TIPS.watch} fmt={fmtHours} />}
        <Kpi label="Publicações" value={t.posts} prev={tp.posts} compare={c} tip={TIPS.posts} />
      </div>
      <div className="grid grid-2">
        <div className="panel"><h3>{fLabel} por dia</h3>
          <LineChart series={[{ name: fLabel, color, values: labels.map((l) => daySum(l, 'followers')) }]} labels={labels} ariaLabel={`${fLabel} por dia`} /></div>
        <div className="panel"><h3>Visualizações diárias da conta</h3>
          <LineChart series={[{ name: 'Visualizações', color, values: labels.map((l) => daySum(l, 'views')) }]} labels={labels} minZero ariaLabel="Visualizações diárias da conta" /></div>
      </div>
      <div className="panel">
        <div className="section-head"><h3>Melhores publicações de {PLATFORM_LABEL[platform]} no período</h3>
          <Link className="small" to={{ pathname: '/publicacoes', search: mergeSearch(search, { redes: platform }) }}>Ver todas</Link></div>
        {cur.length ? <div className="content-grid">{rank(cur, 'views').slice(0, 4).map((p, i) => <ContentCard key={p.id} post={p} rank={i + 1} highlight="views" />)}</div>
          : <EmptyState title="Sem publicações no período" />}
      </div>
    </>
  );
}

function mergeSearch(search: string, patch: Record<string, string>) {
  const p = new URLSearchParams(search);
  for (const [k, v] of Object.entries(patch)) p.set(k, v);
  return `?${p.toString()}`;
}
