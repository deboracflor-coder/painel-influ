import { isNum } from './metrics';
import type { Platform, PostFormat } from './types';

const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

export const fmtInt = (v: number | null | undefined) => (isNum(v) ? nf0.format(v) : '—');
export const fmtDec = (v: number | null | undefined) => (isNum(v) ? nf1.format(v) : '—');
export const fmtPct = (v: number | null | undefined, digits = 1) =>
  isNum(v) ? `${v.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%` : '—';
export const fmtSigned = (v: number | null | undefined) => (isNum(v) ? `${v > 0 ? '+' : ''}${nf0.format(v)}` : '—');
export const fmtHours = (seconds: number | null | undefined) => (isNum(seconds) ? `${nf1.format(seconds / 3600)} h` : '—');

export function compact(v: number): string {
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

export const fmtDate = (iso: string | null | undefined) =>
  iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—';
export const fmtDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }) : '—';

export const PLATFORM_LABEL: Record<Platform, string> = {
  instagram: 'Instagram', facebook: 'Facebook', youtube: 'YouTube', tiktok: 'TikTok', x: 'X', linkedin: 'LinkedIn',
};
/** Ordem de exibição das redes (prioridade do produto). */
export const PLATFORM_ORDER: Platform[] = ['instagram', 'facebook', 'youtube', 'tiktok', 'x', 'linkedin'];

export const FORMAT_LABEL: Record<PostFormat, string> = {
  reels: 'Reels', story: 'Stories', carousel: 'Carrossel', photo: 'Foto', video: 'Vídeo', short: 'Shorts',
  long_video: 'Vídeo longo', live: 'Live', text: 'Texto', other: 'Outro',
};
