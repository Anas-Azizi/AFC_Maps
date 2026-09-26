import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/afc_maps/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/afc_maps/api': {
        target: 'http://localhost:3000',
        rewrite: (p) => p.replace(/^\/afc_maps/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
