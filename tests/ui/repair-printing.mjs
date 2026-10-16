// 修复任务会转换内部输入参数；不得将这个转换误当成用户未保存修改。
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
  const original = structuredClone(data.projects.find((p) => p.model));
  original.validation = null;
  data.projects = [original];
  data.jobs = [];
  const convertedSpec = {
    ...original.spec,
    mode: 'import',
    provider: 'local',
    modeling_plan: null,
    asset_ids: ['isolated-repair-source'],
  };
  let current = original,
    checked = 0;
  const task = {
    id: 'isolated-repair',
    kind: 'repair',
    project_id: original.id,
    base_revision_id: original.revision_id,
    spec: convertedSpec,
    status: 'queued',
    created_at: new Date().toISOString(),
  };
  await page.route('**/api/rpc', async (route) => {
    const { method, params = {} } = route.request().postDataJSON();
    const result = (value) => route.fulfill({ json: { result: value } });
    if (method === 'bootstrap') return result(data);
    if (method === 'model.repair') return result(task);
    if (method === 'job.get') {
      current = {
        ...original,
        spec: convertedSpec,
        revision_id: 'repaired-revision',
        revision_count: original.revision_count + 1,
        validation: null,
        slicing: null,
      };
      return result({
        ...task,
        status: 'succeeded',
        progress: 100,
        result: { project: current },
        message: '修复已完成',
      });
    }
    if (method === 'project.list') return result([current]);
    if (method === 'model.check') {
      checked++;
      assert.equal(params.id, current.id);
      current = {
        ...current,
        validation: {
          revision_id: current.revision_id,
          profile: Object.fromEntries(Object.entries(params.profile).reverse()),
          profile_hash: 'mock-profile',
          can_prepare: true,
          items: [{ name: '封闭与朝向', status: 'pass', detail: '网格封闭，体积为正。' }],
        },
      };
      return result(current);
    }
    return route.continue();
  });
  await page.goto('http://127.0.0.1:5173/');
  await page.getByRole('button', { name: /体检制造/ }).click();
  const check = page.getByRole('button', { name: '开始体检', exact: true });
  await check.waitFor();
  assert(await check.isEnabled());
  assert(await page.getByRole('button', { name: '去打印准备台 →', exact: true }).isDisabled());
  await page.getByRole('button', { name: '尝试修正法线与补小孔', exact: true }).click();
  await page.getByText('修复已完成', { exact: true }).waitFor();
  assert(await check.isEnabled(), '内部修复参数转换不能锁死体检');
  assert(
    await page.getByRole('button', { name: '在 Bambu Studio 中打开模型', exact: true }).isEnabled(),
  );
  assert.equal(
    await page.getByRole('button', { name: '放弃未保存修改，使用已保存模型', exact: true }).count(),
    0,
  );
  await check.click();
  await page.getByText('基础体检完成 ✓', { exact: true }).waitFor();
  assert(await page.getByRole('button', { name: '去打印准备台 →', exact: true }).isEnabled());
  assert.equal(checked, 1);
  await page.screenshot({ path: '.artifacts/verification/repair-printing.png' });
  console.log('修复后可体检和交接，体检通过后进入打印准备；字段顺序不造成误锁。');
} finally {
  await browser.close();
}
