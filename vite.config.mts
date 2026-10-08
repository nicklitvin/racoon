import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

// Production-only CSP. The dev server needs inline scripts for hot reload, so it's left out there.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "object-src 'none'",
  "base-uri 'none'",
].join('; ');

const contentSecurityPolicy: Plugin = {
  name: 'racoon-csp',
  apply: 'build',
  transformIndexHtml: () => [
    { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head' },
  ],
};

export default defineConfig({
  // Relative asset paths so the same build loads from file:// in Electron and from a web host.
  base: './',
  plugins: [react(), contentSecurityPolicy],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
