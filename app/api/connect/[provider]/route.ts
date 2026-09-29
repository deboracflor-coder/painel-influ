import { NextResponse, type NextRequest } from 'next/server';
import { requireEditor } from '@/lib/auth';
import { authorizeUrl, makeState, PROVIDERS, type Provider } from '@/lib/oauth';

// "Conectar" na tela Integrações: manda para a tela de autorização da rede.
export async function GET(request: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  if (!PROVIDERS.includes(provider as Provider)) return NextResponse.json({ error: 'Rede desconhecida' }, { status: 404 });
  const v = await requireEditor();
  if (v instanceof Response) return v;
  let url: string, nonce: string;
  try {
    const s = makeState({ ws: v.workspaceId, uid: v.userId, p: provider as Provider });
    nonce = s.nonce;
    url = authorizeUrl(provider as Provider, s.state);
  } catch (e) {
    return NextResponse.redirect(new URL(`/?erro=${encodeURIComponent(String((e as Error).message))}#integracoes`, request.url));
  }
  const res = NextResponse.redirect(url);
  res.cookies.set('oauth_nonce', nonce, { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/connect', maxAge: 600 });
  return res;
}
