import { useAccess } from '../clients/queries';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { fmtDateTime, fmtInt, PLATFORM_LABEL } from '../../domain/format';
import { useClientContext } from '../clients/ClientContext';
import { useAccounts, useSyncHistory } from '../data/queries';

const STATUS: Record<string, [string, string]> = {
  queued: ['pill-neutral', 'Na fila'], running: ['pill-accent', 'Coletando'], success: ['pill-good', 'Concluída'],
  partial: ['pill-warn', 'Parcial'], error: ['pill-bad', 'Falhou'],
};
const TRIGGER: Record<string, string> = { cron: 'Agendada', manual: 'Manual', retry: 'Nova tentativa' };
const ERROR_CODE: Record<string, string> = {
  token_expired: 'Acesso expirado', rate_limited: 'Limite da API atingido', permission_missing: 'Permissão ausente',
  metric_unavailable: 'Métrica indisponível', network: 'Falha de rede', unknown: 'Erro desconhecido',
};

export function SyncHistoryPage() {
  const { current } = useClientContext();
  const accounts = useAccounts(current?.id);
  const history = useSyncHistory(current?.id);
  const access = useAccess();
  if (access.data && access.data.kind !== 'org_admin' && access.data.kind !== 'org_analyst') {
    return <EmptyState title="Área da agência">O histórico de coleta é acompanhado pela equipe da agência.</EmptyState>;
  }
  if (!current) return <EmptyState title="Nenhum cliente selecionado" />;
  if (history.isLoading || accounts.isLoading) return <LoadingState />;
  if (history.error || accounts.error) return <ErrorState action={<button className="btn" type="button" onClick={() => void history.refetch()}>Tentar de novo</button>} />;

  const acc = new Map((accounts.data ?? []).map((a) => [a.id, a]));
  const name = (id: string) => { const a = acc.get(id); return a ? `${PLATFORM_LABEL[a.platform]} ${a.handle ?? ''}` : '—'; };
  const { runs, errors } = history.data!;

  return (
    <>
      <section className="section">
        <div className="section-head"><h2>Sincronizações</h2><p className="section-sub">Últimas 100 coletas das contas deste cliente</p></div>
        {runs.length === 0 ? <EmptyState title="Nenhuma coleta registrada ainda">As coletas aparecem aqui assim que as contas forem conectadas.</EmptyState> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Início</th><th>Conta</th><th>Origem</th><th>Situação</th><th className="n">Tentativa</th><th className="n">Chamadas à API</th><th className="n">Publicações</th><th className="n">Métricas gravadas</th><th>Fim</th></tr></thead>
            <tbody>{runs.map((r) => {
              const [cls, label] = STATUS[r.status] ?? ['pill-neutral', r.status];
              return (
                <tr key={r.id}>
                  <td>{fmtDateTime(r.started_at ?? r.queued_at)}</td><td>{name(r.account_id)}</td><td>{TRIGGER[r.trigger] ?? r.trigger}</td>
                  <td><span className={`pill ${cls}`}>{label}</span></td><td className="n">{r.attempt}</td><td className="n">{fmtInt(r.api_calls)}</td>
                  <td className="n">{fmtInt(r.posts_upserted)}</td><td className="n">{fmtInt(r.snapshots_written)}</td><td>{fmtDateTime(r.finished_at)}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </section>
      <section className="section">
        <div className="section-head"><h2>Erros de integração</h2></div>
        {errors.length === 0 ? <EmptyState title="Nenhum erro registrado" /> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Quando</th><th>Conta</th><th>Tipo</th><th>Mensagem</th><th className="n">HTTP</th><th>Nova tentativa</th></tr></thead>
            <tbody>{errors.map((e) => (
              <tr key={e.id}>
                <td>{fmtDateTime(e.created_at)}</td><td>{name(e.account_id)}</td><td>{ERROR_CODE[e.code] ?? e.code}</td>
                <td className="wrap">{e.message}</td><td className="n">{e.http_status ?? '—'}</td><td>{e.retryable ? 'Sim' : 'Não'}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </>
  );
}
