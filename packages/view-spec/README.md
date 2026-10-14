# @mcp-ui-kit/view-spec

The contract between an MCP server and the views that render its tool results. It does no I/O, so it runs anywhere.

```ts
import { infer, parseToolViews, validateSpec, META_KEYS, resourceFor } from '@mcp-ui-kit/view-spec';

const views = infer(tool);                    // suggestion from inputSchema/outputSchema/annotations
const parsed = parseToolViews(stored);        // structural validation of untrusted JSON
const issues = validateSpec(views, tool);     // fields must exist in the tool contract

// On a tool result:
result._meta = {
  [META_KEYS.views]: { views, phase: 'result' },    // ViewPayload
  [META_KEYS.theme]: tenantTokens,                  // optional ThemeTokens
};
// On the tool descriptor:
tool._meta = { ui: { resourceUri: `ui://my-server/${resourceFor(views)}` } };
```

- **`ToolViews`** has `input` (`form` or `plan`) and `result` (`table`, `chart`, `card`, `map` or `diagram`).
- **`ViewPayload.phase`** is either `result` or `input`. In the `input` phase the tool did not run: show the form with server `errors`, or the plan with a one-time `confirmToken` that the view echoes in `params._meta[META_KEYS.confirm]`.
- **`validateTheme(tokens)`** returns `errors`, which must be rejected (contrast below 3:1 for the accent, normal-vision ΔE under 15, CVD ΔE under 6), and `warnings`, which are legal but need relief.
