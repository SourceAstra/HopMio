import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

export async function releaseWebPort() {
  const run = promisify(execFile);
  try {
    const { stdout } = await run(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        fileURLToPath(new URL('./stop-web-port.ps1', import.meta.url)),
        '-Port',
        '5173',
      ],
      { windowsHide: true, encoding: 'utf8' },
    );
    if (stdout.trim()) console.log(stdout.trim());
  } catch (error) {
    throw new Error(`无法释放网页端口 5173：${error.stderr?.trim() || error.message}`);
  }
}
