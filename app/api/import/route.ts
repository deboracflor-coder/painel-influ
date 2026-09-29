import { requireEditor } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { FORMATS, PLATFORMS, isOneOf } from '@/lib/enums';

// Importação CSV/Excel: as linhas já chegam validadas pela tela (lib/importer.js) e são conferidas de novo aqui.
// Tudo o que entra por importação fica marcado como "Dado manual" (source = import).
const METRICS: Record<string, string> = {
  reach: 'reach', impressions: 'impressions', views: 'views', likes: 'likes', comments: 'comments', shares: 'shares',
  saves: 'saves', clicks: 'clicks', follows: 'follows', watch_time_min: 'watch_time_minutes', avg_view_pct: 'avg_view_pct', thumb_ctr: 'thumb_ctr',
};
const MAX_ROWS = 5000;

export async function POST(req: Request) {
  const v = await requireEditor();
  if (v instanceof Response) return v;
  const body = await req.json().catch(() => null);
  const rows: any[] = Array.isArray(body?.rows) ? body.rows : [];
  if (!rows.length) return Response.json({ error: 'nenhuma linha válida' }, { status: 400 });
  if (rows.length > MAX_ROWS) return Response.json({ error: `máximo de ${MAX_ROWS} linhas por arquivo` }, { status: 400 });
  const db = supabaseAdmin();

  // Marcas e campanhas citadas precisam ser deste workspace
  const [{ data: brands }, { data: camps }, { data: accs }] = await Promise.all([
    db.from('brands').select('id').eq('workspace_id', v.workspaceId),
    db.from('campaigns').select('id, brand_id').eq('workspace_id', v.workspaceId),
    db.from('social_accounts').select('id, platform, status').eq('workspace_id', v.workspaceId),
  ]);
  const brandIds = new Set((brands ?? []).map((b) => b.id));
  const campById = new Map((camps ?? []).map((c) => [c.id, c]));
  const accountFor = new Map<string, string>();
  for (const a of accs ?? []) if (!accountFor.has(a.platform) || a.status === 'connected') accountFor.set(a.platform, a.id);

  const rejected: string[] = [];
  let imported = 0;
  const capturedAt = new Date().toISOString();
  for (const [i, r] of rows.entries()) {
    const line = `linha ${i + 1}`;
    if (!isOneOf(PLATFORMS, r.platform) || !isOneOf(FORMATS, r.format) || typeof r.external_id !== 'string' || !r.external_id || Number.isNaN(Date.parse(r.published_at))) { rejected.push(`${line}: dados básicos inválidos`); continue; }
    const campaign = r.campaign_id ? campById.get(r.campaign_id) : null;
    if (r.campaign_id && !campaign) { rejected.push(`${line}: campanha não encontrada`); continue; }
    const brandId = r.brand_id ?? campaign?.brand_id ?? null;
    if (brandId && !brandIds.has(brandId)) { rejected.push(`${line}: marca não encontrada`); continue; }

    let accountId = accountFor.get(r.platform);
    if (!accountId) {
      // Rede sem conta conectada: cria um registro "não configurado" só para receber os dados manuais
      const { data: acc, error } = await db.from('social_accounts').insert({ workspace_id: v.workspaceId, platform: r.platform, external_account_id: `manual:${v.workspaceId}:${r.platform}`, handle: '—', display_name: 'Dados importados', status: 'not_configured' }).select('id').single();
      if (error || !acc) { rejected.push(`${line}: ${error?.message}`); continue; }
      accountId = acc.id as string;
      accountFor.set(r.platform, accountId);
    }
    const publishedAt = /^\d{4}-\d{2}-\d{2}$/.test(r.published_at) ? `${r.published_at}T12:00:00Z` : r.published_at;
    const { data: post, error: pErr } = await db.from('posts').upsert({
      account_id: accountId, platform: r.platform, external_post_id: r.external_id, published_at: publishedAt, format: r.format,
      title: typeof r.title === 'string' ? r.title.slice(0, 500) : null, url: typeof r.url === 'string' ? r.url.slice(0, 1000) : null,
      is_sponsored: !!r.sponsored, brand_id: brandId, campaign_id: campaign?.id ?? null, link_confirmed: !!campaign, source: 'import',
    }, { onConflict: 'platform,external_post_id' }).select('id').single();
    if (pErr || !post) { rejected.push(`${line}: ${pErr?.message}`); continue; }
    const snap: Record<string, unknown> = { post_id: post.id, captured_at: capturedAt, source: 'import' };
    for (const [k, col] of Object.entries(METRICS)) {
      const n = r.metrics?.[k];
      snap[col] = typeof n === 'number' && Number.isFinite(n) ? n : null; // ausente = em branco, nunca zero
    }
    const { error: sErr } = await db.from('metric_snapshots').upsert(snap, { onConflict: 'post_id,captured_at' });
    if (sErr) { rejected.push(`${line}: ${sErr.message}`); continue; }
    imported++;
  }

  await db.from('import_batches').insert({
    workspace_id: v.workspaceId, origin: String(body.fileName ?? '').toLowerCase().endsWith('.csv') ? 'csv' : 'xlsx', file_name: String(body.fileName ?? '').slice(0, 200),
    column_mapping: body.mapping ?? {}, rows_total: rows.length + (Array.isArray(body.errors) ? body.errors.length : 0), rows_imported: imported,
    rows_duplicated: Number(body.duplicates) || 0, rows_rejected: rejected.length + (Array.isArray(body.errors) ? body.errors.length : 0),
    errors: { client: Array.isArray(body.errors) ? body.errors.slice(0, 200) : [], server: rejected.slice(0, 200) }, created_by: v.userId,
  });
  return Response.json({ imported, rejected });
}
