import type { ChatMessage } from './types';

export function conversationHistory(messages: ChatMessage[]) {
  const history: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const message of messages) {
    if (message.sender === 'user' && message.content)
      history.push({ role: 'user', content: message.content });
    else if (message.sender === 'assistant') {
      let content = message.content || '';
      if (message.proposal) {
        const p = message.proposal;
        content = JSON.stringify({
          type: '微调方案',
          status: p.applied ? '已应用' : p.superseded ? '已被后续方案替代' : '未应用，仍在讨论',
          summary: p.summary,
          instruction: p.instruction,
          changes: p.changes,
          target: p.targetPartId,
          revision: p.revision,
          job_status: p.jobStatus,
        });
      } else if (message.organize)
        content = JSON.stringify({
          type: '整体造物方案',
          ...message.organize,
          specSnapshot: undefined,
        });
      else if (message.milestone)
        content = JSON.stringify({ type: '模型版本已更新', ...message.milestone });
      if (content) history.push({ role: 'assistant', content });
    }
  }
  // 服务端按当前模型输入预算裁剪，前端不再隐藏截掉历史。
  return history;
}
