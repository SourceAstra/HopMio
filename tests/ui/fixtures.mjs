// 只读使用已有作品或历史任务快照，避免测试依赖用户当前选中的版本类型。
export function editableProject(bootstrap) {
  return bootstrap.projects.find(p => p.model && p.spec.modeling_plan) || [...bootstrap.jobs]
    .sort((a,b) => b.created_at.localeCompare(a.created_at))
    .map(job => job.result?.project).find(p => p?.model && p.spec.modeling_plan);
}
