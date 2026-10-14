import { useStudio } from '../../state/StudioContext';
import type { Spec } from '../../types';

export function ProviderChoice() {
  const s = useStudio();
  const photos = ['image', 'multiview'].includes(s.spec.mode);
  const options = photos ? [
    { id: 'auto', label: '自动 · 照片约束优先', detail: '恢复可观测表面，不足时保留注明推测的轮廓草稿' },
    { id: 'parameters', label: '照片参考设计', detail: '保留参数与设计补全，适合自由调整造型' },
    { id: 'surface', label: '严格表面恢复', detail: '只使用真实配准观测，条件不足时保留原作品' },
  ] : [
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
            aria-pressed={(photos ? s.spec.photo_policy || 'auto' : s.spec.provider) === option.id}
            disabled={s.busy || s.running}
            onClick={() => s.setSpec((old) => photos
              ? { ...old, photo_policy: option.id as Spec['photo_policy'], provider: option.id === 'surface' ? 'reconstruction' : option.id === 'parameters' ? 'parametric' : old.provider }
              : { ...old, provider: option.id })}
          >
            <strong>{option.label}</strong>
            <small>{option.detail}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
