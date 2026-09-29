// Testes de unidade: cálculos, importação, permissões, insights e alertas.
// Rodar: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const Calc = require('../public/painel/lib/calc.js');
const Query = require('../public/painel/lib/query.js');
const Insights = require('../public/painel/lib/insights.js');
const Importer = require('../public/painel/lib/importer.js');
const DemoData = require('../public/painel/data/demo-data.js');

const post = (platform, m, extra = {}) => ({ id: extra.id || 'p' + Math.random(), platform, format: extra.format || 'reels', published_at: extra.date || '2026-09-10T12:00:00Z', metrics: { reach: null, impressions: null, views: null, likes: null, comments: null, shares: null, saves: null, clicks: null, follows: null, ...m }, ...extra });

test('engajamento soma só componentes disponíveis e devolve null sem dado', () => {
  assert.equal(Calc.engagement({ likes: 10, comments: 2, shares: 3, saves: 5 }), 20);
  assert.equal(Calc.engagement({ likes: 10, comments: 2, shares: 3, saves: null }), 15);
  assert.equal(Calc.engagement({ likes: null, comments: null, shares: null, saves: null }), null);
});

test('taxa de engajamento usa a base de cada plataforma', () => {
  const ig = post('instagram', { reach: 1000, views: 4000, likes: 50, comments: 5, shares: 5, saves: 0 });
  const tt = post('tiktok', { reach: 800, views: 2000, likes: 50, comments: 5, shares: 5 });
  assert.equal(Calc.postER(ig, {}), 6);          // 60 / 1000 alcance
  assert.equal(Calc.postER(tt, {}), 3);          // 60 / 2000 views
  assert.equal(Calc.postER(post('youtube', { likes: 5 }), {}), null); // sem views: sem taxa
});

test('taxa agregada é ponderada (não média de taxas)', () => {
  const a = post('instagram', { reach: 100, likes: 10 });     // 10%
  const b = post('instagram', { reach: 900, likes: 9 });      // 1%
  assert.equal(Calc.aggregateER([a, b], {}), 1.9);            // 19 / 1000, e não (10 + 1) / 2
});

test('variação percentual e período anterior equivalente', () => {
  assert.equal(Calc.pctChange(110, 100), 10);
  assert.equal(Calc.pctChange(90, 100), -10);
  assert.equal(Calc.pctChange(10, 0), null);
  assert.equal(Calc.pctChange(null, 10), null);
  assert.deepEqual(Calc.previousPeriod('2026-09-01', '2026-09-29'), { start: '2026-08-03', end: '2026-08-31' });
  assert.deepEqual(Calc.previousPeriod('2026-02-01', '2026-02-28'), { start: '2026-01-04', end: '2026-01-31' });
  assert.equal(Calc.daysBetween('2026-09-01', '2026-09-29'), 29);
});

test('crescimento de seguidores usa o dia anterior ao início como base', () => {
  const daily = [
    { account_id: 'a', day: '2026-08-31', followers: 1000 },
    { account_id: 'a', day: '2026-09-15', followers: 1030 },
    { account_id: 'a', day: '2026-09-30', followers: 1050 },
    { account_id: 'b', day: '2026-08-31', followers: 500 },
    { account_id: 'b', day: '2026-09-30', followers: 490 },
  ];
  const g = Calc.followerGrowth(daily, ['a', 'b'], '2026-09-01', '2026-09-30');
  assert.equal(g.followers, 1540);
  assert.equal(g.gained, 40);
  assert.equal(Math.round(g.pct * 100) / 100, 2.67);
  assert.equal(Calc.followerGrowth([], ['a'], '2026-09-01', '2026-09-30').followers, null);
});

test('totais ignoram métricas ausentes em vez de tratar como zero', () => {
  const t = Calc.totals([post('youtube', { views: 100 }), post('youtube', { views: 300 })], {});
  assert.equal(t.views, 400);
  assert.equal(t.reach, null);
  assert.equal(t.avgViews, 200);
});

