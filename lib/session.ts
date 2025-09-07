import { cookies } from "next/headers";

export type Session = { tid: string | null; uid: string; email?: string; role?: string; };

export async function getSession(): Promise<Session | null> {
  const store = await cookies();                           // Next 15 requires await
  const raw = store.get("clett_session")?.value;           // underscore
  if (!raw) return null;
  try { return JSON.parse(raw) as Session; } catch { return null; }
}
