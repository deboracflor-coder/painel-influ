import { readFileSync } from 'node:fs';
import { asciiFileName } from '../../src/domain/report';
import { as, demoClients, expect, settled, test } from './helpers';

test.describe('Relatório e exportação', () => {
  test.use(as('admin'));

  test('CSV sai no padrão brasileiro, com o período e sem fórmulas', async ({ page }) => {
    const { aurora } = await demoClients();
    await page.goto(`/relatorio?cliente=${aurora}`);
    await settled(page);
    for (const name of ['Resumo', 'Redes', 'Publicações', 'Série diária']) {
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: `CSV · ${name}` }).click(),
      ]);
      expect(download.suggestedFilename()).toMatch(new RegExp(`^Relatorio Aurora Cosmeticos \\d{4}-\\d{2}-\\d{2} a \\d{4}-\\d{2}-\\d{2} - ${asciiFileName(name)}\\.csv$`));
      const text = readFileSync((await download.path())!, 'utf8');
      expect(text.startsWith('﻿'), 'BOM para o Excel abrir acentos').toBe(true);
      expect(text).toContain(';');
      expect(text).not.toMatch(/(^|;)[=+@]/m);
      if (name === 'Resumo') {
        expect(text).toContain('Cliente;Aurora Cosméticos');
        expect(text).toContain('Indicador;Período;Período anterior;Variação;Unidade da variação');
        expect(text).toMatch(/fictícios/);
      }
    }
  });

  test('PDF: a impressão tem uma seção por página e esconde o menu', async ({ page }) => {
    const { aurora } = await demoClients();
    await page.goto(`/relatorio?cliente=${aurora}`);
    await settled(page);
    await expect(page.getByRole('button', { name: 'Salvar em PDF' })).toBeVisible();
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByRole('complementary', { name: 'Navegação' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Salvar em PDF' })).toBeHidden();
    const pdf = await page.pdf({ format: 'A4', landscape: true, printBackground: true, preferCSSPageSize: true });
    const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    expect(pages).toBeGreaterThanOrEqual(4);
  });

  test('Google Sheets aparece como opção de exportação', async ({ page }) => {
    await page.goto('/relatorio');
    await settled(page);
    await expect(page.getByRole('button', { name: 'Conectar Google Sheets' })).toBeVisible();
  });
});

test.describe('Coleta e histórico', () => {
  test.use(as('admin'));

  test('histórico mostra as coletas e o erro de acesso expirado', async ({ page }) => {
    const { aurora } = await demoClients();
    await page.goto(`/historico?cliente=${aurora}`);
    await settled(page);
    await expect(page.getByRole('heading', { name: 'Sincronizações' })).toBeVisible();
    await expect(page.locator('table').first().locator('tbody tr').first()).toBeVisible();
    await expect(page.getByText('o acesso à conta expirou').first()).toBeVisible();
  });

  test('monitoramento aponta a conta com acesso expirado', async ({ page }) => {
    await page.goto('/monitoramento');
    await settled(page);
    const row = page.locator('tr', { hasText: '@aurora.ficticio' }).filter({ hasText: 'Instagram' });
    await expect(row.getByText('Acesso expirado', { exact: true })).toBeVisible();
  });

  test('contas mostram a frequência de coleta de cada conta', async ({ page }) => {
    const { trilha } = await demoClients();
    await page.goto(`/contas?cliente=${trilha}`);
    await settled(page);
    await expect(page.getByRole('button', { name: 'Conectar Instagram e Facebook' })).toBeVisible();
    await expect(page.locator('tr', { hasText: '@trilha.ficticio' }).getByRole('combobox').first()).toBeVisible();
  });
});

test.describe('Métricas indisponíveis', () => {
  test.use(as('client'));

  test('YouTube não fornece alcance nem salvamentos: aparecem como indisponíveis, nunca como zero', async ({ page }) => {
    await page.goto('/redes/youtube');
    await settled(page);
    for (const label of ['Alcance', 'Salvamentos']) {
      const kpi = page.locator('.kpi', { has: page.locator('.kpi-label', { hasText: new RegExp(`^${label}`) }) });
      await expect(kpi.locator('.kpi-value')).toHaveText('Indisponível');
    }
  });
});
