import { createClient } from '@supabase/supabase-js';
import { expect, PASSWORD, settled, test, USERS } from './helpers';

test.describe('Autenticação', () => {
  test('sem sessão, qualquer tela leva ao login e volta para onde a pessoa ia', async ({ page }) => {
    await page.goto('/relatorio');
    await expect(page).toHaveURL(/\/entrar$/);
    await page.getByLabel('E-mail').fill(USERS.client);
    await page.getByLabel('Senha').fill(PASSWORD);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page).toHaveURL(/\/relatorio$/);
    await expect(page.getByText('Relatório de desempenho', { exact: false })).toBeVisible();
  });

  test('senha errada mostra mensagem neutra e não entra', async ({ page }) => {
    await page.goto('/entrar');
    await page.getByLabel('E-mail').fill(USERS.admin);
    await page.getByLabel('Senha').fill('senha-errada-123');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('E-mail ou senha incorretos.');
    await page.goto('/');
    await expect(page).toHaveURL(/\/entrar$/);
  });

  test('recuperar senha responde igual exista ou não o e-mail', async ({ page }) => {
    await page.goto('/entrar');
    await page.getByRole('button', { name: 'Esqueci minha senha' }).click();
    await page.getByLabel('E-mail').fill('ninguem@nao-existe.invalid');
    await page.getByRole('button', { name: 'Enviar link' }).click();
    await expect(page.getByRole('status')).toContainText('Se este e-mail tiver acesso ao painel');
  });

  test('não existe cadastro aberto', async ({ page }) => {
    await page.goto('/entrar');
    await expect(page.getByText('Não há cadastro aberto.')).toBeVisible();
    const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const { data, error } = await anon.auth.signUp({ email: 'intruso@teste.invalid', password: 'qualquer-senha-123' });
    expect(error).not.toBeNull();
    expect(data.user).toBeNull();
  });

  test('sair encerra a sessão neste navegador', async ({ page }) => {
    // Usuário descartável: "Sair" encerra todas as sessões da pessoa, e as sessões dos papéis
    // fictícios são compartilhadas pelos outros testes.
    const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const email = `sair.${Date.now()}@teste.invalid`;
    const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    expect(created.error).toBeNull();
    try {
      await page.goto('/entrar');
      await page.getByLabel('E-mail').fill(email);
      await page.getByLabel('Senha').fill(PASSWORD);
      await page.getByRole('button', { name: 'Entrar', exact: true }).click();
      await settled(page);
      await page.getByRole('button', { name: 'Sair' }).click();
      await expect(page).toHaveURL(/\/entrar$/);
      await page.goto('/publicacoes');
      await expect(page).toHaveURL(/\/entrar$/);
      const leftover = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.endsWith('-auth-token')));
      expect(leftover).toEqual([]);
    } finally {
      await admin.auth.admin.deleteUser(created.data.user!.id);
    }
  });
});
