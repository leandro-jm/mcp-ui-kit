import { defineConfig } from '@playwright/test';

/** Runs against a live stack: mcp-gateway dev (+ scripts/setup-gateway.ts) and `pnpm start` here. */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: { baseURL: process.env.EXAMPLE_URL ?? 'http://localhost:5301', locale: 'en-US', colorScheme: 'light', screenshot: 'only-on-failure' },
  outputDir: 'test-results',
});
