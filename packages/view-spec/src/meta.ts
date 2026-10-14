import { parseToolViews, type Issue, type ParseResult } from './parse';
import type { ToolViews } from './types';

/**
 * `_meta` keys a server uses to attach views and branding to a tool result. They live in the
 * result `_meta` (not in `content`), so they never reach the model's context.
 */
export const META_KEYS = {
  /** `ViewPayload` on a tool result. */
  views: 'io.github.leandro-jm.mcp-ui-kit/views',
  /** `ThemeTokens` of the server (e.g. tenant branding) on a tool result. */
  theme: 'io.github.leandro-jm.mcp-ui-kit/theme',
  /** Confirmation token echoed back in `tools/call` `params._meta` when the user confirms a plan. */
  confirm: 'io.github.leandro-jm.mcp-ui-kit/confirm',
  /** `"app"` on `tools/call` made by a view (self-declared, informative only: never authorization). */
  origin: 'io.github.leandro-jm.mcp-ui-kit/origin',
} as const;

/** MCP Apps extension id a client declares to receive `_meta.ui` (SEP-1865). */
export const MCP_APPS_EXTENSION = 'io.modelcontextprotocol/ui';

/** MIME type of an MCP App HTML resource. */
export const MCP_APP_MIME_TYPE = 'text/html;profile=mcp-app';

/**
 * What a tool result asks the view to do.
 * - `result`: render `views.result` over `structuredContent`.
 * - `input`: the tool did not run; render `views.input` prefilled with the call arguments
 *   (with server-side `errors`, e.g. after a validation failure). A plan carries a one-time
 *   `confirmToken`: only a human click sends it back, so the model cannot confirm by itself.
 */
export interface ViewPayload {
  views: ToolViews;
  phase: 'input' | 'result';
  /** `{ field: message }`, already localized by the server. */
  errors?: Record<string, string>;
  confirmToken?: string;
  /** The result was cut (projection limits or artifact offload): show what came and say so. */
  truncated?: boolean;
  /** Basemap for map views; its host must also be allowed by the resource CSP. */
  mapTiles?: { url: string; attribution?: string };
}

/** `https://…/{z}/{x}/{y}…` tile template: the only shape accepted for a basemap. */
export const TILE_URL = /^https:\/\/[a-z0-9.-]+(:\d+)?\/[^\s"'<>]*\{z\}[^\s"'<>]*\{x\}[^\s"'<>]*\{y\}[^\s"'<>]*$/i;

export function parseViewPayload(value: unknown): ParseResult<ViewPayload> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return { ok: false, issues: [{ code: 'invalid_object', path: '$' }] };
  const v = value as Record<string, unknown>;
  const issues: Issue[] = [];
  const views = parseToolViews(v.views);
  if (!views.ok) issues.push(...views.issues.map((i) => ({ ...i, path: i.path.replace(/^\$/, '$.views') })));
  if (v.phase !== 'input' && v.phase !== 'result') issues.push({ code: 'invalid_value', path: '$.phase' });
  if (v.phase === 'input' && views.ok && !views.value.input) issues.push({ code: 'required', path: '$.views.input' });
  if (v.phase === 'result' && views.ok && !views.value.result) issues.push({ code: 'required', path: '$.views.result' });
  if (v.errors !== undefined) {
    const e = v.errors;
    if (e === null || typeof e !== 'object' || Array.isArray(e) || !Object.values(e).every((m) => typeof m === 'string' && m.length <= 500)) {
      issues.push({ code: 'invalid_object', path: '$.errors' });
    }
  }
  if (v.confirmToken !== undefined && (typeof v.confirmToken !== 'string' || v.confirmToken.length > 256)) issues.push({ code: 'invalid_value', path: '$.confirmToken' });
  if (v.truncated !== undefined && typeof v.truncated !== 'boolean') issues.push({ code: 'invalid_value', path: '$.truncated' });
  if (v.mapTiles !== undefined) {
    const m = v.mapTiles as Record<string, unknown> | null;
    if (!m || typeof m !== 'object' || typeof m.url !== 'string' || !TILE_URL.test(m.url) || (m.attribution !== undefined && (typeof m.attribution !== 'string' || m.attribution.length > 300))) {
      issues.push({ code: 'invalid_value', path: '$.mapTiles' });
    }
  }
  return issues.length ? { ok: false, issues } : { ok: true, value: v as unknown as ViewPayload };
}

/** The generic MCP App resources: `view` (table, chart, card, form, plan, node/edge diagram), `map` and `diagram` (Mermaid). */
export type ViewResource = 'view' | 'map' | 'diagram';

/** Which generic MCP App renders a tool's views; map and Mermaid live apart for size and CSP. */
export function resourceFor(views: ToolViews): ViewResource {
  const r = views.result;
  if (r?.kind === 'map') return 'map';
  if (r?.kind === 'diagram' && 'mermaid' in r) return 'diagram';
  return 'view';
}
