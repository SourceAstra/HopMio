// 预算保存使用隔离回执，不修改用户的实际模型配置或密钥。
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({
  headless: true,
  channel: process.env.YAHA_TEST_BROWSER || 'msedge',
});
const page = await browser.newPage({ viewport: { width: 1500, height: 1050 } });
try {
  const data = (
    await (
      await page.request.post('http://127.0.0.1:5173/api/rpc', { data: { method: 'bootstrap' } })
    ).json()
  ).result;
  const active = data.settings.active_model;
  const name = data.settings.models.find((item) => item.id === active).name;
  let attempts = 0;
  await page.route('**/api/rpc', async (route) => {
    const { method, params } = route.request().postDataJSON();
    if (method === 'bootstrap') return route.fulfill({ json: { result: data } });
    if (method === 'settings.update') {
      attempts++;
      assert.deepEqual(Object.keys(params.values), ['models']);
      const changed = params.values.models.find((item) => item.id === active);
      assert.equal(changed.max_tokens, 131072);
      assert.equal(changed.name, name, '单独保存预算不应保存未提交的名称改动');
      if (attempts === 1)
        return route.fulfill({ json: { error: { message: '隔离模拟保存失败，请重试。' } } });
      data.settings = { ...data.settings, models: params.values.models };
      return route.fulfill({ json: { result: data.settings } });
    }
    if (method === 'settings.unlock') throw new Error('设置不应请求口令');
    return route.continue();
  });
  const openSettings = async () =>
    page
      .getByRole('button', { name: /小屋设置|家长与设置|设置/ })
      .first()
      .click();
  await page.goto('http://127.0.0.1:5173/');
  await openSettings();
  await page.getByText(`当前编辑：${name}`, { exact: true }).waitFor();
  await page.getByLabel('上下文窗口 Token', { exact: true }).fill('1048576');
  await page.getByLabel('最大输入 Token', { exact: true }).fill('0');
  await page.getByLabel('最大输出 Token', { exact: true }).fill('131072');
  await page.getByLabel('显示名称', { exact: true }).fill('未提交的连接名称');
  const save = page.getByRole('button', { name: '保存此模型预算', exact: true });
  await save.click();
  await page.getByText('预算未保存，请查看页面提示。', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('最大输出 Token', { exact: true }).inputValue(), '131072');
  await save.click();
  await page.getByText('预算已保存，下次调用生效。', { exact: true }).waitFor();
  assert.equal(data.settings.active_model, active);
  await page.reload();
  await openSettings();
  assert.equal(await page.getByLabel('最大输出 Token', { exact: true }).inputValue(), '131072');
  assert.equal(await page.getByLabel('显示名称', { exact: true }).inputValue(), name);
  await page.getByRole('button', { name: '保存此模型预算', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: '.artifacts/verification/model-budget-save.png' });
  console.log('预算一键保存、失败重试、刷新回读通过，连接名称与密钥未随预算保存。');
} finally {
  await browser.close();
}
