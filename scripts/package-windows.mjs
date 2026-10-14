import { cp, mkdir, readdir, rm, access } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(root, '.artifacts');
const python = path.join(root, '.venv', 'Scripts', 'python.exe');
const local = (file, args = []) => {
  const result = spawnSync(process.execPath, [path.join(root, 'node_modules', file), ...args], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`命令失败：${file}`);
};
const run = (file, args = []) => {
  const result = spawnSync(file, args, { cwd: root, stdio: 'inherit', windowsHide: true });
  if (result.status !== 0) throw new Error(`命令失败：${file}`);
};

if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('请在 Windows x64 上运行此发布脚本。');
for (const required of [python, path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe'), path.join(root, 'public', 'art', 'usagi', 'app-icon.ico')]) {
  try { await access(required); } catch { throw new Error(`缺少发布依赖：${path.relative(root, required)}`); }
}
for (const directory of ['python', 'web', 'desktop', 'windows']) {
  await rm(path.join(artifacts, directory), { recursive: true, force: true });
  await mkdir(path.join(artifacts, directory), { recursive: true });
}
run(python, [path.join(root, 'scripts', 'prepare-runtime.py'), path.join(artifacts, 'python')]);
local(path.join('vite', 'bin', 'vite.js'), ['build', '--outDir', path.join(artifacts, 'web')]);
local(path.join('typescript', 'bin', 'tsc'), ['--noEmit']);
run(process.execPath, [path.join(root, 'scripts', 'build-desktop.mjs')]);
local(path.join('electron-builder', 'cli.js'), ['--win', 'portable', '--x64']);

const output = path.join(artifacts, 'windows');
const exe = (await readdir(output)).find((name) => name.endsWith('.exe'));
if (!exe) throw new Error('electron-builder 未生成 Windows EXE。');
const release = path.join(root, 'release');
await mkdir(release, { recursive: true });
await cp(path.join(output, exe), path.join(release, exe));
console.log(`Windows 发布包：${path.join('release', exe)}`);
