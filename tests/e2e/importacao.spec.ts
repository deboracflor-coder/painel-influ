import { as, demoClients, expect, settled, test } from './helpers';

test.use(as('admin'));

test('importação manual: prévia, importa, aparece como manual e pode ser desfeita', async ({ page }) => {
  const { trilha } = await demoClients();
  await page.goto(`/importacao?cliente=${trilha}`);
  await settled(page);
  await page.getByLabel('Conta').selectOption({ label: 'Instagram @trilha.ficticio' });

  // Dias bem antes da série do seed (que cobre só os últimos 120 dias).
  const csv = 'data;seguidores;alcance\r\n01/01/2024;9.000;\r\n02/01/2024;9.010;120\r\n';
  await page.getByLabel('Arquivo CSV').setInputFiles({ name: 'historico.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.getByText('2 linha(s) válida(s)')).toBeVisible();
  await page.getByRole('button', { name: 'Importar 2 dia(s)' }).click();

  const manual = page.locator('section', { has: page.getByRole('heading', { name: 'Lançamentos manuais desta conta' }) });
  await expect(manual.getByRole('row', { name: /01\/01\/2024/ })).toContainText('9.000');
  // Célula sem dado continua sem dado (não vira zero).
  await expect(manual.getByRole('row', { name: /01\/01\/2024/ }).locator('td').nth(2)).not.toHaveText('0');

  await manual.getByLabel('De').fill('2024-01-01');
  await manual.getByLabel('Até').fill('2024-01-02');
  await manual.getByRole('button', { name: 'Apagar lançamentos manuais do intervalo' }).click();
  await expect(manual.getByRole('row', { name: /01\/01\/2024/ })).toHaveCount(0);
});

test('arquivo com problema não importa nada', async ({ page }) => {
  const { trilha } = await demoClients();
  await page.goto(`/importacao?cliente=${trilha}`);
  await settled(page);
  await page.getByLabel('Conta').selectOption({ label: 'Instagram @trilha.ficticio' });
  const csv = 'data;seguidores;curtidas\r\n31/02/2024;10;5\r\n';
  await page.getByLabel('Arquivo CSV').setInputFiles({ name: 'ruim.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.getByText('Colunas não reconhecidas: curtidas. Use o modelo.')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Importar/ })).toBeDisabled();
});
