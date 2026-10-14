/**
 * MCP Apps sandbox proxy (SEP-1865, web hosts). Served from an origin different from the
 * host's; it renders the view HTML in an inner iframe with an opaque origin and the resource
 * CSP, and relays JSON-RPC messages between host and view, except `ui/notifications/sandbox-*`.
 *
 * `?host=<origin>` pins the host origin: messages from any other origin are ignored and
 * replies are only posted there.
 */
import { buildCsp, withCsp, type ResourceCsp } from './csp';

const SANDBOX_PREFIX = 'ui/notifications/sandbox-';
const DEFAULT_INNER_SANDBOX = 'allow-scripts allow-forms';
/** The only tokens a resource may ask for on the inner iframe: never `allow-same-origin`. */
const ALLOWED_SANDBOX = new Set(['allow-scripts', 'allow-forms', 'allow-popups', 'allow-popups-to-escape-sandbox', 'allow-modals', 'allow-downloads']);

const hostOrigin = new URLSearchParams(location.search).get('host') ?? '*';
let inner: HTMLIFrameElement | null = null;

const isMsg = (m: unknown): m is { method?: unknown } => typeof m === 'object' && m !== null;
const isSandboxMethod = (m: unknown) => isMsg(m) && typeof m.method === 'string' && m.method.startsWith(SANDBOX_PREFIX);

function innerSandbox(requested: unknown): string {
  if (typeof requested !== 'string') return DEFAULT_INNER_SANDBOX;
  const tokens = requested.split(/\s+/).filter((t) => ALLOWED_SANDBOX.has(t));
  return tokens.length ? [...new Set(tokens)].join(' ') : DEFAULT_INNER_SANDBOX;
}

function render(params: { html?: unknown; sandbox?: unknown; csp?: ResourceCsp }): void {
  if (typeof params.html !== 'string') return;
  inner?.remove();
  inner = document.createElement('iframe');
  inner.setAttribute('sandbox', innerSandbox(params.sandbox));
  inner.setAttribute('title', 'MCP App');
  inner.style.cssText = 'border:0;width:100%;height:100%;display:block;background:transparent';
  inner.srcdoc = withCsp(params.html, buildCsp(params.csp));
  document.body.append(inner);
}

window.addEventListener('message', (e: MessageEvent) => {
  const m: unknown = e.data;
  if (e.source === window.parent) {
    if (hostOrigin !== '*' && e.origin !== hostOrigin) return;
    if (isMsg(m) && m.method === `${SANDBOX_PREFIX}resource-ready`) {
      render(((m as { params?: unknown }).params ?? {}) as Parameters<typeof render>[0]);
      return;
    }
    if (isSandboxMethod(m)) return;
    inner?.contentWindow?.postMessage(m, '*');
    return;
  }
  if (inner && e.source === inner.contentWindow) {
    if (isSandboxMethod(m)) return;
    window.parent.postMessage(m, hostOrigin);
  }
});

window.parent.postMessage({ jsonrpc: '2.0', method: `${SANDBOX_PREFIX}proxy-ready`, params: {} }, hostOrigin);
