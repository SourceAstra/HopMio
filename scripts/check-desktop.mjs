// 实际启动独立桌面包，验证隔离桥接、资源协议和随包 Python。
import { _electron as electron, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
const app = await electron.launch({
  executablePath: path.resolve('release/win-unpacked/呀哈造物.exe'),
  env: {
    ...process.env,
    YAHA_DATA_DIR: path.resolve(process.env.YAHA_DESKTOP_CHECK_DIR || '.yaha-desktop-check'),
  },
});
try {
  const window = await app.firstWindow();
  await window.getByRole('heading', { name: '我的灵感' }).waitFor({ timeout: 60000 });
  await expect(window.getByTestId('model-viewer').locator('canvas')).toBeVisible();
  const state = await window.evaluate(async () => {
    const bootstrap = await window.yaha.call('bootstrap');
    const project = bootstrap.projects[0];
    const job = await window.yaha.call('model.generate', {
      id: project.id,
      spec: { ...project.spec, height_mm: 83, hole: true },
    });
    let result;
    for (let i = 0; i < 60; i++) {
      result = await window.yaha.call('job.get', { id: job.id });
      if (!['queued', 'running'].includes(result.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (result.status !== 'succeeded') throw new Error('随包引擎生成失败：' + result.message);
    const checked = await window.yaha.call('model.check', {
      id: project.id,
      profile: bootstrap.profile,
    });
    if (!checked.validation.can_prepare) throw new Error('随包网格体检失败');
    const file = await window.yaha.call('project.export', { id: project.id, format: '3mf' });
    const exportResponse = await fetch('yaha://assets/' + file.id);
    const bytes = new Uint8Array(await exportResponse.arrayBuffer());
    if (bytes[0] !== 80 || bytes[1] !== 75) throw new Error('随包3MF导出失败');
    await window.yaha.call('project.restore', { id: project.id, revision_id: project.revision_id });
    const response = await fetch('yaha://assets/' + project.model.glb_id);
    return {
      desktop: window.yaha.desktop,
      node: typeof window.require,
      asset: response.status,
      size: (await response.arrayBuffer()).byteLength,
      projects: bootstrap.projects.length,
      generated: true,
      checked: true,
      exported: true,
      restored: true,
    };
  });
  if (!state.desktop || state.node !== 'undefined' || state.asset !== 200 || state.size < 1000)
    throw new Error(JSON.stringify(state));
  await fs.mkdir('验收截图', { recursive: true });
  await window.reload();
  await window.getByRole('heading', { name: '我的灵感' }).waitFor();
  await window.waitForTimeout(800);
  await window.setViewportSize({ width: 1560, height: 1050 });
  const illustrations = await window
    .locator('img.usagi-character')
    .evaluateAll((images) =>
      images.every(
        (image) =>
          image.complete &&
          image.naturalWidth > 0 &&
          image.src.includes('/art/usagi/companion.png'),
      ),
    );
  if (!illustrations) throw new Error('乌萨奇角色素材没有正确显示');
  await window.screenshot({ path: '验收截图/呀哈造物-桌面实测.png', fullPage: true });
  await window.getByRole('button', { name: '小屋门厅', exact: true }).click();
  await expect(window.getByRole('heading', { name: '呀哈，欢迎来到小屋！' })).toBeVisible();
  await expect(window.locator('main img.cottage-art')).toBeVisible();
  await expect(window.locator('main img.cottage-art')).toHaveJSProperty('complete', true);
  await window.screenshot({ path: '验收截图/呀哈造物-乌萨奇小屋.png', fullPage: true });
  await window.getByRole('button', { name: '乌萨奇展厅', exact: true }).click();
  await expect(window.getByRole('heading', { name: '乌萨奇展厅', exact: true })).toBeVisible();
  await expect(window.locator('.gallery-banner img.usagi-character')).toBeVisible();
  await window.screenshot({ path: '验收截图/呀哈造物-乌萨奇展厅.png', fullPage: true });
  console.log('独立桌面包验证通过', state);
} finally {
  await app.close();
}
