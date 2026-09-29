import { requireEditor } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { DELIVERY_STATUS, isOneOf, isUuid } from '@/lib/enums';

// Muda o status de uma linha do controle de entregas.
export async function PATCH(req: Request) {
  const v = await requireEditor();
  if (v instanceof Response) return v;
  const body = await req.json().catch(() => ({}));
  if (!isUuid(body.id) || !isOneOf(DELIVERY_STATUS, body.status)) return Response.json({ error: 'dados inválidos' }, { status: 400 });
  // Confere com a sessão do usuário (RLS) que o item é deste workspace
  const sb = await supabaseServer();
  const { data: item } = await sb.from('delivery_items').select('id, status, delivered_date, deliverables!inner(campaigns!inner(workspace_id))').eq('id', body.id).maybeSingle();
  const ws = (item as any)?.deliverables?.campaigns?.workspace_id;
  if (!item || ws !== v.workspaceId) return Response.json({ error: 'entrega não encontrada' }, { status: 404 });
  const patch: Record<string, unknown> = { status: body.status };
  if ((body.status === 'entregue' || body.status === 'publicado') && !item.delivered_date) patch.delivered_date = new Date().toISOString().slice(0, 10);
  const db = supabaseAdmin();
  const { error } = await db.from('delivery_items').update(patch).eq('id', body.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  await db.from('audit_log').insert({ user_id: v.userId, action: 'status', entity: 'delivery_items', entity_id: body.id, diff: { from: item.status, to: body.status } });
  return Response.json({ ok: true });
}
