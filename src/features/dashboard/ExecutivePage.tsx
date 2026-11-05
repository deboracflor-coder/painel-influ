import { Link, useLocation } from 'react-router-dom';
import { LineChart } from '../../components/charts/LineChart';
import { StackedBars } from '../../components/charts/StackedBars';
import { ContentCard } from '../../components/ContentCard';
import { Kpi, ManualBadge } from '../../components/Kpi';
import { SyncStrip } from '../../components/SyncStrip';
import { fmtDate, fmtInt, fmtPct, fmtSigned, PLATFORM_LABEL, PLATFORM_ORDER } from '../../domain/format';
import { followerGrowth, isNum, rank, sum, totals } from '../../domain/metrics';
import { addDays, weekStarts } from '../../domain/periods';
import { useAccess } from '../clients/queries';
import { FilterBar } from '../filters/FilterBar';
import { useDashboardData } from '../data/useDashboardData';
import { dataGate } from './PageStates';
import { TIPS } from './tips';

export function ExecutivePage() {
  const d = useDashboardData();
  const access = useAccess();
  const { search } = useLocation();
  const isAgency = access.data?.kind === 'org_admin' || access.data?.kind === 'org_analyst';
  const gate = dataGate({ ...d, hasClient: !!d.client, hasAccounts: d.accounts.length > 0 });
  const platforms = [...new Set(d.accounts.map((a) => a.platform))];

  if (gate) return <>{d.accounts.length > 0 && <FilterBar platforms={platforms} />}{gate}</>;

  const { filters, cur, prev } = d;
  const t = totals(cur), tp = totals(prev);
  const accIds = d.activeAccounts.map((a) => a.id);
  const g = followerGrowth(d.daily, accIds, filters.period);
  const gp = followerGrowth(d.daily, accIds, filters.previous);
  const manual = cur.some((p) => p.source === 'manual' || p.source === 'import');
  const c = filters.compare;

  const weeks = weekStarts(filters.period);
  const present = PLATFORM_ORDER.filter((p) => cur.some((x) => x.platform === p));
  const series = present.map((p) => ({
    name: PLATFORM_LABEL[p], color: `var(--p-${p})`,
    values: weeks.map((w) => sum(cur.filter((x) => x.platform === p && x.published_at.slice(0, 10) >= w && x.published_at.slice(0, 10) < addDays(w, 7)), (x) => x.metrics.views) ?? 0),
  }));
  const weekLabel = (w: string, long?: boolean) => {
    const end = addDays(w, 6) > filters.period.end ? filters.period.end : addDays(w, 6);
    return long ? `Semana de ${fmtDate(w)} a ${fmtDate(end)}` : `${w.slice(8, 10)}/${w.slice(5, 7)}`;
  };
  const share = present.map((p) => ({ p, views: sum(cur.filter((x) => x.platform === p), (x) => x.metrics.views), n: cur.filter((x) => x.platform === p).length }));
  const maxShare = Math.max(1, ...share.map((s) => s.views ?? 0));
  const days = d.daily.filter((r) => r.day >= filters.period.start && accIds.includes(r.account_id));
  const dayLabels = [...new Set(days.map((r) => r.day))].sort();
  const followerSeries = d.activeAccounts.map((a) => ({
    name: `${PLATFORM_LABEL[a.platform]}${a.handle ? ` ${a.handle}` : ''}`, color: `var(--p-${a.platform})`,
    values: dayLabels.map((day) => days.find((r) => r.account_id === a.id && r.day === day)?.followers ?? null),
  })).filter((s) => s.values.some(isNum));
  const top = rank(cur, 'views').slice(0, 3);

  return (
    <>
      <FilterBar platforms={platforms} />
      <SyncStrip accounts={d.accounts} linkToHistory={isAgency} />
      <section className="section">
        <div className="section-head"><h2>Audiência</h2><p className="section-sub">Período {fmtDate(filters.period.start)} a {fmtDate(filters.period.end)}{c ? `, comparado a ${fmtDate(filters.previous.start)} – ${fmtDate(filters.previous.end)}` : ''}</p></div>
        <div className="grid grid-kpi">
          <Kpi label="Seguidores" value={g.followers} prev={gp.followers} compare={c} tip={TIPS.followers} />
          <Kpi label="Crescimento de seguidores" value={g.gained} prev={gp.gained} compare={c} tip={TIPS.growth} fmt={fmtSigned}
            extra={isNum(g.pct) ? <span>{fmtPct(g.pct)} da base</span> : null} />
          <Kpi label="Alcance" value={t.reach} prev={tp.reach} compare={c} tip={TIPS.reach} />
          <Kpi label="Visualizações" value={t.views} prev={tp.views} compare={c} tip={TIPS.views} />
        </div>
      </section>
      <section className="section">
        <div className="section-head"><h2>Engajamento</h2></div>
        <div className="grid grid-kpi">
          <Kpi label="Engajamentos" value={t.engagement} prev={tp.engagement} compare={c} tip={TIPS.engagement} badges={manual ? <ManualBadge /> : null} />
          <Kpi label="Taxa de engajamento" value={t.er} prev={tp.er} compare={c} tip={TIPS.er} fmt={(v) => fmtPct(v, 2)} />
          <Kpi label="Curtidas" value={t.likes} prev={tp.likes} compare={c} tip={TIPS.likes} />
          <Kpi label="Comentários" value={t.comments} prev={tp.comments} compare={c} tip={TIPS.comments} />
          <Kpi label="Compartilhamentos" value={t.shares} prev={tp.shares} compare={c} tip={TIPS.shares} />
          <Kpi label="Salvamentos" value={t.saves} prev={tp.saves} compare={c} tip={TIPS.saves} />
        </div>
      </section>
      <section className="section">
        <div className="section-head"><h2>Produção</h2></div>
        <div className="grid grid-kpi">
          <Kpi label="Publicações" value={t.posts} prev={tp.posts} compare={c} tip={TIPS.posts} />
          <Kpi label="Visualizações médias por publicação" value={t.avgViews} prev={tp.avgViews} compare={c} tip={TIPS.avgViews} />
          <Kpi label="Engajamento médio por publicação" value={t.avgEngagement} prev={tp.avgEngagement} compare={c} tip={TIPS.avgEng} />
        </div>
      </section>
      <div className="grid grid-2">
        <div className="panel">
          <h3>Visualizações por semana de publicação</h3>
          <div className="legend">{series.map((s) => <span key={s.name}><i className="dot" style={{ background: s.color }} />{s.name}</span>)}</div>
          <StackedBars labels={weeks} series={series} labelFmt={weekLabel} ariaLabel="Visualizações por semana de publicação, por rede" />
          <p className="small muted">Visualizações acumuladas até a última coleta das publicações feitas em cada semana.</p>
        </div>
        <div className="panel">
          <h3>Participação por rede</h3>
          {share.length ? share.map((s) => (
            <div className="hbar-row" key={s.p}>
              <span><i className="dot" style={{ background: `var(--p-${s.p})` }} /> {PLATFORM_LABEL[s.p]}</span>
              <div className="hbar-track"><div className="hbar-fill" style={{ width: `${(((s.views ?? 0) / maxShare) * 100).toFixed(1)}%`, background: `var(--p-${s.p})` }} /></div>
              <span className="num small"><b>{isNum(s.views) ? fmtInt(s.views) : 'sem dado'}</b> views · {s.n} publicações</span>
            </div>
          )) : <p className="muted">Sem publicações no período.</p>}
        </div>
      </div>
      <div className="panel">
        <h3>Seguidores por dia</h3>
        <div className="legend">{followerSeries.map((s) => <span key={s.name}><i className="dot" style={{ background: s.color }} />{s.name}</span>)}</div>
        <LineChart series={followerSeries} labels={dayLabels} ariaLabel="Seguidores por dia, por conta" />
      </div>
      <div className="panel">
        <div className="section-head"><h3>Top 3 por visualizações</h3><Link className="small" to={{ pathname: '/publicacoes', search }}>Ver todas as publicações</Link></div>
        {top.length ? <div className="content-grid">{top.map((p, i) => <ContentCard key={p.id} post={p} rank={i + 1} highlight="views" />)}</div>
          : <p className="muted">Sem publicações no período.</p>}
      </div>
    </>
  );
}
