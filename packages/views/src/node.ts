import { existsSync, readFileSync } from 'node:fs';
import { MCP_APP_MIME_TYPE, type ViewResource } from '@mcp-ui-kit/view-spec';

export interface ViewResourceInfo {
  name: ViewResource;
  file: string;
  mimeType: typeof MCP_APP_MIME_TYPE;
  /** View kinds this resource renders. */
  kinds: string[];
  /** Fixed CSP needs of the resource; servers add their own (e.g. tile and font hosts). */
  csp: { resourceDomains: string[]; connectDomains: string[] };
  bytes: number;
  /** sha256 of the HTML, for cache keys and integrity checks. */
  sha256: string;
}

function distFile(name: string): URL {
  // dist/node.js sits next to the HTML; src/node.ts (workspace source mode) is one level up
  const here = new URL(`./${name}`, import.meta.url);
  return existsSync(here) ? here : new URL(`../dist/${name}`, import.meta.url);
}

let cached: ViewResourceInfo[] | undefined;

/** The generic MCP App resources shipped by this package. */
export function viewManifest(): ViewResourceInfo[] {
  cached ??= JSON.parse(readFileSync(distFile('manifest.json'), 'utf8')) as ViewResourceInfo[];
  return cached;
}

const html = new Map<ViewResource, string>();

/** Single-file HTML of a generic MCP App (inline scripts and styles, no network at load). */
export function viewHtml(name: ViewResource): string {
  let h = html.get(name);
  if (h === undefined) {
    const info = viewManifest().find((v) => v.name === name);
    if (!info) throw new Error(`unknown view resource: ${name}`);
    h = readFileSync(distFile(info.file), 'utf8');
    html.set(name, h);
  }
  return h;
}

export { MCP_APP_MIME_TYPE };
