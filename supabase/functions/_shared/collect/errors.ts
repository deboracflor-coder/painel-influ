import { ProviderError } from './types.ts';

interface MetaErr { error?: { code?: number; error_subcode?: number; message?: string; type?: string } }
interface GoogleErr { error?: string | { code?: number; message?: string; errors?: { reason?: string }[]; status?: string }; error_description?: string }

const META_RATE = new Set([4, 17, 32, 613, 80001, 80002, 80003, 80004, 80005, 80006, 80008, 80014]);

/** Classifica erro da Graph API (Meta). Mensagens de erro nunca carregam token. */
export function metaError(status: number, body: unknown): ProviderError {
  const e = (body as MetaErr)?.error ?? {};
  const msg = e.message ?? `HTTP ${status}`;
  if (e.code === 190 || e.code === 102) return new ProviderError('token_expired', msg, status, false);
  if (e.code !== undefined && META_RATE.has(e.code)) return new ProviderError('rate_limited', msg, status, true);
  if (e.code === 10 || e.code === 200 || (e.code !== undefined && e.code >= 200 && e.code <= 299)) {
    return new ProviderError('permission_missing', msg, status, false);
  }
  if (e.code === 100) return new ProviderError('metric_unavailable', msg, status, false, false);
  if (status >= 500 || e.code === 1 || e.code === 2) return new ProviderError('network', msg, status, true);
  return new ProviderError('unknown', msg, status, false);
}

/** Classifica erro das APIs do Google (Data, Analytics, OAuth). */
export function googleError(status: number, body: unknown): ProviderError {
  const b = body as GoogleErr;
  if (typeof b?.error === 'string') {
    const msg = b.error_description ?? b.error;
    if (b.error === 'invalid_grant' || b.error === 'unauthorized_client') return new ProviderError('token_expired', msg, status, false);
    return new ProviderError('unknown', msg, status, false);
  }
  const e = b?.error ?? {};
  const msg = e.message ?? `HTTP ${status}`;
  const reasons = (e.errors ?? []).map((x) => x.reason ?? '');
  if (status === 401) return new ProviderError('token_expired', msg, status, false);
  if (status === 429 || reasons.some((r) => /quota|rateLimit|userRateLimit/i.test(r))) return new ProviderError('rate_limited', msg, status, true);
  if (status === 403) return new ProviderError('permission_missing', msg, status, false);
  if (status >= 500) return new ProviderError('network', msg, status, true);
  return new ProviderError('unknown', msg, status, false);
}
