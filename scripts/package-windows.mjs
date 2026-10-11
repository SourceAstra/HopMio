// 发布流程单独维护；双击入口和命令行入口共用同一套打包步骤。
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preparePackageEnvironment } from './package-environment.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const directoryOnly = process.argv.includes('--dir');
let packageEnvironment;
const steps = [
  ['准备乌萨奇应用图标', ['scripts/build-icons.mjs']],
  ['检查代码', ['node_modules/typescript/bin/tsc', '--noEmit']],
  ['构建网页', ['node_modules/vite/bin/vite.js', 'build']],
  ['构建桌面程序', ['scripts/build-desktop.mjs']],
  ['准备独立 Python 引擎', ['scripts/prepare-runtime.mjs']],
  [
    '生成 Windows 程序',
    ['node_modules/electron-builder/cli.js', '--win', directoryOnly ? '--dir' : 'portable'],
  ],
];

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: root, env: packageEnvironment, stdio: 'inherit', windowsHide: true });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`步骤失败（退出码 ${code ?? signal}），已停止后续打包。`));
    });
  });
}

try {
  if (process.platform !== 'win32') throw new Error('请在 Windows 电脑上运行此打包入口。');
  await fs.access(path.join(root, '.venv/Scripts/python.exe'));
  await fs.access(path.join(root, 'node_modules/electron/dist/electron.exe'));
  console.log('呀哈造物 · 一键 Windows 打包');
  packageEnvironment = await preparePackageEnvironment(root);
  for (const [index, [label, args]] of steps.entries()) {
    console.log(`\n[${index + 1}/${steps.length}] ${label}`);
    await run(args);
  }
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const result = directoryOnly
    ? path.join(root, '.artifacts/windows/win-unpacked', `${pkg.build.productName}.exe`)
    : path.join(root, 'release', `YaHa-Craft-${pkg.version}-Windows.exe`);
  if (!directoryOnly) {
    const generated = path.join(root, '.artifacts/windows', path.basename(result));
    await fs.mkdir(path.dirname(result), { recursive: true });
    await fs.copyFile(generated, result);
  }
  await fs.access(result);
  console.log(`\n打包完成：${result}`);
} catch (error) {
  console.error('\n打包失败：', error.message);
  console.error('请检查开发依赖，安装方式见 README.md。');
  process.exitCode = 1;
}
