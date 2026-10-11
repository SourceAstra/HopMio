import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { enginePlugin } from './desktop/dev-plugin.ts';
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    enginePlugin(),
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
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
}));
