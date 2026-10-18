import type { Asset } from '../../types';

export type FolderColorScheme = 'amber' | 'blue' | 'purple' | 'rose' | 'emerald' | 'warm';

export interface MaterialFolder {
  id: string;
  name: string;
  emoji: string;
  description: string;
  isBuiltIn: boolean;
  colorScheme: FolderColorScheme;
}

export const BUILT_IN_FOLDERS: MaterialFolder[] = [
  {
    id: 'all',
    name: '全部素材',
    emoji: '📁',
    description: '收纳小屋收集的所有灵感材料与参考',
    isBuiltIn: true,
    colorScheme: 'warm',
  },
  {
    id: 'photos',
    name: '生活与实拍',
    emoji: '📸',
    description: '日常生活拍摄、毛绒玩具与实物参考照片',
    isBuiltIn: true,
    colorScheme: 'amber',
  },
  {
    id: 'drawings',
    name: '手绘与线稿',
    emoji: '🎨',
    description: '手绘涂鸦、剪影、贴纸与设计草图',
    isBuiltIn: true,
    colorScheme: 'blue',
  },
  {
    id: 'models',
    name: '3D 模型库',
    emoji: '🧊',
    description: '现成 3D 模型构件、零件与切片原型',
    isBuiltIn: true,
    colorScheme: 'purple',
  },
  {
    id: 'multiview',
    name: '多视角环拍',
    emoji: '🔄',
    description: '环绕多角度连续照片，专供 3D 几何重建',
    isBuiltIn: true,
    colorScheme: 'rose',
  },
];

const FOLDERS_STORAGE_KEY = 'yaha_material_custom_folders';
const ASSET_FOLDER_MAP_KEY = 'yaha_material_asset_folder_map';

export function loadCustomFolders(): MaterialFolder[] {
  try {
    const raw = localStorage.getItem(FOLDERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCustomFolders(folders: MaterialFolder[]): void {
  try {
    localStorage.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(folders));
  } catch (e) {
    console.error('Failed to save custom folders', e);
  }
}

export function loadAssetFolderMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(ASSET_FOLDER_MAP_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function saveAssetFolderMap(map: Record<string, string>): void {
  try {
    localStorage.setItem(ASSET_FOLDER_MAP_KEY, JSON.stringify(map));
  } catch (e) {
    console.error('Failed to save asset folder map', e);
  }
}

export const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.bmp',
  '.gif',
  '.svg',
]);

export const MODEL_EXTENSIONS = new Set([
  '.glb',
  '.gltf',
  '.stl',
  '.3mf',
  '.obj',
  '.blend',
]);

/**
 * 依据文件扩展名与元数据严格推导是否为图像类资产
 */
export function isImageAsset(
  asset?: { extension?: string; kind?: string } | null,
): boolean {
  if (!asset) return false;
  const ext = (asset.extension || '').toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) return true;
  if (asset.kind === 'image' || asset.kind === 'model-preview') return true;
  return false;
}

/**
 * 依据文件扩展名与元数据严格推导是否为三维几何模型类资产
 */
export function isModelAsset(
  asset?: { extension?: string; kind?: string } | null,
): boolean {
  if (!asset) return false;
  const ext = (asset.extension || '').toLowerCase();
  if (MODEL_EXTENSIONS.has(ext)) return true;
  if (asset.kind === 'model-input' || asset.kind === 'model') {
    return !IMAGE_EXTENSIONS.has(ext);
  }
  return false;
}

/**
 * 依据第一性原理清洗素材货架内容 (语义投影过滤)
 * 1. 彻底剔除底层内部二进制工程 (.blend)、清单数据 (.json)、归档包 (.usagi)
 * 2. 彻底剔除内部生成的切片产物 (sliced)、报告 (slice-report) 与导出包 (export)
 * 3. 图像类全量保留（生活与实拍、手绘与线稿、多视角环拍）
 * 4. 3D 模型类（.glb, .stl, .3mf）：
 *    - 仅保留用户显式上传的外部创作模型 (kind === 'model-input')
 *    - 或系统基础预置网格（如 '乌萨奇原始网格.stl', '原始模板网格.stl'）
 *    - 彻底排除后台每次造物生成并已收纳于作品柜的成百上千个同名成品（'作品.glb', '作品.stl', 'source.glb' 等）
 */
export function isShelfMaterial(asset: Asset): boolean {
  if (asset.archived || asset.source === 'generated' || ['model-preview', 'model-draft'].includes(asset.kind)) return false;
  const ext = (asset.extension || '').toLowerCase();
  const kind = asset.kind;
  const name = asset.name || '';

  // 1. 排除非素材的二进制工程文件与内部数据
  if (['.blend', '.json', '.usagi'].includes(ext)) {
    return false;
  }
  if (['manifest', 'slice-report', 'sliced', 'imported-history', 'export'].includes(kind)) {
    return false;
  }

  // 2. 图像类（照片、手绘草图、参考视角图）全量保留
  if (isImageAsset(asset)) {
    return true;
  }

  // 3. 3D 模型类：
  if (isModelAsset(asset) || MODEL_EXTENSIONS.has(ext)) {
    // 用户显式上传的输入模型一律保留
    if (kind === 'model-input') {
      return true;
    }
    // 排除系统后台生成的内部同名成品与中间件（归属作品柜，不应在此刷屏）
    if (
      name.startsWith('作品.') ||
      name === 'source.glb' ||
      name === 'source.stl' ||
      name === 'manufacturing.glb' ||
      name === 'model.stl' ||
      name === 'model.glb' ||
      name.endsWith('.gcode.3mf')
    ) {
      return false;
    }
    return true;
  }

  return false;
}

/**
 * 依据第一性原理推导素材归属的文件夹 ID：
 * 1. 若用户在 localStorage 中显式映射且该目标文件夹有效，以用户意图为唯一真实源 (SSOT)；
 * 2. 否则依据物理扩展名与命名特征智能归类：
 *    - 3D模型扩展名 (.glb, .stl, .3mf, .blend) -> 'models'
 *    - 环拍命名特征 (multiview, cam_, _01~_99) -> 'multiview'
 *    - PNG透明图/剪影 (.png) -> 'drawings'
 *    - JPG/WEBP 实拍照 -> 'photos'
 */
export function resolveAssetFolderId(
  asset: Asset,
  folderMap: Record<string, string>,
  allFolders: MaterialFolder[],
): string {
  const customAssigned = folderMap[asset.id];
  if (customAssigned && allFolders.some((f) => f.id === customAssigned)) {
    return customAssigned;
  }

  const ext = (asset.extension || '').toLowerCase();
  const name = (asset.name || '').toLowerCase();

  if (isModelAsset(asset) || MODEL_EXTENSIONS.has(ext)) {
    return 'models';
  }

  if (
    name.includes('multiview') ||
    name.includes('mv_') ||
    name.includes('cam_') ||
    /_0[1-9]/.test(name) ||
    /-0[1-9]/.test(name)
  ) {
    return 'multiview';
  }

  if (ext === '.png') {
    return 'drawings';
  }

  return 'photos';
}

/**
 * 获取指定 ID 的文件夹元数据
 */
export function getFolderMeta(
  folderId: string,
  allFolders: MaterialFolder[],
): MaterialFolder {
  const match = allFolders.find((f) => f.id === folderId);
  if (match) return match;

  return {
    id: folderId,
    name: '自定文件夹',
    emoji: '📁',
    description: '素材收纳分类',
    isBuiltIn: false,
    colorScheme: 'warm',
  };
}
