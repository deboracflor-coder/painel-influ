import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ManualBadge } from '../../components/Kpi';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { fmtDate, fmtInt, PLATFORM_LABEL } from '../../domain/format';
import { type ImportResult, parseImportCsv, TEMPLATE_CSV } from '../../domain/importCsv';
import { todayISO } from '../../domain/periods';
import { supabase } from '../../lib/supabase/client';
import type { Json } from '../../types/database';
import { useFeedback } from '../admin/ui';
import { useClientContext } from '../clients/ClientContext';
import { useAccess } from '../clients/queries';
import { useAccounts } from '../data/queries';

function useManualDays(accountId: string) {
  return useQuery({
    queryKey: ['manual_days', accountId],
    enabled: !!accountId,
    queryFn: async () => {
      const { data, error } = await supabase.from('account_daily_metrics').select('day, followers, reach, impressions, views, profile_visits')
        .eq('account_id', accountId).in('source', ['manual', 'import']).order('day', { ascending: false }).limit(1000);
      if (error) throw error;
      return data;
    },
  });
}

function downloadTemplate() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([TEMPLATE_CSV], { type: 'text/csv;charset=utf-8' }));
  a.download = 'modelo-importacao-serie-diaria.csv';
  document.body.appendChild(a); a.click(); a.remove();
}

