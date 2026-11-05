import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { fmtDateTime, PLATFORM_LABEL } from '../../domain/format';
import { supabase } from '../../lib/supabase/client';
import { ConfirmButton, useFeedback } from '../admin/ui';
import { useClientContext } from '../clients/ClientContext';
import { useAccess } from '../clients/queries';
import { type Account, useAccounts } from '../data/queries';

const STATUS: Record<string, [string, string]> = {
  connected: ['pill-good', 'Conectada'],
  expired: ['pill-bad', 'Acesso expirado'],
  revoked: ['pill-neutral', 'Desconectada'],
  error: ['pill-bad', 'Erro de permissão'],
};
const FREQ = [[60, 'A cada 1 hora'], [180, 'A cada 3 horas'], [360, 'A cada 6 horas'], [720, 'A cada 12 horas'], [1440, 'Uma vez por dia']] as const;
const RETURN_MSG: Record<string, [boolean, string]> = {
  ok: [true, 'Conexão concluída. A primeira coleta começa em até 15 minutos, ou use “Coletar agora”.'],
  cancelada: [false, 'A conexão foi cancelada na tela da rede social. Nada foi alterado.'],
  nenhuma: [false, 'A autorização foi feita, mas nenhuma conta comercial foi encontrada. No Instagram, a conta precisa ser profissional e estar ligada a uma Página do Facebook.'],
  erro: [false, 'Não foi possível concluir a conexão. Tente de novo; se persistir, confira as permissões concedidas.'],
};
type Provider = 'meta' | 'google';
const providerOf = (p: string): Provider => (p === 'youtube' ? 'google' : 'meta');

function useCatalog() {
  return useQuery({
    queryKey: ['metric_catalog'],
    staleTime: 60 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('metric_catalog').select('platform, scope, metric, available, note').order('platform').order('scope').order('metric');
      if (error) throw error;
      return data;
    },
  });
}

