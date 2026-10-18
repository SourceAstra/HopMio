import { useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import type { Asset } from '../../types';
import type { MaterialFolder } from './folders';
import { AssetCard } from './AssetCard';

export function FolderDrawerSection({
  folder,
  assets,
  batchSelectedIds = [],
  folderMetaMap,
  disabled,
  onDeleteAsset,
  onPreviewAsset,
  onMoveAsset,
  onStartProjectAsset,
  onFocusFolder,
  onToggleBatchSelect,
}: {
  folder: MaterialFolder;
  assets: Asset[];
  batchSelectedIds?: string[];
  folderMetaMap: Record<string, MaterialFolder>;
  disabled?: boolean;
  onDeleteAsset: (id: string) => void;
  onPreviewAsset: (asset: Asset) => void;
  onMoveAsset: (asset: Asset) => void;
  onStartProjectAsset?: (asset: Asset) => void;
  onFocusFolder: (folderId: string) => void;
  onToggleBatchSelect?: (id: string, e: React.MouseEvent) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <section className={`folder-drawer-section scheme-${folder.colorScheme}`}>
      {/* 文件夹抽屉标题栏 */}
      <div className="folder-drawer-header">
        <div className="drawer-header-left" onClick={() => setCollapsed(!collapsed)} role="button" tabIndex={0}>
          <button
            type="button"
            className="drawer-collapse-btn"
            aria-label={collapsed ? '展开文件夹' : '收起文件夹'}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
          </button>

          <span className="drawer-emoji" aria-hidden="true">
            {folder.emoji}
          </span>

          <div className="drawer-title-meta">
            <h4>{folder.name}</h4>
            <span className="drawer-desc">{folder.description}</span>
          </div>

          <span className="drawer-count-badge">
            <strong>{assets.length}</strong> 份
          </span>
        </div>

        <div className="drawer-header-right">
          <button
            type="button"
            className="drawer-focus-btn"
            onClick={() => onFocusFolder(folder.id)}
            title={`仅聚焦浏览「${folder.name}」文件夹`}
          >
            <ExternalLink size={12} />
            <span>进入此分类</span>
          </button>
        </div>
      </div>

      {/* 文件夹内素材卡片网格 */}
      {!collapsed && (
        <div className="folder-drawer-content">
          {assets.length > 0 ? (
            <div className="asset-grid modern-grid">
              {assets.map((asset) => {
                const meta = folderMetaMap[asset.id] || folder;
                const isBatch = batchSelectedIds.includes(asset.id);

                return (
                  <AssetCard
                    key={asset.id}
                    asset={asset}
                    folderMeta={meta}
                    disabled={disabled}
                    isBatchSelected={isBatch}
                    onDelete={() => onDeleteAsset(asset.id)}
                    onPreview={() => onPreviewAsset(asset)}
                    onMoveFolder={() => onMoveAsset(asset)}
                    onStartProject={
                      onStartProjectAsset ? () => onStartProjectAsset(asset) : undefined
                    }
                    onToggleBatchSelect={
                      onToggleBatchSelect ? (e) => onToggleBatchSelect(asset.id, e) : undefined
                    }
                  />
                );
              })}
            </div>
          ) : (
            <div className="drawer-empty-placeholder">
              <span className="empty-emoji">📦</span>
              <span>「{folder.name}」暂时还没有素材，从上方上传或将其他素材移入这里吧！</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
