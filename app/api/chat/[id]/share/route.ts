import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { pool } from "@/lib/db";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const cookieStore = await cookies();
  const raw = cookieStore.get("clett_session")?.value ?? null;
  const sessionCookie = raw ? (JSON.parse(raw) as { uid: string }) : null;
  if (!sessionCookie?.uid) return new Response("Unauthorized", { status: 401 });

  const { public: makePublic } = await req.json().catch(() => ({ public: true }));
  const { rows } = await pool.query(
    "update chat_sessions set is_public=$1 where id=$2 and user_id=$3 returning id, is_public",
    [Boolean(makePublic), params.id, sessionCookie.uid]
  );
  if (rows.length === 0) return new Response("Not found", { status: 404 });
  const link = `${process.env.NEXT_PUBLIC_APP_BASE_URL || "https://ask.clett.ai"}/share/${params.id}`;
  return Response.json({ id: params.id, is_public: rows[0].is_public, link });
}

