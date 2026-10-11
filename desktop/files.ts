import { dialog, shell } from 'electron';
import { copyFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import type { Engine } from './engine';

export async function saveAsset(engine: Engine, id: string) {
  const asset = (await engine.call('asset.path', { id })) as { path: string };
  const chosen = await dialog.showSaveDialog({
    defaultPath: '呀哈作品' + path.extname(asset.path),
  });
  if (chosen.canceled || !chosen.filePath) return { canceled: true };
  await copyFile(asset.path, chosen.filePath);
  return { saved: true };
}
export async function openStudio(engine: Engine, id: string) {
  const asset = (await engine.call('asset.path', { id })) as { path: string };
  if (!['.stl', '.3mf'].includes(path.extname(asset.path)))
    throw new Error('请导出 STL 或 3MF 再交给 Bambu Studio。');
  let exe = [
    path.join(process.env.ProgramFiles || '', 'Bambu Studio', 'bambu-studio.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Bambu Studio', 'bambu-studio.exe'),
  ].find((p) => fs.existsSync(p));
  if (!exe) {
    const choice = await dialog.showOpenDialog({
      title: '选择 Bambu Studio 程序',
      filters: [{ name: 'Bambu Studio', extensions: ['exe'] }],
      properties: ['openFile'],
    });
    if (choice.canceled) return { canceled: true };
    exe = choice.filePaths[0];
  }
  if (path.basename(exe).toLowerCase() !== 'bambu-studio.exe')
    throw new Error('请选择 bambu-studio.exe。');
  const child = spawn(exe, [asset.path], { detached: true, stdio: 'ignore', windowsHide: true });
  await new Promise<void>((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', reject);
  });
  child.unref();
  return { handed_off: true };
}
