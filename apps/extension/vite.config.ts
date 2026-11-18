/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

/**
 * Builds the extension pages (popup, side panel, DevTools) and the module service worker.
 * Content scripts must be classic (non-module) scripts, so they are built separately as IIFE
 * bundles by scripts/build.mjs. The manifest is also emitted by scripts/build.mjs.
 */
export default defineConfig({
  plugins: [react()],
  base: '',
  build: {
    outDir: 'dist/chrome',
    emptyOutDir: true,
    target: 'chrome116',
    sourcemap: false,
    modulePreload: false,
    rollupOptions: {
      input: {
        popup: resolve(import.meta.dirname, 'src/popup/index.html'),
        sidepanel: resolve(import.meta.dirname, 'src/sidepanel/index.html'),
        devtools: resolve(import.meta.dirname, 'src/devtools/index.html'),
        'devtools-panel': resolve(import.meta.dirname, 'src/devtools/panel.html'),
        background: resolve(import.meta.dirname, 'src/background/index.ts'),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
  },
});
