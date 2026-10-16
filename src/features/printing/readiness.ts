import type { Project, Profile } from '../../types';
import { dataSnapshot } from '../../utils/dataSnapshot.ts';

export function printingReadiness(
  project: Project | null,
  profile: Profile,
  dirty: boolean,
  busy: boolean,
  running: boolean,
) {
  const modelBlock = !project?.model
    ? '请先生成模型。'
    : busy || running
      ? '当前任务尚未结束，请稍后继续。'
      : dirty
        ? '有未保存的参数修改：请先生成新版本，或选择使用已保存模型。'
        : '';
  const report = project?.validation;
  const profileMatches = !!report && dataSnapshot(profile) === dataSnapshot(report.profile);
  const prepareBlock =
    modelBlock ||
    (!report
      ? '当前版本还没有体检，请点击“开始体检”。'
      : report.revision_id !== project?.revision_id
        ? '模型版本已变化，请重新体检。'
        : !profileMatches
          ? '打印配置已改变，请重新体检。'
          : !report.can_prepare
            ? '基础体检未通过，请先处理上方的问题。'
            : '');
  return {
    modelBlock,
    prepareBlock,
    profileMatches,
    canOpenModel: !modelBlock,
    canCheck: !modelBlock,
    canPrepare: !prepareBlock,
  };
}
