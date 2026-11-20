import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  main: { build: { rollupOptions: { output: { format: 'cjs', entryFileNames: 'index.cjs' } } } },
  preload: { build: { rollupOptions: { output: { format: 'cjs', entryFileNames: 'index.cjs' } } } },
  renderer: {
    root: fromRoot('./src/renderer'),
    plugins: [
      react(),
      {
        name: 'sabri-development-csp',
        apply: 'serve',
        transformIndexHtml: (html) => html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'"),
      },
    ],
    build: { rollupOptions: { input: { index: fromRoot('./src/renderer/index.html') } } },
  },
});
