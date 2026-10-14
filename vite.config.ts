import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    {
      name: 'yaha-production-policy',
      transformIndexHtml(html) {
        if (command !== 'build') return html;
        return html.replace(
          '<head>',
          "<head><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: yaha:; connect-src 'self' yaha:; font-src 'self'; object-src 'none'; base-uri 'none'\">",
        );
      },
    },
  ],
  base: './',
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) {
            return 'three';
          }
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'react';
          }
        },
      },
    },
  },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
}));
