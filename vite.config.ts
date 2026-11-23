import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// @ts-ignore plain JS server module
import { apiMiddleware, loadEnv } from './server/api.mjs';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'dev-api',
      async configureServer(server) { await loadEnv(); server.middlewares.use(apiMiddleware()); },
      async configurePreviewServer(server) { await loadEnv(); server.middlewares.use(apiMiddleware()); },
    },
  ],
  base: './',
  server: { port: 5190 },
});
