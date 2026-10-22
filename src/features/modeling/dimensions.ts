import type { GeometryPlan, Scalar, Spec } from '../../types';

function binding(value?: Scalar): { name: string; factor: number } | null {
  if (!value || typeof value === 'number') return null;
  if ('parameter' in value) return { name: value.parameter, factor: 1 };
  if (value.op !== 'multiply') return null;
  const [a, b] = value.args;
  const factor = typeof a === 'number' ? a : typeof b === 'number' ? b : null;
  const reference = typeof a === 'number' ? binding(b) : binding(a);
  return factor && reference ? { name: reference.name, factor: factor * reference.factor } : null;
}

export function canSetHeight(spec: Spec) {
  const plan = spec.modeling_plan;
  return (
    !plan ||
    !!binding(
      plan.surface?.height_mm ||
        plan.constraints.find((rule) => rule.feature === 'model.height')?.expected_mm,
    )
  );
}

export function heightForPlan(plan: GeometryPlan): number | null {
  const evaluate = (value: Scalar, depth = 0): number => {
    if (depth > 8) return NaN;
    if (typeof value === 'number') return value;
    if ('parameter' in value) {
      const parameter = plan.parameters[value.parameter];
      if (parameter) return typeof parameter.value === 'number' ? parameter.value : NaN;
      const derived = plan.geometry_bindings?.[value.parameter];
      return derived !== undefined ? evaluate(derived, depth + 1) : NaN;
    }
    const a = evaluate(value.args[0], depth + 1),
      b = evaluate(value.args[1], depth + 1);
    return { add: () => a + b, subtract: () => a - b, multiply: () => a * b, divide: () => a / b }[
      value.op
    ]();
  };
  const height =
    plan.surface?.height_mm ||
    plan.constraints.find((rule) => rule.feature === 'model.height')?.expected_mm;
  const result = height === undefined ? NaN : evaluate(height);
  return Number.isFinite(result) && result > 0 ? result : null;
}

export function patchDimensions(spec: Spec, changes: Partial<Spec>): Spec {
  const next = { ...spec, ...changes };
  if (changes.height_mm === undefined || changes.height_mm === spec.height_mm) return next;
  if (spec.reconstruction_plan)
    next.reconstruction_plan = {
      ...spec.reconstruction_plan,
      parameters: {
        ...spec.reconstruction_plan.parameters,
        height: { ...spec.reconstruction_plan.parameters.height, value: changes.height_mm },
      },
    };
  const plan = spec.modeling_plan;
  if (!plan) return next;
  const target = binding(
    plan.surface?.height_mm ||
      plan.constraints.find((rule) => rule.feature === 'model.height')?.expected_mm,
  );
  if (target && plan.parameters[target.name]) {
    next.modeling_plan = {
      ...plan,
      parameters: {
        ...plan.parameters,
        [target.name]: {
          ...plan.parameters[target.name],
          value: changes.height_mm / target.factor,
          locked: true,
        },
      },
    };
  } else {
    // 无可逆尺寸绑定时重新规划，不能留下输入框与实际几何不一致的有效方案。
    next.modeling_plan = null;
  }
  return next;
}
