import { describe, expect, it } from 'vitest';
import { parseCount, parseDay, parseImportCsv } from '../../src/domain/importCsv';
import { buildReport, reportTables, toCsv, type ReportInput } from '../../src/domain/report';
import type { Post, PostMetrics } from '../../src/domain/types';

const M = (m: Partial<PostMetrics>): PostMetrics => ({
  views: null, reach: null, impressions: null, likes: null, comments: null, shares: null, saves: null,
  link_clicks: null, follows: null, watch_time_seconds: null, ...m,
});
const post = (id: string, platform: Post['platform'], day: string, m: Partial<PostMetrics>, source: Post['source'] = 'api'): Post => ({
  id, account_id: `acc-${platform}`, platform, format: 'reels', permalink: null, caption: `Post ${id}`,
  thumbnail_url: null, published_at: `${day}T12:00:00Z`, collected_at: `${day}T18:00:00Z`, source, metrics: M(m),
});

const base: ReportInput = {
  clientName: 'Cliente teste', isDemo: false,
  period: { start: '2026-10-01', end: '2026-10-31' }, previous: { start: '2026-08-31', end: '2026-09-30' },
  accounts: [
    { id: 'acc-instagram', platform: 'instagram', handle: '@ig', display_name: null, status: 'connected', last_synced_at: '2026-11-01T00:00:00Z' },
    { id: 'acc-youtube', platform: 'youtube', handle: '@yt', display_name: null, status: 'expired', last_synced_at: '2026-10-20T00:00:00Z' },
  ],
  cur: [
    post('a', 'instagram', '2026-10-05', { views: 1000, reach: 800, likes: 80, comments: 10, shares: 5, saves: 5 }),
    post('b', 'instagram', '2026-10-10', { views: 3000, reach: 2000, likes: 100 }),
    post('c', 'youtube', '2026-10-12', { views: 500, likes: 20 }, 'manual'),
    post('d', 'instagram', '2026-10-15', { likes: 4 }),
  ],
  prev: [post('p', 'instagram', '2026-09-10', { views: 2000, reach: 1000, likes: 50 })],
  daily: [
    { account_id: 'acc-instagram', day: '2026-09-30', followers: 1000, reach: null, views: null, impressions: null, source: 'api' },
    { account_id: 'acc-instagram', day: '2026-10-31', followers: 1100, reach: 50, views: null, impressions: null, source: 'api' },
  ],
  generatedAt: '01/11/2026 10:00',
};

describe('Relatório', () => {
  const r = buildReport(base);
  const s = Object.fromEntries(r.summary.map((x) => [x.key, x]));

  it('compara com o período anterior', () => {
    expect(s.views).toMatchObject({ cur: 4500, prev: 2000, change: 125 });
    expect(s.posts).toMatchObject({ cur: 4, prev: 1 });
    expect(s.gained!.cur).toBe(100);
  });
  it('taxa de engajamento varia em pontos percentuais', () => {
    expect(s.er!.kind).toBe('pct');
    expect(s.er!.change).toBeCloseTo(s.er!.cur! - s.er!.prev!, 6);
  });
  it('sem dado continua sem dado (salvamentos só de um post; anterior sem base)', () => {
    expect(s.saves).toMatchObject({ cur: 5, prev: null, change: null });
  });
  it('ranking por visualizações ignora posts sem o dado', () => {
    expect(r.topViews.map((x) => x.post.id)).toEqual(['b', 'a', 'c']);
  });
  it('ranking por taxa usa a base de cada rede', () => {
    expect(r.topEr[0]!.post.id).toBe('a'); // 100/800 = 12,5% > 100/2000 e 20/500
  });
  it('separa por rede', () => {
    const yt = r.networks.find((n) => n.platform === 'youtube')!;
    expect(yt).toMatchObject({ posts: 1, views: 500, reach: null });
  });
  it('avisa dado manual, conta expirada e limitações das redes', () => {
    const notes = r.notes.join(' ');
    expect(notes).toMatch(/lançada manualmente/);
    expect(notes).toMatch(/YouTube @yt: conta com acesso expirado/);
    expect(notes).toMatch(/YouTube não fornece alcance/);
  });
  it('cliente de demonstração é avisado', () => {
    expect(buildReport({ ...base, isDemo: true }).notes[0]).toMatch(/fictícios/);
  });
});

describe('Planilhas', () => {
  const tables = reportTables(buildReport(base));
  it('gera as quatro abas', () => {
    expect(tables.map((t) => t.name)).toEqual(['Resumo', 'Redes', 'Publicações', 'Série diária']);
  });
  it('publicações marcam a origem do dado e deixam vazio o que não existe', () => {
    const pub = tables[2]!.rows;
    const c = pub.find((r) => r[4] === 'Post c')!;
    expect(c[14]).toBe('Dado manual');
    expect(c[7]).toBeNull(); // alcance do YouTube
  });
  it('CSV no padrão brasileiro, vazio para sem dado, sem fórmulas', () => {
    const csv = toCsv([['Nome', 'Valor'], ['a;b', 1.5], ['=HYPERLINK("x")', null], ['ok', -3]]);
    expect(csv.startsWith('﻿Nome;Valor\r\n')).toBe(true);
    expect(csv).toContain('"a;b";1,5');
    expect(csv).toContain(`"'=HYPERLINK(""x"")";\r\n`);
    expect(csv).toContain('ok;-3');
  });
});

describe('Importação manual (CSV)', () => {
  it('lê datas e números no formato brasileiro', () => {
    expect(parseDay('05/10/2026')).toBe('2026-10-05');
    expect(parseDay('2026-10-05')).toBe('2026-10-05');
    expect(parseDay('31/02/2026')).toBeNull();
    expect(parseCount('12.500')).toBe(12500);
    expect(parseCount('')).toBeNull();
    expect(parseCount('-3')).toBeNaN();
    expect(parseCount('1,5')).toBeNaN();
  });
  it('aceita o modelo e deixa vazio como sem dado', () => {
    const r = parseImportCsv('﻿data;seguidores;alcance\r\n01/10/2026;12.500;\r\n02/10/2026;12.510;300\r\n', '2026-11-05');
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([
      { day: '2026-10-01', followers: 12500, reach: null, impressions: null, views: null, profile_visits: null },
      { day: '2026-10-02', followers: 12510, reach: 300, impressions: null, views: null, profile_visits: null },
    ]);
  });
  it('aponta linha com problema', () => {
    const r = parseImportCsv('data,seguidores,curtidas\n01/12/2026,10,\n02/10/2026,,\n03/10/2026,abc,\n03/10/2026,1,\n03/10/2026,2,', '2026-11-05');
    expect(r.errors).toContain('Colunas não reconhecidas: curtidas. Use o modelo.');
    expect(r.errors.some((e) => e.startsWith('Linha 2: data futura'))).toBe(true);
    expect(r.errors.some((e) => e.startsWith('Linha 3: nenhum valor'))).toBe(true);
    expect(r.errors.some((e) => e.startsWith('Linha 4: valor inválido'))).toBe(true);
    expect(r.errors.some((e) => e.startsWith('Linha 6: data repetida'))).toBe(true);
    expect(r.rows).toHaveLength(1);
  });
  it('sem coluna de data não importa nada', () => {
    expect(parseImportCsv('seguidores\n10', '2026-11-05').rows).toEqual([]);
  });
});
