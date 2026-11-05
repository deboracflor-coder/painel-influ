import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import type { Table } from '../../domain/report';
import { supabase } from '../../lib/supabase/client';
import { useAuth } from '../auth/AuthProvider';
import { useFeedback } from '../admin/ui';
import { useClientContext } from '../clients/ClientContext';

const RETURN: Record<string, [boolean, string]> = {
  ok: [true, 'Conta Google conectada. Agora é só exportar.'],
  cancelada: [false, 'A conexão com o Google foi cancelada.'],
  erro: [false, 'Não foi possível conectar ao Google. Tente de novo.'],
};

/** Exporta as tabelas do relatório para uma planilha nova no Google Drive da própria pessoa. */
export function SheetsExport({ title, tables }: { title: string; tables: Table[] }) {
  const { session } = useAuth();
  const { current } = useClientContext();
  const [params, setParams] = useSearchParams();
  const fb = useFeedback();
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ['user_integrations', session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.from('user_integrations').select('provider, connected_at').eq('provider', 'google_sheets').maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const connect = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke<{ url: string }>('oauth-start', {
        body: { client_id: current!.id, provider: 'google_sheets', app_origin: window.location.origin },
      });
      if (error) throw error;
      window.location.assign(data!.url);
    },
    onError: (e) => fb.fail(e),
  });
  const exp = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke<{ url: string }>('sheets-export', { body: { action: 'export', title, tables } });
      if (error) throw error;
      return data!.url;
    },
    onError: async (e) => { await fb.fail(e); void qc.invalidateQueries({ queryKey: ['user_integrations'] }); },
  });
  const disconnect = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke('sheets-export', { body: { action: 'disconnect' } });
      if (error) throw error;
    },
    onSuccess: () => { fb.ok('Conta Google desconectada.'); void qc.invalidateQueries({ queryKey: ['user_integrations'] }); },
    onError: (e) => fb.fail(e),
  });

  const ret = params.get('sheets');
  const retMsg = ret ? RETURN[ret] : null;
  const busy = connect.isPending || exp.isPending || disconnect.isPending;
  return (
    <>
      {status.data
        ? <>
            <button className="btn" type="button" disabled={busy} onClick={() => { fb.clear(); exp.reset(); exp.mutate(); }}>{exp.isPending ? 'Exportando…' : 'Exportar para Google Sheets'}</button>
            <button className="btn btn-sm" type="button" disabled={busy} onClick={() => { fb.clear(); disconnect.mutate(); }}>Desconectar Google</button>
          </>
        : <button className="btn" type="button" disabled={busy || status.isLoading} onClick={() => { fb.clear(); connect.mutate(); }}>Conectar Google Sheets</button>}
      <div className="report-feedback">
        {exp.data && <p className="form-notice" role="status">Planilha criada no seu Google Drive: <a href={exp.data} target="_blank" rel="noreferrer noopener">abrir planilha</a></p>}
        {retMsg && !exp.data && <p className={retMsg[0] ? 'form-notice' : 'form-error'} role="status">{retMsg[1]} <button className="btn btn-sm" type="button" onClick={() => setParams((p) => { p.delete('sheets'); return p; })}>Fechar</button></p>}
        {fb.node}
      </div>
    </>
  );
}
