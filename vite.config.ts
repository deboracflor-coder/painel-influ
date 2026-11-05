import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

interface VercelConfig { headers: { source: string; headers: { key: string; value: string }[] }[] }

/**
 * `vite preview` responde com os mesmos cabeçalhos de segurança da Vercel (vercel.json),
 * para os testes de ponta a ponta rodarem sob a mesma política de conteúdo (CSP).
 * Só no preview local, a CSP também libera o Supabase local (http://127.0.0.1:54321).
 */
function previewHeaders(supabaseUrl: string): Record<string, string> {
  const vercel = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')) as VercelConfig;
  const all = vercel.headers.find((h) => h.source === '/(.*)')?.headers ?? [];
  const local = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(supabaseUrl) ? supabaseUrl : '';
  return Object.fromEntries(all
    .filter((h) => h.key !== 'Strict-Transport-Security') // HSTS não se aplica a http local
    .map((h) => [h.key, h.key === 'Content-Security-Policy' && local
      ? h.value.replace('connect-src ', `connect-src ${local} `)
      : h.value]));
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const supabaseUrl = process.env.VITE_SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? '';
  return {
    plugins: [react()],
    server: { port: 5173, strictPort: true },
    preview: { port: 4173, strictPort: true, headers: previewHeaders(supabaseUrl) },
    build: { sourcemap: false },
  };
});
