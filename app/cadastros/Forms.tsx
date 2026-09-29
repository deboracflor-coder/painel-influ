'use client';
import { useActionState } from 'react';
import { addBrand, addCampaign, addDeliverable, linkPost } from './actions';

type Opt = { id: string; name: string };
const PLATFORMS: [string, string][] = [['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['youtube', 'YouTube'], ['facebook', 'Facebook'], ['linkedin', 'LinkedIn']];
const FORMATS: [string, string][] = [['reels', 'Reels'], ['story', 'Stories'], ['carousel', 'Carrossel'], ['photo', 'Foto'], ['video', 'Vídeo'], ['short', 'Shorts'], ['long_video', 'Vídeo longo'], ['live', 'Live'], ['text', 'Texto'], ['other', 'Outro']];

function Msg({ s }: { s: { ok: boolean; msg: string } | null }) {
  return s ? <p className={`notice ${s.ok ? '' : 'notice-bad'}`} role="status">{s.msg}</p> : null;
}

export function BrandForm() {
  const [s, act, pending] = useActionState(addBrand, null);
  return (
    <form action={act}>
      <Msg s={s} />
      <div className="form-grid">
        <label>Nome da marca<input name="name" required /></label>
        <label>Segmento<input name="segment" /></label>
        <label>Contato<input name="contact_name" /></label>
        <label>E-mail do contato<input name="contact_email" type="email" /></label>
        <button className="btn btn-primary" disabled={pending}>Cadastrar marca</button>
      </div>
    </form>
  );
}

export function CampaignForm({ brands }: { brands: Opt[] }) {
  const [s, act, pending] = useActionState(addCampaign, null);
  return (
    <form action={act}>
      <Msg s={s} />
      <div className="form-grid">
        <label>Nome da campanha<input name="name" required /></label>
        <label>Marca<select name="brand_id"><option value="">Campanha própria</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label>Início<input name="start_date" type="date" required /></label>
        <label>Fim<input name="end_date" type="date" required /></label>
        <label>Objetivo<input name="objective" /></label>
        <label>Hashtags/menções de rastreio<input name="hashtags" placeholder="#marcaxcriador @marca" /></label>
        <label>Valor contratado (R$)<input name="contract_value" inputMode="decimal" /></label>
        <label>Mídia/impulsionamento (R$)<input name="media_value" inputMode="decimal" /></label>
        <label>Produtos/permuta (R$)<input name="product_value" inputMode="decimal" /></label>
        <label>Meta de visualizações<input name="goal_views" inputMode="numeric" /></label>
        <button className="btn btn-primary" disabled={pending}>Cadastrar campanha</button>
      </div>
      <p className="small muted">Valores em branco ficam como “não informado”, não como zero.</p>
    </form>
  );
}

export function DeliverableForm({ campaigns }: { campaigns: Opt[] }) {
  const [s, act, pending] = useActionState(addDeliverable, null);
  return (
    <form action={act}>
      <Msg s={s} />
      <div className="form-grid">
        <label>Campanha<select name="campaign_id" required><option value="">Escolha</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>O que foi contratado<input name="label" required placeholder="Reels, Stories, Presença em evento" /></label>
        <label>Quantidade<input name="quantity" type="number" min={1} max={200} defaultValue={1} required /></label>
        <label>Rede<select name="platform"><option value="">Fora das redes</option>{PLATFORMS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label>Formato<select name="format"><option value="">—</option>{FORMATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label>Prazo<input name="due_date" type="date" /></label>
        <button className="btn btn-primary" disabled={pending}>Adicionar entrega</button>
      </div>
    </form>
  );
}

export function LinkForm({ items, posts }: { items: Opt[]; posts: Opt[] }) {
  const [s, act, pending] = useActionState(linkPost, null);
  return (
    <form action={act}>
      <Msg s={s} />
      <div className="form-grid">
        <label>Entrega em aberto<select name="item_id" required><option value="">Escolha</option>{items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label>
        <label>Conteúdo publicado<select name="post_id" required><option value="">Escolha</option>{posts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <button className="btn btn-primary" disabled={pending}>Vincular</button>
      </div>
    </form>
  );
}
