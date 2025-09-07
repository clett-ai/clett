import { NextResponse } from "next/server";
export const runtime = "nodejs";

export async function GET() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("clett_session", JSON.stringify({ tid: "dev-tenant", uid: "dev" }), {
    domain: ".clett.ai",
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 60 * 60,
  });
  return res;
}
