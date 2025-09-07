// app/api/dev-set-cookie/route.ts
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  const res = NextResponse.json({ status: 'ok', message: 'dev session set' });
  // Cookie visible to ALL subdomains (ask.clett.ai & my.clett.ai)
  res.cookies.set('clett_session', JSON.stringify({ tid: 'dev-tenant', uid: 'dev' }), {
    domain: '.clett.ai',
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    maxAge: 60 * 60, // 1 hour
  });
  return res;
}
