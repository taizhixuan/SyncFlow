import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
      // Konva's `main` is a Node build that hard-requires the native `canvas`
      // module; its `browser` field points at the build Vite gives the app.
      // Vitest resolves `main`, so without this a test that renders a real
      // stage dies on "Cannot find module 'canvas'". Anchored so the alias
      // cannot also rewrite deep imports like `konva/lib/Core.js`.
      { find: /^konva$/, replacement: 'konva/lib/index.js' },
    ],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
