/** Datas em ISO 'YYYY-MM-DD', sempre em UTC para evitar problemas de fuso. */
const DAY = 86_400_000;
const toDate = (s: string) => new Date(`${s}T00:00:00Z`);
const toISO = (d: Date) => d.toISOString().slice(0, 10);

export const addDays = (iso: string, n: number) => toISO(new Date(toDate(iso).getTime() + n * DAY));
export const daysBetween = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / DAY) + 1;

export interface Period { start: string; end: string }

/** Período anterior equivalente: mesmo número de dias, imediatamente antes. */
export function previousPeriod({ start, end }: Period): Period {
  const len = daysBetween(start, end);
  const prevEnd = addDays(start, -1);
  return { start: addDays(prevEnd, -(len - 1)), end: prevEnd };
}

export const inPeriod = (iso: string, p: Period) => { const d = iso.slice(0, 10); return d >= p.start && d <= p.end; };

export type PresetKey = 'ultimos_7' | 'ultimos_30' | 'mes_atual' | 'mes_anterior' | 'ultimos_90' | 'personalizado';

export const PRESET_LABEL: Record<PresetKey, string> = {
  ultimos_7: 'Últimos 7 dias',
  ultimos_30: 'Últimos 30 dias',
  mes_atual: 'Mês atual',
  mes_anterior: 'Mês anterior',
  ultimos_90: 'Últimos 90 dias',
  personalizado: 'Personalizado',
};

export function presetPeriod(key: Exclude<PresetKey, 'personalizado'>, today: string): Period {
  switch (key) {
    case 'ultimos_7': return { start: addDays(today, -6), end: today };
    case 'ultimos_30': return { start: addDays(today, -29), end: today };
    case 'ultimos_90': return { start: addDays(today, -89), end: today };
    case 'mes_atual': return { start: `${today.slice(0, 8)}01`, end: today };
    case 'mes_anterior': {
      const end = addDays(`${today.slice(0, 8)}01`, -1);
      return { start: `${end.slice(0, 8)}01`, end };
    }
  }
}

/** Hoje no fuso de São Paulo, em ISO. */
export function todayISO(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
}

/** Segundas-feiras (início de semana) que cobrem o período, começando no início do período. */
export function weekStarts(p: Period): string[] {
  const out: string[] = [];
  for (let s = p.start; s <= p.end; s = addDays(s, 7)) out.push(s);
  return out;
}
