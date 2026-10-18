import { useState, useRef, useEffect, useCallback } from 'react';

export interface MarqueeRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function useMarqueeSelection({
  containerRef,
  allAssetIds,
  onBatchSelectChange,
}: {
  containerRef: React.RefObject<HTMLElement | null>;
  allAssetIds: string[];
  onBatchSelectChange?: (selectedIds: string[]) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);

  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const isMouseDownRef = useRef(false);
  const lastClickedIndexRef = useRef<number>(-1);
  const selectedIdsRef = useRef<string[]>([]);
  selectedIdsRef.current = selectedIds;

  const updateSelected = useCallback(
    (newIds: string[] | ((prev: string[]) => string[])) => {
      setSelectedIds((prev) => {
        const next = typeof newIds === 'function' ? newIds(prev) : newIds;
        onBatchSelectChange?.(next);
        return next;
      });
    },
    [onBatchSelectChange],
  );

  // 单选/反选某一项 (配合卡片勾选框)
  const toggleSelect = useCallback(
    (id: string) => {
      updateSelected((prev) =>
        prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
      );
    },
    [updateSelected],
  );

  // Shift + 点击连选范围
  const handleRangeSelect = useCallback(
    (targetId: string, visibleIds: string[]) => {
      const targetIndex = visibleIds.indexOf(targetId);
      if (targetIndex === -1) return;

      const lastIndex = lastClickedIndexRef.current;
      if (lastIndex === -1 || lastIndex >= visibleIds.length) {
        lastClickedIndexRef.current = targetIndex;
        toggleSelect(targetId);
        return;
      }

      const start = Math.min(lastIndex, targetIndex);
      const end = Math.max(lastIndex, targetIndex);
      const rangeIds = visibleIds.slice(start, end + 1);

      updateSelected((prev) => {
        const set = new Set(prev);
        rangeIds.forEach((id) => set.add(id));
        return Array.from(set);
      });
      lastClickedIndexRef.current = targetIndex;
    },
    [toggleSelect, updateSelected],
  );

  // 全选当前可见素材
  const selectAll = useCallback(
    (idsToSelect: string[]) => {
      updateSelected(idsToSelect);
    },
    [updateSelected],
  );

  // 清空选择
  const clearSelection = useCallback(() => {
    updateSelected([]);
    lastClickedIndexRef.current = -1;
  }, [updateSelected]);

  // 反选当前可见素材
  const invertSelection = useCallback(
    (visibleIds: string[]) => {
      updateSelected((prev) => {
        const prevSet = new Set(prev);
        return visibleIds.filter((id) => !prevSet.has(id));
      });
    },
    [updateSelected],
  );

  // 鼠标拉选 / 框选核心监听
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseDown = (e: MouseEvent) => {
      // 仅支持鼠标左键
      if (e.button !== 0) return;

      const target = e.target as HTMLElement;
      // 若点击的是按钮、输入框、预览弹窗、或明确标记禁止框选的区域，不触发框选
      if (
        target.closest('button') ||
        target.closest('input') ||
        target.closest('a') ||
        target.closest('[data-no-marquee]') ||
        target.closest('.card-hover-actions')
      ) {
        return;
      }

      isMouseDownRef.current = true;
      startPosRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isMouseDownRef.current || !startPosRef.current) return;

      const startX = startPosRef.current.x;
      const startY = startPosRef.current.y;
      const currentX = e.clientX;
      const currentY = e.clientY;

      const deltaX = Math.abs(currentX - startX);
      const deltaY = Math.abs(currentY - startY);

      // 拖拽距离超过 5px 时，正式判定为框选状态
      if (!isDragging && (deltaX > 5 || deltaY > 5)) {
        setIsDragging(true);
      }

      if (isDragging || deltaX > 5 || deltaY > 5) {
        const left = Math.min(startX, currentX);
        const top = Math.min(startY, currentY);
        const width = Math.abs(currentX - startX);
        const height = Math.abs(currentY - startY);

        setMarqueeRect({ left, top, width, height });

        // 碰撞计算：检测视口中所有拥有 data-asset-id 属性的卡片
        const cards = container.querySelectorAll<HTMLElement>('[data-asset-id]');
        const boxRight = left + width;
        const boxBottom = top + height;

        const intersectingIds: string[] = [];

        cards.forEach((card) => {
          const rect = card.getBoundingClientRect();
          // AABB 矩形交叉判定
          const isOverlap = !(
            left > rect.right ||
            boxRight < rect.left ||
            top > rect.bottom ||
            boxBottom < rect.top
          );

          if (isOverlap) {
            const assetId = card.getAttribute('data-asset-id');
            if (assetId) intersectingIds.push(assetId);
          }
        });

        // 如果按住了 Shift 键，则保留之前已选并增量添加
        if (e.shiftKey) {
          updateSelected((prev) => Array.from(new Set([...prev, ...intersectingIds])));
        } else {
          updateSelected(intersectingIds);
        }
      }
    };

    const handleMouseUp = () => {
      if (isMouseDownRef.current) {
        isMouseDownRef.current = false;
        startPosRef.current = null;
        setIsDragging(false);
        setMarqueeRect(null);
      }
    };

    container.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      container.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [containerRef, isDragging, updateSelected]);

  return {
    selectedIds,
    isDragging,
    marqueeRect,
    toggleSelect,
    handleRangeSelect,
    selectAll,
    clearSelection,
    invertSelection,
    isSelected: (id: string) => selectedIds.includes(id),
  };
}
