import { redirect } from 'next/navigation';
import { isLive } from '@/lib/env';
import { currentViewer } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { MemberForm } from './MemberForm';
import { removeMember } from './actions';

export const dynamic = 'force-dynamic';
const ROLE: Record<string, string> = { owner: 'Administração', analyst: 'Equipe · análise', viewer: 'Equipe · leitura', brand_viewer: 'Portal da marca' };

export default async function Acessos() {
  if (!isLive()) redirect('/');
  const v = await currentViewer();
  if (!v || v === 'no_access' || v.role !== 'owner') redirect('/');
  const db = supabaseAdmin();
  const [{ data: members }, { data: brands }] = await Promise.all([
    db.from('memberships').select('id, user_id, role, brand_id, created_at').eq('workspace_id', v.workspaceId).order('created_at'),
    db.from('brands').select('id, name').eq('workspace_id', v.workspaceId).order('name'),
  ]);
  const brandName = new Map((brands ?? []).map((b) => [b.id, b.name]));
  const emails = new Map<string, string>();
  for (const m of members ?? []) {
    const { data } = await db.auth.admin.getUserById(m.user_id);
    emails.set(m.user_id, data.user?.email ?? '—');
  }
  return (
    <main className="page">
      <nav className="topnav"><a href="/">← Voltar ao painel</a><a href="/cadastros">Cadastros</a></nav>
      <h1>Acessos</h1>
      <p className="lead">Quem entra no painel e o que vê. Cada marca enxerga só os próprios conteúdos, entregas e valores.</p>
      <section><h2>Liberar acesso</h2><MemberForm brands={brands ?? []} /></section>
      <section>
        <h2>Pessoas com acesso</h2>
        <div className="table-wrap"><table>
          <thead><tr><th>E-mail</th><th>Perfil</th><th>Marca</th><th></th></tr></thead>
          <tbody>{(members ?? []).map((m) => (
            <tr key={m.id}>
              <td>{emails.get(m.user_id)}</td><td>{ROLE[m.role]}</td><td>{m.brand_id ? brandName.get(m.brand_id) : '—'}</td>
              <td>{m.user_id !== v.userId && <form action={removeMember}><input type="hidden" name="id" value={m.id} /><button className="btn btn-sm">Remover</button></form>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </section>
    </main>
  );
}
