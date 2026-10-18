import { useState, useEffect, useCallback } from 'react';
import {
  INSPIRATION_ITEMS,
  type InspirationItem,
  type InspirationCategoryId,
} from '../../theme/inspirations';

const STORAGE_KEY = 'yaha_craft_inspirations_v3';

// 类别标签映射
export const CATEGORY_LABELS: Record<string, string> = {
  custom: '小朋友脑洞',
  usagi: '乌萨奇专属',
  school: '校园实用',
  pets: '治愈萌宠',
  toys: '益智解压',
  gifts: '节日心意',
};

/**
 * 从本地存储安全读取灵感列表，无有效缓存时降级为内置预设
 */
export function getInspirations(): InspirationItem[] {
  if (typeof window === 'undefined') {
    return INSPIRATION_ITEMS;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // 检查是否有旧版本的小朋友灵感需要平滑迁移
      const oldRaw = localStorage.getItem('yaha_craft_inspirations_v2');
      let customItems: InspirationItem[] = [];
      if (oldRaw) {
        try {
          const oldParsed = JSON.parse(oldRaw);
          if (Array.isArray(oldParsed)) {
            customItems = oldParsed.filter((it: InspirationItem) => it.isCustom);
          }
        } catch {
          // ignore
        }
      }
      const initial = [...customItems, ...INSPIRATION_ITEMS];
      saveInspirations(initial);
      return initial;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      // 增量合并：若官方新增了预设灵感，自动追加，同时保留小朋友自建的灵感
      const existingIds = new Set(parsed.map((it: InspirationItem) => it.id));
      const missingPresets = INSPIRATION_ITEMS.filter((it) => !existingIds.has(it.id));
      if (missingPresets.length > 0) {
        const merged = [...parsed, ...missingPresets];
        saveInspirations(merged);
        return merged;
      }
      return parsed;
    }
  } catch (err) {
    console.warn('[InspirationsStore] 读取本地灵感失败，恢复默认预设:', err);
  }
  return INSPIRATION_ITEMS;
}

/**
 * 保存灵感列表到本地存储并派发全局同步事件
 */
export function saveInspirations(items: InspirationItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent('yaha-inspirations-changed'));
  } catch (err) {
    console.error('[InspirationsStore] 保存灵感失败:', err);
  }
}

/**
 * 新增灵感（小朋友录入）
 */
export function addInspiration(
  data: Omit<InspirationItem, 'id' | 'createdAt' | 'updatedAt'>,
): InspirationItem {
  const current = getInspirations();
  const newItem: InspirationItem = {
    ...data,
    id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    categoryLabel: CATEGORY_LABELS[data.category] || '小朋友脑洞',
    isCustom: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  // 新录入的灵感置顶，让小朋友立即看到成就感
  const nextList = [newItem, ...current];
  saveInspirations(nextList);
  return newItem;
}

/**
 * 更新已有灵感
 */
export function updateInspiration(
  id: string,
  updates: Partial<Omit<InspirationItem, 'id' | 'createdAt'>>,
): boolean {
  const current = getInspirations();
  const index = current.findIndex((item) => item.id === id);
  if (index === -1) return false;

  const prev = current[index];
  const nextCategory = updates.category || prev.category;
  const updatedItem: InspirationItem = {
    ...prev,
    ...updates,
    categoryLabel: CATEGORY_LABELS[nextCategory] || prev.categoryLabel,
    updatedAt: Date.now(),
  };

  const nextList = [...current];
  nextList[index] = updatedItem;
  saveInspirations(nextList);
  return true;
}

/**
 * 删除灵感
 */
export function deleteInspiration(id: string): boolean {
  const current = getInspirations();
  const nextList = current.filter((item) => item.id !== id);
  if (nextList.length === current.length) return false;
  saveInspirations(nextList);
  return true;
}

/**
 * 恢复官方预设灵感
 */
export function resetToDefaults(): InspirationItem[] {
  saveInspirations(INSPIRATION_ITEMS);
  return INSPIRATION_ITEMS;
}

/**
 * React 响应式 Hook
 */
export function useInspirations() {
  const [items, setItems] = useState<InspirationItem[]>(getInspirations);

  const refresh = useCallback(() => {
    setItems(getInspirations());
  }, []);

  useEffect(() => {
    const handleStorageChange = () => refresh();
    window.addEventListener('yaha-inspirations-changed', handleStorageChange);
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('yaha-inspirations-changed', handleStorageChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [refresh]);

  return {
    items,
    addItem: addInspiration,
    updateItem: updateInspiration,
    deleteItem: deleteInspiration,
    resetDefaults: resetToDefaults,
    refresh,
  };
}
