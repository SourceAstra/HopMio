// 仅验证界面状态；真实 Blender 几何由 engine/test_text_adjustment.py 验证。
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { editableProject } from './fixtures.mjs';
const browser = await chromium.launch({
  headless: true,
  channel: process.env.YAHA_TEST_BROWSER || 'msedge',
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1050 } });
try {
  const bootstrap = (
    await (
      await page.request.post('http://127.0.0.1:5173/api/rpc', { data: { method: 'bootstrap' } })
    ).json()
  ).result;
  const project = editableProject(bootstrap);
  assert(project);
  bootstrap.projects = [project];
  bootstrap.jobs = [];
  Object.assign(bootstrap.settings, {
    chat_supports_images: false,
    chat_configured: true,
    cloud_enabled: true,
  });
  const updated = {
    ...project,
    revision_id: 'mock-geometry-revision',
    revision_count: project.revision_count + 1,
    validation: null,
    slicing: null,
    model: {
      ...project.model,
      design_review: {
        schema_version: 'yaha.design-review/v1',
        status: 'geometry_verified',
        scope: 'geometry_only',
        visual_status: 'unverified',
        message: '网格与尺寸已复测，外观待确认。',
      },
    },
  };
  let version = 1,
    submissions = 0,
    finished = false;
  const messages = [
    {
      id: 'isolated-proposal',
      sender: 'assistant',
      type: 'proposal',
      timestamp: Date.now(),
      proposal: {
        summary: '在盒子侧面镂空Usagi',
        instruction: '侧面居中镂空Usagi',
        changes: ['镂空文字'],
        revision: project.revision_id,
        specSnapshot: JSON.stringify(project.spec),
        selectionSnapshot: '{}',
      },
    },
  ];
  const task = {
    id: 'isolated-text-edit',
    kind: 'adjust',
    project_id: project.id,
    base_revision_id: project.revision_id,
    spec: project.spec,
    status: 'queued',
    created_at: new Date().toISOString(),
    message: '准备更新',
  };
  await page.route('**/api/rpc', async (route) => {
    const { method, params = {} } = route.request().postDataJSON();
    const result = (value) => route.fulfill({ json: { result: value } });
    if (method === 'bootstrap') return result(bootstrap);
    if (method === 'conversation.get') return result({ version, messages });
    if (method === 'conversation.save') {
      assert.equal(params.expected_version, version);
      return result({ version: ++version });
    }
    if (method === 'model.adjust') {
      submissions++;
      return result(task);
    }
    if (method === 'job.get') {
      finished = true;
      return result({
        ...task,
        status: 'succeeded',
        progress: 100,
        message: '实际网格与尺寸复测通过，外观待确认。',
        result: { project: updated },
      });
    }
    if (method === 'project.list') return result([finished ? updated : project]);
    return route.continue();
  });
  await page.goto('http://127.0.0.1:5173/');
  await page.getByRole('button', { name: /造物桌面/ }).click();
  await page
    .getByText('可以直接更新 3D 模型；完成后会检查实际网格与尺寸，请和家长一起旋转模型确认外观。', {
      exact: true,
    })
    .waitFor();
  await page.getByRole('button', { name: '确认并更新 3D 模型', exact: true }).click();
  await page.getByText('几何已更新 · 外观待确认', { exact: true }).waitFor();
  await page
    .getByText(
      '网格与尺寸已复测。当前模型未做视觉审阅，请旋转检查文字、位置与其他外观细节，再和家长一起准备打印。',
      { exact: true },
    )
    .waitFor();
  assert.equal(submissions, 1);
  assert.equal(await page.getByText('待改进草稿 · 未通过造型审阅', { exact: true }).count(), 0);
  await page.screenshot({ path: '.artifacts/verification/text-adjustment.png' });
  console.log('文字模型可确认更新，新版本准确显示几何通过、外观待确认。');
} finally {
  await browser.close();
}