test('EMV: CPM por visualizações, prioridade do formato e posts sem parâmetro', () => {
  const params = [
    { platform: 'instagram', format: null, basis: 'views', rate: 20, valid_from: '2026-01-01' },
    { platform: 'instagram', format: 'story', basis: 'reach', rate: 10, valid_from: '2026-01-01' },
    { platform: 'tiktok', format: null, basis: 'engagements', rate: 0.5, valid_from: '2026-01-01' },
  ];
  const r = Calc.emv([
    post('instagram', { views: 10000 }),                                  // 10.000/1000 × 20 = 200
    post('instagram', { reach: 2000, views: 2500 }, { format: 'story' }), // 2.000/1000 × 10 = 20
    post('tiktok', { likes: 100, comments: 10, shares: 10 }),             // 120 × 0,5 = 60
    post('youtube', { views: 5000 }),                                     // sem parâmetro
    post('instagram', { views: null }),                                   // sem métrica base
  ], params);
  assert.equal(r.total, 280);
  assert.deepEqual(r.missing, { sem_parametro: 1, sem_metrica_base: 1 });
  assert.equal(Calc.emv([post('youtube', { views: 1 })], []).total, null);
});

test('EMV respeita vigência do parâmetro', () => {
  const params = [{ platform: 'instagram', basis: 'views', rate: 20, valid_from: '2026-10-01' }];
  assert.equal(Calc.emv([post('instagram', { views: 1000 })], params).total, null);
});

test('entregas: extras não passam de 100% por linha, cancelados saem do contratado, eventos são manuais', () => {
  const dels = [
    { id: 'd1', platform: 'instagram', expected: 2 },
    { id: 'd2', platform: 'instagram', expected: 5 },
    { id: 'd3', platform: null, expected: 1, delivered_manual: 1 },
    { id: 'd4', platform: 'tiktok', expected: 4, cancelled: 1 },
  ];
  const posts = [
    ...Array(2).fill(0).map(() => ({ deliverable_id: 'd1' })),
    ...Array(6).fill(0).map(() => ({ deliverable_id: 'd2' })),
    ...Array(2).fill(0).map(() => ({ deliverable_id: 'd4' })),
  ];
  const p = Calc.deliveryProgress(dels, posts);
  assert.equal(p.expected, 11);   // 2 + 5 + 1 + 3
  assert.equal(p.counted, 10);    // 2 + 5 + 1 + 2
  assert.equal(p.extra, 1);
  assert.equal(Math.round(p.pct), 91);
  assert.equal(p.allComplete, false);
  assert.equal(p.lines[2].manual, true);
});

test('indicadores de negócio', () => {
  const bi = Calc.businessIndicators({ contract_value: 10000, media_value: null, product_value: 2000 }, { views: 600000, engagement: 24000 }, 15000);
  assert.equal(bi.investment, 12000);
  assert.equal(bi.cpmViews, 20);
  assert.equal(bi.costPerEngagement, 0.5);
  assert.equal(bi.roiEstimated, 25);
  assert.equal(Calc.businessIndicators(null, { views: 1 }, 10).roiEstimated, null);
});

test('ranking deixa métricas ausentes por último', () => {
  const r = Calc.rank([post('youtube', { views: 5 }, { id: 'a' }), post('youtube', { saves: null, views: 1 }, { id: 'b' }), post('instagram', { saves: 9 }, { id: 'c' })], 'saves', {});
  assert.equal(r[0].id, 'c');
});

// ---------- Importação ----------
test('CSV com ponto e vírgula, aspas e números em formato brasileiro', () => {
  const p = Importer.parseCSV('﻿Plataforma;ID;Data;Formato;Título;Visualizações\nInstagram;1;01/09/2026;Reels;"Olá; ""mundo""";1.234\n');
  assert.equal(p.delimiter, ';');
  assert.deepEqual(p.header, ['Plataforma', 'ID', 'Data', 'Formato', 'Título', 'Visualizações']);
  assert.equal(p.rows[0][4], 'Olá; "mundo"');
  for (const [raw, v] of [['1.234', 1234], ['1.234,5', 1235], ['12,5k', 12500], ['2,1mi', 2100000], ['1,234', 1234], ['800', 800], ['7 mil', 7000]]) assert.equal(Importer.parseNumber(raw).value, v, raw);
  assert.equal(Importer.parseNumber('abc').error, true);
  assert.equal(Importer.parseNumber('').value, null);
});

