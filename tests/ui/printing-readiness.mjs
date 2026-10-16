import assert from 'node:assert/strict';
import { dataSnapshot } from '../../src/utils/dataSnapshot.ts';
import { printingReadiness } from '../../src/features/printing/readiness.ts';
const profile = { machine: 'A1 mini', layer_mm: 0.2, margin_mm: 5 };
const project = {
  model: {},
  revision_id: 'new',
  validation: {
    revision_id: 'new',
    can_prepare: true,
    profile: { margin_mm: 5, layer_mm: 0.2, machine: 'A1 mini' },
  },
};
assert.equal(dataSnapshot({ a: 1, b: { c: 2 } }), dataSnapshot({ b: { c: 2 }, a: 1 }));
assert(printingReadiness(project, profile, false, false, false).canPrepare);
assert.match(printingReadiness(project, profile, true, false, false).prepareBlock, /未保存/);
assert.match(
  printingReadiness({ ...project, validation: null }, profile, false, false, false).prepareBlock,
  /开始体检/,
);
assert.match(
  printingReadiness({ ...project, revision_id: 'changed' }, profile, false, false, false)
    .prepareBlock,
  /版本已变化/,
);
assert.match(
  printingReadiness(project, { ...profile, layer_mm: 0.1 }, false, false, false).prepareBlock,
  /打印配置/,
);
assert(!printingReadiness(project, profile, false, false, true).canOpenModel);
console.log('打印就绪检查：字段顺序、体检版本、配置、未保存修改和运行中任务均通过。');
