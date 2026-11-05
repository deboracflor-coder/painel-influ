// Exportação do relatório para uma planilha nova no Google Drive de quem pede.
// As tabelas vêm prontas do navegador (são os mesmos dados que a pessoa já vê na tela,
// filtrados pela RLS); aqui só guardamos o acesso ao Google e escrevemos a planilha.
// Valores são gravados como texto/número cru (RAW): nada vira fórmula.
import { z } from 'npm:zod@4.6.7';
import { requireUser, serviceClient } from '../_shared/clients.ts';
import { ProviderError } from '../_shared/collect/types.ts';
import { corsHeaders, json } from '../_shared/http.ts';
import { freshGoogleToken, googleConfig, makeFetchJson, revokeGoogle } from '../_shared/providers.ts';

const Cell = z.union([z.string().max(50_000), z.number(), z.null()]);
const Body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('export'),
    title: z.string().trim().min(1).max(200),
    tables: z.array(z.object({ name: z.string().trim().min(1).max(90), rows: z.array(z.array(Cell).max(40)).max(20_000) })).min(1).max(8),
  }),
  z.object({ action: z.literal('disconnect') }),
]);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Método não permitido' });
  const who = await requireUser(req);
  if (!who) return json(401, { error: 'Sessão inválida' });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json(400, { error: 'Dados inválidos para a planilha' });
  const b = parsed.data;
  const g = googleConfig();
  if (!g) return json(503, { error: 'A exportação para o Google Sheets ainda não foi configurada (projeto do Google pendente).' });

  const admin = serviceClient();
  const { data: token } = await admin.rpc('read_user_token', { p_user: who.userId, p_provider: 'google_sheets' });

  if (b.action === 'disconnect') {
    if (token) await revokeGoogle(token as Record<string, unknown>);
    await admin.rpc('delete_user_token', { p_user: who.userId, p_provider: 'google_sheets' });
    return json(200, { status: 'disconnected' });
  }
  if (!token) return json(409, { error: 'Conecte sua conta Google para exportar', needs_connection: true });

  try {
    const fresh = await freshGoogleToken(token as Record<string, unknown>);
    if (fresh.changed) await admin.rpc('store_user_token', { p_user: who.userId, p_provider: 'google_sheets', p_token: fresh.token });
    const f = makeFetchJson('google');
    const auth = { Authorization: `Bearer ${fresh.token.access_token}`, 'Content-Type': 'application/json' };
    const names = b.tables.map((t, i) => t.name.replace(/[[\]*?/\\:']/g, ' ').trim() || `Aba ${i + 1}`);
    const created = await f(`${g.sheets}/spreadsheets`, {
      method: 'POST', headers: auth,
      body: JSON.stringify({ properties: { title: b.title, locale: 'pt_BR' }, sheets: names.map((title) => ({ properties: { title } })) }),
    }) as { spreadsheetId: string; spreadsheetUrl: string };
    await f(`${g.sheets}/spreadsheets/${created.spreadsheetId}/values:batchUpdate`, {
      method: 'POST', headers: auth,
      body: JSON.stringify({
        valueInputOption: 'RAW',
        data: b.tables.map((t, i) => ({ range: `'${names[i]}'!A1`, values: t.rows.map((r) => r.map((c) => c ?? '')) })),
      }),
    });
    return json(200, { url: created.spreadsheetUrl });
  } catch (e) {
    if (e instanceof ProviderError && e.code === 'token_expired') {
      await admin.rpc('delete_user_token', { p_user: who.userId, p_provider: 'google_sheets' });
      return json(409, { error: 'O acesso ao Google venceu. Conecte de novo para exportar.', needs_connection: true });
    }
    console.error('sheets-export', (e as Error).message);
    return json(502, { error: 'O Google recusou a criação da planilha. Tente de novo em instantes.' });
  }
});
