/**
 * Relatório do período: números consolidados, comparação com o período anterior,
 * desempenho por rede e ranking. A mesma estrutura alimenta a tela, o PDF (impressão),
 * os arquivos CSV e a exportação para o Google Sheets.
 * Regra: sem dado continua sem dado (null), nunca vira zero.
 */
import { FORMAT_LABEL, PLATFORM_LABEL, PLATFORM_ORDER } from './format';
import { engagement, followerGrowth, isNum, pctChange, postER, rank, totals } from './metrics';
import type { Period } from './periods';
import type { DailyRow, Platform, Post } from './types';

export interface ReportAccount {
  id: string; platform: Platform; handle: string | null; display_name: string | null;
  status: string; last_synced_at: string | null;
}

export interface ReportInput {
  clientName: string;
  isDemo: boolean;
  period: Period;
  previous: Period;
  accounts: ReportAccount[];
  cur: Post[];
  prev: Post[];
  daily: DailyRow[];
  generatedAt: string;
}

export type ValueKind = 'int' | 'pct' | 'dec';
export interface CompareRow { key: string; label: string; kind: ValueKind; cur: number | null; prev: number | null; change: number | null }
export interface NetworkRow {
  platform: Platform; posts: number; prevPosts: number;
  views: number | null; prevViews: number | null; reach: number | null;
  engagement: number | null; er: number | null; prevEr: number | null;
  followers: number | null; gained: number | null;
}
export interface RankRow { position: number; post: Post; engagement: number | null; er: number | null }

export interface Report {
  input: ReportInput;
  summary: CompareRow[];
  networks: NetworkRow[];
  topViews: RankRow[];
  topEr: RankRow[];
  notes: string[];
}

const row = (key: string, label: string, kind: ValueKind, cur: number | null, prev: number | null): CompareRow =>
  ({ key, label, kind, cur, prev, change: kind === 'pct' ? (isNum(cur) && isNum(prev) ? cur - prev : null) : pctChange(cur, prev) });

export function buildReport(input: ReportInput, topN = 10): Report {
  const { cur, prev, daily, accounts, period, previous } = input;
  const t = totals(cur), tp = totals(prev);
  const ids = accounts.map((a) => a.id);
  const g = followerGrowth(daily, ids, period), gp = followerGrowth(daily, ids, previous);

  const summary: CompareRow[] = [
    row('followers', 'Seguidores no fim do período', 'int', g.followers, gp.followers),
    row('gained', 'Crescimento de seguidores', 'int', g.gained, gp.gained),
    row('posts', 'Publicações', 'int', t.posts, tp.posts),
    row('views', 'Visualizações', 'int', t.views, tp.views),
    row('reach', 'Alcance', 'int', t.reach, tp.reach),
    row('engagement', 'Engajamentos', 'int', t.engagement, tp.engagement),
    row('er', 'Taxa de engajamento', 'pct', t.er, tp.er),
    row('likes', 'Curtidas', 'int', t.likes, tp.likes),
    row('comments', 'Comentários', 'int', t.comments, tp.comments),
    row('shares', 'Compartilhamentos', 'int', t.shares, tp.shares),
    row('saves', 'Salvamentos', 'int', t.saves, tp.saves),
    row('avgViews', 'Visualizações médias por publicação', 'dec', t.avgViews, tp.avgViews),
  ];

  const present = PLATFORM_ORDER.filter((p) => accounts.some((a) => a.platform === p) || cur.some((x) => x.platform === p));
  const networks: NetworkRow[] = present.map((p) => {
    const c = cur.filter((x) => x.platform === p), pv = prev.filter((x) => x.platform === p);
    const tc = totals(c), tpv = totals(pv);
    const gg = followerGrowth(daily, accounts.filter((a) => a.platform === p).map((a) => a.id), period);
    return {
      platform: p, posts: c.length, prevPosts: pv.length, views: tc.views, prevViews: tpv.views, reach: tc.reach,
      engagement: tc.engagement, er: tc.er, prevEr: tpv.er, followers: gg.followers, gained: gg.gained,
    };
  });

  const toRank = (list: Post[]): RankRow[] => list.slice(0, topN).map((post, i) => ({ position: i + 1, post, engagement: engagement(post.metrics), er: postER(post) }));
  const topViews = toRank(rank(cur, 'views').filter((p) => isNum(p.metrics.views)));
  const topEr = toRank(rank(cur, 'er').filter((p) => isNum(postER(p))));

  const notes: string[] = [];
  if (input.isDemo) notes.push('Cliente de demonstração: todos os números deste relatório são fictícios.');
  const manual = cur.filter((p) => p.source === 'manual' || p.source === 'import').length
    + daily.filter((d) => d.source === 'manual' || d.source === 'import').length;
  if (manual) notes.push('Parte dos números foi lançada manualmente (marcada como “Dado manual”), e não veio das APIs das redes.');
  if (!isNum(g.gained)) notes.push('Crescimento de seguidores indisponível: só existe a partir do dia em que a conta foi conectada.');
  for (const a of accounts) {
    if (a.status !== 'connected') {
      notes.push(`${PLATFORM_LABEL[a.platform]} ${a.handle ?? ''}: conta ${a.status === 'expired' ? 'com acesso expirado' : a.status === 'revoked' ? 'desconectada' : 'com erro'}; números até a última coleta${a.last_synced_at ? ` (${a.last_synced_at.slice(0, 10).split('-').reverse().join('/')})` : ''}.`.replace('  ', ' '));
    }
  }
  if (present.includes('facebook')) notes.push('Facebook não fornece salvamentos.');
  if (present.includes('youtube')) notes.push('YouTube não fornece alcance nem salvamentos.');
  notes.push('Taxa de engajamento = engajamentos ÷ alcance (Instagram, Facebook) ou ÷ visualizações (YouTube).');
  notes.push('Métricas de cada publicação: última coleta disponível. Publicações contam no período em que foram publicadas.');

  return { input, summary, networks, topViews, topEr, notes };
}