test('datas: aceita dd/mm/aaaa e ISO, rejeita datas impossíveis', () => {
  assert.equal(Importer.parseDate('05/09/2026'), '2026-09-05');
  assert.equal(Importer.parseDate('2026-09-05'), '2026-09-05');
  assert.equal(Importer.parseDate('31/09/2026'), null);
  assert.equal(Importer.parseDate('ontem'), null);
});

test('mapeamento automático reconhece nomes em português e inglês', () => {
  const m = Importer.suggestMapping(['Rede', 'ID do post', 'Data', 'Tipo', 'Views', 'Salvos', 'Likes']);
  assert.equal(m.platform, 0); assert.equal(m.external_id, 1); assert.equal(m.views, 4); assert.equal(m.saves, 5); assert.equal(m.likes, 6);
});

test('validação: erros, duplicatas no arquivo e no banco, marca inexistente', () => {
  const csv = [
    'Plataforma;ID do post;Data;Formato;Marca;Visualizações;Curtidas',
    'Instagram;A1;01/09/2026;Reels;;1000;50',
    'Instagram;A1;01/09/2026;Reels;;1000;50',        // repetido no arquivo
    'Instagram;EXISTE;01/09/2026;Reels;;1000;50',    // já existe no banco
    'Kwai;K1;01/09/2026;Vídeo;;1000;50',              // plataforma desconhecida
    'TikTok;T1;01/09/2026;Vídeo;Marca X;1000;50',     // marca não cadastrada
    'TikTok;T2;01/12/2026;Vídeo;;1000;50',            // data no futuro
    'TikTok;T3;01/09/2026;Vídeo;;;',                  // sem métricas
    'YouTube;Y1;02/09/2026;Shorts;Aurora;abc;1',      // número inválido
  ].join('\n');
  const parsed = Importer.parseCSV(csv);
  const r = Importer.validate(parsed, Importer.suggestMapping(parsed.header), {
    posts: [{ platform: 'instagram', external_id: 'EXISTE' }], brands: [{ id: 'b1', name: 'Aurora' }], campaigns: [], today: '2026-09-29',
  });
  assert.equal(r.valid.length, 1);
  assert.equal(r.valid[0].source, 'import');
  assert.deepEqual(r.valid[0].manualFields.sort(), ['likes', 'views']);
  assert.equal(r.duplicates.length, 2);
  assert.deepEqual(r.errors.map((e) => e.line), [5, 6, 7, 8, 9]);
});

test('validação: coluna obrigatória não mapeada impede a importação', () => {
  const parsed = Importer.parseCSV('Plataforma,Data\nInstagram,01/09/2026');
  const r = Importer.validate(parsed, Importer.suggestMapping(parsed.header), { posts: [] });
  assert.match(r.fatal, /ID do post/);
});

// ---------- Permissões ----------
test('portal da marca só enxerga os próprios dados', () => {
  const db = DemoData.build();
  const s = Query.scope(db, { role: 'brand', brandId: 'br_aurora' });
  assert.ok(s.posts.length > 0);
  assert.ok(s.posts.every((p) => p.brand_id === 'br_aurora'));
  assert.ok(s.campaigns.every((c) => c.brand_id === 'br_aurora'));
  assert.deepEqual(s.brands.map((b) => b.id), ['br_aurora']);
  assert.ok(s.deliveryItems.every((i) => i.brand_id === 'br_aurora' && !('internal_notes' in i)));
  assert.equal(s.accounts.length, 0);   // não vê contas nem tokens
  assert.equal(s.daily.length, 0);      // nem série orgânica
  assert.equal(s.syncRuns.length, 0);   // nem logs
  assert.equal(Query.can({ role: 'brand' }, 'edit'), false);
  assert.equal(Query.can({ role: 'viewer' }, 'edit'), false);
  assert.equal(Query.can({ role: 'analyst' }, 'edit'), true);
  const none = Query.scope(db, { role: 'brand', brandId: null });
  assert.equal(none.posts.length, 0);
  assert.equal(Query.scope(db, { role: 'desconhecido' }).posts.length, 0);
});

