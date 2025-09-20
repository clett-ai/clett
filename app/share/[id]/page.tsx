import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts";

async function getData(id: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_BASE_URL || ""}/api/chat/${id}/messages`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Not found");
  return res.json();
}

export default async function SharedChatPage({ params }: { params: { id: string } }) {
  const data = await getData(params.id);
  const messages = data?.messages || [];
  const session = data?.session || { title: "Shared Chat" };
  return (
    <div className="min-h-screen mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-xl font-semibold mb-4">{session.title || "Shared Chat"}</h1>
      <div className="space-y-6">
        {messages.map((m: any) => (
          <div key={m.id} className="rounded-lg px-4 py-3 border border-border">
            {m.role === "assistant" ? (
              <div className="space-y-4">
                {m.meta?.sql ? (
                  <details className="rounded border border-border p-3 text-sm">
                    <summary className="cursor-pointer font-medium">SQL used</summary>
                    <pre className="mt-2 overflow-auto">{m.meta.sql}</pre>
                  </details>
                ) : null}
                {m.meta?.chart ? <InlineChart spec={m.meta.chart} /> : null}
                <div className="prose dark:prose-invert max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>{m.content}</ReactMarkdown>
                </div>
              </div>
            ) : (
              <div className="text-sm whitespace-pre-wrap">{m.content}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function InlineChart({ spec }: { spec: { type: string; xKey: string; yKeys: string[]; data: any[]; title?: string } }) {
  return (
    <div className="w-full h-64 border border-border rounded">
      <div className="px-3 py-2 text-sm font-medium">{spec.title || "Chart"}</div>
      <div className="h-[calc(100%-2rem)]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={spec.data} margin={{ left: 12, right: 12, top: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={spec.xKey} />
            <YAxis />
            <Tooltip />
            <Legend />
            {spec.yKeys.map((k, i) => (
              <Line key={k} type="monotone" dataKey={k} stroke={["#2563eb", "#16a34a", "#f59e0b", "#ef4444"][i % 4]} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

