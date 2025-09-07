import { NextResponse, NextRequest } from "next/server";
import { jwtVerify, createRemoteJWKSet } from "jose";

const jwks = createRemoteJWKSet(new URL(process.env.OUTSETA_JWKS_URL!));

export async function middleware(req: NextRequest) {
  const url = new URL(req.url);
  if (!url.pathname.startsWith("/chat")) return NextResponse.next();

  const cookie = req.cookies.get("clett_session")?.value;
  if (cookie) return NextResponse.next();

  const token = url.searchParams.get("token");
  if (!token) return new NextResponse("Unauthorized", { status: 401 });

  try {
    const { payload } = await jwtVerify(token, jwks, { algorithms: ["RS256"] });
    const session = {
      tid: (payload as any).TenantId || (payload as any)?.custom?.tenant_id || null,
      uid: payload.sub,
      email: (payload as any).email,
      role: (payload as any).role || "member",
    };
    const res = NextResponse.redirect(new URL("/chat", url)); // strip token
    res.cookies.set("clett_session", JSON.stringify(session), {
      httpOnly: true, secure: true, sameSite: "none", path: "/", maxAge: 3600,
    });
    return res;
  } catch {
    return new NextResponse("Unauthorized", { status: 401 });
  }
}

export const config = { matcher: ["/chat"] };
