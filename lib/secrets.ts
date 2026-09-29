import 'server-only';

// Lidas só no servidor. Nunca importe este arquivo em componente de cliente.
function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente ausente: ${name}`);
  return v;
}

export const secrets = {
  serviceRoleKey: () => need('SUPABASE_SERVICE_ROLE_KEY'),
  ownerEmail: () => need('OWNER_EMAIL').trim().toLowerCase(),
  siteUrl: () => (process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` || 'http://localhost:3000').replace(/\/$/, ''),
  meta: () => ({ id: need('META_APP_ID'), secret: need('META_APP_SECRET') }),
  tiktok: () => ({ id: need('TIKTOK_CLIENT_KEY'), secret: need('TIKTOK_CLIENT_SECRET') }),
  google: () => ({ id: need('GOOGLE_CLIENT_ID'), secret: need('GOOGLE_CLIENT_SECRET') }),
  stateSecret: () => need('OAUTH_STATE_SECRET'),
};
