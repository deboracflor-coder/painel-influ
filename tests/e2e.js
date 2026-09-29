// Testes de interface no navegador (Playwright): filtros, atualização, erros de API,
// importação, permissões, ausência de dados e responsividade.
// Rodar: npm run build && npm start (sem variáveis do Supabase = modo demonstração) e, em outro terminal, npm run test:e2e
// Requer playwright instalado. E2E_URL muda o endereço testado.
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright')); }

const URL = process.env.E2E_URL || 'http://127.0.0.1:3000/';
const results = [];
const check = (name, cond, detail = '') => { results.push({ name, ok: !!cond, detail }); };

(async () => {
  const launch = { args: ['--no-sandbox'] };
  if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
  const browser = await chromium.launch(launch);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL + '#visao', { waitUntil: 'load' });
  await page.waitForSelector('.kpi');

  const kpi = (label) => page.evaluate((l) => { const k = [...document.querySelectorAll('.kpi')].find((x) => x.querySelector('.kpi-label').textContent.trim().startsWith(l)); return k ? k.querySelector('.kpi-value').textContent.trim() : null; }, label);
  const go = async (h) => { await page.evaluate((x) => { location.hash = x; }, h); await page.waitForTimeout(150); };

  // ---------- Filtros ----------
  const viewsAll = await kpi('Visualizações');
  const postsAll = await kpi('Conteúdos publicados');
  await page.click('button.chip[data-platform="tiktok"]');
  const viewsTT = await kpi('Visualizações');
  check('Filtro de plataforma altera os cards', viewsTT !== viewsAll, `${viewsAll} → ${viewsTT}`);
  const chartSeries = await page.$$eval('.legend span', (s) => s.map((x) => x.textContent.trim()));
  check('Filtro de plataforma altera o gráfico', chartSeries.length === 1 && chartSeries[0] === 'TikTok', chartSeries.join(','));
  await page.click('button.chip[data-platform="tiktok"]');
  await page.selectOption('#f-brand', 'br_trilha');
  const postsBrand = await kpi('Conteúdos publicados');
  check('Filtro de marca altera contagem de conteúdos', postsBrand !== postsAll, `${postsAll} → ${postsBrand}`);
  const camps = await page.$$eval('#f-campaign option', (o) => o.map((x) => x.textContent));
  check('Filtro de campanha lista só campanhas da marca', camps.slice(1).every((c) => c.startsWith('Trilha')), camps.join(' | '));
  await page.click('[data-action="clear-filters"]');
  check('Limpar filtros restaura os números', (await kpi('Conteúdos publicados')) === postsAll);
  await page.selectOption('#f-preset', 'mes_anterior');
  const meta = await page.textContent('#topbar-meta');
  check('Período "Mês anterior" = agosto e compara com julho', meta.includes('01/08/2026 – 31/08/2026') && meta.includes('01/07/2026 – 31/07/2026'), meta);
  await page.uncheck('#f-compare');
  check('Desligar comparação remove variações', (await page.$$('.delta')).length === 0);
  await page.check('#f-compare');
  await page.selectOption('#f-preset', 'mes_atual');

  // ---------- Ausência de dados ----------
  await page.selectOption('#f-brand', 'br_nimbus');
  await go('conteudos');
  check('Sem conteúdos: estado vazio explicativo', (await page.textContent('#view')).includes('Nenhum conteúdo encontrado'));
  await go('insights');
  check('Sem conteúdos: insights não inventam conclusões', (await page.textContent('#view')).includes('não há insights para gerar'));
  await go('formatos');
  check('Sem conteúdos: formatos mostra estado vazio', (await page.textContent('#view')).includes('Nenhum conteúdo no período'));
  await page.goto(URL + '#visao'); await page.reload(); await page.waitForSelector('.kpi');

  // ---------- Cálculo exibido = cálculo do módulo ----------
  const calcCheck = await page.evaluate(() => {
    const { state } = window.__painel;
    const posts = Query.filterPosts(state.db.posts, state.filters, state.db);
    const t = Calc.totals(posts, state.cfg);
    return { views: Math.round(t.views).toLocaleString('pt-BR'), er: t.er.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%' };
  });
  check('Card de visualizações bate com o módulo de cálculo', (await kpi('Visualizações')) === calcCheck.views, calcCheck.views);
  check('Card de taxa de engajamento bate com o módulo de cálculo', (await kpi('Taxa de engajamento')) === calcCheck.er, calcCheck.er);

  // ---------- Atualização e erros de API ----------
  const lastBefore = await page.textContent('#topbar-meta');
  await go('integracoes');
  await page.check('#fail-acc_tt');
  await page.click('#btn-sync');
  await page.waitForFunction(() => !window.__painel.state.syncing, null, { timeout: 5000 });
  const toast = await page.textContent('#toast');
  check('Atualizar dados conclui e informa contas com erro', /2 com erro/.test(toast), toast);
  const log = await page.textContent('#view');
  check('Log registra erro de limite de requisições', log.includes('rate_limited'));
  check('Log registra token expirado', log.includes('token_expired'));
  check('Última atualização muda após sincronizar', (await page.textContent('#topbar-meta')) !== lastBefore);
  await go('visao');
  check('Erro de sync aparece como alerta', (await page.textContent('#view')).includes('Erro na última sincronização de TikTok'));
  check('Status mostra Facebook com token expirado', (await page.textContent('.sync-strip')).includes('token expirado'));
  // Reconectar Facebook e buscar dados pendentes
  await go('integracoes');
  await page.click('[data-action="reconnect"][data-id="acc_fb"]');
  await page.click('#btn-sync');
  await page.waitForFunction(() => !window.__painel.state.syncing, null, { timeout: 5000 });
  const fbNull = await page.evaluate(() => window.__painel.state.db.posts.filter((p) => p.platform === 'facebook' && p.metrics.views === null).length);
  check('Após reconectar, conteúdos do Facebook recebem métricas', fbNull === 0, `${fbNull} sem métricas`);

  // ---------- Importação ----------
  await go('importar');
  await page.click('[data-action="sample-import"]');
  const imp = await page.textContent('#view');
  check('Importação: 3 linhas válidas', imp.includes('3 prontas para importar'), '');
  check('Importação: 1 duplicata detectada', imp.includes('1 duplicadas'));
  check('Importação: erros listados por linha', imp.includes('Data inválida') && imp.includes('Plataforma desconhecida') && imp.includes('Marca não cadastrada'));
  const before = await page.evaluate(() => window.__painel.state.db.posts.length);
  await page.click('[data-action="do-import"]');
  const after = await page.evaluate(() => window.__painel.state.db.posts.length);
  check('Importação adiciona conteúdos ao dashboard', after - before === 3, `${before} → ${after}`);
  await page.click('[data-action="sample-import"]');
  check('Reimportar o mesmo arquivo não duplica', (await page.textContent('#view')).includes('0 prontas para importar'));
  await page.click('[data-action="cancel-import"]');
  await go('redes.linkedin');
  await go('conteudos');
  await page.click('button.chip[data-platform="linkedin"]');
  check('Conteúdo importado aparece com selo', (await page.textContent('#view')).includes('Importado'));
  await page.click('button.chip[data-platform="linkedin"]');

  // Excel
  const xlsxOk = await page.evaluate(() => typeof XLSX !== 'undefined');
  if (xlsxOk) check('Leitor de Excel carregado', true);
  else console.log('• Leitor de Excel não testado: a CDN está bloqueada neste ambiente de teste (o app avisa para salvar em CSV)');

  // ---------- Parâmetros ----------
  await go('marca.br_aurora');
  const emvBefore = await page.textContent('.estimate-value');
  await go('parametros');
  await page.fill('tbody tr:first-child input[data-k="rate"]', '36');
  await page.dispatchEvent('tbody tr:first-child input[data-k="rate"]', 'change');
  await go('marca.br_aurora');
  const emvAfter = await page.textContent('.estimate-value');
  check('Alterar CPM recalcula o EMV', emvBefore !== emvAfter, `${emvBefore} → ${emvAfter}`);
  await go('parametros');
  await page.click('[data-action="reset-cfg"]');

  // ---------- Permissões ----------
  await page.selectOption('#viewer-select', 'brand:br_aurora');
  await page.waitForTimeout(150);
  const nav = await page.$$eval('#nav .nav-link', (l) => l.map((x) => x.textContent.trim()));
  check('Portal da marca: menu restrito', !nav.some((n) => /Integrações|Parâmetros|Importação|Marcas parceiras/.test(n)), nav.join(', '));
  check('Portal da marca: sem botão de atualizar', await page.$eval('#btn-sync', (b) => b.hidden));
  await go('marca.br_trilha');
  check('Portal da marca: outra marca bloqueada', (await page.textContent('#view')).includes('Acesso restrito'));
  await go('integracoes');
  check('Portal da marca: rota interna redireciona', (await page.textContent('#page-title')).includes('Aurora'));
  await go('conteudos');
  const brandsSeen = await page.evaluate(() => [...new Set(Query.filterPosts(Query.scope(window.__painel.state.db, window.__painel.state.viewer).posts, {}, null).map((p) => p.brand_id))]);
  check('Portal da marca: só conteúdos da própria marca', brandsSeen.length === 1 && brandsSeen[0] === 'br_aurora', brandsSeen.join(','));
  check('Portal da marca: nome de outra marca não aparece nas telas nem nos filtros', !['#view', '#filters', '#nav', '#page-title'].some(() => false) && !(await page.evaluate(() => ['#view', '#filters', '#nav'].map((s) => document.querySelector(s).textContent).join(' '))).includes('Trilha'));
  await go('entregas');
  check('Portal da marca: entregas sem edição de status', (await page.$$('select[data-action="item-status"]')).length === 0);
  await page.selectOption('#viewer-select', 'viewer');
  await go('parametros');
  check('Equipe somente leitura: sem edição de parâmetros', (await page.textContent('#view')).includes('Sem permissão'));
  await page.selectOption('#viewer-select', 'owner');

  // ---------- Responsividade ----------
  const routes = ['visao', 'redes.instagram', 'redes.youtube', 'redes.linkedin', 'conteudos', 'formatos', 'marcas', 'marca.br_aurora', 'marca.br_nimbus', 'entregas', 'campanhas', 'insights', 'integracoes', 'importar', 'relatorio', 'parametros', 'metodologia'];
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const over = [];
    for (const r of routes) { await go(r); const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); if (o > 1) over.push(`${r}(+${o}px)`); }
    check(`Sem rolagem horizontal em ${width}px (${routes.length} telas)`, over.length === 0, over.join(' '));
  }
  check('Nenhum erro de JavaScript durante os testes', errors.length === 0, errors.join(' | '));

  await browser.close();
  const pass = results.filter((r) => r.ok).length;
  for (const r of results) console.log(`${r.ok ? '✓' : '✕'} ${r.name}${r.detail ? '  · ' + r.detail : ''}`);
  console.log(`\n${pass}/${results.length} verificações passaram`);
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
