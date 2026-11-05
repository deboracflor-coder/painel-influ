import { z } from 'zod';

/**
 * Só variáveis públicas chegam ao navegador (prefixo VITE_).
 * A chave "anon" é pública por definição: quem decide o acesso é a RLS no banco.
 * Nunca coloque service role, segredos de OAuth ou tokens aqui.
 */
const schema = z.object({
  VITE_SUPABASE_URL: z.url({ message: 'VITE_SUPABASE_URL ausente ou inválida' }),
  VITE_SUPABASE_ANON_KEY: z.string().min(20, 'VITE_SUPABASE_ANON_KEY ausente'),
});

export type PublicEnv = z.infer<typeof schema>;

export function parseEnv(raw: Record<string, unknown>): PublicEnv {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Configuração incompleta: ${result.error.issues.map((i) => i.message).join('; ')}`);
  }
  const forbidden = Object.keys(raw).filter((k) => k.startsWith('VITE_') && /SERVICE|SECRET/i.test(k));
  if (forbidden.length) {
    throw new Error(`Variável secreta exposta ao navegador: ${forbidden.join(', ')}`);
  }
  return result.data;
}
