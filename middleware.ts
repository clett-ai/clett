import { NextResponse, NextRequest } from 'next/server';
import { jwtVerify, createRemoteJWKSet } from 'jose';

const jwks = createRemoteJWKSet(new URL(process.env.OUTSETA_JWKS_URL!));

export async function middleware(req: NextRequest) {
  const url = new URL(req.url);
  // only handle /chat
  if (!url.pathname.startsWith('/chat')) return NextResponse.next();

  const token = url.searchParams.get('token');
  if (!token) return NextResponse.next();

  try {
    const { payload } = await jwtVerify(token, jwks, { algorithms: ['RS256'] });
    // map Outseta claims → your session shape
    const session = {
      tid: (payload as any).TenantId || (payload as any)?.custom?.tenant_id || null,
      uid: payload.sub,
      email: (payload as any).email,
      role: (payload as any).role || 'member'
    };

    const res = NextResponse.redirect(new URL('/chat', url)); // strip token from URL
    res.cookies.set('clett_session', JSON.stringify(session), {
      httpOnly: true,
      secure: true,
      sameSite: 'none',   // required because it's inside an iframe on a different subdomain
      path: '/',
      maxAge: 60 * 60     // 1 hour
    });
    return res;
  } catch {
    // invalid token → just render /chat normally (it can show login)
    return NextResponse.next();
  }
}

// run this middleware on /chat (and its children if you add any)
export const config = { matcher: ['/chat'] };
