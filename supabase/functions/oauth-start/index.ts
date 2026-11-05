// Início da conexão de contas. Quem opera o cliente (admin ou analista atribuído) recebe
// o endereço de autorização da Meta ou do Google. O estado é de uso único e vale 10 minutos.
import { z } from 'npm:zod@4.6.7';
import { allowedOrigins, redirectUri, requireUser, serviceClient } from '../_shared/clients.ts';
import { corsHeaders, json } from '../_shared/http.ts';
import { authorizationUrl, googleConfig, metaConfig } from '../_shared/providers.ts';

const Body = z.object({ client_id: z.uuid(), provider: z.enum(['meta', 'google', 'google_sheets']), app_origin: z.url() });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Método não permitido' });
  const who = await requireUser(req);
  if (!who) return json(401, { error: 'Sessão inválida' });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json(400, { error: 'Dados inválidos' });
  const b = parsed.data;

  if (b.provider === 'google_sheets') {
    // Exportar é leitura: basta poder ver o cliente (a RLS decide).
    const { data: visible } = await who.caller.from('clients').select('id').eq('id', b.client_id).maybeSingle();
    if (!visible) return json(403, { error: 'Sem acesso a este cliente' });
  } else {
    const { data: canOperate, error } = await who.caller.rpc('can_operate', { p_client: b.client_id });
    if (error || !canOperate) return json(403, { error: 'Só a equipe responsável pelo cliente conecta contas' });
  }

  if (b.provider === 'meta' ? !metaConfig() : !googleConfig()) {
    return json(503, { error: b.provider === 'meta'
      ? 'A integração com Instagram e Facebook ainda não foi configurada (app da Meta pendente).'
      : b.provider === 'google'
        ? 'A integração com o YouTube ainda não foi configurada (projeto do Google pendente).'
        : 'A exportação para o Google Sheets ainda não foi configurada (projeto do Google pendente).' });
  }
  const origin = b.app_origin.replace(/\/$/, '');
  if (!allowedOrigins().includes(origin)) return json(400, { error: 'Endereço do app não autorizado (APP_URL)' });

  const admin = serviceClient();
  const { data: client } = await admin.from('clients').select('organization_id').eq('id', b.client_id).single();
  if (!client) return json(404, { error: 'Cliente não encontrado' });

  const state = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
  const { url, verifier } = await authorizationUrl(b.provider, state, redirectUri());
  const { error: insErr } = await admin.from('oauth_states').insert({
    state, organization_id: client.organization_id, client_id: b.client_id, provider: b.provider, user_id: who.userId,
    code_verifier: verifier, return_to: origin, expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  if (insErr) return json(500, { error: 'Não foi possível iniciar a conexão' });
  return json(200, { url });
});
