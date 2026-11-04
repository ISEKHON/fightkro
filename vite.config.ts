/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.1.0') },
  base: './',
  server: {
    proxy: { '/api': 'http://localhost:8787' },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: { manualChunks: (id: string) => (id.includes('node_modules/three') ? 'three' : undefined) },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
