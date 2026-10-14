import type { Mode, Spec } from '../types';
export function providerForMode(mode: Mode, current: string = 'parametric'): string {
  if (isPhotoMode(mode)) return 'parametric';
  if (mode === 'text') return current === 'reconstruction' ? 'parametric' : current;
  return 'local';
}
export const isPhotoMode = (mode: Mode) => mode === 'image' || mode === 'multiview';
export function editableSpec(spec: Spec): Spec {
  if (spec.asset_ids.length > 0 && spec.mode === 'text') {
    const mode: Mode = spec.asset_ids.length > 1 ? 'multiview' : 'image';
    return {
      ...spec,
      mode,
      provider: spec.provider === 'reconstruction' ? 'reconstruction' : 'parametric',
      modeling_plan: null,
    };
  }
  return spec;
}
export const modes: {
  id: Mode;
  name: string;
  description: string;
  badge: string;
  emoji: string;
}[] = [
  {
    id: 'text',
    name: '喊出一个想法',
    description: '参数模板或 AI 设计，交给 Blender 造物',
    badge: '本地 / AI',
    emoji: '💬',
  },
  {
    id: 'silhouette',
    name: '画画变挂件',
    description: '把清晰轮廓变成有厚度的小作品',
    badge: '本地',
    emoji: '🎨',
  },
  {
    id: 'relief',
    name: '照片小浮雕',
    description: '让照片的明暗长出高低和纹理',
    badge: '本地',
    emoji: '🌄',
  },
  {
    id: 'image',
    name: '照片变立体',
    description: '一张开始，补充照片继续细化造型',
    badge: '参考造型',
    emoji: '🧸',
  },
  {
    id: 'multiview',
    name: '多角度参考',
    description: '补充侧面、背面和细节，继续完善造型',
    badge: '持续细化',
    emoji: '📸',
  },
  {
    id: 'import',
    name: '老作品焕新',
    description: '导入 STL、GLB、3MF，保留原尺寸并修复',
    badge: '本地',
    emoji: '🛠️',
  },
];
export const defaultSpec: Spec = {
  schema_version: 4,
  mode: 'text',
  prompt: '',
  template: 'usagi',
  provider: 'parametric',
  height_mm: 80,
  width_mm: 48,
  depth_mm: 36,
  thickness_mm: 3,
  bottom_mm: 4,
  ear_scale: 1.2,
  base: false,
  hole: false,
  hole_shape: 'round',
  relief_kind: 'relief',
  asset_ids: [],
  assumptions: [],
};
