import { useEffect } from 'react';
import { X, Download, Sparkles } from 'lucide-react';
import { assetUrl, download } from '../../api/client';
import type { Asset } from '../../types';
import { isImageAsset } from './folders';

export function PhotoPreviewModal({
  asset,
  onClose,
  onStartProject,
}: {
  asset: Asset | null;
  onClose: () => void;
  onStartProject?: (asset: Asset) => void;
}) {
  useEffect(() => {
    if (!asset) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [asset, onClose]);

  if (!asset) return null;

  const isImage = isImageAsset(asset);

  return (
    <div className="material-preview-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="素材大图预览">
      <div className="material-preview-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-meta">
            <h4>{asset.name}</h4>
            <span className="modal-size-tag">
              {Math.round(asset.bytes / 1024)} KB · {asset.extension.toUpperCase()}
            </span>
          </div>

          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="关闭预览">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body-visual">
          {isImage ? (
            <img src={assetUrl(asset.id)} alt={asset.name} className="modal-large-img" />
          ) : (
            <div className="modal-model-placeholder">
              <span className="modal-model-emoji">📦</span>
              <p>3D 几何文件：{asset.name}</p>
              <small>可在造物工程中使用或导出至外部切片机</small>
            </div>
          )}
        </div>

        <div className="modal-footer-actions">
          <button
            type="button"
            className="secondary modal-download-btn"
            onClick={() => void download(asset.id, asset.name)}
            title="下载原文件到本地"
          >
            <Download size={14} />
            <span>提取并下载原文件</span>
          </button>

          {onStartProject && (
            <button
              type="button"
              className="primary modal-start-project-btn"
              onClick={() => {
                onClose();
                onStartProject(asset);
              }}
              title="以此素材开启新造物"
            >
              <Sparkles size={14} />
              <span>以此素材立项新造物 ✦</span>
            </button>
          )}

          <button
            type="button"
            className="secondary modal-close-action-btn"
            onClick={onClose}
          >
            <span>完成浏览</span>
          </button>
        </div>
      </div>
    </div>
  );
}
