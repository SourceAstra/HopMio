// 为打包器及其依赖收集进程提供同一个经过检查的 pnpm 环境。
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';

const execute = promisify(execFile);
const listArgs = ['list', '--prod', '--json', '--depth', 'Infinity', '--silent', '--loglevel=error'];

export async function preparePackageEnvironment(root, source = process.env) {
  const pathKey = Object.keys(source).find(key => key.toLowerCase() === 'path') || 'Path';
  const originalPath = source[pathKey] || '';
  const directories = [...new Set([
    ...originalPath.split(path.delimiter), source.PNPM_HOME,
    source.APPDATA && path.join(source.APPDATA, 'npm'),
    source.LOCALAPPDATA && path.join(source.LOCALAPPDATA, 'pnpm'),
    source.USERPROFILE && path.join(source.USERPROFILE,
      '.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback'),
  ].filter(Boolean).map(value => value.replace(/^"|"$/g, '')))];
  const failures = [];
  for (const directory of directories) {
    for (const name of ['pnpm.exe', 'pnpm.cmd']) {
      const command = path.resolve(directory, name);
      try { await fs.access(command); } catch { continue; }
      const env = { ...source, [pathKey]: [directory, path.dirname(process.execPath), originalPath].join(path.delimiter) };
      const quote = value => `'${value.replaceAll("'", "''")}'`;
      const script = `[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); & ${quote(command)} ${listArgs.map(quote).join(' ')}; exit $LASTEXITCODE`;
      try {
        const { stdout } = await execute('powershell.exe', [
          '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64'),
        ], { cwd: root, env, windowsHide: true, timeout: 30000, maxBuffer: 16 * 1024 * 1024 });
        const tree = JSON.parse(stdout.replace(/^\uFEFF/, '').trim());
        const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
        const project = Array.isArray(tree) && tree.find(item => item.name === pkg.name);
        if (!project || Object.keys(pkg.dependencies || {}).some(name => !project.dependencies?.[name])) {
          throw new Error('生产依赖信息不完整');
        }
        console.log(`打包依赖检查通过：${command}`);
        return env;
      } catch {
        failures.push(`${command}：未能返回完整的依赖 JSON`);
      }
    }
  }
  throw new Error(`没有找到可用于打包的 pnpm。请安装 pnpm 并执行 pnpm install --frozen-lockfile。${failures.length ? '\n' + failures.join('\n') : ''}`);
}
