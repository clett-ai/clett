// lib/session.ts
import { cookies } from 'next/headers';

export type Session = {
  tid: string;  // tenant id
  uid?: string; // user id
  [key: string]: any;
};

export function getSession(): Session | null {
  const raw = cookies().get('clett_session')?.value;
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
