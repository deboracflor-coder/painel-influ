import type { ReactNode } from 'react';

export interface TipState { x: number; y: number; content: ReactNode }

export function ChartTooltip({ tip }: { tip: TipState | null }) {
  if (!tip) return null;
  const left = Math.min(tip.x + 14, window.innerWidth - 240);
  const top = tip.y + 14;
  return <div className="tooltip" role="tooltip" style={{ left: Math.max(8, left), top }}>{tip.content}</div>;
}

export function TipRow({ color, label, value }: { color?: string; label: string; value: string }) {
  return (
    <div className="tt-row">
      <span>{color && <i className="dot" style={{ background: color }} />} {label}</span>
      <span>{value}</span>
    </div>
  );
}
