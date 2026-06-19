import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Where the API runs in dev. Defaults to :3000; override via VITE_DEV_API_PROXY
  // (e.g. in .env.local) when the API is on another port — handy when :3000 is
  // taken. The realtime socket connects via VITE_SYNC_URL (see use-board-sync).
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_DEV_API_PROXY || 'http://localhost:3000';

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      // Proxy REST + WebSocket to the API in dev so the browser sees one origin.
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          ws: true,
        },
      },
    },
  };
});
