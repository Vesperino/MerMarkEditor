import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  cacheDir: 'node_modules/.vite-document-style-review',
  root: fileURLToPath(new URL('.', import.meta.url)), plugins: [vue()],
  server: { port: 1434, strictPort: true, fs: { allow: [fileURLToPath(new URL('../..', import.meta.url))] } },
  build: { outDir: '../../output/playwright/document-style-review/site', emptyOutDir: true },
});
