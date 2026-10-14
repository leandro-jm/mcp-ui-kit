import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { conditions: ['mcp-ui-kit-source'] },
  test: {
    include: ['packages/*/src/**/*.test.{ts,tsx}', 'packages/*/test/**/*.test.{ts,tsx}'],
  },
});
