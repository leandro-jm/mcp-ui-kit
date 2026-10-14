// Bundles src/sandbox.ts into a self-contained dist/sandbox.html (inline script, no network).
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = await build({ entryPoints: [`${root}src/sandbox.ts`], bundle: true, minify: true, format: 'iife', target: 'es2022', write: false });
const js = out.outputFiles[0]!.text.replace(/<\/script/gi, '<\\/script');
writeFileSync(
  `${root}dist/sandbox.html`,
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MCP App sandbox</title>` +
    `<style>html,body{margin:0;height:100%;background:transparent;overflow:hidden}</style></head><body><script>${js}</script></body></html>\n`,
);
console.log('dist/sandbox.html written');
