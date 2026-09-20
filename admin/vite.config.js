import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/AFC_Maps/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/AFC_Maps/api': {
        target: 'http://localhost:3000',
        rewrite: (p) => p.replace(/^\/AFC_Maps/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
