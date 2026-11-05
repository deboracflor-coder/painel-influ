import { useState, type PointerEvent } from 'react';
import { compact, fmtInt } from '../../domain/format';
import { niceMax, W } from './scale';
import { ChartTooltip, TipRow, type TipState } from './Tooltip';

export interface BarSeries { name: string; color: string; values: number[] }

export function StackedBars({ labels, series, height = 230, labelFmt = (l) => l, ariaLabel }: {
  labels: string[]; series: BarSeries[]; height?: number; labelFmt?: (l: string, long?: boolean) => string; ariaLabel: string;
}) {
  const [tip, setTip] = useState<TipState | null>(null);
  const H = height, L = 52, R = 10, T = 12, B = 26;
  const totals = labels.map((_, i) => series.reduce((a, s) => a + (s.values[i] ?? 0), 0));
  if (!totals.some((t) => t > 0)) {
    return <div className="empty"><strong>Sem dados para o gráfico</strong><span>Nenhum valor disponível no período.</span></div>;
  }
  const hi = niceMax(Math.max(...totals) * 1.05), step = hi / 4;
  const bw = (W - L - R) / labels.length, barW = Math.min(46, bw * 0.62);
  const y = (v: number) => T + (1 - v / hi) * (H - T - B);
  const every = Math.ceil(labels.length / 8);
  const grid = [0, 1, 2, 3, 4].map((k) => k * step);

  function onMove(e: PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const vx = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.floor((vx - L) / bw);
    const label = labels[i];
    if (i < 0 || label === undefined) { setTip(null); return; }
    setTip({
      x: e.clientX, y: e.clientY,
      content: <><strong>{labelFmt(label, true)}</strong>
        {series.filter((s) => s.values[i]).map((s) => <TipRow key={s.name} color={s.color} label={s.name} value={fmtInt(s.values[i])} />)}
        <TipRow label="Total" value={fmtInt(totals[i])} /></>,
    });
  }

  return (
    <>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}
        onPointerMove={onMove} onPointerLeave={() => setTip(null)}>
        {grid.map((v) => (
          <g key={v}>
            <line className="gridline" x1={L} x2={W - R} y1={y(v)} y2={y(v)} />
            <text x={L - 8} y={y(v) + 4} textAnchor="end">{compact(v)}</text>
          </g>
        ))}
        {labels.map((lab, i) => {
          const cx = L + bw * i + bw / 2, x0 = cx - barW / 2;
          let acc = 0;
          const segs = series.map((s) => ({ s, v: s.values[i] ?? 0 })).filter((z) => z.v > 0);
          return (
            <g key={lab}>
              {segs.map((z, k) => {
                const y1 = y(acc + z.v), y0 = y(acc), h = y0 - y1;
                const top = k === segs.length - 1, rr = Math.min(4, h, barW / 2);
                const d = top
                  ? `M${x0} ${y0} L${x0} ${y1 + rr} Q${x0} ${y1} ${x0 + rr} ${y1} L${x0 + barW - rr} ${y1} Q${x0 + barW} ${y1} ${x0 + barW} ${y1 + rr} L${x0 + barW} ${y0} Z`
                  : `M${x0} ${y0} L${x0} ${y1} L${x0 + barW} ${y1} L${x0 + barW} ${y0} Z`;
                acc += z.v;
                return <path key={z.s.name} d={d} fill={z.s.color} stroke="var(--surface)" strokeWidth={2} paintOrder="stroke" />;
              })}
              {i % every === 0 && <text x={cx} y={H - 6} textAnchor="middle">{labelFmt(lab)}</text>}
            </g>
          );
        })}
        <line className="baseline" x1={L} x2={W - R} y1={y(0)} y2={y(0)} />
        <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="transparent" />
      </svg>
      <ChartTooltip tip={tip} />
    </>
  );
}
