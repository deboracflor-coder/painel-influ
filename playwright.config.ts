import { defineConfig, devices } from '@playwright/test';

/**
 * Testes de ponta a ponta no navegador, contra o app compilado (`vite preview`, com os mesmos
 * cabeçalhos de segurança da Vercel) e o Supabase local com os dados fictícios do seed.
 *
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... npm run test:e2e
 */
const supabaseUrl = process.env.SUPABASE_URL ?? '';
const anonKey = process.env.SUPABASE_ANON_KEY ?? '';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(supabaseUrl) || !anonKey) {
  throw new Error('Defina SUPABASE_URL (Supabase local) e SUPABASE_ANON_KEY. Veja `npx supabase status -o env`.');
}

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'npm run build && npx vite preview --host 127.0.0.1',
    url: 'http://127.0.0.1:4173/entrar',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { VITE_SUPABASE_URL: supabaseUrl, VITE_SUPABASE_ANON_KEY: anonKey },
  },
});
