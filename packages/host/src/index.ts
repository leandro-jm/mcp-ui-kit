import { AppBridge, PostMessageTransport, getToolUiResourceUri, isToolVisibilityModelOnly } from '@modelcontextprotocol/ext-apps/app-bridge';
import type { McpUiHostContext, McpUiResourceCsp, McpUiResourcePermissions } from '@modelcontextprotocol/ext-apps';
import { cleanSources, type ResourceCsp } from './csp';

export { buildCsp, cleanSources, withCsp, type ResourceCsp } from './csp';

/** The parts of an MCP tool descriptor the host reads. */
export interface ToolLike {
  name: string;
  title?: string;
  inputSchema?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
  [key: string]: unknown;
}

/** An MCP `CallToolResult` (content, structuredContent, isError, _meta). */
export type ToolResult = { content: unknown[]; structuredContent?: Record<string, unknown>; isError?: boolean; _meta?: Record<string, unknown>; [key: string]: unknown };

export interface ResourceContentsLike {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
  _meta?: Record<string, unknown>;
}

export interface McpUiHostOptions {
  /**
   * URL of the sandbox proxy page (`@mcp-ui-kit/host/sandbox.html`), served from an origin
   * different from the chat's. The host origin is appended as `?host=` so the proxy only
   * talks to this page.
   */
  sandboxUrl: string;
  /** Relays `tools/call` to the MCP server (usually through the system's own backend, which holds the credentials). */
  callTool(name: string, args: Record<string, unknown>, meta?: Record<string, unknown>): Promise<ToolResult>;
  /** Relays `resources/read` to the MCP server. */
  readResource(uri: string): Promise<{ contents: ResourceContentsLike[] }>;
  /** A view asked to post a user message to the conversation (`ui/message`). */
  onMessage?(text: string): void | Promise<void>;
  /** A view asked to open a link; defaults to a new tab with `noopener`. */
  onOpenLink?(url: string): void;
  /** Host context pieces; read on mount and on `refresh()`. */
  theme?(): 'light' | 'dark';
  locale?(): string;
  /** Standard MCP Apps style variables (`--color-background-primary`…) to blend the view in. */
  styleVariables?(): Record<string, string>;
  hostInfo?: { name: string; version: string };
  /** Upper bound for the iframe height in px (default 900). */
  maxHeight?: number;
}

export interface MountRequest {
  tool: ToolLike;
  args: Record<string, unknown>;
  result: ToolResult;
  /**
   * Descriptors of the server's tools, to enforce visibility on calls from the view: the host
   * MUST reject `tools/call` for tools without `"app"` visibility. Unknown tools are rejected.
   * When omitted, only the mounted tool itself may be called.
   */
  tools?: ToolLike[];
}

export interface MountedView {
  /** Pushes a newer result of the same tool to the view. */
  update(result: ToolResult): Promise<void>;
  /** Re-reads theme/locale/style variables and notifies the view. */
  refresh(): Promise<void>;
  destroy(): Promise<void>;
}

export interface McpUiHost {
  /** Mounts the view of a tool result into `el`; resolves `null` when the tool has no MCP App. */
  mount(el: HTMLElement, req: MountRequest): Promise<MountedView | null>;
}

/** The MCP App resource of a tool (`_meta.ui.resourceUri`), if any. */
export function uiResourceOf(tool: ToolLike): string | undefined {
  return getToolUiResourceUri(tool as never) ?? undefined;
}

function textMessage(content: unknown[]): string {
  return content
    .map((c) => (c && typeof c === 'object' && (c as { type?: string }).type === 'text' ? String((c as { text?: unknown }).text ?? '') : ''))
    .filter(Boolean)
    .join('\n');
}

/** Visibility gate for `tools/call` coming from a view (SEP-1865). */
export function canViewCall(name: string, req: Pick<MountRequest, 'tool' | 'tools'>): boolean {
  const known = req.tools ?? [req.tool];
  const tool = known.find((t) => t.name === name);
  return Boolean(tool) && !isToolVisibilityModelOnly(tool as never);
}

/**
 * A thin MCP Apps host for any chat UI, over the official `AppBridge`. It only renders: every
 * call a view makes goes back through `callTool`, so the MCP server's authorization applies.
 */
