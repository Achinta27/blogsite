import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Same-origin API in development, so the refresh cookie is first-party
    proxy: {
      '/api': { target: process.env.API_PROXY_TARGET || 'http://localhost:5000', changeOrigin: true },
      '/socket.io': { target: process.env.API_PROXY_TARGET || 'http://localhost:5000', ws: true, changeOrigin: true },
    },
  },
});
