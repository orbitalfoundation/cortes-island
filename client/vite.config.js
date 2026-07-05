import { defineConfig } from 'vite';

// Dev: vite on :5173 proxies API + websocket to the node server on :8000.
// Prod: the server serves client/dist itself — same-origin, no proxy needed.
export default defineConfig({
  server: {
    proxy: {
      '/socket.io': { target: 'http://localhost:8000', ws: true },
      '/api': { target: 'http://localhost:8000' },
    },
  },
  build: { chunkSizeWarningLimit: 1600 },
});
