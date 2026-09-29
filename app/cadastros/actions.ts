'use server';
import { revalidatePath } from 'next/cache';
import { requireEditor } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { FORMATS, PLATFORMS, isDate, isOneOf, isUuid } from '@/lib/enums';

type Result = { ok: boolean; msg: string };
const text = (f: FormData, k: string, max = 300) => String(f.get(k) ?? '').trim().slice(0, max);
const money = (f: FormData, k: string) => {
  const s = text(f, k).replace(/\./g, '').replace(',', '.');
  if (!s) return null; // em branco = não informado (nunca zero)
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
};

async function editor() {
  const v = await requireEditor();
  if (v instanceof Response) throw new Error('Sem permissão para cadastrar.');
  return v;
}
async function ownsCampaign(ws: string, id: string) {
  const { data } = await supabaseAdmin().from('campaigns').select('id').eq('id', id).eq('workspace_id', ws).maybeSingle();
  return !!data;
}

export async function addBrand(_: Result | null, f: FormData): Promise<Result> {
  const v = await editor();
  const name = text(f, 'name', 120);
  if (!name) return { ok: false, msg: 'Informe o nome da marca.' };
  const { error } = await supabaseAdmin().from('brands').insert({ workspace_id: v.workspaceId, name, segment: text(f, 'segment', 120) || null, contact_name: text(f, 'contact_name', 120) || null, contact_email: text(f, 'contact_email', 200) || null });
  if (error) return { ok: false, msg: error.code === '23505' ? 'Já existe uma marca com esse nome.' : error.message };
  revalidatePath('/cadastros');
  return { ok: true, msg: `Marca "${name}" cadastrada.` };
}

export async function addCampaign(_: Result | null, f: FormData): Promise<Result> {
  const v = await editor();
  const name = text(f, 'name', 160), start = text(f, 'start_date'), end = text(f, 'end_date'), brandId = text(f, 'brand_id');
  if (!name || !isDate(start) || !isDate(end) || end < start) return { ok: false, msg: 'Preencha nome e um período válido.' };
  if (brandId && !isUuid(brandId)) return { ok: false, msg: 'Marca inválida.' };
  const db = supabaseAdmin();
  if (brandId) {
    const { data } = await db.from('brands').select('id').eq('id', brandId).eq('workspace_id', v.workspaceId).maybeSingle();
    if (!data) return { ok: false, msg: 'Marca não encontrada.' };
  }
  const contract = money(f, 'contract_value'), media = money(f, 'media_value'), product = money(f, 'product_value');
  const goal = text(f, 'goal_views') ? Number(text(f, 'goal_views').replace(/\D/g, '')) : null;
  if ([contract, media, product].some((n) => Number.isNaN(n))) return { ok: false, msg: 'Valores em R$ inválidos.' };
  const { data: c, error } = await db.from('campaigns').insert({
    workspace_id: v.workspaceId, brand_id: brandId || null, name, objective: text(f, 'objective', 300) || null, start_date: start, end_date: end,
    goal_views: goal || null, tracking_hashtags: text(f, 'hashtags').split(/[\s,]+/).filter(Boolean),
  }).select('id').single();
  if (error || !c) return { ok: false, msg: error?.message ?? 'erro' };
  if ([contract, media, product].some((n) => n !== null)) {
    await db.from('campaign_financials').insert({ campaign_id: c.id, contract_value: contract, media_value: media, product_value: product, source: 'manual', updated_by: v.userId });
  }
  revalidatePath('/cadastros');
  return { ok: true, msg: `Campanha "${name}" cadastrada.` };
}

export async function addDeliverable(_: Result | null, f: FormData): Promise<Result> {
  const v = await editor();
  const campaignId = text(f, 'campaign_id'), label = text(f, 'label', 120), qty = Number(text(f, 'quantity'));
  const platform = text(f, 'platform'), format = text(f, 'format'), due = text(f, 'due_date');
  if (!isUuid(campaignId) || !(await ownsCampaign(v.workspaceId, campaignId))) return { ok: false, msg: 'Escolha a campanha.' };
  if (!label || !Number.isInteger(qty) || qty < 1 || qty > 200) return { ok: false, msg: 'Informe o nome da entrega e a quantidade (1 a 200).' };
  if (platform && !isOneOf(PLATFORMS, platform)) return { ok: false, msg: 'Rede inválida.' };
  if (format && !isOneOf(FORMATS, format)) return { ok: false, msg: 'Formato inválido.' };
  if (due && !isDate(due)) return { ok: false, msg: 'Prazo inválido.' };
  const db = supabaseAdmin();
  const { data: d, error } = await db.from('deliverables').insert({ campaign_id: campaignId, platform: platform || null, format: format || null, label, quantity_expected: qty, due_date: due || null }).select('id').single();
  if (error || !d) return { ok: false, msg: error?.message ?? 'erro' };
  // Uma linha por unidade contratada no controle de entregas
  await db.from('delivery_items').insert(Array.from({ length: qty }, () => ({ deliverable_id: d.id, expected_date: due || null, status: 'planejado' })));
  revalidatePath('/cadastros');
  return { ok: true, msg: `${qty}× ${label} adicionado(s) ao controle de entregas.` };
}

export async function linkPost(_: Result | null, f: FormData): Promise<Result> {
  const v = await editor();
  const itemId = text(f, 'item_id'), postId = text(f, 'post_id');
  if (!isUuid(itemId) || !isUuid(postId)) return { ok: false, msg: 'Escolha a entrega e o conteúdo.' };
  const db = supabaseAdmin();
  const { data: item } = await db.from('delivery_items').select('id, deliverable_id, deliverables!inner(campaign_id, campaigns!inner(workspace_id, brand_id))').eq('id', itemId).maybeSingle();
  const camp = (item as any)?.deliverables?.campaigns;
  if (!item || camp?.workspace_id !== v.workspaceId) return { ok: false, msg: 'Entrega não encontrada.' };
  const { data: post } = await db.from('posts').select('id, published_at, social_accounts!inner(workspace_id)').eq('id', postId).maybeSingle();
  if (!post || (post as any).social_accounts?.workspace_id !== v.workspaceId) return { ok: false, msg: 'Conteúdo não encontrado.' };
  await db.from('posts').update({ campaign_id: (item as any).deliverables.campaign_id, brand_id: camp.brand_id, deliverable_id: item.deliverable_id, is_sponsored: true, link_confirmed: true }).eq('id', postId);
  await db.from('delivery_items').update({ post_id: postId, delivered_date: String(post.published_at).slice(0, 10), status: 'publicado' }).eq('id', itemId);
  await db.from('audit_log').insert({ user_id: v.userId, action: 'link_post', entity: 'delivery_items', entity_id: itemId, diff: { post_id: postId } });
  revalidatePath('/cadastros');
  return { ok: true, msg: 'Conteúdo vinculado à entrega.' };
}
