# @mcp-ui-kit/components

React renderers for `@mcp-ui-kit/view-spec`. The MCP Apps in `@mcp-ui-kit/views` use them inside the iframe. You can also use them natively, without an iframe, when the content is trusted, for example to preview a tenant's own views.

```tsx
import { ToolView, ThemeScope } from '@mcp-ui-kit/components';
import '@mcp-ui-kit/components/styles.css';

<ThemeScope mode="light" tokens={tenantTokens}>
  <ToolView result={callToolResult} args={args} locale="pt-BR"
    host={{ callTool: (name, args, meta) => …, sendMessage: (text) => … }} />
</ThemeScope>
```

The map (Leaflet) and Mermaid renderers are separate entry points, so they stay out of the main bundle. Pass them through `renderers={{ map: MapResult, mermaid: MermaidResult }}`. Strings ship in `en`, `pt-BR` and `es`.
