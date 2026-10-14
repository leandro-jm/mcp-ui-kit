# @mcp-ui-kit/host

A thin MCP Apps host for any chat UI, built over the official `AppBridge` (`@modelcontextprotocol/ext-apps`).

```tsx
import { createMcpUiHost } from '@mcp-ui-kit/host';
import { McpAppView } from '@mcp-ui-kit/host/react';

const host = createMcpUiHost({
  sandboxUrl: 'https://sandbox.example.com/sandbox.html', // serve @mcp-ui-kit/host/sandbox.html on ANOTHER origin
  callTool: (name, args, meta) => post('/ui/call', { name, arguments: args, _meta: meta }), // your backend relays to the MCP server
  readResource: (uri) => post('/ui/resource', { uri }),
  onMessage: (text) => chat.send(text),                   // ui/message from the view
  theme: () => 'dark',
  locale: () => navigator.language,
});

<McpAppView host={host} tool={tool} args={args} result={result} tools={allTools} fallback={<pre>{text}</pre>} />
```

- **Isolation:** two iframes. The sandbox proxy runs on another origin; the view runs in an opaque origin with a CSP built from `_meta.ui.csp`. Only clean sources are accepted; the default allows no network, no frames and no plugins.
- **Visibility:** calls from a view are rejected unless the tool is known and visible to apps. Model-only tools are never callable from a view.
- **Other frameworks:** `import '@mcp-ui-kit/host/element'` registers `<mcp-app-view>`. Set its `host` and `call` properties.

Other ready-made hosts work with the same servers: `@mcp-ui/client` (`AppRenderer`) and the AI SDK's `MCPAppRenderer`.