test('filtros globais combinados', () => {
  const db = DemoData.build();
  const f = { start: '2026-08-01', end: '2026-08-31', platforms: ['instagram'], brand: 'br_aurora', contentType: 'patrocinado' };
  const r = Query.filterPosts(db.posts, f, db);
  assert.ok(r.length > 0);
  assert.ok(r.every((p) => p.platform === 'instagram' && p.brand_id === 'br_aurora' && p.sponsored && p.published_at.startsWith('2026-08')));
  assert.equal(Query.filterPosts(db.posts, { ...f, contentType: 'organico' }, db).length, 0);
  const videos = Query.filterPosts(db.posts, { start: '2026-09-01', end: '2026-09-29', contentKind: 'video' }, db);
  assert.ok(videos.every((p) => ['reels', 'video', 'short', 'long_video'].includes(p.format)));
  const pend = Query.filterPosts(db.posts, { deliveryStatus: 'publicado' }, db);
  assert.ok(pend.every((p) => db.deliveryItems.find((i) => i.post_id === p.id).status === 'publicado'));
});

// ---------- Insights, alertas, ausência de dados e erros de API ----------
test('sem dados: insights informam ausência em vez de inventar', () => {
  const db = DemoData.build();
  const out = Insights.insights(db, { start: '2026-09-01', end: '2026-09-29', brand: 'br_nimbus' }, {});
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, 'vazio');
});

test('alertas: token expirado, entrega atrasada, conteúdo sem métricas', () => {
  const db = DemoData.build();
  const al = Insights.alerts(db, { start: '2026-09-01', end: '2026-09-29' }, {}, db.meta.now);
  assert.ok(al.some((a) => a.kind === 'api' && /Facebook/.test(a.text)));
  assert.ok(al.some((a) => a.kind === 'atraso' && /Vídeo longo/.test(a.text)));
  assert.ok(al.some((a) => a.kind === 'sem_metricas'));
  assert.equal(al[0].severity, 'critical');
});

test('alertas: erro de sincronização em conta conectada e limites configuráveis', () => {
  const db = DemoData.build();
  db.syncRuns.push({ account_id: 'acc_tt', started_at: '2026-09-29T23:00:00Z', status: 'error', error: 'rate_limited' });
  const al = Insights.alerts(db, { start: '2026-09-01', end: '2026-09-29' }, {}, db.meta.now);
  assert.ok(al.some((a) => a.kind === 'sync' && /TikTok/.test(a.text)));
  const strict = Insights.alerts(db, { start: '2026-09-01', end: '2026-09-29' }, { alerts: { reachDropPct: 99 } }, db.meta.now);
  assert.ok(!strict.some((a) => a.kind === 'queda'));
});

test('dados de demonstração: determinísticos e sem métricas inventadas onde a API não fornece', () => {
  const a = DemoData.build(), b = DemoData.build();
  assert.deepEqual(a.posts.map((p) => p.metrics.views), b.posts.map((p) => p.metrics.views));
  assert.ok(a.posts.filter((p) => p.platform === 'youtube').every((p) => p.metrics.reach === null));
  assert.ok(a.posts.filter((p) => p.platform === 'instagram').every((p) => p.metrics.impressions === null));
  assert.ok(a.posts.filter((p) => p.platform === 'tiktok' && p.metrics.saves !== null).every((p) => p.manualFields.includes('saves')));
  assert.ok(a.brands.every((x) => x.demo) && a.params.every((x) => x.demo));
});
