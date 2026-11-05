import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0';
import { env } from './http.ts';

const opts = { auth: { persistSession: false, autoRefreshToken: false } };

/** Service role: só dentro das Edge Functions, nunca no navegador. */
export const serviceClient = (): SupabaseClient => createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), opts);

/** Cliente com o token de quem chamou: a RLS vale como no navegador. */
export const callerClient = (authorization: string): SupabaseClient =>
  createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { ...opts, global: { headers: { Authorization: authorization } } });

/** Valida a sessão e devolve o cliente do chamador, ou uma resposta de erro. */
export async function requireUser(req: Request): Promise<{ caller: SupabaseClient; userId: string } | null> {
  const authorization = req.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) return null;
  const caller = callerClient(authorization);
  const { data, error } = await caller.auth.getUser();
  if (error || !data.user) return null;
  return { caller, userId: data.user.id };
}

/** Origens do app autorizadas a receber o retorno do OAuth (APP_URL, separadas por vírgula). */
export function allowedOrigins(): string[] {
  return (Deno.env.get('APP_URL') ?? '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
}

export const redirectUri = () => Deno.env.get('OAUTH_REDIRECT_URI') || `${env('SUPABASE_URL')}/functions/v1/oauth-callback`;
