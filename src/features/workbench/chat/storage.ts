import type { ChatMessage } from './types';

const STORAGE_PREFIX = 'yaha_chat_v1_';

export function loadChatHistory(projectId: string): ChatMessage[] {
  if (!projectId) return [];
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${projectId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map((message: ChatMessage) =>
          message.proposal?.applied && !message.proposal.appliedRevisionId
            ? { ...message, proposal: { ...message.proposal, applied: false } }
            : message,
        )
      : [];
  } catch {
    return [];
  }
}

export function saveChatHistory(projectId: string, messages: ChatMessage[]): void {
  if (!projectId) return;
  try {
    // 保留最近 100 条消息，防止存储堆积
    const trimmed = messages.slice(-100);
    localStorage.setItem(`${STORAGE_PREFIX}${projectId}`, JSON.stringify(trimmed));
  } catch {
    // 忽略存储空间异常
  }
}

export function clearChatHistory(projectId: string): void {
  if (!projectId) return;
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${projectId}`);
  } catch {
    // 忽略
  }
}
