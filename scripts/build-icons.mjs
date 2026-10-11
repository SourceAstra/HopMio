// 仅转换格式和输出尺寸，角色设计保留 app-icon.png 原图。
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const result = spawnSync(
  path.join(root, '.venv/Scripts/python.exe'),
  [
    '-c',
    `
from PIL import Image
from pathlib import Path
source = Path('public/art/usagi/app-icon.png')
image = Image.open(source).convert('RGBA')
if image.width != image.height:
    raise ValueError('应用图标必须为正方形')
image.save(source.with_suffix('.ico'), format='ICO', sizes=[(n, n) for n in (16, 24, 32, 48, 64, 128, 256)])
print('乌萨奇应用图标已准备：16–256 像素 Windows ICO')
`,
  ],
  {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  },
);
if (result.error) throw result.error;
if (result.status !== 0) throw new Error('图标转换失败，请检查 Python 与 Pillow 依赖。');
