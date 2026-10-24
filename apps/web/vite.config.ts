import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Im Dev-Modus laufen API und WebSockets über `wrangler dev` (Port 8787).
const server = 'http://localhost:8787';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': server,
      '^/r/[^/]+/ws$': { target: server, ws: true },
    },
  },
});
