import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { cookies } from "next/headers";

type ChatRequest = {
  userId?: string;
  message: string;
  context?: { sessionId?: string } | null;
};

type SessionCookie = { uid: string } | null;

async function ensureTables() {
  await pool.query(`
    create table if not exists chat_sessions (
      id text primary key,
      user_id text not null,
      title text,
      is_public boolean default false,
      created_at timestamp with time zone default now()
    );
  `);
  await pool.query(`
    create table if not exists chat_messages (
      id text primary key,
      session_id text references chat_sessions(id) on delete cascade,
      role text not null,
      content text not null,
      meta jsonb default '{}'::jsonb,
      created_at timestamp with time zone default now()
    );
  `);
}

async function getOrCreateSession(userId: string, proposedTitle: string | null, sessionId?: string | null) {
  if (sessionId) {
    const s = await pool.query("select * from chat_sessions where id=$1 and user_id=$2", [sessionId, userId]);
    if (s.rowCount === 1) return s.rows[0];
  }
  const newId = crypto.randomUUID();
  const title = (proposedTitle || "New chat").slice(0, 80);
  const result = await pool.query(
    "insert into chat_sessions(id, user_id, title) values ($1,$2,$3) returning *",
    [newId, userId, title]
  );
  return result.rows[0];
}

async function saveMessage(sessionId: string, role: "user" | "assistant", content: string, meta: any = {}) {
  const id = crypto.randomUUID();
  await pool.query(
    "insert into chat_messages(id, session_id, role, content, meta) values ($1,$2,$3,$4,$5)",
    [id, sessionId, role, content, JSON.stringify(meta)]
  );
  return id;
}

function streamSSE(controller: ReadableStreamDefaultController, event: string, data: any) {
  const payload = typeof data === "string" ? data : JSON.stringify(data);
  const line = `event: ${event}\n` + `data: ${payload}\n\n`;
  controller.enqueue(new TextEncoder().encode(line));
}

async function basicHeuristicAnswer(question: string): Promise<{
  text: string;
  sql?: string;
  chart?: { type: string; xKey: string; yKeys: string[]; data: any[]; title?: string };
}> {
  const q = question.toLowerCase();
  // Try to discover revenue/cost tables
  const { rows: tables } = await pool.query(
    "select table_name from information_schema.tables where table_schema='public'"
  );
  const tableNames = tables.map((t: any) => t.table_name);
  const hasMetrics = tableNames.some((t: string) => /metric|kpi|dashboard/.test(t));

  if (q.includes("gross margin")) {
    // Try simple margin calc from a view if exists
    const candidate = tableNames.find((t: string) => /margin|profit|kpi|metric/.test(t)) || null;
    const sql = candidate
      ? `select date_trunc('quarter', period) as quarter, sum(revenue) as revenue, sum(cost) as cost, (sum(revenue)-sum(cost))::numeric/sum(revenue) as gross_margin from ${candidate} group by 1 order by 1 desc limit 1;`
      : `-- Define a materialized view with columns: period, revenue, cost to compute margin`;
    let text = "I computed the latest quarterly gross margin.";
    if (candidate) {
      const { rows } = await pool.query(sql);
      if (rows.length > 0) {
        const r = rows[0];
        text += ` Gross margin for ${new Date(r.quarter).toISOString().slice(0, 7)} is ${(Number(r.gross_margin) * 100).toFixed(1)}%.`;
      } else {
        text += " No rows found.";
      }
    } else {
      text = "I could not find a table with revenue and cost to compute margin.";
    }
    return { text, sql };
  }

  if (q.includes("revenue") && (q.includes("marketing") || q.includes("ad"))) {
    // Build a demo chart if we can find a metrics table with period + revenue + marketing_spend
    const candidate = tableNames.find((t: string) => /metric|kpi|dash/.test(t)) || null;
    const sql = candidate
      ? `select period::date as date, revenue::numeric as revenue, marketing_spend::numeric as marketing_spend from ${candidate} where period >= now() - interval '90 days' order by 1;`
      : `-- Expected columns: period(date), revenue(numeric), marketing_spend(numeric)`;
    let chart: any | undefined = undefined;
    if (candidate) {
      const { rows } = await pool.query(sql);
      chart = {
        type: "line",
        xKey: "date",
        yKeys: ["revenue", "marketing_spend"],
        data: rows,
        title: "Revenue vs Marketing Spend (90d)",
      };
    }
    const text = chart
      ? "Here's a chart of revenue vs marketing spend for the last 90 days."
      : "I couldn't find the expected metrics table to produce the chart."
    return { text, sql, chart };
  }

  if (q.includes("repeat") && q.includes("customer")) {
    const candidate = tableNames.find((t: string) => /order|purchase|sale/.test(t)) || null;
    const sql = candidate
      ? `with repeats as (
            select customer_id, count(*) as orders
            from ${candidate}
            group by 1
         )
         select segment, avg(orders)::numeric as avg_orders
         from repeats r
         join customers c on c.id = r.customer_id
         group by 1
         order by 2 desc
         limit 5;`
      : `-- Need orders and customers tables to compute repeat frequency by segment`;
    let text = "I analyzed repeat frequency by customer segment.";
    if (candidate) {
      const { rows } = await pool.query(sql);
      if (rows.length > 0) {
        text += ` Top segment: ${rows[0].segment} with ${Number(rows[0].avg_orders).toFixed(2)} avg orders.`;
      } else {
        text += " No rows found.";
      }
    } else {
      text = "I could not find orders/customers tables to compute repeat frequency.";
    }
    return { text, sql };
  }

  return { text: "I received your question. Please provide more details.", sql: undefined };
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const raw = cookieStore.get("clett_session")?.value ?? null;
  const sessionCookie = raw ? (JSON.parse(raw) as SessionCookie) : null;
  if (!sessionCookie?.uid) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = (await req.json()) as ChatRequest;
  const userMessage = (body.message || "").trim();
  if (!userMessage) return new Response("Bad Request", { status: 400 });

  await ensureTables();
  const session = await getOrCreateSession(sessionCookie.uid, userMessage, body.context && (body.context as any).sessionId);
  const userMessageId = await saveMessage(session.id, "user", userMessage);

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: any) => streamSSE(controller, event, data);
      send("ack", { sessionId: session.id, messageId: userMessageId });

      // Produce heuristic answer and stream
      try {
        const answer = await basicHeuristicAnswer(userMessage);
        send("sql", { sql: answer.sql ?? null });
        if (answer.chart) send("chart", answer.chart);

        // Stream the text word-by-word for effect
        const words = answer.text.split(/(\s+)/);
        let assembled = "";
        for (const chunk of words) {
          assembled += chunk;
          send("data", { delta: chunk });
          await new Promise((r) => setTimeout(r, 10));
        }
        await saveMessage(session.id, "assistant", assembled, {
          sql: answer.sql ?? null,
          chart: answer.chart ?? null,
        });
        send("done", { ok: true });
      } catch (err: any) {
        send("error", { message: err?.message || String(err) });
        send("done", { ok: false });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

