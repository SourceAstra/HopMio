import { useState } from 'react';
import { ChevronLeft, ChevronRight, Eye, Columns2, Layers } from 'lucide-react';
import { assetUrl } from '../../api/client';
import { useStudio } from '../../state/StudioContext';
import { ModelViewer } from '../../components/ModelViewer';
import type { Model } from '../../types';

interface MultiViewComparisonProps {
  model: Model | null | undefined;
  activeAssetId?: string | null;
  onSelectAsset?: (id: string) => void;
}

export function MultiViewComparison({
  model,
  activeAssetId,
  onSelectAsset,
}: MultiViewComparisonProps) {
  const s = useStudio();
  const assetIds = s.spec.asset_ids || [];
  const [internalSelectedId, setInternalSelectedId] = useState<string>(
    activeAssetId || assetIds[0] || '',
  );
  const [mode, setMode] = useState<'split' | 'overlay'>('split');
  const [opacity, setOpacity] = useState<number>(50);

  const selectedId = activeAssetId || internalSelectedId || assetIds[0];
  const currentIndex = Math.max(0, assetIds.indexOf(selectedId));

  const handleSelect = (id: string) => {
    setInternalSelectedId(id);
    onSelectAsset?.(id);
  };

  const handlePrev = () => {
    if (assetIds.length === 0) return;
    const prevIdx = (currentIndex - 1 + assetIds.length) % assetIds.length;
    handleSelect(assetIds[prevIdx]);
  };

  const handleNext = () => {
    if (assetIds.length === 0) return;
    const nextIdx = (currentIndex + 1) % assetIds.length;
    handleSelect(assetIds[nextIdx]);
  };

  const currentAsset = s.assets.find((a) => a.id === selectedId);
  const currentPhotoName = currentAsset?.name || `视角照片 ${currentIndex + 1}`;

  const glbId = model?.glb_id || model?.source_glb_id;

  return (
    <div className="multiview-comparison-container">
      {/* 顶部控制栏 */}
      <div className="multiview-toolbar">
        <div className="multiview-photo-selector">
          <button
            type="button"
            className="multiview-nav-btn"
            onClick={handlePrev}
            disabled={assetIds.length <= 1}
            title="查看上一张照片视角"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="multiview-photo-indicator">
            <strong>{currentPhotoName}</strong>
            <small>({currentIndex + 1} / {assetIds.length})</small>
          </span>
          <button
            type="button"
            className="multiview-nav-btn"
            onClick={handleNext}
            disabled={assetIds.length <= 1}
            title="查看下一张照片视角"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="multiview-mode-switch">
          <button
            type="button"
            className={`multiview-mode-btn ${mode === 'split' ? 'active' : ''}`}
            onClick={() => setMode('split')}
            title="左右分屏比对"
          >
            <Columns2 size={15} /> 左右对照
          </button>
          <button
            type="button"
            className={`multiview-mode-btn ${mode === 'overlay' ? 'active' : ''}`}
            onClick={() => setMode('overlay')}
            title="半透明叠层核验"
          >
            <Layers size={15} /> 叠层核验
          </button>
        </div>

        {mode === 'overlay' && (
          <div className="multiview-opacity-slider">
            <span>叠层透明度</span>
            <input
              type="range"
              min={0}
              max={100}
              value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
            />
            <span>{opacity}%</span>
          </div>
        )}
      </div>

      {/* 主视图区域 */}
      <div className={`multiview-body mode-${mode}`}>
        {mode === 'split' ? (
          <>
            {/* 左侧：选中的实物照片 */}
            <div className="multiview-photo-pane">
              {selectedId ? (
                <div className="multiview-image-wrap">
                  <img src={assetUrl(selectedId)} alt={currentPhotoName} />
                  <span className="photo-badge">实物参考照 #{currentIndex + 1}</span>
                </div>
              ) : (
                <div className="multiview-empty-hint">暂未上传参考照片</div>
              )}
            </div>

            {/* 右侧：自由交互旋转的 3D 模型 */}
            <div className="multiview-3d-pane">
              <span className="viewer-badge">3D 还原实体 (可自由旋转比对)</span>
              <ModelViewer assetId={glbId} appearance="solid" />
            </div>
          </>
        ) : (
          /* 叠层核验模式 */
          <div className="multiview-overlay-wrap">
            {selectedId && (
              <img
                src={assetUrl(selectedId)}
                alt={currentPhotoName}
                className="multiview-overlay-photo"
              />
            )}
            <div
              className="multiview-overlay-3d"
              style={{ opacity: opacity / 100 }}
            >
              <ModelViewer assetId={glbId} appearance="solid" />
            </div>
          </div>
        )}
      </div>

      {/* 底部缩略图快捷选择条 */}
      {assetIds.length > 1 && (
        <div className="multiview-thumbnails-rail">
          {assetIds.map((id, idx) => (
            <button
              key={id}
              type="button"
              className={`multiview-thumb-btn ${id === selectedId ? 'active' : ''}`}
              onClick={() => handleSelect(id)}
              title={`切换至第 ${idx + 1} 张照片对照`}
            >
              <img src={assetUrl(id)} alt={`视角 ${idx + 1}`} />
              <span className="thumb-idx">{idx + 1}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
