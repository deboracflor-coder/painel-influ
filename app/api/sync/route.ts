import { requireEditor } from '@/lib/auth';
import { SUPABASE_URL } from '@/lib/env';
import { secrets } from '@/lib/secrets';

export const maxDuration = 60;

// Botão "Atualizar dados": dispara a mesma rotina do agendamento, só para este workspace.
export async function POST() {
  const v = await requireEditor();
  if (v instanceof Response) return v;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/sync-runner`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secrets.serviceRoleKey()}` },
    body: JSON.stringify({ scope: 'recent', trigger: 'manual', workspaceId: v.workspaceId }),
  });
  if (!res.ok) return Response.json({ error: `a rotina de sincronização respondeu ${res.status}` }, { status: 502 });
  return Response.json({ results: await res.json() });
}
