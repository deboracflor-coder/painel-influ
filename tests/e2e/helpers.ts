import { test as base, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

// Usuários FICTÍCIOS criados por scripts/seed-local.ts (só existem no Supabase local).
export const PASSWORD = 'senha-local-123';
export const USERS = {
  admin: 'admin@agencia.exemplo',
  analyst: 'analista@agencia.exemplo',
  client: 'cliente@aurora.exemplo',
} as const;
export type Role = keyof typeof USERS;
export const AUTH_DIR = 'test-results/.auth';
export const as = (role: Role) => ({ storageState: `${AUTH_DIR}/${role}.json` });

/** Ids dos clientes fictícios, lidos com a service role só no processo de teste (nunca no navegador). */
export async function demoClients(): Promise<{ aurora: string; trilha: string }> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY é necessária para este teste');
  const admin = createClient(process.env.SUPABASE_URL!, key, { auth: { persistSession: false } });
  const { data, error } = await admin.from('clients').select('id, name').in('name', ['Aurora Cosméticos', 'Trilha Esportes']);
  if (error) throw error;
  const id = (prefix: string) => data!.find((c) => c.name.startsWith(prefix))!.id;
  return { aurora: id('Aurora'), trilha: id('Trilha') };
}

/**
 * Toda página é vigiada: erro de JavaScript, violação da política de segurança (CSP)
 * ou erro no console reprovam o teste. Requisições recusadas de propósito (ex.: senha errada)
 * aparecem como "Failed to load resource" e são tratadas no próprio teste.
 */
export const test = base.extend<{ problems: string[] }>({
  problems: [async ({ page }, use) => {
    const problems: string[] = [];
    page.on('pageerror', (e) => problems.push(`Erro na página: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      if (m.text().startsWith('Failed to load resource')) return;
      problems.push(`Console: ${m.text()}`);
    });
    await use(problems);
    expect(problems, 'a página não pode ter erros nem violações de CSP').toEqual([]);
  }, { auto: true }],
});
export { expect };

/** Espera a tela terminar de carregar (sem indicador de carregamento visível). */
export async function settled(page: Page) {
  await expect(page.getByText(/^Carregando/)).toHaveCount(0);
  await expect(page.getByText('Verificando sua sessão…')).toHaveCount(0);
}

/** Largura do documento não pode passar da janela (sem rolagem lateral). */
export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

/** Chama a API do Supabase de dentro do navegador, com a sessão de quem está logado. */
export async function restAsUser(page: Page, path: string): Promise<{ status: number; body: unknown }> {
  return page.evaluate(async ({ url, anon, path }) => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
    const token = key ? (JSON.parse(localStorage.getItem(key)!) as { access_token: string }).access_token : '';
    const r = await fetch(`${url}/rest/v1/${path}`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } });
    return { status: r.status, body: await r.json() };
  }, { url: process.env.SUPABASE_URL!, anon: process.env.SUPABASE_ANON_KEY!, path });
}
