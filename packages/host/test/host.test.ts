import { describe, expect, it } from 'vitest';
import { buildCsp, canViewCall, cleanSources, uiResourceOf, withCsp } from '../src/index';

describe('CSP', () => {
  it('is restrictive by default', () => {
    const csp = buildCsp(undefined);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("frame-src 'none'");
    expect(csp).toContain("object-src 'none'");
  });

  it('adds only clean declared sources', () => {
    const csp = buildCsp({ resourceDomains: ['https://tile.openstreetmap.org', "https://x.com; script-src 'unsafe-eval'", 'https://*.cdn.example'], connectDomains: ['wss://rt.example.com'] });
    expect(csp).toContain('img-src \'self\' data: blob: https://tile.openstreetmap.org https://*.cdn.example');
    expect(csp).toContain('connect-src wss://rt.example.com');
    expect(csp).not.toContain('unsafe-eval');
    expect(cleanSources(['a b', '"x"', 'https://ok.example:8443'])).toEqual(['https://ok.example:8443']);
  });

  it('injects the meta tag first in head', () => {
    const html = withCsp('<!doctype html><html><head><meta charset="utf-8"><script>1</script></head></html>', "default-src 'none'");
    expect(html.indexOf('Content-Security-Policy')).toBeLessThan(html.indexOf('charset'));
    expect(withCsp('<p>x</p>', 'a')).toMatch(/^<!doctype html><html><head><meta http-equiv/);
  });
});

describe('visibility', () => {
  const tool = { name: 'clientes_create', _meta: { ui: { resourceUri: 'ui://mcp-gateway/view' } } };
  const lookup = { name: 'clientes_lookup', _meta: { ui: { visibility: ['app'] } } };
  const modelOnly = { name: 'admin_purge', _meta: { ui: { visibility: ['model'] } } };

  it('lets a view call app-visible tools it knows about, never model-only or unknown ones', () => {
    const req = { tool, tools: [tool, lookup, modelOnly] };
    expect(canViewCall('clientes_create', req)).toBe(true);
    expect(canViewCall('clientes_lookup', req)).toBe(true);
    expect(canViewCall('admin_purge', req)).toBe(false);
    expect(canViewCall('unknown', req)).toBe(false);
  });

  it('without the tool list only the mounted tool is callable', () => {
    expect(canViewCall('clientes_create', { tool })).toBe(true);
    expect(canViewCall('clientes_lookup', { tool })).toBe(false);
  });

  it('reads the ui resource of a tool', () => {
    expect(uiResourceOf(tool)).toBe('ui://mcp-gateway/view');
    expect(uiResourceOf({ name: 'plain' })).toBeUndefined();
  });
});
