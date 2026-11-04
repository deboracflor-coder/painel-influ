import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase/client';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { useClientContext } from '../clients/ClientContext';

const PLATFORM: Record<string, string> = {
  instagram: 'Instagram', facebook: 'Facebook', youtube: 'YouTube', tiktok: 'TikTok', x: 'X', linkedin: 'LinkedIn',
};
const STATUS: Record<string, string> = {
  connected: 'Conectada', expired: 'Token expirado', revoked: 'Desconectada', error: 'Erro na coleta',
};

function fmt(ts: string | null): string {
  return ts ? new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'ainda não houve';
}

/**
 * Visão inicial da Fase 2: mostra as contas sociais do cliente com o estado
 * real do banco. Indicadores e gráficos chegam na Fase 3.
 */
export function OverviewPage() {
  const { current, clients, isLoading, error, refetch } = useClientContext();
  const accounts = useQuery({
    queryKey: ['social_accounts', current?.id],
    enabled: !!current,
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('social_accounts')
        .select('id, platform, handle, display_name, status, last_synced_at, sync_frequency_minutes')
        .eq('client_id', current!.id)
        .order('platform');
      if (err) throw err;
      return data;
    },
  });

  if (isLoading) return <LoadingState label="Carregando clientes…" />;
  if (error) return <ErrorState detail="Verifique sua conexão." action={<button className="btn" onClick={refetch}>Tentar de novo</button>} />;
  if (!clients.length) {
    return (
      <EmptyState title="Nenhum cliente liberado para você">
        Peça a um administrador da agência para vincular seu usuário a um cliente.
      </EmptyState>
    );
  }
  if (accounts.isLoading) return <LoadingState label="Carregando contas…" />;
  if (accounts.error) return <ErrorState action={<button className="btn" onClick={() => void accounts.refetch()}>Tentar de novo</button>} />;

  const rows = accounts.data ?? [];
  return (
    <section className="panel" aria-labelledby="accounts-title">
      <h3 id="accounts-title">Redes conectadas</h3>
      {rows.length === 0 ? (
        <div className="empty">
          <strong>Nenhuma rede conectada para {current?.name}</strong>
          <span>A conexão com Instagram, Facebook e YouTube entra na Fase 4. Até lá, nenhum número é exibido.</span>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Rede</th><th>Perfil</th><th>Situação</th><th>Última coleta</th><th className="n">Coleta a cada</th></tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td>{PLATFORM[a.platform] ?? a.platform}</td>
                  <td>{a.display_name ?? a.handle ?? '—'}</td>
                  <td>{STATUS[a.status] ?? a.status}</td>
                  <td>{fmt(a.last_synced_at)}</td>
                  <td className="n">{Math.round(a.sync_frequency_minutes / 60)} h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
