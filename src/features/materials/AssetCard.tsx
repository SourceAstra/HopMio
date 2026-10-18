import { useState } from 'react';
import { Trash2, ZoomIn, Check, Star, Box, FolderInput, Sparkles } from 'lucide-react';
import { assetUrl } from '../../api/client';
import type { Asset } from '../../types';
import { isImageAsset, isModelAsset, type MaterialFolder } from './folders';

export function AssetCard({
  asset,
  folderMeta,
  disabled,
  isBatchSelected = false,
  onDelete,
  onPreview,
  onMoveFolder,
  onStartProject,
  onToggleBatchSelect,
}: {
  asset: Asset;
  folderMeta?: MaterialFolder;
  disabled?: boolean;
  isBatchSelected?: boolean;
  onDelete: () => void;
  onPreview: () => void;
  onMoveFolder?: () => void;
  onStartProject?: () => void;
  onToggleBatchSelect?: (e: React.MouseEvent) => void;
}) {
  const [imageError, setImageError] = useState(false);
  const isImage = isImageAsset(asset);
  const isModel = isModelAsset(asset);
  const ext = (asset.extension || '').toLowerCase();

  const typeLabel = isImage
    ? ext === '.png'
      ? '手绘图'
      : '照片'
    : isModel
      ? '3D模型'
      : '素材';

  return (
    <div
      data-asset-id={asset.id}
      className={`modern-asset-card ${isBatchSelected ? 'is-batch-selected' : ''}`}
      role="button"
      tabIndex={0}
      onClick={onPreview}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onPreview();
        }
      }}
      title={`点击放大查看或提取「${asset.name}」`}
    >
      {/* 批量多选勾选圆钮 */}
      {onToggleBatchSelect && (
        <button
          type="button"
          className={`card-batch-checkbox ${isBatchSelected ? 'checked' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleBatchSelect(e);
          }}
          title={isBatchSelected ? '取消多选' : '多选此项（支持按住 Shift 连选）'}
          aria-label={isBatchSelected ? '已多选' : '勾选多选'}
        >
          {isBatchSelected && <Check size={11} strokeWidth={3} />}
        </button>
      )}

      {/* 悬停快捷操作栏（立项造物、移动文件夹、放大镜与删除） */}
      <div className="asset-hover-actions">
        {onStartProject && (
          <button
            type="button"
            className="asset-action-circle create-btn"
            title="✨ 以此素材立项新造物…"
            aria-label="以此素材立项新造物"
            onClick={(e) => {
              e.stopPropagation();
              onStartProject();
            }}
          >
            <Sparkles size={13} />
          </button>
        )}

        {onMoveFolder && (
          <button
            type="button"
            className="asset-action-circle move-btn"
            title="移动到分类收纳夹…"
            aria-label="移动到分类文件夹"
            onClick={(e) => {
              e.stopPropagation();
              onMoveFolder();
            }}
          >
            <FolderInput size={13} />
          </button>
        )}

        <button
          type="button"
          className="asset-action-circle preview-btn"
          title="查看大图与详情"
          aria-label="查看大图"
          onClick={(e) => {
            e.stopPropagation();
            onPreview();
          }}
        >
          <ZoomIn size={13} />
        </button>

        <button
          type="button"
          className="asset-action-circle delete-btn"
          title={`从素材架删除 ${asset.name}`}
          aria-label={`从素材架删除 ${asset.name}`}
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(`从素材架移除“${asset.name}”？作品和历史版本中的引用将保留。`)) {
              onDelete();
            }
          }}
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* 视觉缩略图 */}
      <div className="asset-media-box">
        {isImage && !imageError ? (
          <img
            src={assetUrl(asset.id)}
            alt={asset.name}
            loading="lazy"
            draggable={false}
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="asset-3d-model-wrap">
            <Box size={32} className="model-box-icon" />
            <span className="model-ext-tag">{asset.extension.toUpperCase()}</span>
          </div>
        )}
      </div>

      {/* 底部元数据 */}
      <div className="asset-meta-info">
        <strong title={asset.name}>{asset.name}</strong>
        <div className="asset-sub-meta">
          <span>{Math.round(asset.bytes / 1024)} KB</span>
          <span className="meta-dot">·</span>
          <span>{typeLabel}</span>

          {folderMeta && (
            <>
              <span className="meta-dot">·</span>
              <button
                type="button"
                className="asset-inline-folder-btn"
                title={`所属分类：${folderMeta.name}，点击更换分类`}
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveFolder?.();
                }}
              >
                <span className="inline-folder-emoji">{folderMeta.emoji}</span>
                <span className="inline-folder-name">{folderMeta.name}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
