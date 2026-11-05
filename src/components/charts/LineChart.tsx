import { useState, type PointerEvent } from 'react';
import { compact, fmtDec } from '../../domain/format';
import { dm, niceMax, W } from './scale';
import { ChartTooltip, TipRow, type TipState } from './Tooltip';

export interface LineSeries { name: string; color: string; values: (number | null)[] }

/** Gráfico de linha em SVG. Pontos sem dado interrompem a linha (não viram zero). */
export function LineChart({ series, labels, height = 220, minZero = false, ariaLabel }: {
  series: LineSeries[]; labels: string[]; height?: number; minZero?: boolean; ariaLabel: string;
}) {
  const [tip, setTip] = useState<TipState | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const all = series.flatMap((s) => s.values).filter((v): v is number => typeof v === 'number');
  if (!all.length || !labels.length) {
    return <div className="empty"><strong>Sem dados para o gráfico</strong><span>Nenhum valor disponível no período.</span></div>;
  }
  const H = height, L = 52, R = 14, T = 12, B = 26;
  let lo = minZero ? 0 : Math.min(...all);
  let hi = Math.max(...all);
  if (!minZero) { const pad = (hi - lo) * 0.15 || hi * 0.05 || 1; lo = Math.max(0, lo - pad); hi += pad; }
  const step = niceMax((hi - lo) / 4);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  if (hi === lo) hi = lo + step;
  const x = (i: number) => L + (labels.length === 1 ? (W - L - R) / 2 : (i / (labels.length - 1)) * (W - L - R));
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const grid: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) grid.push(v);
  const ticks = Math.min(6, labels.length);
  const tickIdx = Array.from({ length: ticks }, (_, k) => Math.round((k * (labels.length - 1)) / Math.max(ticks - 1, 1)));

  function onMove(e: PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const vx = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0, bd = Infinity;
    labels.forEach((_, i) => { const d = Math.abs(x(i) - vx); if (d < bd) { bd = d; best = i; } });
    setCursor(best);
    setTip({
      x: e.clientX, y: e.clientY,
      content: <><strong>{labels[best]?.split('-').reverse().join('/')}</strong>{series.map((s) => (
        <TipRow key={s.name} color={s.color} label={s.name} value={typeof s.values[best] === 'number' ? fmtDec(s.values[best]) : 'sem dado'} />
      ))}</>,
    });
  }

  return (
    <>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}
        onPointerMove={onMove} onPointerLeave={() => { setTip(null); setCursor(null); }}>
        {grid.map((v) => (
          <g key={v}>
            <line className="gridline" x1={L} x2={W - R} y1={y(v)} y2={y(v)} />
            <text x={L - 8} y={y(v) + 4} textAnchor="end">{compact(v)}</text>
          </g>
        ))}
        {tickIdx.map((i, k) => (
          <text key={k} x={x(i)} y={H - 6} textAnchor={k === 0 ? 'start' : k === ticks - 1 ? 'end' : 'middle'}>{dm(labels[i] ?? '')}</text>
        ))}
        <line className="baseline" x1={L} x2={W - R} y1={y(lo)} y2={y(lo)} />
        {series.map((s) => {
          let d = '', started = false, first: number | null = null, last: number | null = null;
          s.values.forEach((v, i) => {
            if (typeof v !== 'number') { started = false; return; }
            d += `${started ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
            started = true;
            if (first === null) first = i;
            last = i;
          });
          const lastV = last !== null ? s.values[last] : null;
          return (
            <g key={s.name}>
              {series.length === 1 && first !== null && last !== null && (
                <path d={`${d} L${x(last)} ${y(lo)} L${x(first)} ${y(lo)} Z`} fill={s.color} opacity={0.12} />
              )}
              <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {last !== null && typeof lastV === 'number' && <circle cx={x(last)} cy={y(lastV)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />}
            </g>
          );
        })}
        {cursor !== null && <line className="cursor" x1={x(cursor)} x2={x(cursor)} y1={T} y2={H - B} />}
        <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="transparent" />
      </svg>
      <ChartTooltip tip={tip} />
    </>
  );
}
