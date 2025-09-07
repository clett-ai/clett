// lib/ingest/parsers.ts
import 'server-only'; // ensure Next never bundles this for the client
import { parse as parseCsv } from 'csv-parse/sync';

export type DataType = 'accounting' | 'sales' | 'marketing';

/**
 * Parse an uploaded file buffer (csv/xlsx/json) into normalized rows
 * for a given data type.
 */
export async function parseBufferToRows(
  buf: Buffer,
  ext: string,
  dataType: DataType
): Promise<any[]> {
  const e = (ext || '').toLowerCase();
  let rows: any[] = [];

  if (e === '.csv') {
    rows = parseCsv(buf, { columns: true, skip_empty_lines: true });
  } else if (e === '.xlsx') {
    // Lazy import avoids bundling XLSX and keeps it server-only
    const XLSX = await import('xlsx');
    const wb = XLSX.read(buf, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(sheet);
  } else if (e === '.json') {
    const text = buf.toString('utf8');
    const parsed = JSON.parse(text);
    rows = Array.isArray(parsed) ? parsed : (parsed.rows || []);
  } else {
    // Unknown extension -> return empty list
    rows = [];
  }

  return normalize(rows, dataType);
}

/** Normalize arbitrary row objects into our canonical schema per data type */
function normalize(rows: any[], dataType: DataType): any[] {
  if (dataType === 'accounting') {
    // expected columns: date, revenue, expenses, cash_in, cash_out
    return rows.map((r) => ({
      date: iso(r.date),
      revenue: num(r.revenue),
      expenses: num(r.expenses),
      cash_in: num(r.cash_in ?? r.cashIn),
      cash_out: num(r.cash_out ?? r.cashOut),
    }));
  }

  if (dataType === 'sales') {
    // expected: date, order_id, customer_id, amount, currency
    return rows.map((r) => ({
      date: iso(r.date),
      order_id: String(r.order_id ?? r.orderId ?? ''),
      customer_id: String(r.customer_id ?? r.customerId ?? ''),
      amount: num(r.amount),
      currency: String(r.currency ?? 'USD'),
    }));
  }

  // marketing: date, channel, campaign, spend, impressions, clicks
  return rows.map((r) => ({
    date: iso(r.date),
    channel: String(r.channel ?? ''),
    campaign: String(r.campaign ?? ''),
    spend: num(r.spend),
    impressions: int(r.impressions),
    clicks: int(r.clicks),
  }));
}

/** Helpers */
function iso(v: any): string | null {
  const d = new Date(v);
  return isNaN((d as unknown) as number) ? null : d.toISOString().slice(0, 10);
}
function num(v: any): number {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}
function int(v: any): number {
  const n = parseInt(v, 10);
  return isNaN(n) ? 0 : n;
}
