import { Link, useLocation } from 'react-router-dom';
import { fmtDateTime, PLATFORM_LABEL } from '../domain/format';
import type { Account } from '../features/data/queries';

const LABEL: Record<string, [string, string]> = {
  connected: ['ok', '✓ conectada'],
  expired: ['err', '✕ token expirado'],
  revoked: ['off', '— desconectada'],
  error: ['err', '✕ erro na coleta'],
};

export function SyncStrip({ accounts, linkToHistory }: { accounts: Account[]; linkToHistory: boolean }) {
  const { search } = useLocation();
  if (!accounts.length) return null;
  return (
    <div className="sync-strip" aria-label="Situação das contas">
      {accounts.map((a) => {
        const [cls, txt] = LABEL[a.status] ?? ['off', a.status];
        const body = (
          <>
            <i className="dot" style={{ background: `var(--p-${a.platform})` }} />
            {PLATFORM_LABEL[a.platform]}: <span className={cls}>{txt}</span>
            <span className="muted small">· {a.last_synced_at ? `coleta ${fmtDateTime(a.last_synced_at)}` : "sem coleta"}</span>
          </>
        );
        return linkToHistory
          ? <Link key={a.id} className="sync-chip" to={{ pathname: '/historico', search }} style={{ textDecoration: 'none', color: 'inherit' }}>{body}</Link>
          : <span key={a.id} className="sync-chip">{body}</span>;
      })}
    </div>
  );
}
