import { cp, mkdir, readFile, writeFile, rm, access, realpath } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { windowsConfig } from './packaging/windows-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(root, '.artifacts');
const staging = path.join(artifacts, 'package-windows');
const python = path.join(root, '.venv/Scripts/python.exe');
const portable = process.argv.includes('--portable');
const target = portable ? 'portable' : 'nsis';
if (process.argv.slice(2).some((value) => value !== '--portable'))
  throw new Error('仅支持 --portable（便携版）；默认生成安装程序。');
if (process.platform !== 'win32' || process.arch !== 'x64')
  throw new Error('请在 Windows x64 上运行此发布脚本。');
const packageInfo = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const run = (file, args, env = process.env) => {
  const result = spawnSync(file, args, { cwd: root, stdio: 'inherit', windowsHide: true, env });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`步骤失败：${path.basename(file)}（退出码 ${result.status}）`);
};
const local = (file, args = []) =>
  run(process.execPath, [path.join(root, 'node_modules', file), ...args]);
for (const required of [
  python,
  path.join(root, 'node_modules/electron/dist/electron.exe'),
  path.join(root, 'node_modules/electron-builder/cli.js'),
  path.join(root, 'public/art/usagi/app-icon.ico'),
]) {
  try {
    await access(required);
  } catch {
    throw new Error(`缺少发布依赖：${path.relative(root, required)}。请先按 README 安装开发依赖。`);
  }
}
// 只清理已核对的本次打包目录，网页服务、作品、旧发行包均在其他目录。
await mkdir(artifacts, { recursive: true });
const artifactsReal = await realpath(artifacts);
const workspaceReal = await realpath(root);
const artifactRelative = path.relative(workspaceReal, artifactsReal);
if (
  path.isAbsolute(artifactRelative) ||
  artifactRelative.startsWith('..' + path.sep) ||
  artifactRelative === '..'
)
  throw new Error('构建目录不在当前工作区中，已停止。');
let stagingReal;
try {
  stagingReal = await realpath(staging);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
if (
  stagingReal &&
  (path.dirname(stagingReal) !== artifactsReal || path.basename(stagingReal) !== 'package-windows')
)
  throw new Error('打包目录指向工作区之外，已停止清理。');
await rm(staging, { recursive: true, force: true });
await mkdir(path.join(staging, 'app/desktop'), { recursive: true });
await mkdir(path.join(staging, 'tools'), { recursive: true });
console.log('[1/6] 检查 TypeScript');
local('typescript/bin/tsc', ['--noEmit']);
console.log('[2/6] 组装独立 Python 与引擎依赖');
run(python, [path.join(root, 'scripts/prepare-runtime.py'), path.join(staging, 'python')]);
const runtimeEnv = {
  ...process.env,
  PYTHONHOME: path.join(staging, 'python'),
  PYTHONPATH: path.join(root, 'backend'),
  PYTHONIOENCODING: 'utf-8',
};
run(
  path.join(staging, 'python/python.exe'),
  [
    '-c',
    'import yaha.service, pycolmap, numpy, scipy, PIL, httpx, keyring; print("Python runtime imports OK")',
  ],
  runtimeEnv,
);
console.log('[3/6] 构建安装包网页');
local('vite/bin/vite.js', ['build', '--outDir', path.join(staging, 'app/web')]);
console.log('[4/6] 组装桌面入口与工具安装入口');
for (const name of ['main.cjs', 'preload.cjs'])
  await cp(path.join(root, 'desktop', name), path.join(staging, 'app/desktop', name));
await writeFile(
  path.join(staging, 'app/package.json'),
  JSON.stringify(
    {
      name: packageInfo.name,
      version: packageInfo.version,
      description: packageInfo.description,
      author: packageInfo.author,
      main: 'desktop/main.cjs',
      private: true,
    },
    null,
    2,
  ),
);
for (const name of [
  'install-modeling.py',
  'install-blender.py',
  'install-reconstruction.py',
  'install-slicer.py',
  'runtime_install.py',
])
  await cp(path.join(root, 'scripts', name), path.join(staging, 'tools', name));
await cp(path.join(root, '安装建模工具.cmd'), path.join(staging, 'tools/安装建模工具.cmd'));
const config = windowsConfig(root, staging, packageInfo);
config.electronVersion = JSON.parse(
  await readFile(path.join(root, 'node_modules/electron/package.json'), 'utf8'),
).version;
const configPath = path.join(staging, 'electron-builder.json');
await writeFile(configPath, JSON.stringify(config, null, 2));
console.log(`[5/6] 生成 Windows x64 ${portable ? '便携程序' : '安装程序'}`);
local('electron-builder/cli.js', [
  '--config',
  configPath,
  '--win',
  target,
  '--x64',
  '--publish',
  'never',
]);
console.log('[6/6] 输出安装包与 SHA256');
const exe = portable
  ? `YaHa-Craft-${packageInfo.version}-Windows.exe`
  : `YaHa-Craft-Setup-${packageInfo.version}-x64.exe`;
const source = path.join(staging, 'output', exe);
await access(source);
const release = path.join(root, 'release');
await mkdir(release, { recursive: true });
const destination = path.join(release, exe);
await cp(source, destination);
const hash = createHash('sha256');
for await (const chunk of createReadStream(destination)) hash.update(chunk);
await writeFile(destination + '.sha256', `${hash.digest('hex')}  ${exe}\n`);
console.log(`发布文件：${destination}`);
