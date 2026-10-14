import { createMcpUiHost, type ToolLike, type ToolResult } from '@mcp-ui-kit/host';
import { McpAppView } from '@mcp-ui-kit/host/react';
import { StrictMode, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';

type Part =
  | { kind: 'user'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'tool'; tool: ToolLike; args: Record<string, unknown>; result: ToolResult };

interface Config {
  llm: boolean;
  model: string;
  sandboxUrl: string;
}

const post = async <T,>(url: string, body: unknown): Promise<T> => {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${url}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
};

const textOf = (r: ToolResult) =>
  r.content.map((c) => (c && typeof c === 'object' && (c as { type?: string }).type === 'text' ? String((c as { text?: unknown }).text) : '')).join('\n');

function App() {
  const [config, setConfig] = useState<Config>();
  const [tools, setTools] = useState<ToolLike[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState('');
  const [args, setArgs] = useState('{}');
  const session = useRef<string | undefined>(undefined);
  const log = useRef<HTMLDivElement>(null);
  const append = (p: Part) => setParts((all) => [...all, p]);

  useEffect(() => {
    void fetch('/api/config').then((r) => r.json()).then(setConfig);
    void fetch('/api/tools').then((r) => r.json()).then((t: ToolLike[]) => {
      setTools(t);
      setPick(t.find((x) => x._meta?.ui)?.name ?? t[0]?.name ?? '');
    });
  }, []);
  useEffect(() => {
    // block body: in current browsers scrollTo() returns a promise, which must not become the effect cleanup
    void log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'smooth' });
  }, [parts]);

  const chat = async (text: string) => {
    if (!config?.llm) return;
    append({ kind: 'user', text });
    setBusy(true);
    try {
      const res = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: session.current, text }) });
      const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += value;
        const events = buf.split('\n\n');
        buf = events.pop() ?? '';
        for (const ev of events) {
          const data = ev.split('\n').find((l) => l.startsWith('data:'))?.slice(5).trim();
          if (!data) continue;
          const e = JSON.parse(data);
          if (e.type === 'text') append({ kind: 'text', text: e.text });
          if (e.type === 'tool_call') append({ kind: 'tool', tool: e.tool, args: e.args, result: e.result });
          if (e.type === 'error') append({ kind: 'text', text: `⚠ ${e.message}` });
          if (e.type === 'done') session.current = e.sessionId;
        }
      }
    } finally {
      setBusy(false);
    }
  };

  // One host for the page. Views only reach the MCP server through this backend's relay.
  const host = useMemo(
    () =>
      config &&
      createMcpUiHost({
        sandboxUrl: config.sandboxUrl,
        callTool: (name, a, meta) => post<ToolResult>('/ui/call', { name, arguments: a, ...(meta ? { _meta: meta } : {}) }),
        readResource: (uri) => post('/ui/resource', { uri }),
        onMessage: (text) => (config.llm ? chat(text) : append({ kind: 'user', text })),
        theme: () => (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
        locale: () => navigator.language,
      }),
    [config],
  );

  const runTool = async () => {
    const parsed = JSON.parse(args || '{}') as Record<string, unknown>;
    append({ kind: 'user', text: `▶ ${pick} ${JSON.stringify(parsed)}` });
    const r = await post<{ tool: ToolLike; args: Record<string, unknown>; result: ToolResult }>('/api/tool', { name: pick, arguments: parsed });
    append({ kind: 'tool', tool: r.tool, args: r.args, result: r.result });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || busy) return;
    void chat(input.trim());
    setInput('');
  };

  return (
    <div className="app">
      <main>
        <div className="log" ref={log} data-testid="log">
          {parts.map((p, i) => (
            <div key={i} className={`msg ${p.kind === 'user' ? 'user' : 'bot'}`}>
              {p.kind === 'user' && <div className="bubble">{p.text}</div>}
              {p.kind === 'text' && <div className="text">{p.text}</div>}
              {p.kind === 'tool' && host && (
                <div data-testid="tool-call" data-tool={p.tool.name}>
                  <div className="tool">{p.tool.name}</div>
                  <McpAppView host={host} tool={p.tool} args={p.args} result={p.result} tools={tools} fallback={<div className="fallback">{textOf(p.result)}</div>} />
                </div>
              )}
            </div>
          ))}
        </div>
        <form className="composer" onSubmit={submit}>
          <input value={input} onChange={(e) => setInput(e.target.value)} disabled={!config?.llm || busy} placeholder={config?.llm ? `Ask (${config.model})…` : 'Set ANTHROPIC_API_KEY on the server to chat; use the panel to run tools.'} />
          <button className="primary" disabled={!config?.llm || busy}>
            Send
          </button>
        </form>
      </main>
      <aside>
        <h2>Run a tool</h2>
        <p className="hint">Calls the MCP server directly (no LLM) and renders the result with its view.</p>
        <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Tool">
          {tools.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
              {t._meta?.ui ? ' ◆' : ''}
            </option>
          ))}
        </select>
        <textarea value={args} onChange={(e) => setArgs(e.target.value)} aria-label="Arguments" />
        <button className="primary" onClick={() => void runTool()} disabled={!pick}>
          Run
        </button>
        <p className="hint">◆ the tool has an MCP App view.</p>
      </aside>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
