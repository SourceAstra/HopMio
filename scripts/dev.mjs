import { spawn } from 'node:child_process';
import { createServer } from 'vite';
import electron from 'electron';
await import('./build-desktop.mjs');
const server = await createServer();
await server.listen();
const child = spawn(electron, ['.'], {
  stdio: 'inherit',
  windowsHide: true,
  env: { ...process.env, YAHA_DEV_URL: 'http://127.0.0.1:5173' },
});
child.on('exit', async () => {
  await server.close();
  process.exit(0);
});
child.on('error', async (error) => {
  console.error(error);
  await server.close();
  process.exit(1);
});
