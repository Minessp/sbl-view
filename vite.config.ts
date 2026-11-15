/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fontPreload } from './scripts/vite-preload';
import { pwa } from './scripts/vite-pwa';

export default defineConfig({
  // Cloudflare Pages: raiz. GitHub Pages: BASE_PATH=/sbl-view/ no build.
  // (Caminho relativo './' quebraria assets em rotas aninhadas.)
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), fontPreload(), pwa()],
  // Data do build (rodapé).
  define: { __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 10)) },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    // three.js entra no chunk lazy do palco (~250 KB gzip), nunca na shell.
    chunkSizeWarningLimit: 1100,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
