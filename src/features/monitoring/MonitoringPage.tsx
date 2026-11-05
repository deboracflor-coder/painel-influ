import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { fmtDateTime, fmtInt, PLATFORM_LABEL } from '../../domain/format';
import { supabase } from '../../lib/supabase/client';
import { useAccess } from '../clients/queries';

const DAY = 86_400_000;
/** Atraso tolerado além da próxima coleta prevista (o agendador passa a cada 15 min). */
const LATE_MS = 45 * 60_000;

function useMonitoring(enabled: boolean) {
  return useQuery({
    queryKey: ['monitoring'],
    enabled,
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * DAY).toISOString();
      const [acc, clients, runs, errs] = await Promise.all([
        supabase.from('social_accounts').select('id, client_id, platform, handle, display_name, status, sync_enabled, last_synced_at, next_sync_at, last_error'),
        supabase.from('clients').select('id, name, is_demo'),
        supabase.from('sync_runs').select('account_id, status, queued_at').gte('queued_at', since).order('queued_at', { ascending: false }).limit(5000),
        supabase.from('sync_errors').select('account_id, code, created_at').gte('created_at', new Date(Date.now() - DAY).toISOString()).limit(5000),
      ]);
      for (const r of [acc, clients, runs, errs]) if (r.error) throw r.error;
      return { accounts: acc.data!, clients: clients.data!, runs: runs.data!, errors: errs.data! };
    },
  });
}

type Health = 'ok' | 'late' | 'failing' | 'expired' | 'off';
const HEALTH: Record<Health, [string, string, number]> = {
  expired: ['pill-bad', 'Acesso expirado', 0],
  failing: ['pill-bad', 'Falhando', 1],
  late: ['pill-warn', 'Atrasada', 2],
  off: ['pill-neutral', 'Coleta desligada', 3],
  ok: ['pill-good', 'Em dia', 4],
};

export function MonitoringPage() {
  const access = useAccess();
  const isAgency = access.data?.kind === 'org_admin' || access.data?.kind === 'org_analyst';
  const q = useMonitoring(isAgency);
  if (access.isLoading) return <LoadingState />;
  if (!isAgency) return <EmptyState title="Área da agência">O monitoramento das coletas é acompanhado pela equipe da agência.</EmptyState>;
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState action={<button className="btn" type="button" onClick={() => void q.refetch()}>Tentar de novo</button>} />;

  const { accounts, clients, runs, errors } = q.data!;
  const now = q.dataUpdatedAt;
  const clientName = new Map(clients.map((c) => [c.id, c.is_demo ? `${c.name} (fictício)` : c.name]));
  const day = runs.filter((r) => Date.parse(r.queued_at) >= now - DAY);
  const count = (s: string) => day.filter((r) => r.status === s).length;

  const rows = accounts.map((a) => {
    const mine = runs.filter((r) => r.account_id === a.id);
    const last = mine[0];
    const health: Health =
      a.status === 'expired' || a.status === 'revoked' ? (a.status === 'revoked' ? 'off' : 'expired')
      : a.status === 'error' || last?.status === 'error' ? 'failing'
      : !a.sync_enabled ? 'off'
      : a.next_sync_at && Date.parse(a.next_sync_at) < now - LATE_MS ? 'late'
      : 'ok';
    return {
      a, health, last,
      runs7: mine.length, fails7: mine.filter((r) => r.status === 'error').length,
      errors24: errors.filter((e) => e.account_id === a.id).length,
    };
  }).sort((x, y) => HEALTH[x.health][2] - HEALTH[y.health][2] || (clientName.get(x.a.client_id) ?? '').localeCompare(clientName.get(y.a.client_id) ?? '', 'pt-BR'));

  const by = (h: Health) => rows.filter((r) => r.health === h).length;

  return (
    <>
      <section className="section">
        <div className="section-head"><h2>Coletas de todos os clientes</h2><p className="section-sub">Contas dos clientes que você acompanha. A tela se atualiza a cada 60 s.</p></div>
        <div className="grid grid-kpi">
          <div className="kpi"><span className="kpi-label">Contas em dia</span><b className="kpi-value">{fmtInt(by('ok'))}</b><span className="kpi-foot">de {fmtInt(rows.length)} contas</span></div>
          <div className="kpi"><span className="kpi-label">Precisam de atenção</span><b className="kpi-value">{fmtInt(by('expired') + by('failing') + by('late'))}</b><span className="kpi-foot">{by('expired')} expiradas · {by('failing')} falhando · {by('late')} atrasadas</span></div>
          <div className="kpi"><span className="kpi-label">Coletas nas últimas 24 h</span><b className="kpi-value">{fmtInt(day.length)}</b><span className="kpi-foot">{count('success')} ok · {count('partial')} com avisos · {count('error')} com erro</span></div>
          <div className="kpi"><span className="kpi-label">Erros nas últimas 24 h</span><b className="kpi-value">{fmtInt(errors.length)}</b><span className="kpi-foot">inclui avisos de métrica indisponível</span></div>
        </div>
        {by('late') > 0 && <div className="callout callout-warn" role="status">Há contas com coleta atrasada. Se várias atrasarem ao mesmo tempo, confira se o agendador está ligado (veja o passo 4 de docs/runbooks/integracoes.md).</div>}
      </section>
      <section className="section">
        {rows.length === 0 ? <EmptyState title="Nenhuma conta conectada ainda">As contas aparecem aqui assim que forem conectadas em “Contas conectadas”.</EmptyState> : (
          <div className="panel table-wrap">
            <table>
              <thead><tr><th>Cliente</th><th>Conta</th><th>Situação</th><th>Última coleta</th><th>Próxima</th><th className="n">Coletas (7 dias)</th><th className="n">Falhas (7 dias)</th><th className="n">Erros (24 h)</th><th>Último erro</th></tr></thead>
              <tbody>{rows.map(({ a, health, runs7, fails7, errors24 }) => {
                const [cls, label] = HEALTH[health];
                return (
                  <tr key={a.id}>
                    <td><Link to={{ pathname: '/historico', search: `?cliente=${a.client_id}` }}>{clientName.get(a.client_id) ?? '—'}</Link></td>
                    <td><i className="dot" style={{ background: `var(--p-${a.platform})` }} /> {PLATFORM_LABEL[a.platform]} {a.handle ?? a.display_name ?? ''}</td>
                    <td><span className={`pill ${cls}`}>{label}</span></td>
                    <td className="small">{fmtDateTime(a.last_synced_at)}</td>
                    <td className="small">{a.status === 'connected' && a.sync_enabled ? fmtDateTime(a.next_sync_at) : '—'}</td>
                    <td className="n">{fmtInt(runs7)}</td><td className="n">{fmtInt(fails7)}</td><td className="n">{fmtInt(errors24)}</td>
                    <td className="small muted" style={{ maxWidth: 280 }}>{a.last_error ?? '—'}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
