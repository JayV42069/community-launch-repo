import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      // Proxy WebSocket connections to our Node.js relay server
      '/ws': {
        target: 'ws://localhost:8081',
        ws: true
      }
    }
  }
});