// ---------- Tabelas para planilha (CSV e Google Sheets) ----------

export type Cell = string | number | null;
export interface Table { name: string; rows: Cell[][] }

const dateBR = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const round = (v: number | null, d = 2) => (isNum(v) ? Math.round(v * 10 ** d) / 10 ** d : null);

export function reportTables(r: Report, posts: Post[] = r.input.cur, daily: DailyRow[] = r.input.daily): Table[] {
  const { input } = r;
  const acc = new Map(input.accounts.map((a) => [a.id, a]));
  const head: Cell[][] = [
    ['Cliente', input.clientName],
    ['Período', `${dateBR(input.period.start)} a ${dateBR(input.period.end)}`],
    ['Período anterior', `${dateBR(input.previous.start)} a ${dateBR(input.previous.end)}`],
    ['Gerado em', input.generatedAt],
    [],
  ];
  const resumo: Cell[][] = [
    ...head,
    ['Indicador', 'Período', 'Período anterior', 'Variação', 'Unidade da variação'],
    ...r.summary.map((s) => [s.label, round(s.cur), round(s.prev), round(s.change, 1), isNum(s.change) ? (s.kind === 'pct' ? 'p.p.' : '%') : null]),
    [],
    ['Observações'],
    ...r.notes.map((n) => [n]),
  ];
  const redes: Cell[][] = [
    ['Rede', 'Publicações', 'Publicações (anterior)', 'Visualizações', 'Visualizações (anterior)', 'Alcance', 'Engajamentos', 'Taxa de engajamento (%)', 'Taxa anterior (%)', 'Seguidores no fim', 'Crescimento'],
    ...r.networks.map((n) => [PLATFORM_LABEL[n.platform], n.posts, n.prevPosts, n.views, n.prevViews, n.reach, n.engagement, round(n.er), round(n.prevEr), n.followers, n.gained]),
  ];
  const publicacoes: Cell[][] = [
    ['Data', 'Rede', 'Conta', 'Formato', 'Legenda', 'Link', 'Visualizações', 'Alcance', 'Curtidas', 'Comentários', 'Compartilhamentos', 'Salvamentos', 'Engajamentos', 'Taxa de engajamento (%)', 'Origem do dado', 'Coletado em'],
    ...rank(posts, 'views').map((p) => [
      dateBR(p.published_at), PLATFORM_LABEL[p.platform], acc.get(p.account_id)?.handle ?? null, FORMAT_LABEL[p.format],
      (p.caption ?? '').replace(/\s+/g, ' ').slice(0, 300), p.permalink,
      p.metrics.views, p.metrics.reach, p.metrics.likes, p.metrics.comments, p.metrics.shares, p.metrics.saves,
      engagement(p.metrics), round(postER(p)), p.source === 'manual' || p.source === 'import' ? 'Dado manual' : p.source === 'api' ? 'API' : null,
      p.collected_at ? dateBR(p.collected_at) : null,
    ]),
  ];
  const diario: Cell[][] = [
    ['Dia', 'Rede', 'Conta', 'Seguidores', 'Alcance', 'Visualizações', 'Origem do dado'],
    ...daily.filter((d) => d.day >= input.period.start && d.day <= input.period.end)
      .sort((a, b) => a.day.localeCompare(b.day) || a.account_id.localeCompare(b.account_id))
      .map((d) => {
        const a = acc.get(d.account_id);
        return [dateBR(d.day), a ? PLATFORM_LABEL[a.platform] : null, a?.handle ?? null, d.followers, d.reach, d.views, d.source === 'api' ? 'API' : 'Dado manual'];
      }),
  ];
  return [
    { name: 'Resumo', rows: resumo },
    { name: 'Redes', rows: redes },
    { name: 'Publicações', rows: publicacoes },
    { name: 'Série diária', rows: diario },
  ];
}

/** CSV no padrão brasileiro: ponto e vírgula, vírgula decimal e BOM (abre certo no Excel e no Sheets pt-BR). Vazio = sem dado. */
/**
 * Nome de arquivo só com ASCII: alguns navegadores trocam por "download" o nome de um
 * arquivo gerado na página quando ele tem acentos.
 */
export function asciiFileName(name: string): string {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
}

export function toCsv(rows: Cell[][]): string {
  const cell = (v: Cell) => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return String(v).replace('.', ',');
    // texto que começa com = + - @ viraria fórmula no Excel/Sheets: prefixa com apóstrofo
    const s = /^[=+\-@]/.test(v) ? `'${v}` : v;
    return /[";\n\r]/.test(s) || s !== v ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '\uFEFF' + rows.map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
}
