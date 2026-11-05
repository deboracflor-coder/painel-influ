import { useState, type FormEvent } from 'react';
import { ErrorState, LoadingState } from '../../components/States';
import { useAuth } from '../auth/AuthProvider';
import { useAdminClients, useTeam, useTeamMutations, type ClientRow, type InviteKind, type Member } from './queries';
import { AdminOnly, ConfirmButton, useFeedback } from './ui';

const KIND_LABEL: Record<InviteKind, string> = {
  org_admin: 'Agência · administração',
  org_analyst: 'Agência · análise',
  client_viewer: 'Cliente (só leitura)',
};

export function PeoplePage() {
  return <AdminOnly>{(orgId) => <People orgId={orgId} />}</AdminOnly>;
}

function People({ orgId }: { orgId: string }) {
  const team = useTeam(orgId);
  const clients = useAdminClients(orgId);
  if (team.isLoading || clients.isLoading) return <LoadingState />;
  if (team.error || clients.error) return <ErrorState action={<button className="btn" type="button" onClick={() => { void team.refetch(); void clients.refetch(); }}>Tentar de novo</button>} />;
  const cl = clients.data!;
  const { members, clientUsers } = team.data!;
  return (
    <>
      <InviteForm orgId={orgId} clients={cl} />
      <section className="section">
        <div className="section-head"><h2>Equipe da agência</h2><p className="section-sub">Administradores veem todos os clientes. Analistas veem só os clientes marcados.</p></div>
        <div className="panel table-wrap">
          <table>
            <thead><tr><th>Pessoa</th><th>Papel</th><th>Clientes liberados</th><th><span className="sr-only">Ações</span></th></tr></thead>
            <tbody>{members.map((m) => <MemberRow key={m.user_id} orgId={orgId} m={m} clients={cl} />)}</tbody>
          </table>
        </div>
      </section>
      <section className="section">
        <div className="section-head"><h2>Pessoas dos clientes</h2><p className="section-sub">Acesso só de leitura ao painel do próprio cliente.</p></div>
        <div className="panel table-wrap">
          <table>
            <thead><tr><th>Pessoa</th><th>Cliente</th><th><span className="sr-only">Ações</span></th></tr></thead>
            <tbody>
              {clientUsers.length === 0 && <tr><td colSpan={3} className="muted">Nenhuma pessoa de cliente convidada ainda.</td></tr>}
              {clientUsers.map((u) => <ClientUserRow key={`${u.user_id}-${u.client_id}`} orgId={orgId} u={u} clientName={cl.find((c) => c.id === u.client_id)?.name ?? '—'} />)}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function PersonCell({ p }: { p: { full_name: string | null; email: string | null } }) {
  return <td><b>{p.full_name ?? p.email ?? 'Sem nome'}</b>{p.full_name && p.email && <div className="small muted">{p.email}</div>}</td>;
}

function InviteForm({ orgId, clients }: { orgId: string; clients: ClientRow[] }) {
  const { invite } = useTeamMutations(orgId);
  const fb = useFeedback();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [kind, setKind] = useState<InviteKind>('org_analyst');
  const [clientId, setClientId] = useState('');
  const [assigned, setAssigned] = useState<string[]>([]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    fb.clear();
    try {
      const res = await invite.mutateAsync({
        email, full_name: fullName, kind,
        client_id: kind === 'client_viewer' ? clientId : undefined,
        assign_client_ids: kind === 'org_analyst' ? assigned : undefined,
      });
      fb.ok(res?.invited
        ? `Convite enviado para ${email.trim()}. A pessoa recebe um e-mail para definir a senha.`
        : `${email.trim()} já tinha cadastro; o acesso foi liberado.`);
      setEmail(''); setFullName(''); setAssigned([]);
    } catch (err) { await fb.fail(err); }
  }

  return (
    <section className="section">
      <div className="section-head"><h2>Convidar pessoa</h2><p className="section-sub">O convite chega por e-mail. Não existe cadastro aberto: só entra quem foi convidado.</p></div>
      <form className="panel admin-form" onSubmit={(e) => void submit(e)}>
        <div className="form-grid">
          <label>E-mail<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" /></label>
          <label>Nome (opcional)<input maxLength={120} value={fullName} onChange={(e) => setFullName(e.target.value)} /></label>
          <label>Tipo de acesso
            <select value={kind} onChange={(e) => setKind(e.target.value as InviteKind)}>
              {(Object.keys(KIND_LABEL) as InviteKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
          </label>
          {kind === 'client_viewer' && (
            <label>Cliente
              <select required value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="" disabled>Escolha o cliente</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}
        </div>
        {kind === 'org_analyst' && (
          <fieldset className="admin-checks">
            <legend>Clientes que o analista pode ver</legend>
            {clients.length === 0 && <span className="muted small">Cadastre um cliente primeiro.</span>}
            {clients.map((c) => (
              <label key={c.id}><input type="checkbox" checked={assigned.includes(c.id)} onChange={(e) => setAssigned((a) => e.target.checked ? [...a, c.id] : a.filter((x) => x !== c.id))} /> {c.name}</label>
            ))}
          </fieldset>
        )}
        <div className="admin-actions"><button className="btn btn-primary" type="submit" disabled={invite.isPending}>{invite.isPending ? 'Enviando…' : 'Enviar convite'}</button></div>
        {fb.node}
      </form>
    </section>
  );
}

function MemberRow({ orgId, m, clients }: { orgId: string; m: Member; clients: ClientRow[] }) {
  const { session } = useAuth();
  const { setRole, removeMember, assign } = useTeamMutations(orgId);
  const fb = useFeedback();
  const isMe = m.user_id === session?.user.id;
  const run = (p: Promise<unknown>) => { fb.clear(); p.catch((err: unknown) => void fb.fail(err)); };
  return (
    <tr>
      <PersonCell p={m} />
      <td>
        <select aria-label={`Papel de ${m.full_name ?? m.email ?? 'pessoa'}`} value={m.role} disabled={setRole.isPending}
          onChange={(e) => run(setRole.mutateAsync({ user_id: m.user_id, role: e.target.value as Member['role'] }))}>
          <option value="org_admin">{KIND_LABEL.org_admin}</option>
          <option value="org_analyst">{KIND_LABEL.org_analyst}</option>
        </select>
        {isMe && <div className="small muted">Você</div>}
      </td>
      <td>
        {m.role === 'org_admin' ? <span className="muted small">Todos os clientes</span> : (
          <div className="admin-checks compact">
            {clients.length === 0 && <span className="muted small">Nenhum cliente</span>}
            {clients.map((c) => (
              <label key={c.id}><input type="checkbox" checked={m.clientIds.includes(c.id)} disabled={assign.isPending}
                onChange={(e) => run(assign.mutateAsync({ user_id: m.user_id, client_id: c.id, on: e.target.checked }))} /> {c.name}</label>
            ))}
          </div>
        )}
        {fb.node}
      </td>
      <td className="row-actions">
        <ConfirmButton label="Remover" confirmLabel={isMe ? 'Remover meu acesso' : 'Confirmar remoção'} disabled={removeMember.isPending}
          onConfirm={() => run(removeMember.mutateAsync(m.user_id))} />
      </td>
    </tr>
  );
}

function ClientUserRow({ orgId, u, clientName }: { orgId: string; u: { user_id: string; client_id: string; full_name: string | null; email: string | null }; clientName: string }) {
  const { removeClientUser } = useTeamMutations(orgId);
  const fb = useFeedback();
  return (
    <tr>
      <PersonCell p={u} />
      <td>{clientName}{fb.node}</td>
      <td className="row-actions">
        <ConfirmButton label="Remover acesso" confirmLabel="Confirmar remoção" disabled={removeClientUser.isPending}
          onConfirm={() => { fb.clear(); removeClientUser.mutateAsync({ user_id: u.user_id, client_id: u.client_id }).catch((err: unknown) => void fb.fail(err)); }} />
      </td>
    </tr>
  );
}
