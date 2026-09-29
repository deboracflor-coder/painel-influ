import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from '@/lib/env';
import { secrets } from '@/lib/secrets';

// Service role: ignora RLS. Use só depois de conferir o papel do usuário (lib/auth.ts).
export function supabaseAdmin() {
  return createClient(SUPABASE_URL, secrets.serviceRoleKey(), { auth: { persistSession: false, autoRefreshToken: false } });
}
