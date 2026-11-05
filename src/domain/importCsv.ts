/**
 * Leitura do CSV de importação manual (série diária de uma conta).
 * Aceita ";" ou "," como separador, datas DD/MM/AAAA ou AAAA-MM-DD e números com
 * separador de milhar brasileiro. Célula vazia = sem dado (nunca vira zero).
 */

export const IMPORT_COLUMNS = {
  data: 'day',
  seguidores: 'followers',
  alcance: 'reach',
  impressoes: 'impressions',
  visualizacoes: 'views',
  visitas_perfil: 'profile_visits',
} as const;
type Field = (typeof IMPORT_COLUMNS)[keyof typeof IMPORT_COLUMNS];

export interface ImportRow { day: string; followers: number | null; reach: number | null; impressions: number | null; views: number | null; profile_visits: number | null }
export interface ImportResult { rows: ImportRow[]; errors: string[] }

export const TEMPLATE_CSV = '\uFEFFdata;seguidores;alcance;impressoes;visualizacoes;visitas_perfil\r\n01/10/2026;12500;;;;\r\n';

const norm = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_');

function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

export function parseDay(s: string): string | null {
  const t = s.trim();
  let y: number, m: number, d: number;
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (br) { d = +br[1]!; m = +br[2]!; y = +br[3]!; }
  else if (iso) { y = +iso[1]!; m = +iso[2]!; d = +iso[3]!; }
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

/** Inteiro não negativo; aceita "12.500" e "12500". Vazio = null; inválido = NaN. */
export function parseCount(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ''));
  if (/^\d+$/.test(t)) return Number(t);
  return Number.NaN;
}

export function parseImportCsv(text: string, today: string): ImportResult {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (!lines.length) return { rows: [], errors: ['Arquivo vazio.'] };
  const sep = (lines[0]!.match(/;/g)?.length ?? 0) >= (lines[0]!.match(/,/g)?.length ?? 0) ? ';' : ',';
  const header = splitLine(lines[0]!, sep).map(norm);
  const cols = header.map((h) => (IMPORT_COLUMNS as Record<string, Field>)[h] ?? null);
  const errors: string[] = [];
  const unknown = header.filter((h, i) => h && !cols[i]);
  if (unknown.length) errors.push(`Colunas não reconhecidas: ${unknown.join(', ')}. Use o modelo.`);
  if (!cols.includes('day')) return { rows: [], errors: [...errors, 'Falta a coluna "data".'] };
  if (cols.filter((c) => c && c !== 'day').length === 0) return { rows: [], errors: [...errors, 'Nenhuma coluna de métrica encontrada.'] };

  const rows: ImportRow[] = [];
  const seen = new Set<string>();
  lines.slice(1).forEach((line, i) => {
    const n = i + 2;
    const cells = splitLine(line, sep);
    const row: ImportRow = { day: '', followers: null, reach: null, impressions: null, views: null, profile_visits: null };
    let bad = false;
    cols.forEach((c, j) => {
      if (!c) return;
      const v = cells[j] ?? '';
      if (c === 'day') {
        const d = parseDay(v);
        if (!d) { errors.push(`Linha ${n}: data inválida "${v}".`); bad = true; }
        else if (d > today) { errors.push(`Linha ${n}: data futura (${v}).`); bad = true; }
        else row.day = d;
      } else {
        const num = parseCount(v);
        if (Number.isNaN(num)) { errors.push(`Linha ${n}: valor inválido "${v}" (use números inteiros, sem negativos).`); bad = true; }
        else row[c] = num;
      }
    });
    if (bad) return;
    if ([row.followers, row.reach, row.impressions, row.views, row.profile_visits].every((v) => v === null)) {
      errors.push(`Linha ${n}: nenhum valor preenchido.`);
      return;
    }
    if (seen.has(row.day)) { errors.push(`Linha ${n}: data repetida.`); return; }
    seen.add(row.day);
    rows.push(row);
  });
  if (rows.length > 1000) errors.push('No máximo 1000 linhas por arquivo.');
  return { rows, errors };
}
