import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/env';

// Cliente com a sessão do usuário: tudo o que ele lê passa pelas regras de acesso (RLS).
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try { for (const { name, value, options } of list) store.set(name, value, options); }
        catch { /* chamado de um Server Component: o proxy renova a sessão */ }
      },
    },
  });
}
