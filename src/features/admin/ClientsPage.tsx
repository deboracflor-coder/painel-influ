import { useState, type FormEvent } from 'react';
import { ErrorState, LoadingState } from '../../components/States';
import { fmtDate } from '../../domain/format';
import { useAdminClients, useClientMutations, type ClientRow } from './queries';
import { AdminOnly, useFeedback } from './ui';

export function ClientsPage() {
  return <AdminOnly>{(orgId) => <Clients orgId={orgId} />}</AdminOnly>;
}

function Clients({ orgId }: { orgId: string }) {
  const list = useAdminClients(orgId);
  const { create } = useClientMutations(orgId);
  const fb = useFeedback();
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    fb.clear();
    try {
      await create.mutateAsync({ name, notes });
      fb.ok(`Cliente “${name.trim()}” criado.`);
      setName(''); setNotes('');
    } catch (err) { await fb.fail(err); }
  }

  return (
    <>
      <section className="section">
        <div className="section-head"><h2>Clientes da agência</h2><p className="section-sub">Cada cliente tem seus próprios perfis, dados e pessoas com acesso.</p></div>
        <form className="panel admin-form" onSubmit={(e) => void onCreate(e)}>
          <h3>Novo cliente</h3>
          <div className="form-grid">
            <label>Nome<input required minLength={2} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label>Observações (opcional)<input maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
          </div>
          <div className="admin-actions"><button className="btn btn-primary" type="submit" disabled={create.isPending}>{create.isPending ? 'Criando…' : 'Criar cliente'}</button></div>
          {fb.node}
        </form>
      </section>
      {list.isLoading ? <LoadingState /> : list.error ? <ErrorState action={<button className="btn" type="button" onClick={() => void list.refetch()}>Tentar de novo</button>} /> : (
        <div className="panel table-wrap">
          <table>
            <thead><tr><th>Cliente</th><th>Observações</th><th>Criado em</th><th><span className="sr-only">Ações</span></th></tr></thead>
            <tbody>
              {list.data!.length === 0 && <tr><td colSpan={4} className="muted">Nenhum cliente cadastrado ainda.</td></tr>}
              {list.data!.map((c) => <ClientRowView key={c.id} orgId={orgId} c={c} />)}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function ClientRowView({ orgId, c }: { orgId: string; c: ClientRow }) {
  const { update, remove } = useClientMutations(orgId);
  const fb = useFeedback();
  const [mode, setMode] = useState<'view' | 'edit' | 'delete'>('view');
  const [name, setName] = useState(c.name);
  const [notes, setNotes] = useState(c.notes ?? '');
  const [typed, setTyped] = useState('');

  async function save(e: FormEvent) {
    e.preventDefault();
    try { await update.mutateAsync({ id: c.id, name, notes }); setMode('view'); fb.clear(); } catch (err) { await fb.fail(err); }
  }
  async function del() {
    try { await remove.mutateAsync(c.id); } catch (err) { await fb.fail(err); }
  }

  if (mode === 'edit') return (
    <tr><td colSpan={4}>
      <form className="admin-inline" onSubmit={(e) => void save(e)}>
        <label>Nome<input required minLength={2} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Observações<input maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        <button className="btn btn-sm btn-primary" type="submit" disabled={update.isPending}>Salvar</button>
        <button className="btn btn-sm" type="button" onClick={() => { setMode('view'); setName(c.name); setNotes(c.notes ?? ''); }}>Cancelar</button>
      </form>{fb.node}
    </td></tr>
  );
  if (mode === 'delete') return (
    <tr><td colSpan={4}>
      <div className="callout callout-bad">
        <strong>Excluir “{c.name}”?</strong> Isso apaga de forma definitiva os perfis conectados, publicações, métricas, histórico de coleta e os acessos das pessoas deste cliente.
        <div className="admin-inline">
          <label>Digite o nome do cliente para confirmar<input value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Nome do cliente para confirmar" /></label>
          <button className="btn btn-sm btn-danger" type="button" disabled={typed.trim() !== c.name || remove.isPending} onClick={() => void del()}>Excluir definitivamente</button>
          <button className="btn btn-sm" type="button" onClick={() => { setMode('view'); setTyped(''); }}>Cancelar</button>
        </div>
      </div>{fb.node}
    </td></tr>
  );
  return (
    <tr>
      <td><b>{c.name}</b> {c.is_demo && <span className="badge badge-demo">Dados fictícios</span>}</td>
      <td className="muted">{c.notes ?? '—'}</td>
      <td className="num">{fmtDate(c.created_at.slice(0, 10))}</td>
      <td className="row-actions">
        <button className="btn btn-sm" type="button" onClick={() => setMode('edit')}>Editar</button>
        <button className="btn btn-sm" type="button" onClick={() => setMode('delete')}>Excluir</button>
      </td>
    </tr>
  );
}
