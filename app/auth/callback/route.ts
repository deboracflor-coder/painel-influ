import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

// Link mágico do e-mail: troca o código por uma sessão e volta para o painel.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  if (code) {
    const sb = await supabaseServer();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL('/', request.url));
  }
  return NextResponse.redirect(new URL('/login?erro=link', request.url));
}
