import { redirect } from 'next/navigation';
import { isLive } from '@/lib/env';
import { currentViewer, canEdit } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { BrandForm, CampaignForm, DeliverableForm, LinkForm } from './Forms';

export const dynamic = 'force-dynamic';
const PLAT: Record<string, string> = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', facebook: 'Facebook', linkedin: 'LinkedIn' };
const br = (d: string) => d.slice(0, 10).split('-').reverse().join('/');

export default async function Cadastros() {
  if (!isLive()) redirect('/');
  const v = await currentViewer();
  if (!v || v === 'no_access' || !canEdit(v)) redirect('/');
  const sb = await supabaseServer();
  const [{ data: brands }, { data: campaigns }, { data: items }, { data: posts }] = await Promise.all([
    sb.from('brands').select('id, name').eq('workspace_id', v.workspaceId).order('name'),
    sb.from('campaigns').select('id, name, end_date').eq('workspace_id', v.workspaceId).order('start_date', { ascending: false }),
    sb.from('delivery_items').select('id, expected_date, deliverables!inner(label, platform, campaigns!inner(name, workspace_id))').is('post_id', null).in('status', ['planejado', 'em_producao', 'aguardando_aprovacao', 'pendente']).eq('deliverables.campaigns.workspace_id', v.workspaceId).order('expected_date').limit(300),
    sb.from('posts').select('id, platform, title, published_at').is('deliverable_id', null).order('published_at', { ascending: false }).limit(300),
  ]);
  const itemOpts = (items ?? []).map((i: any) => ({ id: i.id, name: `${i.deliverables.campaigns.name} · ${i.deliverables.label}${i.deliverables.platform ? ' (' + PLAT[i.deliverables.platform] + ')' : ''}${i.expected_date ? ' · prazo ' + br(i.expected_date) : ''}` }));
  const postOpts = (posts ?? []).map((p) => ({ id: p.id, name: `${br(p.published_at)} · ${PLAT[p.platform]} · ${(p.title ?? '(sem título)').slice(0, 60)}` }));

  return (
    <main className="page">
      <nav className="topnav"><a href="/">← Voltar ao painel</a>{v.role === 'owner' && <a href="/acessos">Acessos</a>}</nav>
      <h1>Cadastros</h1>
      <p className="lead">Marcas, campanhas e o que foi contratado. Tudo aqui é dado manual e aparece assim no painel.</p>
      <section><h2>Nova marca</h2><BrandForm /></section>
      <section><h2>Nova campanha</h2><CampaignForm brands={brands ?? []} /></section>
      <section><h2>Entregas contratadas</h2><DeliverableForm campaigns={campaigns ?? []} /></section>
      <section>
        <h2>Vincular conteúdo a uma entrega</h2>
        <p className="small muted">Conteúdos com as hashtags da campanha são sugeridos automaticamente; aqui você confirma o vínculo.</p>
        <LinkForm items={itemOpts} posts={postOpts} />
      </section>
    </main>
  );
}
