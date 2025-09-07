// lib/ingest/loaders.ts
import 'server-only';
import { neon } from '@neondatabase/serverless';
import type { DataType } from './parsers';

// Lazily init the Neon client so builds don't require envs.
let _sql: ReturnType<typeof neon> | null = null;
function sql() {
  const url = process.env.NEON_DATABASE_URL;
  if (!url) throw new Error('NEON_DATABASE_URL is not set');
  if (!_sql) _sql = neon(url);
  return _sql;
}

// Create tables if they don't exist
async function ensureTables() {
  await sql()`
    CREATE TABLE IF NOT EXISTS acct_ledger (
      tenant_id text,
      date date,
      revenue numeric,
      expenses numeric,
      cash_in numeric,
      cash_out numeric
    );
  `;

  await sql()`
    CREATE TABLE IF NOT EXISTS sales_txn (
      tenant_id text,
      date date,
      order_id text,
      customer_id text,
      amount numeric,
      currency text
    );
  `;

  await sql()`
    CREATE TABLE IF NOT EXISTS mkt_perf (
      tenant_id text,
      date date,
      channel text,
      campaign text,
      spend numeric,
      impressions int,
      clicks int
    );
  `;
}

/**
 * Insert normalized rows into Postgres, scoped by tenant id.
 * Clear + safe parameterized inserts (can batch later if needed).
 */
export async function loadRowsToNeon(
  rows: any[],
  dataType: DataType,
  tid: string
): Promise<number> {
  if (!rows?.length) return 0;

  await ensureTables();

  if (dataType === 'accounting') {
    for (const r of rows) {
      await sql()`
        INSERT INTO acct_ledger
          (tenant_id, date, revenue, expenses, cash_in, cash_out)
        VALUES
          (${tid}, ${r.date}, ${r.revenue}, ${r.expenses}, ${r.cash_in}, ${r.cash_out});
      `;
    }
    return rows.length;
  }

  if (dataType === 'sales') {
    for (const r of rows) {
      await sql()`
        INSERT INTO sales_txn
          (tenant_id, date, order_id, customer_id, amount, currency)
        VALUES
          (${tid}, ${r.date}, ${r.order_id}, ${r.customer_id}, ${r.amount}, ${r.currency});
      `;
    }
    return rows.length;
  }

  // marketing
  for (const r of rows) {
    await sql()`
      INSERT INTO mkt_perf
        (tenant_id, date, channel, campaign, spend, impressions, clicks)
      VALUES
        (${tid}, ${r.date}, ${r.channel}, ${r.campaign}, ${r.spend}, ${r.impressions}, ${r.clicks});
    `;
  }
  return rows.length;
}
