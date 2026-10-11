// 把当前虚拟环境转换成独立 Python 运行时，发布包不依赖开发机路径。
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const venv = path.resolve('.venv');
const result = spawnSync(
  path.join(venv, 'Scripts/python.exe'),
  ['-c', 'import sys; print(sys.base_prefix)'],
  { encoding: 'utf8' },
);
if (result.status !== 0) throw new Error('请先创建 .venv 并安装 Python 依赖。');
const base = result.stdout.trim();
const target = path.resolve('.artifacts/python');
await fs.mkdir(target, { recursive: true });
for (const entry of await fs.readdir(base, { withFileTypes: true })) {
  if (entry.isFile() && /\.(exe|dll|zip)$/i.test(entry.name))
    await fs.copyFile(path.join(base, entry.name), path.join(target, entry.name));
}
await fs.cp(path.join(base, 'DLLs'), path.join(target, 'DLLs'), { recursive: true });
await fs.cp(path.join(base, 'Lib'), path.join(target, 'Lib'), {
  recursive: true,
  filter: (p) =>
    !p
      .split(path.sep)
      .some((part) =>
        [
          'site-packages',
          '__pycache__',
          'test',
          'tests',
          'idlelib',
          'tkinter',
          'ensurepip',
        ].includes(part),
      ),
});
await fs.cp(path.join(venv, 'Lib/site-packages'), path.join(target, 'Lib/site-packages'), {
  recursive: true,
  filter: (p) =>
    !p.split(path.sep).some((part) => ['__pycache__', 'pip', 'pytest', '_pytest'].includes(part)),
});
console.log('独立 Python 运行时已准备：', target);
