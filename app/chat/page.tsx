"use client";
import useSWR from "swr";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts";

type ChatSession = { id: string; title: string; is_public: boolean; created_at: string; message_count: number };
type ChatMessage = { id: string; role: "user" | "assistant"; content: string; meta?: any; created_at: string };

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function ChatPage() {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [streamBuffer, setStreamBuffer] = useState<string>("");
  const [lastAnswerMeta, setLastAnswerMeta] = useState<{ sql?: string | null; chart?: any | null } | null>(null);

  const { data: sessions, mutate: mutateSessions } = useSWR<ChatSession[]>("/api/chat/sessions", fetcher);
  const { data: messagesData, mutate: mutateMessages } = useSWR<{ session: any; messages: ChatMessage[] }>(
    activeSessionId ? `/api/chat/${activeSessionId}/messages` : null,
    fetcher
  );

  const messages = messagesData?.messages ?? [];
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streamBuffer]);

  function newChat() {
    setActiveSessionId(null);
    setStreamBuffer("");
    setLastAnswerMeta(null);
    setInput("");
  }

  async function shareCurrent() {
    if (!activeSessionId) return;
    const res = await fetch(`/api/chat/${activeSessionId}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ public: true }),
    });
    const data = await res.json();
    if (data?.link) {
      navigator.clipboard.writeText(data.link).catch(() => {});
      alert(`Share link copied to clipboard:\n${data.link}`);
    }
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || isSending) return;
    setIsSending(true);
    setStreamBuffer("");
    setLastAnswerMeta(null);

    // Optimistic: show user message
    await mutateMessages(
      (prev: { session: any; messages: ChatMessage[] } | undefined) =>
        prev && {
          ...prev,
          messages: [
            ...prev.messages,
            { id: `tmp-${Date.now()}`, role: "user", content: text, meta: {}, created_at: new Date().toISOString() },
          ],
        },
      false
    );
    setInput("");

    const resp = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, context: { sessionId: activeSessionId } }),
    });
    if (!resp.ok) {
      setIsSending(false);
      await mutateMessages();
      return;
    }

    const reader = resp.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let newSessionId: string | null = null;
    let assistantAccum = "";

    const flushDataEvent = async (payload: any) => {
      const delta = payload?.delta ?? "";
      assistantAccum += delta;
      setStreamBuffer((prev) => prev + delta);
    };

    const handleEvent = async (event: string, data: string) => {
      try {
        const json = data ? JSON.parse(data) : null;
        if (event === "ack") {
          newSessionId = json.sessionId;
          if (!activeSessionId) setActiveSessionId(json.sessionId);
          await mutateSessions();
        } else if (event === "sql") {
          setLastAnswerMeta((m) => ({ ...(m || {}), sql: json?.sql ?? null }));
        } else if (event === "chart") {
          setLastAnswerMeta((m) => ({ ...(m || {}), chart: json }));
        } else if (event === "data") {
          await flushDataEvent(json);
        } else if (event === "done") {
          setIsSending(false);
          setStreamBuffer("");
          await mutateMessages();
        }
      } catch {
        // ignore parse errors
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      while (true) {
        const evtIdx = buffer.indexOf("event: ");
        const dataIdx = buffer.indexOf("data: ", evtIdx + 7);
        const endIdx = buffer.indexOf("\n\n", dataIdx + 6);
        if (evtIdx === -1 || dataIdx === -1 || endIdx === -1) break;
        const event = buffer.slice(evtIdx + 7, buffer.indexOf("\n", evtIdx + 7)).trim();
        const data = buffer.slice(dataIdx + 6, endIdx).trim();
        await handleEvent(event, data);
        buffer = buffer.slice(endIdx + 2);
      }
    }
  }

  const selected = useMemo(() => sessions?.find((s: ChatSession) => s.id === activeSessionId) || null, [sessions, activeSessionId]);

  return (
    <div className="h-screen flex">
      {/* Sidebar */}
      <aside className="w-72 border-r border-border hidden md:flex md:flex-col">
        <div className="p-4 flex items-center justify-between">
          <span className="font-semibold">Conversations</span>
          <button onClick={newChat} className="text-sm px-2 py-1 rounded bg-muted">New</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {sessions?.map((s: ChatSession) => (
            <button
              key={s.id}
              onClick={() => setActiveSessionId(s.id)}
              className={`w-full text-left px-4 py-2 hover:bg-muted ${activeSessionId === s.id ? "bg-muted" : ""}`}
            >
              <div className="truncate font-medium">{s.title || "Untitled"}</div>
              <div className="text-xs text-gray-500">{new Date(s.created_at).toLocaleString()}</div>
            </button>
          ))}
        </div>
      </aside>

      {/* Main */}
      <section className="flex-1 flex flex-col">
        <header className="h-14 border-b border-border px-4 flex items-center justify-between">
          <div className="font-semibold truncate">{selected?.title || "Ask Clett"}</div>
          <div className="flex items-center gap-2">
            {activeSessionId && (
              <button onClick={shareCurrent} className="text-sm px-3 py-1 rounded bg-muted">Share</button>
            )}
            <button onClick={newChat} className="text-sm px-3 py-1 rounded bg-muted">New Chat</button>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
          {messages.map((m: ChatMessage) => (
            <MessageBubble key={m.id} role={m.role} content={m.content} meta={m.meta} />
          ))}
          {isSending && (
            <MessageBubble role="assistant" content={streamBuffer} meta={lastAnswerMeta || {}} />
          )}
          <div ref={endRef} />
        </div>

        {/* Input */}
        <div className="border-t border-border p-3 sticky bottom-0 bg-background">
          <div className="max-w-3xl mx-auto flex gap-2">
            <textarea
              className="flex-1 resize-none rounded border border-border p-2 bg-transparent focus:outline-none"
              rows={3}
              placeholder="Ask about revenue, cost, margin..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
            />
            <button
              onClick={sendMessage}
              disabled={isSending || input.trim().length === 0}
              className="px-4 py-2 rounded bg-black text-white disabled:opacity-50 dark:bg-white dark:text-black self-end"
            >
              Send
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function MessageBubble({ role, content, meta }: { role: "user" | "assistant"; content: string; meta?: any }) {
  const isUser = role === "user";
  return (
    <div className={`max-w-3xl mx-auto ${isUser ? "" : ""}`}>
      <div className={`rounded-lg px-4 py-3 ${isUser ? "bg-muted" : "bg-transparent"}`}>
        {isUser ? (
          <div className="whitespace-pre-wrap text-sm">{content}</div>
        ) : (
          <div className="space-y-4">
            {meta?.sql ? (
              <details className="rounded border border-border p-3 text-sm">
                <summary className="cursor-pointer font-medium">SQL used</summary>
                <pre className="mt-2 overflow-auto">
{meta.sql}
                </pre>
              </details>
            ) : null}
            {meta?.chart ? <InlineChart spec={meta.chart} /> : null}
            <div className="prose dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>{content}</ReactMarkdown>
            </div>
          </div>
        )}
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