export function AccountsPage() {
  const access = useAccess();
  const { current } = useClientContext();
  const accounts = useAccounts(current?.id);
  const catalog = useCatalog();
  const [params, setParams] = useSearchParams();
  const fb = useFeedback();
  const qc = useQueryClient();
  const refresh = () => Promise.all(['social_accounts', 'sync_history', 'posts', 'daily'].map((k) => qc.invalidateQueries({ queryKey: [k] })));

  const start = useMutation({
    mutationFn: async (provider: Provider) => {
      const { data, error } = await supabase.functions.invoke<{ url: string }>('oauth-start', {
        body: { client_id: current!.id, provider, app_origin: window.location.origin },
      });
      if (error) throw error;
      window.location.assign(data!.url);
    },
    onError: (e) => fb.fail(e),
  });
  const action = useMutation({
    mutationFn: async (v: { account_id: string; action: 'sync' | 'disconnect' }) => {
      const { data, error } = await supabase.functions.invoke<{ status: string; posts?: number; error?: string }>('account-actions', { body: v });
      if (error) throw error;
      return data!;
    },
    onSuccess: async (d, v) => {
      await refresh();
      if (v.action === 'disconnect') fb.ok('Conta desconectada. O acesso guardado foi apagado; os dados já coletados continuam no painel.');
      else if (d.status === 'error') fb.failText(`A coleta falhou: ${d.error ?? 'erro desconhecido'}. Detalhes no histórico de coleta.`);
      else fb.ok(d.status === 'partial' ? 'Coleta concluída com avisos: algumas métricas não vieram. Detalhes no histórico de coleta.' : 'Coleta concluída.');
    },
    onError: (e) => fb.fail(e),
  });
  const settings = useMutation({
    mutationFn: async (v: { id: string; sync_enabled?: boolean; sync_frequency_minutes?: number }) => {
      const { id, ...patch } = v;
      const { error } = await supabase.from('social_accounts').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e) => fb.fail(e),
  });

  const kind = access.data?.kind;
  if (access.isLoading) return <LoadingState />;
  if (kind !== 'org_admin' && kind !== 'org_analyst') return <EmptyState title="Área da agência">A conexão das redes é feita pela equipe da agência.</EmptyState>;
  if (!current) return <EmptyState title="Nenhum cliente selecionado" />;
  if (accounts.isLoading) return <LoadingState />;
  if (accounts.error) return <ErrorState action={<button className="btn" type="button" onClick={() => void accounts.refetch()}>Tentar de novo</button>} />;

  const ret = params.get('conexao');
  const retMsg = ret ? RETURN_MSG[ret] : null;
  const busy = start.isPending || action.isPending;
  const list = accounts.data ?? [];

  return (
    <>
      {retMsg && (
        <div className={`callout ${retMsg[0] ? 'callout-info' : 'callout-warn'}`} role="status">
          {retMsg[1]}
          {ret === 'ok' && params.get('contas') && <> Contas conectadas: {params.get('contas')}.</>}
          {params.get('outras') && <> {params.get('outras')} conta(s) já estavam ligadas a outro cliente e foram ignoradas.</>}
          {' '}<button className="btn btn-sm" type="button" onClick={() => setParams((p) => { ['conexao', 'contas', 'outras'].forEach((k) => p.delete(k)); return p; })}>Fechar</button>
        </div>
      )}
      <section className="section">
        <div className="section-head"><h2>Conectar redes de {current.name}</h2><p className="section-sub">A autorização é feita na tela oficial de cada rede. Guardamos o acesso de forma criptografada; ele nunca passa pelo navegador.</p></div>
        <div className="panel admin-form">
          <div className="admin-actions" style={{ flexWrap: 'wrap' }}>
            <button className="btn btn-primary" type="button" disabled={busy} onClick={() => { fb.clear(); start.mutate('meta'); }}>Conectar Instagram e Facebook</button>
            <button className="btn btn-primary" type="button" disabled={busy} onClick={() => { fb.clear(); start.mutate('google'); }}>Conectar YouTube</button>
          </div>
          <p className="small muted">Instagram precisa ser conta profissional ligada a uma Página do Facebook. Na tela da Meta, escolha só as páginas deste cliente.</p>
          {fb.node}
        </div>
      </section>
      <section className="section">
        <div className="section-head"><h2>Contas</h2><p className="section-sub">A coleta automática roda a cada 15 minutos e atende as contas cuja próxima coleta já chegou.</p></div>
        {list.length === 0 ? <EmptyState title="Nenhuma conta conectada">Use os botões acima para conectar as redes deste cliente.</EmptyState> : (
          <div className="panel table-wrap">
            <table>
              <thead><tr><th>Conta</th><th>Situação</th><th>Coletas</th><th>Coleta automática</th><th><span className="sr-only">Ações</span></th></tr></thead>
              <tbody>{list.map((a) => <Row key={a.id} a={a} busy={busy || settings.isPending}
                onSync={() => { fb.clear(); action.mutate({ account_id: a.id, action: 'sync' }); }}
                onDisconnect={() => { fb.clear(); action.mutate({ account_id: a.id, action: 'disconnect' }); }}
                onReconnect={() => { fb.clear(); start.mutate(providerOf(a.platform)); }}
                onSettings={(p) => settings.mutate({ id: a.id, ...p })} />)}</tbody>
            </table>
          </div>
        )}
      </section>
      <section className="section">
        <div className="section-head"><h2>O que cada rede entrega</h2><p className="section-sub">Conforme a documentação oficial. Métrica marcada como indisponível aparece no painel como “Indisponível”, nunca como zero.</p></div>
        {catalog.data && (
          <div className="panel table-wrap">
            <table>
              <thead><tr><th>Rede</th><th>Nível</th><th>Métrica</th><th>Disponível</th><th>Observação</th></tr></thead>
              <tbody>{catalog.data.map((m) => (
                <tr key={`${m.platform}-${m.scope}-${m.metric}`}>
                  <td>{PLATFORM_LABEL[m.platform]}</td><td>{m.scope === 'post' ? 'Publicação' : 'Conta'}</td><td>{METRIC_LABEL[m.metric] ?? m.metric}</td>
                  <td>{m.available ? <span className="pill pill-good">Sim</span> : <span className="pill pill-neutral">Não</span>}</td>
                  <td className="small muted">{m.note ?? ''}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

const METRIC_LABEL: Record<string, string> = {
  views: 'Visualizações', reach: 'Alcance', impressions: 'Impressões', likes: 'Curtidas/reações', comments: 'Comentários',
  shares: 'Compartilhamentos', saves: 'Salvamentos', watch_time_seconds: 'Tempo de exibição', avg_watch_time_seconds: 'Tempo médio de exibição',
  profile_visits: 'Visitas ao perfil', follows: 'Novos seguidores pela publicação', link_clicks: 'Cliques no link',
  followers: 'Seguidores/inscritos', followers_gained: 'Inscritos ganhos',
};

function Row({ a, busy, onSync, onDisconnect, onReconnect, onSettings }: {
  a: Account; busy: boolean; onSync: () => void; onDisconnect: () => void; onReconnect: () => void;
  onSettings: (p: { sync_enabled?: boolean; sync_frequency_minutes?: number }) => void;
}) {
  const [cls, label] = STATUS[a.status] ?? ['pill-neutral', a.status];
  const connected = a.status === 'connected';
  return (
    <tr>
      <td><i className="dot" style={{ background: `var(--p-${a.platform})` }} /> <b>{PLATFORM_LABEL[a.platform]}</b> {a.handle ?? a.display_name ?? ''}</td>
      <td><span className={`pill ${cls}`}>{label}</span>{a.last_error && <div className="small muted" style={{ maxWidth: 260 }}>{a.last_error}</div>}</td>
      <td className="small">
        <div>Última: {a.last_synced_at ? fmtDateTime(a.last_synced_at) : 'ainda não coletada'}</div>
        <div className="muted">Próxima: {connected && a.sync_enabled && a.next_sync_at ? fmtDateTime(a.next_sync_at) : '—'}</div>
      </td>
      <td>
        <select aria-label={`Frequência de ${PLATFORM_LABEL[a.platform]}`} value={a.sync_frequency_minutes} disabled={busy || a.status === 'revoked'}
          onChange={(e) => onSettings({ sync_frequency_minutes: Number(e.target.value) })}>
          {FREQ.map(([m, l]) => <option key={m} value={m}>{l}</option>)}
          {!FREQ.some(([m]) => m === a.sync_frequency_minutes) && <option value={a.sync_frequency_minutes}>{a.sync_frequency_minutes} min</option>}
        </select>
        <div><label className="small"><input type="checkbox" checked={a.sync_enabled} disabled={busy || a.status === 'revoked'} onChange={(e) => onSettings({ sync_enabled: e.target.checked })} /> ligada</label></div>
      </td>
      <td className="row-actions">
        {connected && <button className="btn btn-sm" type="button" disabled={busy} onClick={onSync}>Coletar agora</button>}
        {!connected && <button className="btn btn-sm" type="button" disabled={busy} onClick={onReconnect}>Reconectar</button>}
        {a.status !== 'revoked' && <ConfirmButton label="Desconectar" confirmLabel="Confirmar" disabled={busy} onConfirm={onDisconnect} />}
      </td>
    </tr>
  );
}
