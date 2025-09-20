import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { pool } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const cookieStore = await cookies();
  const raw = cookieStore.get("clett_session")?.value ?? null;
  const sessionCookie = raw ? (JSON.parse(raw) as { uid: string }) : null;

  const { rows: sessions } = await pool.query("select * from chat_sessions where id=$1", [params.id]);
  if (sessions.length === 0) return new Response("Not found", { status: 404 });
  const session = sessions[0];
  if (!session.is_public && session.user_id !== sessionCookie?.uid) {
    return new Response("Forbidden", { status: 403 });
  }

  const { rows } = await pool.query(
    "select id, role, content, meta, created_at from chat_messages where session_id=$1 order by created_at asc",
    [params.id]
  );
  return Response.json({ session: { id: session.id, title: session.title, is_public: session.is_public }, messages: rows });
}

