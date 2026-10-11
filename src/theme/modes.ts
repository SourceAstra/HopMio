import type { Mode, Spec } from '../types';
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
    description: '参数模板，或让 AI 创作自由形状',
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
    description: 'AI 猜想一张照片里物品的完整形状',
    badge: '云端 AI',
    emoji: '🧸',
  },
  {
    id: 'multiview',
    name: '绕一圈拍照',
    description: '从 2–4 个角度认识同一个物品',
    badge: '云端 AI',
    emoji: '📸',
  },
  {
    id: 'import',
    name: '老作品焕新',
    description: '导入 STL、GLB、3MF，调整大小和底座',
    badge: '本地',
    emoji: '🛠️',
  },
];
export const defaultSpec: Spec = {
  schema_version: 1,
  mode: 'text',
  prompt: '',
  template: 'usagi',
  provider: 'local',
  height_mm: 80,
  width_mm: 48,
  depth_mm: 36,
  thickness_mm: 3,
  ear_scale: 1.2,
  base: false,
  hole: false,
  hole_shape: 'round',
  relief_kind: 'relief',
  asset_ids: [],
  assumptions: [],
};
