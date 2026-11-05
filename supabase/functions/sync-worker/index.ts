// Coleta agendada. Chamada pelo pg_cron (a cada 15 min) com o cabeçalho x-cron-secret.
// Processa as contas vencidas, uma por vez, até o limite de tempo da execução.
import { serviceClient } from '../_shared/clients.ts';
import { json } from '../_shared/http.ts';
import { ACCOUNT_COLUMNS, type AccountRow, syncAccount } from '../_shared/sync.ts';

const BUDGET_MS = 110_000;

function sameSecret(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Método não permitido' });
  if (!sameSecret(req.headers.get('x-cron-secret') ?? '', Deno.env.get('SYNC_CRON_SECRET') ?? '')) {
    return json(401, { error: 'Não autorizado' });
  }
  const started = Date.now();
  const admin = serviceClient();
  const { data: due, error } = await admin.from('social_accounts').select(ACCOUNT_COLUMNS)
    .eq('status', 'connected').eq('sync_enabled', true).lte('next_sync_at', new Date().toISOString())
    .order('next_sync_at', { ascending: true }).limit(25);
  if (error) return json(500, { error: 'Falha ao listar contas' });

  const results = [];
  for (const acc of (due ?? []) as AccountRow[]) {
    if (Date.now() - started > BUDGET_MS) break; // o resto fica para a próxima rodada
    const { data: last } = await admin.from('sync_runs').select('status, next_retry_at').eq('account_id', acc.id)
      .order('queued_at', { ascending: false }).limit(1).maybeSingle();
    const trigger = last?.status === 'error' && last.next_retry_at ? 'retry' : 'cron';
    const out = await syncAccount(admin, acc, trigger, null);
    results.push({ account_id: acc.id, ...out });
  }
  return json(200, { processed: results.length, results });
});
