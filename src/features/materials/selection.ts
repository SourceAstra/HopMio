import type { Mode, Spec } from '../../types';
import { isPhotoMode, providerForMode } from '../../theme/modes';

export function selectMaterials(spec: Spec, asset_ids: string[], mode?: Mode): Spec {
  if (spec.modeling_plan?.source_mesh && !mode) {
    const plan = spec.modeling_plan;
    return {
      ...spec, asset_ids, provider: 'parametric',
      modeling_plan: { ...plan, source_asset_ids: asset_ids, reference_views: (plan.reference_views || []).flatMap((view) => {
        const index = asset_ids.indexOf(plan.source_asset_ids[view.photo_index]);
        return index < 0 ? [] : [{ ...view, photo_index: index }];
      }) },
    };
  }
  let targetMode = mode;
  if (!targetMode) {
    if (asset_ids.length > 0) {
      targetMode = ['silhouette', 'relief', 'image', 'multiview'].includes(spec.mode)
        ? spec.mode
        : (asset_ids.length > 1 ? 'multiview' : 'image');
    } else {
      targetMode = ['image', 'multiview'].includes(spec.mode) ? 'text' : spec.mode;
    }
  }
  const next = {
    ...spec,
    mode: targetMode,
    provider: targetMode === spec.mode ? spec.provider : providerForMode(targetMode, spec.provider),
    asset_ids,
  };
  if (
    next.mode === spec.mode &&
    next.provider === spec.provider &&
    asset_ids.length === spec.asset_ids.length &&
    asset_ids.every((id, i) => id === spec.asset_ids[i])
  )
    return spec;
  return {
    ...next,
    modeling_plan:
      next.provider === spec.provider &&
      isPhotoMode(next.mode) &&
      spec.asset_ids.length > 0 &&
      spec.asset_ids.every((id) => asset_ids.includes(id))
        ? spec.modeling_plan
        : null,
    reconstruction_plan: null,
  };
}
