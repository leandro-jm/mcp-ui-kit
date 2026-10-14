import { ToolView, type ExtraRenderers, type ViewHost } from '@mcp-ui-kit/components';
import '@mcp-ui-kit/components/styles.css';
import { META_KEYS, resolveTheme, validateTheme, type JsonSchemaObject, type ThemeTokens } from '@mcp-ui-kit/view-spec';
import type { McpUiHostContext } from '@modelcontextprotocol/ext-apps';
import { useApp } from '@modelcontextprotocol/ext-apps/react';
import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';

type ToolResult = Parameters<NonNullable<ReturnType<typeof useApp>['app']>['ontoolresult'] & {}>[0];

/** Server branding, only when it passes the theme gate (anything invalid is ignored, never applied). */
function serverTokens(result: ToolResult | undefined): ThemeTokens | undefined {
  const t = result?._meta?.[META_KEYS.theme];
  if (!t || typeof t !== 'object') return undefined;
  return validateTheme(t as ThemeTokens).errors.length ? undefined : (t as ThemeTokens);
}

function systemMode(): 'light' | 'dark' {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function Shell({ renderers }: { renderers?: ExtraRenderers }) {
  const [result, setResult] = useState<ToolResult>();
  const [args, setArgs] = useState<Record<string, unknown>>({});
  const [ctx, setCtx] = useState<McpUiHostContext>({});
  const { app, error } = useApp({
    appInfo: { name: 'mcp-ui-kit', version: '0.1.0' },
    capabilities: {},
    onAppCreated: (a) => {
      a.ontoolinput = (p) => setArgs((p.arguments ?? {}) as Record<string, unknown>);
      a.ontoolresult = (r) => setResult(r);
      a.onhostcontextchanged = (c) => setCtx((prev) => ({ ...prev, ...c }));
    },
  });

  useEffect(() => {
    if (app) setCtx((prev) => ({ ...app.getHostContext(), ...prev }));
  }, [app]);

  // theme: kit defaults → server branding (from the result) → host style variables
  const mode = ctx.theme ?? systemMode();
  const tokens = useMemo(() => serverTokens(result), [result]);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = mode;
    root.style.colorScheme = mode;
    const vars = resolveTheme(mode, tokens, ctx.styles?.variables as Record<string, string | undefined> | undefined);
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  }, [mode, tokens, ctx.styles]);

  const host = useMemo<ViewHost | undefined>(
    () =>
      app
        ? {
            callTool: (name, a, meta) => app.callServerTool({ name, arguments: a, _meta: { ...meta, [META_KEYS.origin]: 'app' } }),
            sendMessage: async (text) => {
              await app.sendMessage({ role: 'user', content: [{ type: 'text', text }] });
            },
          }
        : undefined,
    [app],
  );

  if (error) return <p className="mui-err">{error.message}</p>;
  if (!host || !result) return null;
  const toolSchema = ctx.toolInfo?.tool.inputSchema as JsonSchemaObject | undefined;
  return (
    <ToolView result={result} args={args} host={host} locale={ctx.locale ?? navigator.language} renderers={renderers} {...(toolSchema ? { toolSchema } : {})} />
  );
}

/** Mounts the MCP App. Each generic resource (view, map, diagram) calls this with its renderers. */
export function mount(renderers?: ExtraRenderers): void {
  document.body.classList.add('mui-app');
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Shell renderers={renderers} />
    </StrictMode>,
  );
}
