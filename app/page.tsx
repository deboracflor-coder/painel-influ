import { redirect } from 'next/navigation';
import Dashboard from './Dashboard';
import { isLive } from '@/lib/env';
import { currentViewer, canEdit } from '@/lib/auth';
import { loadDataset } from '@/lib/data';

export const dynamic = 'force-dynamic';

export default async function Home() {
  // Sem Supabase configurado: demonstração com dados fictícios
  if (!isLive()) return <Dashboard payload={null} />;

  const v = await currentViewer();
  if (!v) redirect('/login');
  if (v === 'no_access') {
    return (
      <main className="login">
        <h1>Sem acesso ainda</h1>
        <p>Seu e-mail entrou, mas ainda não foi convidado para este painel. Peça o convite a quem administra.</p>
        <p><a href="/auth/signout">Sair</a></p>
      </main>
    );
  }
  const { data, workspaceName, settings } = await loadDataset(v);
  const links = [
    ...(canEdit(v) ? [{ href: '/cadastros', label: 'Cadastros' }] : []),
    ...(v.role === 'owner' ? [{ href: '/acessos', label: 'Acessos' }] : []),
  ];
  const payload = {
    mode: 'live',
    data,
    settings,
    workspaceName,
    userEmail: v.email,
    links,
    viewer: v.role === 'brand_viewer' ? { role: 'brand', brandId: v.brandId } : { role: v.role, brandId: null },
  };
  return <Dashboard payload={payload} />;
}
