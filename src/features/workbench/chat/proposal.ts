import type { Spec } from '../../../types';
import type { ChatMessage, ProposalData } from './types';
import { dataSnapshot as canonical } from '../../../utils/dataSnapshot.ts';

export function proposalBlockReason(
  proposal: ProposalData,
  revision: string | null | undefined,
  spec: Spec,
) {
  if (proposal.superseded)
    return '这条建议已被后续方案替代，请确认最新建议，或引用这条建议继续讨论。';
  if (proposal.revision !== revision)
    return '这条建议对应旧模型版本，请点击“继续修改”，基于当前版本更新建议。';
  try {
    if (canonical(JSON.parse(proposal.specSnapshot)) !== canonical(spec))
      return '模型参数已改变，请点击“继续修改”，结合当前参数重新整理建议。';
  } catch {
    return '这条旧建议缺少有效的模型快照，请引用它继续修改。';
  }
  // 点选只是后续输入位置；执行始终使用建议内冻结的目标，不受当前红点影响。
  return null;
}

export function pendingProposal(messages: ChatMessage[], revision: string | null | undefined) {
  return [...messages]
    .reverse()
    .find(
      (message) =>
        message.proposal &&
        !message.proposal.applied &&
        !message.proposal.superseded &&
        message.proposal.revision === revision,
    )?.proposal;
}
