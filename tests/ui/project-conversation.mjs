// 云端和会话写入均拦截；不修改真实作品，不消耗模型额度。
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { editableProject } from './fixtures.mjs';
const browser = await chromium.launch({
  headless: true,
  channel: process.env.YAHA_TEST_BROWSER || 'msedge',
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1050 } });
const bootstrap = (
  await (
    await page.request.post('http://127.0.0.1:5173/api/rpc', { data: { method: 'bootstrap' } })
  ).json()
).result;
const project = editableProject(bootstrap);
assert(project, '需要一个可编辑参数模型作为只读样本');
bootstrap.projects = [project];
bootstrap.jobs = [];
Object.assign(bootstrap.settings, {
  cloud_enabled: true,
  chat_configured: true,
  chat_supports_images: false,
});
const target = project.spec.modeling_plan.steps[0].id;
const proposal = {
  summary: '在侧面添加Usagi',
  instruction: '盒子侧面镂空文字Usagi，保持其他部分不变',
  changes: ['镂空Usagi'],
  revision: project.revision_id,
  specSnapshot: JSON.stringify(Object.fromEntries(Object.entries(project.spec).reverse())),
  selectionSnapshot: JSON.stringify({ selectedPartId: target, selectedPointMm: [25, 0, 25] }),
  targetPartId: target,
};
let store = {
  version: 1,
  messages: [
    {
      id: 'seed-user',
      sender: 'user',
      type: 'text',
      content: '添加镂空文字Usagi',
      timestamp: Date.now(),
    },
    { id: 'seed-proposal', sender: 'assistant', type: 'proposal', proposal, timestamp: Date.now() },
  ],
};
const ideas = [],
  adjustments = [];
await page.route('**/api/rpc', async (route) => {
  const { method, params = {} } = route.request().postDataJSON();
  const result = async (value) => route.fulfill({ json: { result: value } });
  if (method === 'bootstrap') return result(bootstrap);
  if (method === 'conversation.get') return result(store);
  if (method === 'conversation.save') {
    assert.equal(params.expected_version, store.version);
    store = { version: store.version + 1, messages: params.messages };
    return result({ version: store.version });
  }
  if (method === 'idea.converse') {
    ideas.push(params);
    if (params.text === '你建议什么材料')
      return result({ action: 'ask', summary: '可以先用PLA，请和家长一起确认打印配置。' });
    if (params.text === '重新设计成钥匙扣')
      return result({
        action: 'create',
        summary: '重新做成钥匙扣',
        design: {
          ...project.spec,
          prompt: 'Usagi名字钥匙扣',
          template: 'plaque',
          modeling_plan: null,
          reconstruction_plan: null,
          height_mm: 45,
          hole: true,
        },
      });
    return result({
      action: 'adjust',
      scope: 'selected',
      summary: ideas.length === 1 ? 'Usagi文字移到正中间' : 'Usagi居中并放大字体',
      instruction:
        ideas.length === 1
          ? '侧面正中心镂空Usagi，其他保持不变'
          : '侧面正中心镂空Usagi并放大字体，其他保持不变',
      changes: ['保留镂空Usagi', '正中心'],
    });
  }
  if (method === 'model.adjust') {
    adjustments.push(params);
    return result({
      id: 'mock-' + adjustments.length,
      project_id: project.id,
      kind: 'adjust',
      base_revision_id: project.revision_id,
      status: 'failed',
      progress: 88,
      message: '成品审阅 HTTP 429',
      error_code: 'AI_ADJUSTMENT_REVIEW_UNAVAILABLE',
      spec: project.spec,
      created_at: new Date().toISOString(),
    });
  }
  if (method === 'job.list') return result([]);
  return route.continue();
});
try {
  await page.goto('http://127.0.0.1:5173/');
  await page.getByRole('button', { name: /造物桌面/ }).click();
  const input = page.getByRole('textbox', { name: '造物对话', exact: true });
  assert.equal(await page.locator('.dock-mode-selector').count(), 0);
  await input.fill('这一面位置正中间');
  await input.press('Enter');
  await page.getByText('Usagi文字移到正中间', { exact: true }).waitFor();
  assert.equal(ideas[0].project_id, project.id);
  assert.match(JSON.stringify(ideas[0].history), /添加镂空文字Usagi/);
  assert.match(ideas[0].pending_proposal.instruction, /镂空文字Usagi/);
  assert(
    await page.getByRole('button', { name: '请确认后续方案', exact: true }).first().isDisabled(),
  );
  await input.fill('再放大字体');
  await input.press('Enter');
  await page.getByText('Usagi居中并放大字体', { exact: true }).waitFor();
  assert.match(ideas[1].pending_proposal.instruction, /正中心镂空Usagi/);
  assert.match(JSON.stringify(ideas[1].history), /这一面位置正中间/);
  await page.getByRole('button', { name: '确认并更新 3D 模型', exact: true }).click();
  const retry = page.getByRole('button', { name: '重试此微调', exact: true });
  await retry.waitFor();
  await retry.click();
  await page.waitForFunction(() => !document.querySelector('.dock-textarea')?.disabled);
  assert.equal(adjustments.length, 2);
  assert.equal(adjustments[0].adjustment.instruction, adjustments[1].adjustment.instruction);
  await page.reload();
  await page.getByRole('button', { name: /造物桌面/ }).click();
  await page.getByText('Usagi居中并放大字体', { exact: true }).waitFor();
  assert(store.messages.some((m) => m.content === '再放大字体'));
  const restoredInput = page.getByRole('textbox', { name: '造物对话', exact: true });
  await restoredInput.fill('你建议什么材料');
  await restoredInput.press('Enter');
  await page.getByText('可以先用PLA，请和家长一起确认打印配置。', { exact: true }).waitFor();
  await restoredInput.fill('重新设计成钥匙扣');
  await restoredInput.press('Enter');
  await page.getByRole('button', { name: '立即开始造物', exact: true }).waitFor();
  assert.equal(await page.locator('.dock-mode-selector').count(), 0);
  await page.screenshot({ path: '.artifacts/verification/unified-dialogue.png' });
  console.log('统一对话：文字模型连续调整、咨询、重新设计、旧方案替代、失败重试及刷新恢复通过。');
} finally {
  await browser.close();
}
