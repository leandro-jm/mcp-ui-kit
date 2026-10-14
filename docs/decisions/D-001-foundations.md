# D-001: Foundations (B0 spikes)

- Status: accepted
- Date: 2026-10-09

## Context
mcp-ui-kit renders MCP tool results as UI (tables, charts, cards, forms, confirmation plans, maps, diagrams) in any chat. It works inside MCP Apps hosts (Claude, ChatGPT, VS Code…) and natively in a system's own chat. Before building, three things had to be measured rather than assumed:
- the MCP Apps SDK;
- a JSON Schema validator that works under a strict CSP;
- the size of the single-file views.

## Decisions

**MCP Apps: `@modelcontextprotocol/ext-apps` 2.0.3, pinned.**
- It is the official SDK of the MCP Apps extension (SEP-1865, stable since 2026-01-26), with peer dependencies on the MCP SDK v2 (`@modelcontextprotocol/client`/`server` 2.x).
- The views use `App` (through `useApp`). The host package will use `AppBridge`.
- Host context provides `theme`, `styles.variables` (standard CSS variable names), `locale` and `toolInfo.tool`. The kit uses those names directly for surfaces, text, borders, fonts and radii, and adds only `--mcp-ui-accent`, `--mcp-ui-accent-contrast`, `--mcp-ui-chart-1..8` and `--mcp-ui-density`.

**Own contract (`ViewSpec`), not A2UI, for now.**
- A2UI is at v1.0 RC.
- The components we need (chart, table, map, diagram, schema form, plan) are outside its basic catalog, so we would write them anyway.
- Every `ViewSpec` kind maps to an A2UI component, so a `toA2UI` adapter is a pure function to add when A2UI 1.0 ships and a host needs it.

**Validation without `eval`: `@cfworker/json-schema` 4.1.1.**
- Form checks run first with friendly, localized messages, then the full schema goes through cfworker, which needs no `unsafe-eval`. The server validates again regardless.
- Scan of the built HTML: no `eval(` and no `new Function`. The only `Function(` is zod's capability probe inside `try/catch`, so under a strict CSP zod simply runs without JIT.

**Three resources, measured (vite 8 + vite-plugin-singlefile, minified):**

| Resource | Renders | Size |
|---|---|---|
| `view.html` | table, chart, card, form, plan, node/edge diagram | 509 KiB |
| `map.html` | map (Leaflet, circle markers, no image assets) | 672 KiB |
| `diagram.html` | Mermaid text diagrams | 5,520 KiB |

- Splitting stays justified: Mermaid alone is ~5 MiB once its lazy diagram chunks are inlined, and the map needs tile hosts in its CSP.
- Node/edge diagrams render in `view.html` with an own layered SVG layout, so most diagrams never load Mermaid.
- `view.html` bundles React, the kit, and `ext-apps` with the MCP SDK and zod it depends on. The split between them has not been itemized yet. Follow-up before 1.0: run a bundle analysis and measure `ext-apps`' lighter entry points.

**Chart palette.**
- The default categorical palette is the validated reference palette (fixed slot order, CVD-checked).
- Re-validated on the kit's own surfaces (`#ffffff` light, `#151d1a` dark): every check passes. In light mode three slots sit under 3:1 contrast, so charts always ship the table view and a direct label.
- Tenant palettes go through the same gate (`validateTheme`): normal-vision ΔE ≥ 15, CVD ΔE ≥ 6 (warning under 8), accent ≥ 3:1.

## Consequences
- Upgrading `ext-apps` requires re-running the views against a real host.
- `diagram.html` is heavy. Servers should prefer node/edge data when they control the output.
