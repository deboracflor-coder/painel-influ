import { as, expect, horizontalOverflow, settled, test } from './helpers';

const VIEWPORTS = [
  { name: 'celular', width: 360, height: 740 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'computador', width: 1366, height: 800 },
];
const CLIENT_PAGES = ['/', '/redes', '/publicacoes', '/relatorio'];
const AGENCY_PAGES = ['/contas', '/historico', '/monitoramento', '/importacao', '/clientes', '/pessoas'];

test.describe('Responsividade', () => {
  for (const vp of VIEWPORTS) {
    test.describe(vp.name, () => {
      test.use({ viewport: { width: vp.width, height: vp.height }, ...as('admin') });

      test(`todas as telas sem rolagem lateral (${vp.width}px)`, async ({ page }) => {
        for (const path of [...CLIENT_PAGES, ...AGENCY_PAGES]) {
          await page.goto(path);
          await settled(page);
          expect(await horizontalOverflow(page), `${path} em ${vp.width}px`).toBeLessThanOrEqual(0);
        }
      });
    });
  }

  test.describe('menu no celular', () => {
    test.use({ viewport: { width: 360, height: 740 }, ...as('client') });

    test('abre, navega e fecha', async ({ page }) => {
      await page.goto('/');
      await settled(page);
      const nav = page.getByRole('complementary', { name: 'Navegação' });
      await expect(nav.getByRole('link', { name: 'Relatório' })).not.toBeInViewport();
      await page.getByRole('button', { name: 'Abrir menu' }).click();
      await expect(nav.getByRole('link', { name: 'Relatório' })).toBeInViewport();
      await nav.getByRole('link', { name: 'Relatório' }).click();
      await expect(page).toHaveURL(/\/relatorio/);
      await expect(nav.getByRole('link', { name: 'Relatório' })).not.toBeInViewport();
    });
  });
});

test.describe('Desempenho', () => {
  test.use(as('client'));

  // Limites folgados para máquina de CI; os números medidos ficam no relatório do teste.
  test('visão executiva com 120 dias de dados abre em menos de 3 s', async ({ page }, info) => {
    const start = Date.now();
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Audiência' })).toBeVisible();
    await settled(page);
    const ms = Date.now() - start;
    info.annotations.push({ type: 'tempo', description: `visão executiva: ${ms} ms` });
    expect(ms).toBeLessThan(3000);
  });

  test('primeira visita baixa só o necessário; telas pesadas vêm sob demanda', async ({ page }) => {
    const scripts: string[] = [];
    page.on('response', (r) => { if (r.request().resourceType() === 'script') scripts.push(new URL(r.url()).pathname); });
    await page.goto('/');
    await settled(page);
    expect(scripts.some((s) => /ReportPage/.test(s))).toBe(false);
    await page.getByRole('link', { name: 'Relatório' }).click();
    await expect(page.getByRole('button', { name: 'Salvar em PDF' })).toBeVisible();
    expect(scripts.some((s) => /ReportPage/.test(s))).toBe(true);
  });

  test('a tela atualiza os dados sozinha a cada 60 s, sem recarregar', async ({ page }) => {
    await page.clock.install();
    await page.goto('/');
    await settled(page);
    const requests: string[] = [];
    page.on('request', (r) => { if (r.url().includes('/rest/v1/')) requests.push(r.url()); });
    await page.clock.runFor(61_000);
    await expect.poll(() => requests.length).toBeGreaterThan(0);
  });
});

test.describe('Segurança no navegador', () => {
  test('cabeçalhos de segurança da Vercel estão ativos', async ({ request }) => {
    const r = await request.get('/entrar');
    const h = r.headers();
    expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(h['content-security-policy']).toContain("script-src 'self'");
    expect(h['x-frame-options']).toBe('DENY');
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['x-robots-tag']).toContain('noindex');
  });

  test.describe('com sessão', () => {
    test.use(as('admin'));
    test('nenhum segredo no navegador: só a sessão da própria pessoa fica guardada', async ({ page }) => {
      await page.goto('/');
      await settled(page);
      const stored = await page.evaluate(() => JSON.stringify(localStorage) + document.cookie);
      expect(stored).not.toContain(process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'nunca');
      expect(stored).not.toMatch(/service_role/);
      const html = await page.content();
      expect(html).not.toMatch(/service_role|META_APP_SECRET|GOOGLE_CLIENT_SECRET/);
    });
  });
});
