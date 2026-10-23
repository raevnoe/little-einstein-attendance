import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';
import serviceWorker from './vite-plugins/serviceWorker.js';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    // serviceWorker() only runs for `vite build` (writes dist/sw.js); see vite-plugins/serviceWorker.js.
    plugins: [react(), tailwindcss(), serviceWorker()],
    server: {
      port: 5173,
      // Forward /api calls to the Express server during development (avoids CORS setup locally).
      proxy: {
        '/api': env.DEV_API_PROXY_TARGET || 'http://localhost:5000',
      },
    },
  };
});
