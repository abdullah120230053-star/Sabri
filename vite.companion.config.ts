import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
const here = (path: string) => fileURLToPath(new URL(path,import.meta.url));
export default defineConfig({ root:here('./src/companion'),base:'/',plugins:[react()],build:{ outDir:here('./out/companion'),emptyOutDir:true,assetsInlineLimit:0 } });
