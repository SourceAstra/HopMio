// 网页开发入口：Vite 提供页面热更新，开发插件连接本地 Python 引擎。
import { createServer } from 'vite';
import path from 'node:path';
import { releaseWebPort } from './release-web-port.mjs';

let server;
try {
  await releaseWebPort();
  server = await createServer({ server: { open: process.argv.includes('--open') ? '/' : false } });
  await server.listen();
  console.log('\n呀哈造物 · 乌萨奇网页工作台');
  server.printUrls();
  console.log(`作品目录：${path.resolve(process.env.YAHA_DATA_DIR || '.yaha')}`);
  console.log('修改页面、样式和角色素材后自动更新。修改 Python 引擎后请重启此服务。');
  console.log('关闭此窗口或按 Ctrl+C 停止网页服务。\n');
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, async () => {
      await server.close();
      process.exit(0);
    });
  }
} catch (error) {
  await server?.close();
  console.error('网页工作台启动失败：', error.message);
  console.error('请检查开发依赖和占用端口的进程权限，再重新启动。');
  process.exitCode = 1;
}
