import { useMemo } from 'react';
import { ManualBadge } from '../../components/Kpi';
import { fmtDate, fmtDateTime, fmtDec, fmtInt, fmtPct, FORMAT_LABEL, PLATFORM_LABEL } from '../../domain/format';
import { isNum } from '../../domain/metrics';
import { buildReport, type CompareRow, type RankRow, reportTables } from '../../domain/report';
import { useClientContext } from '../clients/ClientContext';
import { dataGate } from '../dashboard/PageStates';
import { useDashboardData } from '../data/useDashboardData';
import { FilterBar } from '../filters/FilterBar';
import { downloadCsv } from './download';
import { SheetsExport } from './SheetsExport';

const fmt = (kind: CompareRow['kind'], v: number | null) => (kind === 'pct' ? fmtPct(v, 2) : kind === 'dec' ? fmtDec(v) : fmtInt(v));

function Change({ row }: { row: Pick<CompareRow, 'kind' | 'change'> }) {
  if (!isNum(row.change)) return <span className="delta flat">sem base</span>;
  const up = row.change > 0.05, down = row.change < -0.05;
  const txt = row.kind === 'pct' ? `${fmtDec(Math.abs(row.change))} p.p.` : `${fmtDec(Math.abs(row.change))}%`;
  return <span className={`delta ${up ? 'up' : down ? 'down' : 'flat'}`}>{up ? '↑' : down ? '↓' : '→'} {txt}</span>;
}

function Ranking({ rows, by }: { rows: RankRow[]; by: 'views' | 'er' }) {
  if (!rows.length) return <p className="muted">Nenhuma publicação com esse dado no período.</p>;
  return (
    <div className="table-wrap"><table>
      <thead><tr><th>#</th><th>Publicação</th><th>Rede</th><th className="n">Visualizações</th><th className="n">Alcance</th><th className="n">Engajamentos</th><th className="n">Taxa</th></tr></thead>
      <tbody>{rows.map((r) => (
        <tr key={r.post.id}>
          <td className="num">{r.position}</td>
          <td>
            <div>{fmtDate(r.post.published_at.slice(0, 10))} · {FORMAT_LABEL[r.post.format]} {(r.post.source === 'manual' || r.post.source === 'import') && <ManualBadge />}</div>
            <div className="small muted" style={{ maxWidth: 420 }}>{r.post.permalink
              ? <a href={r.post.permalink} target="_blank" rel="noreferrer noopener">{(r.post.caption ?? 'Ver publicação').slice(0, 110)}</a>
              : (r.post.caption ?? '').slice(0, 110)}</div>
          </td>
          <td>{PLATFORM_LABEL[r.post.platform]}</td>
          <td className={`n${by === 'views' ? ' strong' : ''}`}>{fmtInt(r.post.metrics.views)}</td>
          <td className="n">{fmtInt(r.post.metrics.reach)}</td>
          <td className="n">{fmtInt(r.engagement)}</td>
          <td className={`n${by === 'er' ? ' strong' : ''}`}>{fmtPct(r.er)}</td>
        </tr>
      ))}</tbody>
    </table></div>
  );
}

