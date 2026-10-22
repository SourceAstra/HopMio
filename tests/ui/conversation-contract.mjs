import assert from 'node:assert/strict';
import {
  proposalBlockReason,
  pendingProposal,
} from '../../src/features/workbench/chat/proposal.ts';
import { conversationHistory } from '../../src/features/workbench/chat/context.ts';

const spec = { width_mm: 50, modeling_plan: { parameters: { wall: 3, height: 50 } } };
const proposal = {
  revision: 'r1',
  specSnapshot: JSON.stringify({
    modeling_plan: { parameters: { height: 50, wall: 3 } },
    width_mm: 50,
  }),
  selectionSnapshot: '{}',
  instruction: '在侧面镂空Usagi',
  summary: '添加文字',
  changes: ['镂空文字'],
};
assert.equal(proposalBlockReason(proposal, 'r1', spec), null);
assert.match(proposalBlockReason(proposal, 'r2', spec), /旧模型版本/);
assert.match(proposalBlockReason(proposal, 'r1', { ...spec, width_mm: 60 }), /参数已改变/);
assert.equal(proposalBlockReason(proposal, 'r1', { ...spec, prompt: '补充描述', asset_ids: ['photo'] }), null);
assert.match(proposalBlockReason(proposal, 'r1', { ...spec, modeling_plan: { parameters: { wall: 4, height: 50 } } }), /参数已改变/);
const messages = [
  { id: 'a', sender: 'user', content: '添加镂空文字Usagi' },
  { id: 'b', sender: 'assistant', proposal: { ...proposal, superseded: true } },
  { id: 'c', sender: 'user', content: '这一面位置正中间' },
  { id: 'd', sender: 'assistant', proposal: { ...proposal, instruction: '在侧面正中心镂空Usagi' } },
];
assert.equal(pendingProposal(messages, 'r1').instruction, '在侧面正中心镂空Usagi');
assert.equal(pendingProposal(messages, 'r2'), undefined);
const history = conversationHistory(messages);
assert.equal(history[0].content, '添加镂空文字Usagi');
assert.match(history[1].content, /已被后续方案替代/);
assert.match(history[3].content, /正中心镂空Usagi/);
console.log('连续对话上下文与微调版本检查通过。');