export function createMcpUiHost(options: McpUiHostOptions): McpUiHost {
  const hostInfo = options.hostInfo ?? { name: 'mcp-ui-kit-host', version: '0.1.0' };
  const context = (tool: ToolLike): McpUiHostContext => ({
    ...(options.theme ? { theme: options.theme() } : {}),
    ...(options.locale ? { locale: options.locale() } : {}),
    ...(options.styleVariables ? { styles: { variables: options.styleVariables() } as never } : {}),
    toolInfo: { tool: tool as never },
    displayMode: 'inline',
    availableDisplayModes: ['inline'],
    platform: 'web',
  });

  return {
    async mount(el, req) {
      const uri = uiResourceOf(req.tool);
      if (!uri) return null;
      const read = await options.readResource(uri);
      const res = read.contents.find((c) => typeof c.text === 'string');
      if (!res?.text) return null;
      const ui = (res._meta?.ui ?? {}) as { csp?: ResourceCsp; permissions?: McpUiResourcePermissions };
      const csp: McpUiResourceCsp = {
        connectDomains: cleanSources(ui.csp?.connectDomains),
        resourceDomains: cleanSources(ui.csp?.resourceDomains),
      };

      const iframe = document.createElement('iframe');
      const url = new URL(options.sandboxUrl, location.href);
      url.searchParams.set('host', location.origin);
      iframe.src = url.toString();
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
      iframe.setAttribute('title', req.tool.title ?? req.tool.name);
      iframe.style.cssText = 'border:0;width:100%;height:120px;display:block;background:transparent;color-scheme:normal';
      el.replaceChildren(iframe);

      const bridge = new AppBridge(null, hostInfo, { openLinks: {}, serverTools: {}, serverResources: {}, message: { text: {} } as never }, { hostContext: context(req.tool) });
      bridge.oncalltool = async (params) => {
        if (!canViewCall(params.name, req)) {
          return { isError: true, content: [{ type: 'text', text: `Tool not available to this view: ${params.name}` }] } as never;
        }
        return (await options.callTool(params.name, (params.arguments ?? {}) as Record<string, unknown>, params._meta as Record<string, unknown> | undefined)) as never;
      };
      bridge.onreadresource = async (params) => (await options.readResource(params.uri)) as never;
      bridge.onmessage = async (params) => {
        const text = textMessage(params.content as unknown[]);
        if (text && options.onMessage) await options.onMessage(text);
        return { isError: !text || !options.onMessage } as never;
      };
      bridge.onopenlink = async ({ url: link }) => {
        const safe = /^https?:\/\//i.test(link);
        if (safe) (options.onOpenLink ?? ((u: string) => window.open(u, '_blank', 'noopener,noreferrer')))(link);
        return { isError: !safe } as never;
      };
      bridge.onsizechange = ({ height }) => {
        if (typeof height === 'number' && height > 0) iframe.style.height = `${Math.min(Math.ceil(height), options.maxHeight ?? 900)}px`;
      };
      bridge.onsandboxready = () => {
        void bridge.sendSandboxResourceReady({ html: res.text!, csp, ...(ui.permissions ? { permissions: ui.permissions } : {}) });
      };
      const initialized = new Promise<void>((resolve) => {
        bridge.oninitialized = () => resolve();
      });

      await new Promise<void>((resolve) => {
        if (iframe.contentWindow) resolve();
        else iframe.addEventListener('load', () => resolve(), { once: true });
      });
      await bridge.connect(new PostMessageTransport(iframe.contentWindow!, iframe.contentWindow!));
      void initialized.then(async () => {
        await bridge.sendToolInput({ arguments: req.args });
        await bridge.sendToolResult(req.result as never);
      });

      return {
        async update(result) {
          await initialized;
          await bridge.sendToolResult(result as never);
        },
        async refresh() {
          await initialized;
          await bridge.sendHostContextChange(context(req.tool) as never);
        },
        async destroy() {
          await bridge.teardownResource({}).catch(() => undefined);
          await bridge.close().catch(() => undefined);
          iframe.remove();
        },
      };
    },
  };
}
