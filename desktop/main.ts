import { app, ipcMain, protocol, net, dialog } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Engine } from './engine';
import { createWindow } from './window';
import { saveAsset, openStudio } from './files';
import { publicMethods } from '../shared/methods';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'yaha',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);
let engine: Engine;
app
  .whenReady()
  .then(() => {
    const root = app.isPackaged ? process.resourcesPath : process.cwd();
    engine = new Engine(
      root,
      process.env.YAHA_DATA_DIR || path.join(app.getPath('userData'), '小屋作品'),
      app.isPackaged,
    );
    protocol.handle('yaha', async (request) => {
      const url = new URL(request.url);
      if (url.hostname !== 'assets') return new Response('', { status: 404 });
      try {
        const asset = (await engine.call('asset.path', { id: url.pathname.slice(1) })) as {
          path: string;
        };
        return net.fetch(pathToFileURL(asset.path).toString());
      } catch {
        return new Response('', { status: 404 });
      }
    });
    ipcMain.handle('yaha:call', (_event, method, params) => {
      if (!publicMethods.has(method)) throw new Error('操作未开放。');
      return engine.call(method, params);
    });
    ipcMain.handle('yaha:save', (_event, id) => saveAsset(engine, id));
    ipcMain.handle('yaha:studio', (_event, id) => openStudio(engine, id));
    createWindow(__dirname, process.env.YAHA_DEV_URL);
    app.on('activate', () => createWindow(__dirname, process.env.YAHA_DEV_URL));
  })
  .catch((error) => {
    dialog.showErrorBox('小屋启动失败', error.message);
    app.quit();
  });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => engine?.close());
