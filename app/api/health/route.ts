import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET() {
  const r = await pool.query("select now()");
  return NextResponse.json({ ok: true, db_time: r.rows[0].now });
}
