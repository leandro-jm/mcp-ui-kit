/**
 * Example backend of a chat that consumes an MCP server with MCP Apps (e.g. mcp-gateway).
 *
 * - Holds the MCP credential: the browser never talks to the MCP server directly.
 * - Runs the LLM loop (Claude) with the server's tools and streams, per turn, the text and every
 *   tool call with its full result (including `_meta`, where the views travel).
 * - Relays the calls a view makes (`/ui/call`, `/ui/resource`), so the MCP server's own
 *   authorization applies to them.
 * - Serves the sandbox proxy on a second port: MCP Apps require a different origin.
 *
 * Env: MCP_URL (default http://localhost:4000/mcp), MCP_TOKEN, ANTHROPIC_API_KEY (optional:
 * without it the chat runs tools directly from the "Run a tool" panel), PORT (5301), SANDBOX_PORT (5302).
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';

const MCP_URL = process.env.MCP_URL ?? 'http://localhost:4000/mcp';
const MCP_TOKEN = process.env.MCP_TOKEN ?? 'mgw_dev-agent-token-somente-para-desenvolvimento';
const PORT = Number(process.env.PORT ?? 5301);
const SANDBOX_PORT = Number(process.env.SANDBOX_PORT ?? 5302);
const MODEL = 'claude-opus-5-5';
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/** One MCP client for the demo user, on the 2026-07-28 revision, declaring MCP Apps support. */
async function connectMcp(): Promise<Client> {
  const client = new Client(
    { name: 'mcp-ui-kit-example', version: '0.1.0' },
    { capabilities: { extensions: { 'io.modelcontextprotocol/ui': {} } }, versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );
  await client.connect(new StreamableHTTPClientTransport(new URL(MCP_URL), { requestInit: { headers: { authorization: `Bearer ${MCP_TOKEN}` } } }));
  return client;
}

const mcp = await connectMcp();
const anthropic = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? new Anthropic() : undefined;
/** Conversation per browser session (demo: in memory). */
const conversations = new Map<string, Anthropic.Beta.BetaMessageParam[]>();

const textOf = (content: unknown[]): string =>
  content
    .map((c) => (c && typeof c === 'object' && (c as { type?: string }).type === 'text' ? String((c as { text?: unknown }).text ?? '') : ''))
    .filter(Boolean)
    .join('\n') || '(no text content)';

const app = new Hono();

app.get('/api/config', (c) => c.json({ llm: Boolean(anthropic), model: MODEL, sandboxUrl: `http://localhost:${SANDBOX_PORT}/sandbox.html` }));

/** Tool descriptors (with `_meta.ui`): the host needs them to enforce view visibility. */
app.get('/api/tools', async (c) => c.json((await mcp.listTools()).tools));

/** Runs one tool directly (no LLM): handy to try views and for end-to-end tests. */
app.post('/api/tool', async (c) => {
  const { name, arguments: args = {} } = await c.req.json<{ name: string; arguments?: Record<string, unknown> }>();
  const tool = (await mcp.listTools()).tools.find((t) => t.name === name);
  if (!tool) return c.json({ error: 'unknown tool' }, 404);
  return c.json({ tool, args, result: await mcp.callTool({ name, arguments: args }) });
});

/** Relay for calls made by a view (form submit, plan confirmation, actions). */
app.post('/ui/call', async (c) => {
  const { name, arguments: args = {}, _meta } = await c.req.json<{ name: string; arguments?: Record<string, unknown>; _meta?: Record<string, unknown> }>();
  return c.json(await mcp.callTool({ name, arguments: args, ...(_meta ? { _meta } : {}) }));
});

app.post('/ui/resource', async (c) => {
  const { uri } = await c.req.json<{ uri: string }>();
  return c.json(await mcp.readResource({ uri }));
});

/**
 * One chat turn: a manual tool-use loop (the frontend needs each tool result with its `_meta`).
 * The model only ever sees the text content of results; views go to the browser.
 */
app.post('/api/chat', async (c) => {
  if (!anthropic) return c.json({ error: 'no ANTHROPIC_API_KEY: use the Run a tool panel' }, 400);
  const { sessionId = randomUUID(), text } = await c.req.json<{ sessionId?: string; text: string }>();
  const messages = conversations.get(sessionId) ?? [];
  conversations.set(sessionId, messages);
  messages.push({ role: 'user', content: text });

  return streamSSE(c, async (stream) => {
    const send = (event: Record<string, unknown>) => stream.writeSSE({ data: JSON.stringify(event) });
    const mcpTools = (await mcp.listTools()).tools;
    const tools: Anthropic.Beta.BetaTool[] = mcpTools.map((t) => ({
      name: t.name,
      description: t.description ?? t.title ?? t.name,
      input_schema: t.inputSchema as Anthropic.Beta.BetaTool.InputSchema,
    }));
    for (let round = 0; round < 8; round++) {
      const response = await anthropic.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        system: 'You are an assistant inside a business chat. Use the tools to answer. Tool results may also be shown to the user as interactive views (tables, charts, forms); keep your text short and do not repeat the data the view already shows.',
        tools,
        messages,
        // on a policy decline, the API retries on a fallback model inside the same call
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      } as Anthropic.Beta.MessageCreateParamsNonStreaming);
      messages.push({ role: 'assistant', content: response.content });
      for (const block of response.content) if (block.type === 'text' && block.text) await send({ type: 'text', text: block.text });
      if (response.stop_reason === 'refusal') {
        await send({ type: 'error', message: 'The model declined this request.' });
        break;
      }
      if (response.stop_reason === 'pause_turn') continue;
      if (response.stop_reason !== 'tool_use') break;

      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;
        const args = (block.input ?? {}) as Record<string, unknown>;
        try {
          const result = await mcp.callTool({ name: block.name, arguments: args });
          await send({ type: 'tool_call', tool: mcpTools.find((t) => t.name === block.name), args, result });
          results.push({ type: 'tool_result', tool_use_id: block.id, content: textOf(result.content as unknown[]), ...(result.isError ? { is_error: true } : {}) });
        } catch (err) {
          results.push({ type: 'tool_result', tool_use_id: block.id, content: String((err as Error).message), is_error: true });
        }
      }
      messages.push({ role: 'user', content: results });
    }
    await send({ type: 'done', sessionId });
  });
});

app.use('/*', serveStatic({ root: here('./web/dist') }));

serve({ fetch: app.fetch, port: PORT });

// The sandbox proxy, on its own origin (the host passes its origin as ?host=).
const sandbox = new Hono();
const sandboxHtml = readFileSync(here('./node_modules/@mcp-ui-kit/host/dist/sandbox.html'), 'utf8');
sandbox.get('/sandbox.html', (c) => c.html(sandboxHtml));
serve({ fetch: sandbox.fetch, port: SANDBOX_PORT });

console.log(`chat on http://localhost:${PORT} · sandbox on http://localhost:${SANDBOX_PORT} · MCP ${MCP_URL} · LLM ${anthropic ? MODEL : 'off'}`);
