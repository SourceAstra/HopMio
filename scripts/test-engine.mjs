import { spawnSync } from 'node:child_process';
import path from 'node:path';
const result = spawnSync(
  path.resolve('.venv/Scripts/python.exe'),
  ['-m', 'pytest', 'tests/engine', '-q'],
  { stdio: 'inherit', env: { ...process.env, PYTHONPATH: path.resolve('backend') } },
);
process.exit(result.status || 0);
