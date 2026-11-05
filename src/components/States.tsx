import type { ReactNode } from 'react';

export function LoadingState({ label = 'Carregando…' }: { label?: string }) {
  return <div className="state state-loading" role="status" aria-live="polite">{label}</div>;
}

export function ErrorState({ title = 'Não foi possível carregar', detail, action }: { title?: string; detail?: string; action?: ReactNode }) {
  return (
    <div className="panel"><div className="empty" role="alert">
      <strong>{title}</strong>
      {detail && <span>{detail}</span>}
      {action}
    </div></div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="panel"><div className="empty"><strong>{title}</strong>{children && <span>{children}</span>}</div></div>;
}
