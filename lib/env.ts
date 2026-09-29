// Variáveis públicas (vão para o navegador): só URL e chave anônima do Supabase.
// Chaves secretas ficam em lib/secrets.ts e só são lidas no servidor.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

// Sem Supabase configurado, o site abre a demonstração com dados fictícios.
export const isLive = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