export function ReportPage() {
  const d = useDashboardData();
  const { clients } = useClientContext();
  const isDemo = !!clients.find((c) => c.id === d.client?.id)?.is_demo;
  const platforms = [...new Set(d.accounts.map((a) => a.platform))];
  const report = useMemo(() => (d.client ? buildReport({
    clientName: d.client.name, isDemo, period: d.filters.period, previous: d.filters.previous,
    accounts: d.activeAccounts, cur: d.cur, prev: d.prev,
    daily: d.daily.filter((r) => d.activeAccounts.some((a) => a.id === r.account_id)),
    generatedAt: fmtDateTime(new Date().toISOString()),
  }) : null), [d.client, isDemo, d.filters.period, d.filters.previous, d.activeAccounts, d.cur, d.prev, d.daily]);

  const gate = dataGate({ ...d, hasClient: !!d.client, hasAccounts: d.accounts.length > 0 });
  if (gate || !report) return <>{d.accounts.length > 0 && <FilterBar platforms={platforms} />}{gate}</>;

  const tables = reportTables(report);
  const fileBase = `Relatório ${report.input.clientName} ${report.input.period.start} a ${report.input.period.end}`;
  const big = report.summary.filter((s) => ['views', 'engagement', 'er'].includes(s.key));

  return (
    <>
      <FilterBar platforms={platforms} />
      <div className="panel report-controls">
        <div className="report-actions">
          <button className="btn btn-primary" type="button" onClick={() => window.print()}>Salvar em PDF</button>
          {tables.map((t) => <button key={t.name} className="btn" type="button" onClick={() => downloadCsv(t, fileBase)}>CSV · {t.name}</button>)}
          <SheetsExport title={fileBase} tables={tables} />
        </div>
        <p className="small muted">“Salvar em PDF” abre a impressão do navegador: escolha “Salvar como PDF”. As planilhas usam o padrão brasileiro (ponto e vírgula, vírgula decimal); célula vazia significa sem dado.</p>
      </div>

      <div className="report">
        <section className="slide slide-cover">
          <span className="slide-kicker">Relatório de desempenho{isDemo ? ' · dados fictícios' : ''}</span>
          <h2 className="slide-title">{report.input.clientName}</h2>
          <p>{fmtDate(report.input.period.start)} a {fmtDate(report.input.period.end)} · comparado a {fmtDate(report.input.previous.start)} – {fmtDate(report.input.previous.end)}</p>
          <p className="small">Gerado em {report.input.generatedAt} · Redes: {report.networks.map((n) => PLATFORM_LABEL[n.platform]).join(', ')}</p>
        </section>

        <section className="slide">
          <span className="slide-kicker">Resultados do período</span>
          <div className="big-trio">
            {big.map((s) => (
              <div className="arch" key={s.key}>
                <h4>{s.label}</h4>
                <div className="arch-line"><b>{fmt(s.kind, s.cur)}</b><Change row={s} /></div>
                <span className="small muted">Anterior: {fmt(s.kind, s.prev)}</span>
              </div>
            ))}
          </div>
          <div className="table-wrap"><table>
            <thead><tr><th>Indicador</th><th className="n">Período</th><th className="n">Anterior</th><th className="n">Variação</th></tr></thead>
            <tbody>{report.summary.map((s) => (
              <tr key={s.key}><td>{s.label}</td><td className="n strong">{fmt(s.kind, s.cur)}</td><td className="n">{fmt(s.kind, s.prev)}</td><td className="n"><Change row={s} /></td></tr>
            ))}</tbody>
          </table></div>
        </section>

        <section className="slide">
          <span className="slide-kicker">Desempenho por rede</span>
          <div className="table-wrap"><table>
            <thead><tr><th>Rede</th><th className="n">Publicações</th><th className="n">Visualizações</th><th className="n">Var.</th><th className="n">Alcance</th><th className="n">Engajamentos</th><th className="n">Taxa</th><th className="n">Taxa anterior</th><th className="n">Seguidores</th><th className="n">Crescimento</th></tr></thead>
            <tbody>{report.networks.map((n) => (
              <tr key={n.platform}>
                <td><i className="dot" style={{ background: `var(--p-${n.platform})` }} /> {PLATFORM_LABEL[n.platform]}</td>
                <td className="n">{fmtInt(n.posts)} <span className="muted small">({fmtInt(n.prevPosts)})</span></td>
                <td className="n strong">{fmtInt(n.views)}</td>
                <td className="n"><Change row={{ kind: 'int', change: isNum(n.views) && isNum(n.prevViews) && n.prevViews !== 0 ? ((n.views - n.prevViews) / Math.abs(n.prevViews)) * 100 : null }} /></td>
                <td className="n">{fmtInt(n.reach)}</td><td className="n">{fmtInt(n.engagement)}</td>
                <td className="n">{fmtPct(n.er)}</td><td className="n">{fmtPct(n.prevEr)}</td>
                <td className="n">{fmtInt(n.followers)}</td><td className="n">{isNum(n.gained) ? `${n.gained > 0 ? '+' : ''}${fmtInt(n.gained)}` : '—'}</td>
              </tr>
            ))}</tbody>
          </table></div>
          <p className="small muted">Entre parênteses, publicações do período anterior. “—” = sem dado.</p>
        </section>

        <section className="slide">
          <span className="slide-kicker">Ranking · mais visualizadas</span>
          <Ranking rows={report.topViews} by="views" />
        </section>
        <section className="slide">
          <span className="slide-kicker">Ranking · maior taxa de engajamento</span>
          <Ranking rows={report.topEr} by="er" />
        </section>

        <section className="slide">
          <span className="slide-kicker">Notas sobre os dados</span>
          <ul className="report-notes">{report.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        </section>
      </div>
    </>
  );
}
