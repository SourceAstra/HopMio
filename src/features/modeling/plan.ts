import type { Project, Spec } from '../../types';

export function adjustmentSpec(project: Project | null, spec: Spec) {
  if (!project?.model) return null;
  const source = spec.provider === 'parametric' && spec.modeling_plan ? spec : project.spec;
  return source.provider === 'parametric' && source.modeling_plan ? source : null;
}

export function hasCurrentPlan(spec: Spec) {
  const plan = spec.modeling_plan;
  return (
    !!plan &&
    plan.source_prompt === spec.prompt &&
    JSON.stringify(plan.source_asset_ids) === JSON.stringify(spec.asset_ids)
  );
}
