/**
 * Prepares a local mcp-gateway dev stack for the example: crawls the dev tenant's fake HR source,
 * enables a few tools, lets the `agent` role call them and activates the views inferred from
 * their contracts (ADR-022). Idempotent.
 *
 * Env: GATEWAY_URL (http://localhost:4000), ADMIN_USER/ADMIN_PASSWORD (admin/admin), TENANT (dev).
 */
export {};

const GATEWAY = process.env.GATEWAY_URL ?? 'http://localhost:4000';
const TENANT = process.env.TENANT ?? 'dev';
const TOOLS = ['rh_colaboradores_list', 'rh_marcacoes_list', 'rh_marcacao_create', 'rh_marcacao_delete'];

async function call<T>(token: string | null, method: string, path: string, body?: unknown, ok = [200, 201, 204]): Promise<T> {
  const res = await fetch(`${GATEWAY}/admin/v1${path}`, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}`, 'x-tenant': TENANT } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!ok.includes(res.status)) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

const { token } = await call<{ token: string }>(null, 'POST', '/auth/login', { username: process.env.ADMIN_USER ?? 'admin', password: process.env.ADMIN_PASSWORD ?? 'admin' });

type Tool = { id: string; name: string; state: string };
const list = async () => (await call<{ items: Tool[] }>(token, 'GET', '/tools?limit=200')).items;
let tools = await list();
if (!TOOLS.every((n) => tools.some((t) => t.name === n))) {
  const sources = await call<{ items: Array<{ id: string; name: string }> }>(token, 'GET', '/sources');
  const rh = sources.items.find((s) => s.name === 'rh');
  if (!rh) throw new Error('dev source "rh" not found: run pnpm db:seed in mcp-gateway');
  await call(token, 'POST', `/sources/${rh.id}/crawl`, {}, [200, 201, 202]);
  for (let i = 0; i < 60 && !TOOLS.every((n) => tools.some((t) => t.name === n)); i++) {
    await new Promise((r) => setTimeout(r, 1000));
    tools = await list();
  }
  if (!TOOLS.every((n) => tools.some((t) => t.name === n))) throw new Error('crawl did not produce the tools: is the crawler worker running?');
}

for (const name of TOOLS) {
  const tool = tools.find((t) => t.name === name)!;
  if (tool.state !== 'enabled') await call(token, 'POST', `/tools/${tool.id}/enable`, {});
  const { views } = await call<{ views: unknown }>(token, 'POST', `/tools/${tool.id}/view/suggest`);
  await call(token, 'PUT', `/tools/${tool.id}/view`, { views, status: 'active' });
  console.log(`✓ ${name}: enabled, view active`);
}

const policies = await call<{ items: Array<{ subject: string; toolPattern: string }> }>(token, 'GET', '/policies');
if (!policies.items.some((p) => p.subject === 'agent' && p.toolPattern === 'rh_*')) {
  await call(token, 'POST', '/policies', { subjectType: 'role', subject: 'agent', effect: 'allow', toolPattern: 'rh_*' });
  console.log('✓ policy: role agent may call rh_*');
}

await call(token, 'PUT', '/settings/theme', { tokens: { accent: { light: '#0b5cad', dark: '#5aa2f0' } } });
console.log('✓ theme: tenant accent set');
