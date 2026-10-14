/** `_meta.ui.csp` of an MCP App resource (SEP-1865). */
export interface ResourceCsp {
  connectDomains?: string[];
  resourceDomains?: string[];
  frameDomains?: string[];
  baseUriDomains?: string[];
}

/**
 * Only origins and wildcard hosts are accepted as CSP sources: anything with spaces, quotes or
 * semicolons could inject directives, so it is dropped (never escaped).
 */
const SOURCE = /^(https:\/\/|wss:\/\/)?(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)*(:\d{1,5})?$/i;

export function cleanSources(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.filter((s): s is string => typeof s === 'string' && s.length <= 253 && SOURCE.test(s)))].slice(0, 32);
}

/**
 * CSP for the inner iframe. Restrictive by default, as the spec requires: no network, no
 * frames, no plugins; only what the resource declared is added (and only clean sources).
 */
export function buildCsp(csp: ResourceCsp | undefined): string {
  const res = cleanSources(csp?.resourceDomains);
  const con = cleanSources(csp?.connectDomains);
  const frm = cleanSources(csp?.frameDomains);
  const list = (base: string[], extra: string[]) => [...base, ...extra].join(' ');
  return [
    "default-src 'none'",
    `script-src ${list(["'self'", "'unsafe-inline'"], res)}`,
    `style-src ${list(["'self'", "'unsafe-inline'"], res)}`,
    `img-src ${list(["'self'", 'data:', 'blob:'], res)}`,
    `font-src ${list(["'self'", 'data:'], res)}`,
    `media-src ${list(["'self'", 'data:', 'blob:'], res)}`,
    `connect-src ${con.length ? con.join(' ') : "'none'"}`,
    `frame-src ${frm.length ? frm.join(' ') : "'none'"}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

/** Puts the CSP `<meta>` first in `<head>` so it applies before any of the resource's own markup. */
export function withCsp(html: string, csp: string): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${csp.replace(/"/g, '&quot;')}">`;
  const head = /<head[^>]*>/i.exec(html);
  if (head) return `${html.slice(0, head.index + head[0].length)}${meta}${html.slice(head.index + head[0].length)}`;
  return `<!doctype html><html><head>${meta}</head><body>${html}</body></html>`;
}
