// Coleta de uma conta: lê o token no Vault, chama a rede, grava tudo numa transação
// e registra o resultado em sync_runs / sync_errors.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0';
import { collectFacebook } from './collect/facebook.ts';
import { collectInstagram } from './collect/instagram.ts';
import { type CollectContext, type Platform, ProviderError, type SyncPayload, type SyncWarning } from './collect/types.ts';
import { collectYoutube } from './collect/youtube.ts';
import { freshGoogleToken, googleConfig, makeFetchJson, metaConfig, redact } from './providers.ts';

export interface AccountRow {
  id: string; client_id: string; organization_id: string; platform: Platform; external_account_id: string;
  status: string; sync_frequency_minutes: number; last_synced_at: string | null;
}
export const ACCOUNT_COLUMNS = 'id, client_id, organization_id, platform, external_account_id, status, sync_frequency_minutes, last_synced_at';

const FIRST_SYNC_DAYS = 180;   // primeira coleta: publicações dos últimos 180 dias
const REFRESH_DAYS = 45;       // depois: atualiza métricas das publicações dos últimos 45 dias
const MAX_ATTEMPTS = 3;
const MAX_RAW = 200;

export type SyncOutcome =
  | { status: 'busy' }
  | { status: 'success' | 'partial' | 'error'; run_id: string; posts: number; snapshots: number; daily: number; error?: string };

export async function syncAccount(admin: SupabaseClient, acc: AccountRow, trigger: 'cron' | 'manual' | 'retry', requestedBy: string | null): Promise<SyncOutcome> {
  const now = new Date();
  const ids = { account_id: acc.id, client_id: acc.client_id, organization_id: acc.organization_id };

  // Tentativa: continua a contagem se a última coleta falhou com erro temporário
  const { data: last } = await admin.from('sync_runs').select('attempt, status, next_retry_at')
    .eq('account_id', acc.id).order('queued_at', { ascending: false }).limit(1).maybeSingle();
  const attempt = last && last.status === 'error' && last.next_retry_at ? last.attempt + 1 : 1;

  const { data: run, error: runErr } = await admin.from('sync_runs').insert({
    ...ids, trigger, status: 'running', attempt, started_at: now.toISOString(), requested_by: requestedBy,
  }).select('id').single();
  if (runErr) {
    if (runErr.code === '23505') return { status: 'busy' }; // já existe coleta em andamento
    throw runErr;
  }

  let apiCalls = 0;
  const raw: { endpoint: string; body: unknown }[] = [];
  const onRaw = (url: string, body: unknown) => { apiCalls++; if (raw.length < MAX_RAW) raw.push({ endpoint: redact(url), body: body == null ? null : JSON.parse(redact(JSON.stringify(body))) }); };
  const warnings: SyncWarning[] = [];

  try {
    const { data: token, error: tokErr } = await admin.rpc('read_account_token', { p_account_id: acc.id });
    if (tokErr) throw tokErr;
    if (!token) throw new ProviderError('token_expired', 'Sem acesso salvo para esta conta. Conecte de novo.', null, false);

    const since = new Date(now.getTime() - (acc.last_synced_at ? REFRESH_DAYS : FIRST_SYNC_DAYS) * 86400_000).toISOString();
    const base = { externalId: acc.external_account_id, now: now.toISOString(), since, warnings };
    let payload: SyncPayload;
    if (acc.platform === 'youtube') {
      const g = googleConfig();
      if (!g) throw new ProviderError('permission_missing', 'Integração com o Google não configurada no servidor', null, false);
      const fresh = await freshGoogleToken(token as Record<string, unknown>);
      if (fresh.changed) await admin.rpc('store_account_token', { p_account_id: acc.id, p_token: fresh.token });
      const ctx: CollectContext = { ...base, accessToken: String(fresh.token.access_token), fetchJson: makeFetchJson('google', onRaw) };
      payload = await collectYoutube(ctx, { data: g.data, analytics: g.analytics });
    } else {
      const m = metaConfig();
      if (!m) throw new ProviderError('permission_missing', 'Integração com a Meta não configurada no servidor', null, false);
      const ctx: CollectContext = { ...base, accessToken: String((token as Record<string, unknown>).access_token), fetchJson: makeFetchJson('meta', onRaw) };
      payload = acc.platform === 'instagram' ? await collectInstagram(ctx, m.graph, m.version) : await collectFacebook(ctx, m.graph, m.version);
    }

    const { data: counts, error: ingErr } = await admin.rpc('ingest_sync_batch', { p_account: acc.id, p_payload: payload });
    if (ingErr) throw ingErr;
    const c = counts as { posts: number; snapshots: number; daily: number };
    const status = warnings.length ? 'partial' : 'success';
    const finished = new Date();
    await saveDetails(admin, run.id, ids, raw, warnings);
    await admin.from('sync_runs').update({
      status, finished_at: finished.toISOString(), api_calls: apiCalls, posts_upserted: c.posts, snapshots_written: c.snapshots + c.daily,
    }).eq('id', run.id);
    await admin.from('social_accounts').update({
      status: 'connected', last_synced_at: finished.toISOString(), last_error: null,
      next_sync_at: new Date(finished.getTime() + acc.sync_frequency_minutes * 60_000).toISOString(),
    }).eq('id', acc.id);
    return { status, run_id: run.id, ...c };
  } catch (e) {
    const pe = e instanceof ProviderError ? e : new ProviderError('unknown', (e as Error)?.message ?? 'Erro inesperado', null, false);
    const retry = pe.retryable && attempt < MAX_ATTEMPTS;
    const retryAt = retry ? new Date(Date.now() + 5 * 60_000 * 2 ** (attempt - 1)) : null;
    await saveDetails(admin, run.id, ids, raw, [...warnings, { code: pe.code, message: pe.message, http_status: pe.httpStatus }], pe.retryable);
    await admin.from('sync_runs').update({
      status: 'error', finished_at: new Date().toISOString(), api_calls: apiCalls, next_retry_at: retryAt?.toISOString() ?? null,
    }).eq('id', run.id);
    await admin.from('social_accounts').update({
      status: pe.code === 'token_expired' ? 'expired' : pe.code === 'permission_missing' ? 'error' : acc.status === 'connected' ? 'connected' : acc.status,
      last_error: pe.message.slice(0, 500),
      next_sync_at: pe.code === 'token_expired' ? null
        : (retryAt ?? new Date(Date.now() + acc.sync_frequency_minutes * 60_000)).toISOString(),
    }).eq('id', acc.id);
    return { status: 'error', run_id: run.id, posts: 0, snapshots: 0, daily: 0, error: pe.message };
  }
}

async function saveDetails(admin: SupabaseClient, runId: string, ids: Record<string, string>, raw: { endpoint: string; body: unknown }[], warnings: SyncWarning[], lastRetryable = false) {
  if (raw.length) await admin.from('raw_payloads').insert(raw.map((r) => ({ sync_run_id: runId, endpoint: r.endpoint, body: r.body ?? {} })));
  if (warnings.length) {
    await admin.from('sync_errors').insert(warnings.slice(0, 50).map((w, i, all) => ({
      sync_run_id: runId, ...ids, code: w.code, message: w.message.slice(0, 1000), http_status: w.http_status,
      retryable: i === all.length - 1 ? lastRetryable : false,
    })));
  }
}
