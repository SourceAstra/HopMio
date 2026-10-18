import { useStudio } from '../../state/StudioContext';
import type { Spec } from '../../types';

export function ProviderChoice() {
  const s = useStudio();
  const photos = ['image', 'multiview'].includes(s.spec.mode);
  const selectedPolicy =
    s.spec.photo_policy === 'parameters' ||
    (s.spec.photo_policy !== 'surface' &&
      s.spec.asset_ids.length < (s.preferences?.reconstruction?.min_photos || 3))
      ? 'parameters'
      : 'surface';
  const options = photos
    ? [
        {
          id: 'surface',
          label: '实物表面重建',
          detail: '用重叠多视角恢复实物；观测不足时提示补拍并保留原作品',
        },
        {
          id: 'parameters',
          label: '照片参考设计 · 含推测',
          detail: 'AI 推断缺失深度与背面，适合创作；不能作为精确实物还原',
        },
      ]
    : [
        {
          id: 'parametric',
          label: 'AI 参数建模',
          detail: '描述设计结构，Blender 制作',
        },
        ...(s.spec.mode === 'text'
          ? [{ id: 'local', label: '参数模板', detail: '只调整已有模板的尺寸' }]
          : []),
      ];
  return (
    <div className="modeling-provider">
      <label>选择造物方式</label>
      <div className="modeling-provider-options">
        {options.map((option) => (
          <button
            key={option.id}
            aria-pressed={(photos ? selectedPolicy : s.spec.provider) === option.id}
            disabled={s.busy || s.running}
            onClick={() =>
              s.setSpec((old) =>
                photos
                  ? {
                      ...old,
                      photo_policy: option.id as Spec['photo_policy'],
                      provider: option.id === 'parameters' ? 'parametric' : 'reconstruction',
                      modeling_plan: null,
                    }
                  : { ...old, provider: option.id },
              )
            }
          >
            <strong>{option.label}</strong>
            <small>{option.detail}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
