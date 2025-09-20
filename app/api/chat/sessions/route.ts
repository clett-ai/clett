import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { pool } from "@/lib/db";

export async function GET(_req: NextRequest) {
  const cookieStore = await cookies();
  const raw = cookieStore.get("clett_session")?.value ?? null;
  const sessionCookie = raw ? (JSON.parse(raw) as { uid: string }) : null;
  if (!sessionCookie?.uid) return new Response("Unauthorized", { status: 401 });

  const { rows } = await pool.query(
    `select s.id, s.title, s.is_public, s.created_at,
            (select count(1) from chat_messages m where m.session_id = s.id) as message_count
       from chat_sessions s
      where s.user_id = $1
      order by s.created_at desc
    `,
    [sessionCookie.uid]
  );
  return Response.json(rows);
}

