import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '.artifacts', 'desktop');
await mkdir(output, { recursive: true });
for (const file of ['main.cjs', 'preload.cjs']) {
  await cp(path.join(root, 'desktop', file), path.join(output, file));
}
