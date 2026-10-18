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
    const snapshot = JSON.parse(proposal.specSnapshot || '{}');
    const snapParams = snapshot.modeling_plan?.parameters;
    const curParams = spec.modeling_plan?.parameters;
    if (canonical(snapshot.modeling_plan?.source_mesh) !== canonical(spec.modeling_plan?.source_mesh))
      return '编辑源网格已改变，请基于当前模型重新确认建议。';
    // 仅在核心参数化建模参数发生结构性修改时提示，不因添加照片素材或文字润色误杀
    if (snapParams && curParams && canonical(snapParams) !== canonical(curParams)) {
      return '模型参数已改变，请点击“继续修改”，结合当前参数重新整理建议。';
    }
  } catch {
    /* 容错解析，避免旧数据快照阻断用户 */
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
