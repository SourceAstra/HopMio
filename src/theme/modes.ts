import type { Mode, Spec } from '../types';
export function providerForMode(mode: Mode, current: string = 'parametric'): string {
  if (isPhotoMode(mode)) return current === 'reconstruction' ? 'reconstruction' : 'parametric';
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
    description: '上传重叠多视角照片还原实物，单张照片可选参考创作',
    badge: '实物 / 创作',
    emoji: '🧸',
  },
  {
    id: 'multiview',
    name: '多角度实物重建',
    description: '配准重叠照片，恢复实际观测到的表面与比例',
    badge: '实物重建',
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
  schema_version: 5,
  mode: 'text',
  prompt: '',
  template: 'usagi',
  provider: 'parametric',
  photo_policy: 'auto',
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

// 照片模式高精度 3D 打印精准提示词模板
export const PHOTO_PROMPT_PRESETS = [
  {
    id: 'solid-statue',
    emoji: '🧸',
    title: '忠实参考 · 保留外形',
    tag: '新手首选',
    prompt:
      '忠实保留照片主体的比例、姿态、轮廓和关键细节；不主动改变造型、加宽底部或删除细小部件，未观测区域明确标记为推测。',
  },
  {
    id: 'relief-badge',
    emoji: '🎖️',
    title: '半浮雕精致徽章 · 细节高辨识',
    tag: '徽章挂件',
    prompt: '提取照片主体的轮廓与明暗特征，雕刻为立体浮雕徽章，背面平坦光滑，自带钥匙扣穿孔。',
  },
  {
    id: 'chibi-smooth',
    emoji: '🍬',
    title: 'Q版圆润手办 · 平滑去倒扣',
    tag: '萌系治愈',
    prompt:
      '提炼 Q 版萌系造型轮廓，放大关键特征，平滑倒角去锐角倒扣，加厚薄弱连接处，打印不易断裂。',
  },
  {
    id: 'watertight-solid',
    emoji: '📐',
    title: '精密水密几何 · 严密成型',
    tag: '水密高精',
    prompt: '构建闭合水密网格实体，壁厚不小于 1.2mm，无非流形结构，针对 0.4mm 喷嘴精密打印优化。',
  },
];
