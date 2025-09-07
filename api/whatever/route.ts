import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

export async function GET() {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Scope your DB queries by tenant id
  const tenantId = session.tid;
  const data = await db.query('SELECT * FROM invoices WHERE tenant_id = ?', [tenantId]);

  return NextResponse.json({ data });
}
