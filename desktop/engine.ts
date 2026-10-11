import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import path from 'node:path';
import fs from 'node:fs';

export class Engine {
  private process: ChildProcessWithoutNullStreams;
  private pending = new Map<
    number,
    {
      resolve: (v: unknown) => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private sequence = 0;
  constructor(root: string, data: string, packaged = false) {
    const python = packaged
      ? path.join(root, 'python', 'python.exe')
      : process.env.YAHA_PYTHON || path.join(root, '.venv', 'Scripts', 'python.exe');
    if (!fs.existsSync(python)) throw new Error('找不到 Python 引擎，请先按 README 安装依赖。');
    this.process = spawn(python, ['-u', '-m', 'yaha'], {
      cwd: root,
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONPATH: path.join(root, 'backend'),
        YAHA_DATA_DIR: data,
        PYTHONIOENCODING: 'utf-8',
        ...(packaged ? { PYTHONHOME: path.join(root, 'python') } : {}),
      },
    });
    createInterface({ input: this.process.stdout }).on('line', (line) => {
      try {
        const answer = JSON.parse(line);
        const waiter = this.pending.get(answer.id);
        if (!waiter) return;
        clearTimeout(waiter.timer);
        this.pending.delete(answer.id);
        if (answer.error) waiter.reject(new Error(answer.error.message));
        else waiter.resolve(answer.result);
      } catch {
        /* Protocol ignores incomplete non-JSON diagnostics. */
      }
    });
    this.process.stderr.on('data', (data) => console.error('[engine]', data.toString()));
    this.process.on('exit', () => this.fail('造物引擎已关闭，请重新打开小屋。'));
    this.process.on('error', () => this.fail('造物引擎启动失败。'));
  }
  private fail(message: string) {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error(message));
    }
    this.pending.clear();
  }
  call(method: string, params: unknown = {}): Promise<unknown> {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('引擎响应超时，请查看任务记录。'));
      }, 120000);
      this.pending.set(id, { resolve, reject, timer });
      this.process.stdin.write(JSON.stringify({ id, method, params }) + '\n');
    });
  }
  close() {
    this.process.kill();
    this.fail('小屋已关闭。');
  }
}
