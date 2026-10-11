import type { Plugin } from 'vite';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { Engine } from './engine.ts';
import { publicMethods } from '../shared/methods.ts';
export function enginePlugin(): Plugin {
  return {
    name: 'yaha-engine',
    configureServer(server) {
      const engine = new Engine(
        process.cwd(),
        process.env.YAHA_DATA_DIR || path.join(process.cwd(), '.yaha'),
      );
      server.httpServer?.once('close', () => engine.close());
      server.middlewares.use(async (request, response, next) => {
        if (!request.url?.startsWith('/api/')) return next();
        const origin = request.headers.origin;
        if (origin && origin !== 'http://127.0.0.1:5173' && origin !== 'http://localhost:5173') {
          response.statusCode = 403;
          return response.end();
        }
        try {
          if (request.url.startsWith('/api/assets/') && request.method === 'GET') {
            const asset = (await engine.call('asset.path', {
              id: decodeURIComponent(request.url.split('/')[3].split('?')[0]),
            })) as { path: string; mime: string };
            response.setHeader('Content-Type', asset.mime);
            createReadStream(asset.path).pipe(response);
            return;
          }
          if (request.url === '/api/rpc' && request.method === 'POST') {
            let content = '';
            for await (const chunk of request) {
              content += chunk;
              if (content.length > 19 * 1024 * 1024) throw new Error('上传内容太大。');
            }
            const { method, params } = JSON.parse(content);
            if (!publicMethods.has(method)) throw new Error('未开放的操作。');
            const result = await engine.call(method, params);
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ result }));
            return;
          }
          response.statusCode = 404;
          response.end();
        } catch (error) {
          response.statusCode = 400;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ error: { message: (error as Error).message } }));
        }
      });
    },
  };
}
