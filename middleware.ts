// middleware.ts
import { NextResponse, NextRequest } from "next/server";
import { jwtVerify, createRemoteJWKSet } from "jose";

const jwks = createRemoteJWKSet(new URL(process.env.OUTSETA_JWKS_URL!));

export async function middleware(req: NextRequest) {
  const url = new URL(req.url);
  // only handle /chat
  if (!url.pathname.startsWith("/chat")) return NextResponse.next();

  // already have a session cookie? proceed
  const cookie = req.cookies.get("clett_session")?.value;
  if (cookie) return NextResponse.next();

  // expect a token on first hop
  const token = url.searchParams.get("token");
  if (!token) return new NextResponse("Unauthorized", { status: 401 });

  try {
    const { payload } = await jwtVerify(token, jwks, { algorithms: ["RS256"] });
    // map JWT claims → session
    const session = {
      tid: (payload as any).TenantId || (payload as any)?.custom?.tenant_id || null,
      uid: payload.sub,
      email: (payload as any).email,
      role: (payload as any).role || "member",
    };

    // strip token and set session cookie for ALL clett.ai subdomains
    const res = NextResponse.redirect(new URL("/chat", url));
    res.cookies.set("clett_session", JSON.stringify(session), {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      path: "/",
      domain: ".clett.ai",    // ✅ make the cookie work on ask.clett.ai and my.clett.ai
      maxAge: 60 * 60,        // 1 hour
    });
    return res;
  } catch {
    return new NextResponse("Unauthorized", { status: 401 });
  }
}

// run this middleware on /chat
export const config = { matcher: ["/chat"] };