export function ImportPage() {
  const access = useAccess();
  const { current } = useClientContext();
  const accounts = useAccounts(current?.id);
  const [accountId, setAccountId] = useState('');
  const [parsed, setParsed] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState('');
  const [range, setRange] = useState({ from: '', to: '' });
  const fb = useFeedback();
  const qc = useQueryClient();
  const list = accounts.data ?? [];
  const acc = list.find((a) => a.id === accountId) ?? null;
  const manual = useManualDays(acc?.id ?? '');
  const refresh = () => Promise.all(['manual_days', 'daily'].map((k) => qc.invalidateQueries({ queryKey: [k] })));

  const send = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('import_daily_metrics', { p_account: acc!.id, p_rows: parsed!.rows as unknown as Json });
      if (error) throw error;
      return data as { inserted: number; updated: number; skipped_api: number };
    },
    onSuccess: async (r) => {
      await refresh();
      setParsed(null); setFileName('');
      fb.ok(`Importação concluída: ${r.inserted} dia(s) novo(s), ${r.updated} substituído(s)${r.skipped_api ? `, ${r.skipped_api} pulado(s) porque já vieram da API` : ''}.`);
    },
    onError: (e) => fb.fail(e),
  });
  const remove = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('delete_manual_daily', { p_account: acc!.id, p_from: range.from, p_to: range.to });
      if (error) throw error;
      return data as number;
    },
    onSuccess: async (n) => { await refresh(); fb.ok(`${n} lançamento(s) manual(is) apagado(s).`); },
    onError: (e) => fb.fail(e),
  });

  const kind = access.data?.kind;
  if (access.isLoading || accounts.isLoading) return <LoadingState />;
  if (kind !== 'org_admin' && kind !== 'org_analyst') return <EmptyState title="Área da agência">A importação manual é feita pela equipe da agência.</EmptyState>;
  if (!current) return <EmptyState title="Nenhum cliente selecionado" />;
  if (accounts.error) return <ErrorState action={<button className="btn" type="button" onClick={() => void accounts.refetch()}>Tentar de novo</button>} />;
  if (!list.length) return <EmptyState title="Nenhuma conta deste cliente">Conecte uma conta em “Contas conectadas” antes de lançar dados manuais.</EmptyState>;

  async function onFile(f: File | undefined) {
    fb.clear();
    if (!f) return;
    if (f.size > 2_000_000) { fb.failText('Arquivo maior que 2 MB.'); return; }
    setFileName(f.name);
    setParsed(parseImportCsv(await f.text(), todayISO()));
  }

  return (
    <>
      <section className="section">
        <div className="section-head"><h2>Importação manual da série diária</h2><p className="section-sub">Para números que a API não entrega, como seguidores de antes da conexão. Tudo o que entra aqui aparece com o selo <ManualBadge />.</p></div>
        <div className="panel admin-form">
          <div className="form-grid">
            <label>Conta
              <select value={accountId} onChange={(e) => { setAccountId(e.target.value); setParsed(null); fb.clear(); }}>
                <option value="">Escolha a conta</option>
                {list.map((a) => <option key={a.id} value={a.id}>{PLATFORM_LABEL[a.platform]} {a.handle ?? a.display_name ?? ''}</option>)}
              </select>
            </label>
            <label>Arquivo CSV
              <input type="file" accept=".csv,text/csv" disabled={!acc} onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
          </div>
          <div className="admin-actions"><button className="btn btn-sm" type="button" onClick={downloadTemplate}>Baixar modelo (CSV)</button></div>
          <ul className="report-notes">
            <li>Colunas: <code>data</code> (DD/MM/AAAA) e pelo menos uma entre <code>seguidores</code>, <code>alcance</code>, <code>impressoes</code>, <code>visualizacoes</code>, <code>visitas_perfil</code>. Célula vazia = sem dado.</li>
            <li>Dias que já vieram da API não são alterados. Importar o mesmo dia de novo substitui o lançamento manual anterior.</li>
            <li>Cada importação fica registrada na auditoria, com quem fez e quando.</li>
          </ul>
          {parsed && (
            <div className="import-preview">
              <p><b>{fileName}</b>: {fmtInt(parsed.rows.length)} linha(s) válida(s){parsed.errors.length ? `, ${parsed.errors.length} problema(s)` : ''}.</p>
              {parsed.errors.length > 0 && <ul className="form-error">{parsed.errors.slice(0, 20).map((e) => <li key={e}>{e}</li>)}{parsed.errors.length > 20 && <li>… e mais {parsed.errors.length - 20}.</li>}</ul>}
              {parsed.rows.length > 0 && (
                <div className="table-wrap"><table>
                  <thead><tr><th>Dia</th><th className="n">Seguidores</th><th className="n">Alcance</th><th className="n">Impressões</th><th className="n">Visualizações</th><th className="n">Visitas ao perfil</th></tr></thead>
                  <tbody>{parsed.rows.slice(0, 10).map((r) => <tr key={r.day}><td>{fmtDate(r.day)}</td><td className="n">{fmtInt(r.followers)}</td><td className="n">{fmtInt(r.reach)}</td><td className="n">{fmtInt(r.impressions)}</td><td className="n">{fmtInt(r.views)}</td><td className="n">{fmtInt(r.profile_visits)}</td></tr>)}</tbody>
                </table></div>
              )}
              {parsed.rows.length > 10 && <p className="small muted">Mostrando 10 de {parsed.rows.length}.</p>}
              <div className="admin-actions">
                <button className="btn btn-primary" type="button" disabled={!parsed.rows.length || parsed.errors.length > 0 || send.isPending} onClick={() => send.mutate()}>
                  {send.isPending ? 'Importando…' : `Importar ${parsed.rows.length} dia(s)`}
                </button>
                <button className="btn" type="button" onClick={() => { setParsed(null); setFileName(''); }}>Cancelar</button>
              </div>
              {parsed.errors.length > 0 && <p className="small muted">Corrija o arquivo e envie de novo: nada é importado enquanto houver problema.</p>}
            </div>
          )}
          {fb.node}
        </div>
      </section>
      {acc && (
        <section className="section">
          <div className="section-head"><h2>Lançamentos manuais desta conta</h2><p className="section-sub">{fmtInt(manual.data?.length ?? 0)} dia(s)</p></div>
          {manual.data && manual.data.length > 0 ? (
            <div className="panel">
              <div className="table-wrap"><table>
                <thead><tr><th>Dia</th><th className="n">Seguidores</th><th className="n">Alcance</th><th className="n">Impressões</th><th className="n">Visualizações</th><th className="n">Visitas ao perfil</th></tr></thead>
                <tbody>{manual.data.slice(0, 60).map((r) => <tr key={r.day}><td>{fmtDate(r.day)}</td><td className="n">{fmtInt(r.followers)}</td><td className="n">{fmtInt(r.reach)}</td><td className="n">{fmtInt(r.impressions)}</td><td className="n">{fmtInt(r.views)}</td><td className="n">{fmtInt(r.profile_visits)}</td></tr>)}</tbody>
              </table></div>
              <div className="admin-inline">
                <label>De<input type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} /></label>
                <label>Até<input type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} /></label>
                <button className="btn btn-sm btn-danger" type="button" disabled={!range.from || !range.to || range.from > range.to || remove.isPending} onClick={() => { fb.clear(); remove.mutate(); }}>Apagar lançamentos manuais do intervalo</button>
              </div>
              <p className="small muted">Apaga só o que foi lançado à mão; dados da API não são afetados.</p>
            </div>
          ) : <EmptyState title="Nenhum lançamento manual">Os dias importados aparecem aqui.</EmptyState>}
        </section>
      )}
    </>
  );
}
