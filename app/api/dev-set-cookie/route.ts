import { NextResponse } from "next/server";
export const runtime = "nodejs";

/**
 * Sets a development session cookie for the current host so testing works on
 * both custom domains (e.g. *.clett.ai) and preview URLs (e.g. *.vercel.app).
 *
 * Optional query params:
 * - tid: override tenant id (default: "dev-tenant")
 * - uid: override user id (default: "dev")
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const host = url.host || "";
  const tid = url.searchParams.get("tid") || "dev-tenant";
  const uid = url.searchParams.get("uid") || "dev";

  const res = NextResponse.json({ ok: true, host, tid, uid });

  // Decide cookie domain strategy based on host:
  // - For *.clett.ai -> set domain to ".clett.ai" (shared across subdomains)
  // - For anything else (e.g. *.vercel.app, localhost) -> omit domain so it
  //   scopes to the current host and is accepted by browsers.
  const cookieOptions: Parameters<typeof res.cookies.set>[2] = {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 60 * 60,
  };
  if (host.endsWith(".clett.ai")) {
    (cookieOptions as any).domain = ".clett.ai";
  }

  res.cookies.set(
    "clett_session",
    JSON.stringify({ tid, uid }),
    cookieOptions
  );

  return res;
}
