# mcp-ui-kit

Render MCP tool results as UI inside any chat: tables, charts, cards, forms, confirmation plans, maps and diagrams.

mcp-ui-kit is built on **[MCP Apps](https://modelcontextprotocol.io/seps/1865-mcp-apps-interactive-user-interfaces-for-mcp)** (`io.modelcontextprotocol/ui`), the official MCP extension for interactive UI. The same view works in Claude, ChatGPT, VS Code and other MCP Apps hosts, and in your own chat through a thin host.

```
your MCP server ──► tool result: structuredContent (data) + _meta (ViewSpec + theme)
                    ui://…/view  (generic MCP App: one HTML file, sandboxed)
any MCP Apps host ─► renders the view; calls from the view go back through the server's policy
```

Data travels once, in `structuredContent`. The `ViewSpec` and the theme travel in the result `_meta`, which never reaches the model's context.

## Packages

| Package | What it is | Runs in |
|---|---|---|
| [`@mcp-ui-kit/view-spec`](packages/view-spec) | The contract: `ViewSpec` types, validation, `infer(tool)` from JSON Schema + annotations, theme tokens with a contrast/color-blindness gate | anywhere (pure) |
| [`@mcp-ui-kit/views`](packages/views) | Three generic MCP Apps as single-file HTML (`view`, `map`, `diagram`) plus a Node helper to serve them as `ui://` resources | your MCP server |
| [`@mcp-ui-kit/components`](packages/components) | React renderers (`<ToolView>`) used inside the views; also usable natively (no iframe) for trusted content | browser |
| [`@mcp-ui-kit/host`](packages/host) | A thin MCP Apps host over the official `AppBridge`: sandbox proxy, CSP, visibility checks, `<McpAppView>` for React and `<mcp-app-view>` for anything else | your chat |

## Three ways to use it

1. **You run an MCP server.**
   - Store a `ToolViews` per tool. Start from `infer()` and review the result.
   - Serve `@mcp-ui-kit/views` as `ui://` resources and point each tool's `_meta.ui.resourceUri` at one of them.
   - Add `_meta["io.github.leandro-jm.mcp-ui-kit/views"]` (a `ViewPayload`) to the results.
   - [mcp-gateway](https://github.com/leandro-jm/mcp-gateway) does all of this for every REST/OpenAPI tool it exposes.
2. **You run a chat.**
   - Use `@mcp-ui-kit/host` (`createMcpUiHost` + `<McpAppView>`), `@mcp-ui/client`'s `AppRenderer`, or the AI SDK's `MCPAppRenderer`.
   - With `@mcp-ui-kit/host`, your backend keeps the MCP credential and relays `tools/call` and `resources/read` for the views.
3. **You want native rendering** in an app you control: render `<ToolView>` from `@mcp-ui-kit/components` with the same payload.

## View kinds

| Kind | For | Notes |
|---|---|---|
| `table` | lists of records | typed columns, row actions |
| `chart` | series | documented subset of Vega-Lite (bar, line, area, point); always offers the table view |
| `card` | one object | fields and stat tiles |
| `form` | tool input | JSON Schema + a subset of the rjsf uiSchema; validated without `eval` |
| `plan` | destructive tools | steps plus confirmation; the server issues a one-time token that only a human click sends back |
| `map` | rows with coordinates or GeoJSON points | Leaflet; the basemap comes from the server and is declared in the CSP |
| `diagram` | nodes/edges, or Mermaid text | nodes/edges use the kit's own SVG layout; Mermaid lives in its own resource because of its size |

## Theming

The views use the **standard MCP Apps CSS variables** (`--color-background-primary`, `--font-sans`, `--border-radius-md`…), so a host's styles apply naturally. The kit adds only `--mcp-ui-accent` and `--mcp-ui-chart-1..8`.

Values are resolved in this order: kit defaults, then the server's `ThemeTokens` (for example, tenant branding), then the host's variables. `validateTheme` rejects unreadable accents and palettes that are indistinguishable under normal vision or color blindness. The default chart palette is pre-validated.

## Example

[`examples/chat-external`](examples/chat-external) is a chat (Hono + React) that:
- talks to an MCP server with the 2026-07-28 protocol;
- runs Claude with the server's tools;
- renders every tool result with its view.

Its Playwright test drives a table, a form and a human-confirmed plan through the double-iframe sandbox.

## Development

```bash
pnpm install
pnpm check      # typecheck
pnpm test       # unit tests
pnpm build      # dist/ of every package (views: three single-file HTML)
```

Decisions are recorded in [`docs/decisions`](docs/decisions).

## License

Apache-2.0
