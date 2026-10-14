# @mcp-ui-kit/views

Generic MCP Apps that render any `ViewSpec`, each a single self-contained HTML file with no network access at load time:

| Resource | Renders |
|---|---|
| `view.html` | table, chart, card, form, plan, node/edge diagram |
| `map.html` | map (Leaflet) |
| `diagram.html` | Mermaid diagrams |

```ts
import { viewHtml, viewManifest, MCP_APP_MIME_TYPE } from '@mcp-ui-kit/views';

// resources/read for ui://my-server/view
return { contents: [{ uri, mimeType: MCP_APP_MIME_TYPE, text: viewHtml('view'), _meta: { ui: { csp: { resourceDomains: [], connectDomains: [] } } } }] };
```

Inside the iframe, each view:
- reads the tool result, the `ViewPayload` and the theme from the MCP Apps bridge;
- follows the host's theme and locale;
- sends every action back as `tools/call` through the host, tagged `_meta[".../origin"] = "app"`.
