// 在真实网页中模拟模型服务，不使用真实密钥，不更改家长口令与作品。
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const browser = await chromium.launch({
  headless: true,
  ...(process.env.YAHA_TEST_BROWSER ? { channel: process.env.YAHA_TEST_BROWSER } : {}),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
let saved;
let tests = 0;
// 保存接口完全隔离，借助现有只读设置生成回执。
await page.route('**/api/rpc', async (route) => {
  const { method, params } = route.request().postDataJSON();
  if (method === 'settings.unlock')
    return route.fulfill({ json: { result: { token: 'ui-isolated-token' } } });
  if (method === 'settings.models.discover')
    return route.fulfill({
      json: {
        result: {
          url: 'https://mock.invalid/v1',
          models: [
            { id: 'demo-chat', name: '演示文字模型' },
            { id: 'demo-vision', name: '演示图片模型' },
          ],
          message: '请测试后使用。',
          has_more: false,
        },
      },
    });
  if (method === 'settings.models.test') {
    assert.equal(params.api_key, 'test-placeholder-key');
    tests++;
    if (params.kind === 'image')
      return route.fulfill({
        json: {
          result: {
            available: true,
            supports_images: true,
            latency_ms: 234,
            message: '随机图识别通过',
          },
        },
      });
    return route.fulfill({
      json:
        tests === 1
          ? { result: { available: true, latency_ms: 123, message: '文本调用成功' } }
          : { error: { message: '当前密钥套餐不包含该模型（HTTP 403）。' } },
    });
  }
  if (method === 'settings.update') {
    saved = params.values;
    const current = await page.request.post('http://127.0.0.1:5173/api/rpc', {
      data: { method: 'settings.get', params: {} },
    });
    const { result } = await current.json();
    return route.fulfill({
      json: {
        result: {
          ...result,
          ...saved,
          model_keys: undefined,
          models: saved.models.map((item) => ({
            ...item,
            has_key: !!saved.model_keys[item.id] || item.has_key,
          })),
        },
      },
    });
  }
  return route.continue();
});
try {
  await page.goto('http://127.0.0.1:5173/');
  await page
    .getByRole('button', { name: /小屋设置|家长与设置|设置/ })
    .first()
    .click();
  assert.equal(await page.getByLabel('家长口令', { exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: '发现可用模型', exact: true }).count(), 0);
  await page.getByLabel('最长等待时间（秒）', { exact: true }).fill('777');
  await page.getByRole('tab', { name: /发现模型/ }).click();
  await page
    .getByLabel('发现模型服务地址', { exact: true })
    .fill('https://mock.invalid/v1/chat/completions');
  await page.getByLabel('发现服务 API Key', { exact: true }).fill('test-placeholder-key');
  await page.getByRole('tab', { name: /模型配置/ }).click();
  assert.equal(await page.getByLabel('最长等待时间（秒）', { exact: true }).inputValue(), '777');
  await page.getByRole('tab', { name: /发现模型/ }).click();
  assert.equal(
    await page.getByLabel('发现服务 API Key', { exact: true }).inputValue(),
    'test-placeholder-key',
  );
  await page.getByRole('button', { name: '发现可用模型', exact: true }).click();
  await page.getByLabel('演示文字模型').check();
  await page.getByLabel('演示图片模型').check();
  await page.getByRole('tab', { name: /模型配置/ }).click();
  await page.getByRole('tab', { name: /发现模型/ }).click();
  assert(await page.getByLabel('演示文字模型').isChecked());
  await page.screenshot({ path: '.artifacts/verification/model-discovery-tab.png' });
  await page.getByRole('button', { name: '加入候选列表（2）', exact: true }).click();
  const candidate = page.locator('.model-candidate').filter({ hasText: '演示文字模型' });
  await candidate.getByRole('button', { name: /编辑/ }).click();
  await page.getByLabel('最大输出 Token', { exact: true }).fill('262144');
  await page.getByLabel('上下文窗口 Token', { exact: true }).fill('1048576');
  await page.getByLabel('最大输入 Token', { exact: true }).fill('700000');
  await page.getByLabel('最长等待时间（秒）', { exact: true }).fill('900');
  await page.getByLabel('思考强度', { exact: true }).selectOption('low');

  await candidate.getByRole('button', { name: '测试文字能力', exact: true }).click();
  await candidate.getByText(/文字测试通过 · 123 ms/).waitFor();
  const other = page.locator('.model-candidate').filter({ hasText: '演示图片模型' });
  await other.getByRole('button', { name: '测试文字能力', exact: true }).click();
  await other.getByText(/HTTP 403/).waitFor();
  await candidate.getByRole('button', { name: '测试图片能力', exact: true }).click();
  await candidate.getByText(/图片测试通过 · 234 ms/).waitFor();
  await candidate.getByText('图片已启用', { exact: true }).waitFor();
  await candidate.getByRole('button', { name: '选用', exact: true }).click();
  await page.getByRole('button', { name: '保存模型配置', exact: true }).click();
  await page.getByText('模型候选列表与密钥已保存。', { exact: true }).waitFor();
  assert.equal(saved.models.filter((item) => item.model.startsWith('demo-')).length, 2);
  assert.equal(saved.model_keys[saved.active_model], 'test-placeholder-key');
  assert.equal(saved.models.find((item) => item.id === saved.active_model).supports_images, true);
  assert.equal(saved.models.find((item) => item.id === saved.active_model).max_tokens, 262144);
  assert.equal(
    saved.models.find((item) => item.id === saved.active_model).context_window_tokens,
    1048576,
  );
  assert.equal(
    saved.models.find((item) => item.id === saved.active_model).max_input_tokens,
    700000,
  );
  assert.equal(saved.models.find((item) => item.id === saved.active_model).timeout_seconds, 900);
  await candidate.getByRole('button', { name: /编辑/ }).click();
  assert.equal(await page.getByLabel('最大输出 Token', { exact: true }).inputValue(), '262144');
  await fs.mkdir('.artifacts/verification', { recursive: true });
  await page.locator('main').evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.locator('.model-candidates').evaluate((element) => {
    element.scrollTop = 0;
  });
  const closeNotice = page.getByRole('button', { name: '关闭提示', exact: true });
  if (await closeNotice.isVisible()) await closeNotice.click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: '.artifacts/verification/model-settings.png', fullPage: true });
  await page.getByRole('tab', { name: /模型配置/ }).focus();
  await page.keyboard.press('End');
  assert.equal(
    await page.getByRole('tab', { name: /发现模型/ }).getAttribute('aria-selected'),
    'true',
  );
  await page.keyboard.press('Home');
  assert.equal(
    await page.getByRole('tab', { name: /模型配置/ }).getAttribute('aria-selected'),
    'true',
  );
  console.log('模型发现、多选添加、成功/失败测试和隔离保存已通过。');
} finally {
  await browser.close();
}
