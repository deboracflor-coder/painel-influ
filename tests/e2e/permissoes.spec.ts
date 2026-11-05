import { as, demoClients, expect, restAsUser, settled, test } from './helpers';

const AGENCY_PAGES = ['/contas', '/historico', '/monitoramento', '/importacao'];
const ADMIN_PAGES = ['/clientes', '/pessoas'];

test.describe('Permissões por papel', () => {
  test.describe('pessoa do cliente', () => {
    test.use(as('client'));

    test('menu só mostra o acompanhamento', async ({ page }) => {
      await page.goto('/');
      await settled(page);
      const nav = page.getByRole('complementary', { name: 'Navegação' });
      await expect(nav.getByRole('link')).toHaveText(['Visão executiva', 'Por rede', 'Publicações', 'Relatório']);
    });

    for (const path of [...AGENCY_PAGES, ...ADMIN_PAGES]) {
      test(`endereço digitado ${path} não abre a área da agência`, async ({ page }) => {
        await page.goto(path);
        await expect(page.getByText(/Área da agência|Área restrita/)).toBeVisible();
        await expect(page.locator('table')).toHaveCount(0);
      });
    }
  });

  test.describe('analista', () => {
    test.use(as('analyst'));

    test('vê a área da agência, mas não administra clientes e pessoas', async ({ page }) => {
      await page.goto('/monitoramento');
      await expect(page.getByRole('heading', { name: 'Coletas de todos os clientes' })).toBeVisible();
      const nav = page.getByRole('complementary', { name: 'Navegação' });
      await expect(nav.getByRole('link', { name: 'Clientes' })).toHaveCount(0);
      for (const path of ADMIN_PAGES) {
        await page.goto(path);
        await expect(page.getByText('Área restrita')).toBeVisible();
      }
    });
  });

  test.describe('administração', () => {
    test.use(as('admin'));

    test('abre todas as telas da agência', async ({ page }) => {
      for (const [path, heading] of [
        ['/contas', /Contas/], ['/historico', 'Sincronizações'], ['/monitoramento', 'Coletas de todos os clientes'],
        ['/importacao', 'Importação manual da série diária'], ['/clientes', /Clientes/], ['/pessoas', /Pessoas|Equipe/],
      ] as const) {
        await page.goto(path);
        await settled(page);
        await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible();
      }
    });
  });
});

test.describe('Isolamento entre clientes (no navegador)', () => {
  test.describe('pessoa do cliente Aurora', () => {
    test.use(as('client'));

    test('só enxerga o próprio cliente, mesmo pedindo outro pela URL', async ({ page }) => {
      const { trilha } = await demoClients();
      await page.goto(`/?cliente=${trilha}`);
      await settled(page);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Aurora Cosméticos');
      await expect(page.getByText('Trilha', { exact: false })).toHaveCount(0);
      await page.goto(`/publicacoes?cliente=${trilha}`);
      await settled(page);
      await expect(page.getByText('@trilha.ficticio')).toHaveCount(0);
    });

    test('a API, chamada com a sessão dela, não devolve dados de outro cliente', async ({ page }) => {
      const { trilha } = await demoClients();
      await page.goto('/');
      await settled(page);
      const clients = await restAsUser(page, 'clients?select=name');
      expect(clients.body).toEqual([{ name: 'Aurora Cosméticos' }]);
      for (const table of ['social_accounts', 'posts', 'account_daily_metrics']) {
        const r = await restAsUser(page, `${table}?select=client_id&client_id=eq.${trilha}&limit=5`);
        expect(r.body, table).toEqual([]);
      }
    });
  });

  test.describe('analista atribuído só à Aurora', () => {
    test.use(as('analyst'));

    test('a lista de clientes e o monitoramento só trazem a Aurora', async ({ page }) => {
      await page.goto('/monitoramento');
      await settled(page);
      await expect(page.getByText('Aurora', { exact: false }).first()).toBeVisible();
      await expect(page.getByText('Trilha', { exact: false })).toHaveCount(0);
    });
  });

  test.describe('administração', () => {
    test.use(as('admin'));

    test('troca de cliente e cada um mostra só as próprias contas', async ({ page }) => {
      const { aurora, trilha } = await demoClients();
      await page.goto(`/contas?cliente=${trilha}`);
      await settled(page);
      await expect(page.getByText('@trilha.ficticio').first()).toBeVisible();
      await expect(page.getByText('@aurora.ficticio')).toHaveCount(0);
      await page.getByLabel('Cliente').selectOption(aurora);
      await expect(page.getByText('@aurora.ficticio').first()).toBeVisible();
      await expect(page.getByText('@trilha.ficticio')).toHaveCount(0);
    });
  });
});
