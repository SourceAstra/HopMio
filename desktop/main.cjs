const { app, BrowserWindow, dialog, ipcMain, net, protocol } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const readline = require('node:readline');

const methods = new Set([
  'studio.open',
  'conversation.get', 'conversation.save',
  'settings.models.discover', 'settings.models.test',
  'bootstrap', 'project.create', 'project.get', 'project.list', 'project.history',
  'project.restore', 'project.update', 'project.export', 'asset.upload', 'asset.list',
  'project.select_revision', 'project.delete', 'project.delete_revision', 'revision.delete',
  'asset.delete', 'materials.get', 'materials.save',
  'idea.interpret', 'idea.adjustment', 'idea.converse', 'model.generate', 'model.adjust', 'model.plan',
  'model.check', 'model.slice', 'job.get', 'job.cancel', 'job.list', 'profile.save',
  'settings.get', 'settings.unlock', 'settings.update', 'workshop.templates',
  'model.repair', 'project.import',
]);

protocol.registerSchemesAsPrivileged([
  { scheme: 'yaha', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

const packaged = app.isPackaged;
const resources = process.resourcesPath;
const appRoot = app.getAppPath();
const dataRoot = process.env.YAHA_DATA_DIR || path.join(
  process.env.LOCALAPPDATA || path.join(app.getPath('appData'), '..', 'Local'),
  'YaHaCraft', 'data',
);
app.setPath('userData', path.join(dataRoot, '..'));

let engine;
let nextId = 1;
const pending = new Map();

function startEngine() {
  const root = packaged ? resources : process.cwd();
  const python = packaged
    ? path.join(resources, 'python', 'python.exe')
    : path.join(root, '.venv', 'Scripts', 'python.exe');
  const env = {
    ...process.env,
    YAHA_DATA_DIR: dataRoot,
    YAHA_MODEL_CONFIG: path.join(root, 'config', 'models.yaml'),
    PYTHONIOENCODING: 'utf-8',
    PYTHONPATH: [path.join(root, 'backend'), packaged && path.join(resources, 'python', 'Lib', 'site-packages')]
      .filter(Boolean).join(path.delimiter),
  };
  if (packaged) {
    env.PYTHONHOME = path.join(resources, 'python');
    env.PATH = [path.join(resources, 'python'), path.join(resources, 'python', 'DLLs'), env.PATH].filter(Boolean).join(path.delimiter);
  }
  engine = spawn(python, ['-m', 'yaha'], { cwd: root, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = readline.createInterface({ input: engine.stdout });
  lines.on('line', (line) => {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    const task = pending.get(message.id);
    if (!task) return;
    pending.delete(message.id);
    message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result);
  });
  engine.stderr.on('data', (chunk) => console.error('[YaHa engine]', chunk.toString().trimEnd()));
  engine.on('error', failPending);
  engine.on('exit', (code) => failPending(new Error(`小屋引擎已退出 (${code ?? 'unknown'})`)));
}

function failPending(error) {
  for (const task of pending.values()) task.reject(error);
  pending.clear();
}

function callEngine(method, params = {}) {
  if (!methods.has(method) && method !== 'asset.path') return Promise.reject(new Error('不支持的操作。'));
  if (!engine || engine.exitCode !== null) return Promise.reject(new Error('小屋引擎尚未启动。'));
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    engine.stdin.write(`${JSON.stringify({ id, method, params })}\n`, (error) => {
      if (error && pending.delete(id)) reject(error);
    });
  });
}

async function openStudio(assetId) {
  return callEngine('studio.open', { asset_id: assetId });
}

async function saveAsset(assetId) {
  const asset = await callEngine('asset.path', { id: assetId });
  const target = await dialog.showSaveDialog({ defaultPath: path.basename(asset.path) });
  if (target.canceled || !target.filePath) return { canceled: true };
  await fs.copyFile(asset.path, target.filePath);
  return { saved: true };
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1500, height: 960, minWidth: 800, minHeight: 640,
    backgroundColor: '#fffaf0',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('yaha://app/')) event.preventDefault();
  });
  window.loadURL('yaha://app/index.html');
}

app.whenReady().then(async () => {
  await fs.mkdir(dataRoot, { recursive: true });
  protocol.handle('yaha', async (request) => {
    const url = new URL(request.url);
    if (url.hostname === 'assets') {
      try {
        const asset = await callEngine('asset.path', { id: decodeURIComponent(url.pathname.slice(1)) });
        return net.fetch(pathToFileURL(asset.path).toString());
      } catch (error) {
        return new Response(error.message, { status: 404 });
      }
    }
    const webRoot = path.resolve(appRoot, 'web');
    const file = path.resolve(webRoot, decodeURIComponent(url.pathname || '/index.html').replace(/^\/+/, ''));
    if (!file.startsWith(`${webRoot}${path.sep}`) && file !== path.join(webRoot, 'index.html')) {
      return new Response('Not found', { status: 404 });
    }
    try { return net.fetch(pathToFileURL(file).toString()); }
    catch { return new Response('Not found', { status: 404 }); }
  });
  ipcMain.handle('yaha:call', (_event, method, params) => callEngine(method, params));
  ipcMain.handle('yaha:save', (_event, id) => saveAsset(id));
  ipcMain.handle('yaha:open-studio', (_event, id) => openStudio(id));
  startEngine();
  createWindow();
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
  if (engine && engine.exitCode === null) {
    engine.stdin.end();
    const childPid = engine.pid;
    const stopTree = () => {
      if (process.platform === 'win32') {
        const killer = spawn('taskkill', ['/PID', String(childPid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        killer.unref();
      } else engine.kill('SIGTERM');
    };
    const timer = setTimeout(stopTree, 2500);
    engine.once('exit', () => clearTimeout(timer));
  }
});
