# Example: a chat with MCP Apps views

A minimal chat (Hono backend + React page) that:
- talks to an MCP server on the 2026-07-28 protocol, declaring MCP Apps;
- runs Claude (`claude-opus-5-5`, with server-side refusal fallback) over the server's tools;
- renders every tool result with its view through `@mcp-ui-kit/host`.

## Run against a local mcp-gateway

1. In `mcp-gateway`, start the stack:
   ```bash
   pnpm dev:infra
   pnpm db:migrate && pnpm db:seed
   pnpm dev:upstream
   pnpm dev
   pnpm --filter @mcp-gateway/crawler dev
   ```
2. In this directory, prepare the gateway: crawl, enable a few tools and activate their inferred views.
   ```bash
   npx tsx scripts/setup-gateway.ts
   ```
3. Start the chat:
   ```bash
   pnpm build && ANTHROPIC_API_KEY=… pnpm start
   ```
   Then open http://localhost:5301. Without a key, use the "Run a tool" panel, which calls tools directly.
4. Run the end-to-end test:
   ```bash
   pnpm e2e
   ```
   It covers a table, a form (invalid arguments, then submit), and a destructive plan that only runs after Confirm.

## Configuration

| Variable | Default |
|---|---|
| `MCP_URL` | `http://localhost:4000/mcp` |
| `MCP_TOKEN` | the mcp-gateway dev agent token |
| `PORT` | `5301` |
| `SANDBOX_PORT` | `5302` (the sandbox proxy needs its own origin) |
