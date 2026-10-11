import { BrowserWindow } from 'electron';
import path from 'node:path';
export function createWindow(root: string, devUrl?: string) {
  const window = new BrowserWindow({
    width: 1500,
    height: 1000,
    minWidth: 1080,
    minHeight: 720,
    title: '呀哈造物 · 乌萨奇小屋',
    backgroundColor: '#fff9ed',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(root, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(devUrl || 'file://')) event.preventDefault();
  });
  if (devUrl) window.loadURL(devUrl);
  else window.loadFile(path.join(root, '..', 'web', 'index.html'));
  return window;
}
