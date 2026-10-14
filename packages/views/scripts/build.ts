// Builds the three generic MCP Apps as single-file HTML (vite + vite-plugin-singlefile),
// writes dist/manifest.json and compiles the Node helper (dist/node.js).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { build, defaultClientConditions } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = `${root}dist`;
rmSync(dist, { recursive: true, force: true });

const VIEWS = [
  { name: 'view', kinds: ['table', 'chart', 'card', 'form', 'plan', 'diagram'] },
  { name: 'map', kinds: ['map'] },
  { name: 'diagram', kinds: ['diagram'] },
] as const;

for (const v of VIEWS) {
  await build({
    root,
    logLevel: 'warn',
    plugins: [react(), viteSingleFile({ removeViteModuleLoader: true })],
    resolve: { conditions: ['mcp-ui-kit-source', ...defaultClientConditions] },
    build: { outDir: dist, emptyOutDir: false, rollupOptions: { input: `${root}${v.name}.html` }, target: 'es2022' },
  });
}

const manifest = VIEWS.map((v) => {
  const file = `${v.name}.html`;
  const html = readFileSync(`${dist}/${file}`);
  return {
    name: v.name,
    file,
    mimeType: 'text/html;profile=mcp-app',
    kinds: [...v.kinds],
    csp: { resourceDomains: [], connectDomains: [] },
    bytes: html.length,
    sha256: createHash('sha256').update(html).digest('hex'),
  };
});
writeFileSync(`${dist}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
execFileSync('pnpm', ['exec', 'tsup', 'src/node.ts', '--format', 'esm', '--out-dir', 'dist', '--external', '@mcp-ui-kit/view-spec'], { cwd: root, stdio: 'inherit' });
execFileSync('pnpm', ['exec', 'tsc', '-p', 'tsconfig.build.json'], { cwd: root, stdio: 'inherit' });
for (const m of manifest) console.log(`${m.file}: ${(m.bytes / 1024).toFixed(1)} KiB`);
