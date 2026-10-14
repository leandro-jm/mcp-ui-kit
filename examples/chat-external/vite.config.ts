import react from '@vitejs/plugin-react';
import { defaultClientConditions, defineConfig } from 'vite';

export default defineConfig({
  root: 'web',
  plugins: [react()],
  resolve: { conditions: ['mcp-ui-kit-source', ...defaultClientConditions] },
  build: { outDir: 'dist', emptyOutDir: true },
});
