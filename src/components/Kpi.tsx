import type { ReactNode } from 'react';
import { fmtDec, fmtInt } from '../domain/format';
import { isNum, pctChange } from '../domain/metrics';

export function Tip({ text }: { text: string }) {
  return <span className="tip" title={text} aria-label={text} tabIndex={0}>?</span>;
}

export function Delta({ cur, prev }: { cur: number | null; prev: number | null }) {
  const ch = pctChange(cur, prev);
  if (ch === null) return <span className="delta flat" title="Sem base de comparação no período anterior">sem base</span>;
  const up = ch > 0.05, down = ch < -0.05;
  return <span className={`delta ${up ? 'up' : down ? 'down' : 'flat'}`}>{up ? '↑' : down ? '↓' : '→'} {fmtDec(Math.abs(ch))}%</span>;
}

/**
 * Card de indicador. `value` null = sem dado no período (nunca mostrado como zero).
 * `unavailable` = a rede não fornece essa métrica.
 */
export function Kpi({ label, value, prev, compare, fmt = fmtInt, tip, badges, unavailable, extra }: {
  label: string; value: number | null; prev?: number | null; compare?: boolean; fmt?: (v: number) => string;
  tip?: string; badges?: ReactNode; unavailable?: string; extra?: ReactNode;
}) {
  if (unavailable) {
    return (
      <div className="kpi unavailable">
        <div className="kpi-label">{label} {tip && <Tip text={tip} />}</div>
        <div className="kpi-value na">Indisponível</div>
        <div className="kpi-foot"><span>{unavailable}</span></div>
      </div>
    );
  }
  return (
    <div className="kpi">
      <div className="kpi-label">{label} {tip && <Tip text={tip} />}</div>
      <div className="kpi-value">{isNum(value) ? fmt(value) : <span className="muted">Sem dado</span>}</div>
      <div className="kpi-foot">
        {compare && isNum(value) && <Delta cur={value} prev={prev ?? null} />}
        {compare && isNum(prev) && <span>antes: {fmt(prev)}</span>}
        {extra}
        {badges}
      </div>
    </div>
  );
}

export const ManualBadge = () => <span className="badge badge-manual" title="Inclui valores inseridos manualmente">Dado manual</span>;
