import type { Spec } from '../../../types';
import type { ChatMessage } from './types';
import { conversationHistory } from './context';
import { pendingProposal } from './proposal';

export interface DialogueReply {
  action: 'adjust' | 'create' | 'ask';
  is_new_project?: boolean;
  summary: string;
  instruction?: string;
  changes?: string[];
  scope?: 'whole' | 'selected';
  design?: Spec & { title?: string };
}

export function dialogueContext(
  messages: ChatMessage[],
  revision: string,
  selectedPartId?: string | null,
  selectedPointMm?: [number, number, number] | null,
) {
  const pending = pendingProposal(messages, revision);
  let previousPoint: [number, number, number] | null = null;
  try {
    previousPoint = JSON.parse(pending?.selectionSnapshot || '{}').selectedPointMm || null;
  } catch {
    /* 兼容旧记录。 */
  }
  const target = selectedPartId || pending?.targetPartId;
  const point =
    selectedPointMm ||
    (!selectedPartId || selectedPartId === pending?.targetPartId ? previousPoint : null);
  return {
    history: conversationHistory(messages),
    pending_proposal: pending,
    selection: { selectedPartId: target, selectedPointMm: point },
  };
}

export function dialogueMessage(
  reply: DialogueReply,
  spec: Spec,
  revision: string,
  selection: ReturnType<typeof dialogueContext>['selection'],
  locationAssetId?: string,
  locationPoint?: [number, number] | null,
): ChatMessage {
  const base = { id: crypto.randomUUID(), sender: 'assistant' as const, timestamp: Date.now() };
  if (reply.action === 'adjust' && reply.instruction && reply.changes)
    return {
      ...base,
      type: 'proposal',
      proposal: {
        summary: reply.summary,
        instruction: reply.instruction,
        changes: reply.changes,
        revision,
        specSnapshot: JSON.stringify(spec),
        selectionSnapshot: JSON.stringify(selection),
        targetPartId:
          reply.scope === 'selected' ? selection.selectedPartId || undefined : undefined,
        locationAssetId,
        locationPointSnapshot: JSON.stringify(locationPoint || null),
        applied: false,
      },
    };
  if (reply.action === 'create' && reply.design) {
    const { title, ...cleanSpec } = reply.design;
    return {
      ...base,
      type: 'organize',
      organize: {
        ...cleanSpec,
        title: reply.design.title,
        is_new_project: reply.is_new_project,
        specSnapshot: JSON.stringify(cleanSpec),
      },
    };
  }
  return { ...base, type: 'text', content: reply.summary };
}

export function appendDialogueReply(messages: ChatMessage[], reply: ChatMessage) {
  if (reply.type === 'text') return [...messages, reply];
  return [
    ...messages.map((message) => ({
      ...message,
      ...(message.proposal && !message.proposal.applied
        ? { proposal: { ...message.proposal, superseded: true } }
        : {}),
      ...(message.organize && !message.organize.applied
        ? { organize: { ...message.organize, superseded: true } }
        : {}),
    })),
    reply,
  ];
}
