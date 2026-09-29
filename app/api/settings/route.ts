import { requireEditor } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { EMV_BASIS, FORMATS, PLATFORMS, isDate, isOneOf } from '@/lib/enums';

// Parâmetros da tela "Parâmetros de valor": base da taxa de engajamento, limites de alertas e CPMs de referência.
export async function PATCH(req: Request) {
  const v = await requireEditor();
  if (v instanceof Response) return v;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return Response.json({ error: 'corpo inválido' }, { status: 400 });
  const db = supabaseAdmin();

  const { data: ws } = await db.from('workspaces').select('settings').eq('id', v.workspaceId).single();
  const settings = { ...(ws?.settings ?? {}) };
  if (body.erBase && typeof body.erBase === 'object') settings.erBase = body.erBase;
  if (body.alerts && typeof body.alerts === 'object') settings.alerts = body.alerts;
  await db.from('workspaces').update({ settings }).eq('id', v.workspaceId);

  let saved = 0, skipped = 0;
  if (Array.isArray(body.params)) {
    // Guarda só parâmetros completos: sem valor, o EMV continua em branco (nunca um valor inventado)
    const rows = [];
    for (const p of body.params) {
      const rate = Number(p?.rate);
      const ok = isOneOf(PLATFORMS, p?.platform) && (p.format === null || isOneOf(FORMATS, p.format)) && isOneOf(EMV_BASIS, p.basis)
        && Number.isFinite(rate) && rate > 0 && isDate(p.valid_from) && (p.valid_to === null || p.valid_to === undefined || isDate(p.valid_to));
      if (!ok) { skipped++; continue; }
      rows.push({ workspace_id: v.workspaceId, platform: p.platform, format: p.format, basis: p.basis, rate, methodology: String(p.methodology ?? '').slice(0, 2000), valid_from: p.valid_from, valid_to: p.valid_to || null, created_by: v.userId });
    }
    const del = await db.from('benchmark_parameters').delete().eq('workspace_id', v.workspaceId);
    if (del.error) return Response.json({ error: del.error.message }, { status: 500 });
    if (rows.length) {
      const ins = await db.from('benchmark_parameters').insert(rows);
      if (ins.error) return Response.json({ error: ins.error.message }, { status: 500 });
    }
    saved = rows.length;
  }
  await db.from('audit_log').insert({ user_id: v.userId, action: 'update_settings', entity: 'workspaces', entity_id: v.workspaceId, diff: { params: saved, skipped } });
  return Response.json({ ok: true, saved, skipped });
}
