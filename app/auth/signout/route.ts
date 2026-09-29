import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const sb = await supabaseServer();
  await sb.auth.signOut();
  return NextResponse.redirect(new URL('/login', request.url));
}
