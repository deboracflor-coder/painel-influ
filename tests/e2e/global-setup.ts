import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium, type FullConfig } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { AUTH_DIR, PASSWORD, USERS, type Role } from './helpers';

/**
 * Garante os dados fictícios do seed e guarda a sessão de cada papel,
 * entrando pela tela de login de verdade.
 */
export default async function globalSetup(config: FullConfig) {
  const url = process.env.SUPABASE_URL!;
  const anon = createClient(url, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const probe = await anon.auth.signInWithPassword({ email: USERS.admin, password: PASSWORD });
  if (probe.error) {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Sem seed: defina SUPABASE_SERVICE_ROLE_KEY para criar os dados fictícios.');
    execFileSync('npx', ['tsx', 'scripts/seed-local.ts'], { stdio: 'inherit', env: process.env });
  }

  mkdirSync(AUTH_DIR, { recursive: true });
  const baseURL = config.projects[0]!.use.baseURL!;
  const browser = await chromium.launch();
  for (const role of Object.keys(USERS) as Role[]) {
    const page = await browser.newPage({ baseURL });
    await page.goto('/entrar');
    await page.getByLabel('E-mail').fill(USERS[role]);
    await page.getByLabel('Senha').fill(PASSWORD);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page.getByRole('button', { name: 'Sair' }).waitFor();
    await page.context().storageState({ path: `${AUTH_DIR}/${role}.json` });
    await page.close();
  }
  await browser.close();
}
