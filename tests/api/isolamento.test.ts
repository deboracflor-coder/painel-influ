/**
 * Isolamento pela API REST (o mesmo caminho que o navegador usa).
 * Requer o Supabase local rodando (`npm run db:start`) e as variáveis
 * SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY (ver README).
 * Todos os dados criados aqui são fictícios e removidos ao final.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  throw new Error('Defina SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY (npx supabase status -o env)');
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, opts);
const run = Date.now().toString(36);
const password = `Teste-${run}-Senha!`;

type Ids = Record<string, string>;
const users: Ids = {};
const ids: Ids = {};

async function createUser(key: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email: `${key}.${run}@example.com`, password, email_confirm: true,
  });
  if (error) throw error;
  users[key] = data.user.id;
}

async function signIn(key: string): Promise<SupabaseClient> {
  const c = createClient(url!, anonKey!, opts);
  const { error } = await c.auth.signInWithPassword({ email: `${key}.${run}@example.com`, password });
  if (error) throw error;
  return c;
}

async function must<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<NonNullable<T>> {
  const { data, error } = await p;
  if (error) throw error;
  if (data === null || data === undefined) throw new Error('Resposta vazia');
  return data;
}

async function exec(p: PromiseLike<{ error: unknown }>): Promise<void> {
  const { error } = await p;
  if (error) throw error;
}

let asC1: SupabaseClient, asC2: SupabaseClient, asAnalyst: SupabaseClient, asAdminA: SupabaseClient;
const anon = createClient(url, anonKey, opts);

beforeAll(async () => {
  for (const k of ['adma', 'anaa', 'cli1', 'cli2', 'admb']) await createUser(k);
  ids.orgA = await must(admin.rpc('bootstrap_organization', { p_name: `Agência A (teste ${run})`, p_admin: users.adma }));
  ids.orgB = await must(admin.rpc('bootstrap_organization', { p_name: `Agência B (teste ${run})`, p_admin: users.admb }));
  await exec(admin.from('organization_members').insert({ organization_id: ids.orgA, user_id: users.anaa, role: 'org_analyst' }));
  const clients = await must(admin.from('clients').insert([
    { organization_id: ids.orgA, name: 'Cliente 1 (teste)', is_demo: true },
    { organization_id: ids.orgA, name: 'Cliente 2 (teste)', is_demo: true },
    { organization_id: ids.orgB, name: 'Cliente 3 (teste)', is_demo: true },
  ]).select('id, name'));
  [ids.c1, ids.c2, ids.c3] = ['Cliente 1 (teste)', 'Cliente 2 (teste)', 'Cliente 3 (teste)']
    .map((n) => clients.find((c) => c.name === n)!.id);
  await exec(admin.from('client_assignments').insert({ client_id: ids.c1, organization_id: ids.orgA, user_id: users.anaa }));
  await exec(admin.from('client_users').insert([
    { client_id: ids.c1, organization_id: ids.orgA, user_id: users.cli1 },
    { client_id: ids.c2, organization_id: ids.orgA, user_id: users.cli2 },
  ]));
  const accounts = await must(admin.from('social_accounts').insert([
    { organization_id: ids.orgA, client_id: ids.c1, platform: 'instagram', external_account_id: `t1-${run}` },
    { organization_id: ids.orgA, client_id: ids.c2, platform: 'youtube', external_account_id: `t2-${run}` },
    { organization_id: ids.orgB, client_id: ids.c3, platform: 'facebook', external_account_id: `t3-${run}` },
  ]).select('id, client_id'));
  const acc = (c: string) => accounts.find((a) => a.client_id === c)!.id;
  await exec(admin.rpc('store_account_token', { p_account_id: acc(ids.c1), p_token: { access_token: 'token-ficticio' } }));
  await exec(admin.from('posts').insert([
    { account_id: acc(ids.c1), client_id: ids.c1, organization_id: ids.orgA, platform: 'instagram', external_post_id: 'a', published_at: '2026-10-01' },
    { account_id: acc(ids.c2), client_id: ids.c2, organization_id: ids.orgA, platform: 'youtube', external_post_id: 'b', published_at: '2026-10-01' },
    { account_id: acc(ids.c3), client_id: ids.c3, organization_id: ids.orgB, platform: 'facebook', external_post_id: 'c', published_at: '2026-10-01' },
  ]));
  ids.acc1 = acc(ids.c1);
  ids.acc2 = acc(ids.c2);

  [asC1, asC2, asAnalyst, asAdminA] = await Promise.all(['cli1', 'cli2', 'anaa', 'adma'].map(signIn));
});

afterAll(async () => {
  if (ids.orgA) await admin.from('organizations').delete().in('id', [ids.orgA, ids.orgB]);
  for (const id of Object.values(users)) await admin.auth.admin.deleteUser(id);
});

describe('Visitante sem login', () => {
  it('não lê clientes, posts nem métricas', async () => {
    for (const t of ['clients', 'posts', 'post_metric_snapshots', 'social_accounts', 'organizations']) {
      const { data, error } = await anon.from(t).select('*');
      expect(error, t).not.toBeNull();
      expect(data).toBeNull();
    }
  });
  it('não consegue criar conta sozinho (cadastro só por convite)', async () => {
    const { data, error } = await anon.auth.signUp({ email: `intruso.${run}@example.com`, password });
    expect(error).not.toBeNull();
    expect(data.user).toBeNull();
  });
});

describe('Usuário do Cliente 1', () => {
  it('vê só o próprio cliente e os próprios posts', async () => {
    expect((await must(asC1.from('clients').select('id'))).map((r) => r.id)).toEqual([ids.c1]);
    const posts = await must(asC1.from('posts').select('client_id'));
    expect(posts.length).toBe(1);
    expect(posts[0].client_id).toBe(ids.c1);
  });
  it('não encontra dados do Cliente 2 nem filtrando pelo id', async () => {
    expect(await must(asC1.from('clients').select('id').eq('id', ids.c2))).toEqual([]);
    expect(await must(asC1.from('posts').select('id').eq('client_id', ids.c2))).toEqual([]);
    expect(await must(asC1.from('social_accounts').select('id').eq('id', ids.acc2))).toEqual([]);
  });
  it('não altera o Cliente 2', async () => {
    const { data } = await asC1.from('clients').update({ name: 'Alterado' }).eq('id', ids.c2).select();
    expect(data ?? []).toEqual([]);
    const still = await must(admin.from('clients').select('name').eq('id', ids.c2).single());
    expect(still.name).toBe('Cliente 2 (teste)');
  });
  it('não se vincula a outro cliente', async () => {
    const { error } = await asC1.from('client_users').insert({ client_id: ids.c2, organization_id: ids.orgA, user_id: users.cli1 });
    expect(error).not.toBeNull();
  });
  it('não lê token, referência de token nem respostas brutas', async () => {
    expect((await asC1.from('social_accounts').select('token_secret_id')).error).not.toBeNull();
    expect((await asC1.rpc('read_account_token', { p_account_id: ids.acc1 })).error).not.toBeNull();
    expect((await asC1.from('raw_payloads').select('*')).error).not.toBeNull();
  });
  it('não chama funções internas nem cria organização', async () => {
    expect((await asC1.rpc('can_read_client', { p_client: ids.c2 })).error).not.toBeNull();
    expect((await asC1.rpc('bootstrap_organization', { p_name: 'X', p_admin: users.cli1 })).error).not.toBeNull();
  });
  it('não grava posts nem métricas', async () => {
    const { error } = await asC1.from('posts').insert({ account_id: ids.acc1, client_id: ids.c1, organization_id: ids.orgA, platform: 'instagram', external_post_id: 'falso', published_at: '2026-10-02' });
    expect(error).not.toBeNull();
  });
});

describe('Usuário do Cliente 2', () => {
  it('vê só o próprio cliente', async () => {
    expect((await must(asC2.from('clients').select('id'))).map((r) => r.id)).toEqual([ids.c2]);
  });
});

describe('Analista da agência', () => {
  it('vê só o cliente atribuído', async () => {
    expect((await must(asAnalyst.from('clients').select('id'))).map((r) => r.id)).toEqual([ids.c1]);
  });
  it('não cria cliente', async () => {
    expect((await asAnalyst.from('clients').insert({ organization_id: ids.orgA, name: 'Novo' })).error).not.toBeNull();
  });
});

describe('Administrador da Agência A', () => {
  it('vê os clientes da própria agência e nenhum da Agência B', async () => {
    const rows = await must(asAdminA.from('clients').select('id'));
    expect(rows.map((r) => r.id).sort()).toEqual([ids.c1, ids.c2].sort());
    expect(await must(asAdminA.from('clients').select('id').eq('id', ids.c3))).toEqual([]);
  });
  it('não cria cliente na Agência B', async () => {
    expect((await asAdminA.from('clients').insert({ organization_id: ids.orgB, name: 'Intruso' })).error).not.toBeNull();
  });
});

describe('Convites (Edge Function admin-users)', () => {
  const email = `convidado.${run}@example.com`;
  async function invite(client: SupabaseClient | null, body: Record<string, unknown>) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', apikey: anonKey! };
    if (client) {
      const { data } = await client.auth.getSession();
      headers.Authorization = `Bearer ${data.session!.access_token}`;
    }
    const res = await fetch(`${url}/functions/v1/admin-users`, { method: 'POST', headers, body: JSON.stringify(body) });
    return { status: res.status, body: (await res.json().catch(() => ({}))) as { invited?: boolean; user_id?: string; error?: string } };
  }

  afterAll(async () => {
    const { data } = await admin.from('profiles').select('user_id').eq('email', email).maybeSingle();
    if (data) await admin.auth.admin.deleteUser(data.user_id);
  });

  it('sem login é recusado', async () => {
    const r = await invite(null, { organization_id: ids.orgA, email, kind: 'client_viewer', client_id: ids.c1 });
    expect(r.status).toBe(401);
  });
  it('usuário de cliente não convida', async () => {
    const r = await invite(asC1, { organization_id: ids.orgA, email, kind: 'client_viewer', client_id: ids.c1 });
    expect(r.status).toBe(403);
  });
  it('analista não convida', async () => {
    const r = await invite(asAnalyst, { organization_id: ids.orgA, email, kind: 'client_viewer', client_id: ids.c1 });
    expect(r.status).toBe(403);
  });
  it('admin A não convida para a Agência B', async () => {
    const r = await invite(asAdminA, { organization_id: ids.orgB, email, kind: 'client_viewer', client_id: ids.c3 });
    expect(r.status).toBe(403);
  });
  it('admin A não vincula ninguém a cliente da Agência B', async () => {
    const r = await invite(asAdminA, { organization_id: ids.orgA, email, kind: 'client_viewer', client_id: ids.c3 });
    expect(r.status).toBe(403);
  });
  it('admin A convida usuário para o Cliente 1, e ele só vê o Cliente 1', async () => {
    const r = await invite(asAdminA, { organization_id: ids.orgA, email, kind: 'client_viewer', client_id: ids.c1 });
    expect(r.status).toBe(200);
    expect(r.body.invited).toBe(true);
    const links = await must(admin.from('client_users').select('client_id').eq('user_id', r.body.user_id!));
    expect(links.map((l) => l.client_id)).toEqual([ids.c1]);
    const audit = await must(admin.from('audit_log').select('actor_id').eq('entity', 'client_users').eq('entity_id', r.body.user_id!));
    expect(audit[0]?.actor_id).toBe(users.adma);
  });
  it('convite repetido não duplica o acesso', async () => {
    const r = await invite(asAdminA, { organization_id: ids.orgA, email, kind: 'client_viewer', client_id: ids.c1 });
    expect(r.status).toBe(409);
  });
});
