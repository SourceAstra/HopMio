// 网页交接流程：拦截程序启动请求，不在回归测试中打开外部软件。
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({
  headless: true,
  ...(process.env.YAHA_TEST_BROWSER ? { channel: process.env.YAHA_TEST_BROWSER } : {}),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const requests = [];
await page.route('**/api/rpc', async (route) => {
  const { method, params } = route.request().postDataJSON();
  if (method === 'project.export') {
    assert.equal(params.format, '3mf');
    return route.fulfill({ json: { result: { id: 'isolated-3mf' } } });
  }
  if (method === 'studio.open') {
    requests.push(params);
    return route.fulfill({ json: { result: { handed_off: true, with_model: !!params.asset_id } } });
  }
  return route.continue();
});
try {
  await page.goto('http://127.0.0.1:5173/');
  await page.getByRole('button', { name: /体检制造/ }).click();
  const saved = page.getByRole('button', { name: '放弃未保存修改，使用已保存模型', exact: true });
  if (await saved.count()) await saved.click();
  const modelButton = page.getByRole('button', { name: '在 Bambu Studio 中打开模型', exact: true });
  await modelButton.waitFor();
  await expect(modelButton).toBeEnabled();
  await modelButton.click();
  await page
    .getByText('已请求 Bambu Studio 打开当前模型，请在软件中检查机型、摆放和切片。', {
      exact: true,
    })
    .waitFor();
  assert.deepEqual(requests[0], { asset_id: 'isolated-3mf' });
  await page.getByRole('button', { name: '打印准备台', exact: true }).click();
  await page.getByRole('button', { name: '打开 Bambu Studio', exact: true }).click();
  await page.getByText('已请求打开本机 Bambu Studio。', { exact: true }).waitFor();
  assert.deepEqual(requests[1], {});
  console.log('网页版直接打开 Bambu Studio 与模型交接流程通过。');
} finally {
  await browser.close();
}
