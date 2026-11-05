/**
 * Só variáveis públicas chegam ao navegador (prefixo VITE_).
 * A chave "anon" é pública por definição: quem decide o acesso é a RLS no banco.
 * Nunca coloque service role, segredos de OAuth ou tokens aqui.
 * (Validação feita à mão para não pesar no primeiro carregamento.)
 */
export interface PublicEnv {
  VITE_SUPABASE_URL: string;
  VITE_SUPABASE_ANON_KEY: string;
}

function isHttpUrl(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  try {
    return ['http:', 'https:'].includes(new URL(v).protocol);
  } catch {
    return false;
  }
}

export function parseEnv(raw: Record<string, unknown>): PublicEnv {
  const issues: string[] = [];
  const url = raw.VITE_SUPABASE_URL;
  const key = raw.VITE_SUPABASE_ANON_KEY;
  if (!isHttpUrl(url)) issues.push('VITE_SUPABASE_URL ausente ou inválida');
  if (typeof key !== 'string' || key.length < 20) issues.push('VITE_SUPABASE_ANON_KEY ausente');
  if (issues.length) throw new Error(`Configuração incompleta: ${issues.join('; ')}`);
  const forbidden = Object.keys(raw).filter((k) => k.startsWith('VITE_') && /SERVICE|SECRET/i.test(k));
  if (forbidden.length) {
    throw new Error(`Variável secreta exposta ao navegador: ${forbidden.join(', ')}`);
  }
  return { VITE_SUPABASE_URL: url as string, VITE_SUPABASE_ANON_KEY: key as string };
}
