import { NextResponse } from "next/server";
import { cookies } from "next/headers";
export const runtime = "nodejs";

export async function GET() {
  const raw = (await cookies()).get("clett_session")?.value || null;
  let parsed: any = null;
  try { parsed = raw ? JSON.parse(raw) : null; } catch {}
  return NextResponse.json({ hasCookie: !!raw, tid: parsed?.tid ?? null });
}
