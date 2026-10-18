import { Check, FolderPlus, X } from 'lucide-react';
import type { Asset } from '../../types';
import type { MaterialFolder } from './folders';

export function MoveFolderModal({
  asset,
  batchCount,
  isOpen,
  onClose,
  folders,
  currentFolderId,
  onSelectTargetFolder,
  onOpenCreateFolder,
}: {
  asset?: Asset | null;
  batchCount?: number;
  isOpen: boolean;
  onClose: () => void;
  folders: MaterialFolder[];
  currentFolderId: string;
  onSelectTargetFolder: (targetFolderId: string) => void;
  onOpenCreateFolder: () => void;
}) {
  if (!isOpen) return null;
  if (!asset && !batchCount) return null;

  // 排除 'all'，因为全部不是具体的目标分类收纳夹
  const selectableFolders = folders.filter((f) => f.id !== 'all');
  const isBatch = Boolean(batchCount && batchCount > 1);

  return (
    <div className="folder-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="folder-modal-box move-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="folder-modal-header">
          <div className="folder-modal-title">
            <span className="folder-tab-emoji">📁</span>
            <div>
              <h3>{isBatch ? `批量移动 ${batchCount} 份素材` : '移动素材到分类文件夹'}</h3>
              <p title={asset?.name}>
                {isBatch
                  ? `将选中的 ${batchCount} 份素材一起归入指定分类收纳夹`
                  : `当前素材：${asset?.name || ''}`}
              </p>
            </div>
          </div>

          <button type="button" className="folder-modal-close" onClick={onClose} aria-label="关闭">
            <X size={16} />
          </button>
        </div>

        <div className="move-folder-list" role="menu">
          {selectableFolders.map((folder) => {
            const isCurrent = !isBatch && currentFolderId === folder.id;

            return (
              <button
                key={folder.id}
                type="button"
                role="menuitem"
                className={`move-folder-item ${isCurrent ? 'is-current' : ''}`}
                onClick={() => {
                  onSelectTargetFolder(folder.id);
                  onClose();
                }}
              >
                <div className="move-folder-meta">
                  <span className="move-folder-emoji">{folder.emoji}</span>
                  <div className="move-folder-text">
                    <strong>{folder.name}</strong>
                    <span>{folder.description}</span>
                  </div>
                </div>

                {isCurrent ? (
                  <span className="current-badge">
                    <Check size={12} /> 当前位置
                  </span>
                ) : (
                  <span className="move-action-text">{isBatch ? '全部移入' : '移入此处'}</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="move-folder-footer">
          <button
            type="button"
            className="create-new-folder-link"
            onClick={() => {
              onClose();
              onOpenCreateFolder();
            }}
          >
            <FolderPlus size={14} />
            <span>+ 新建并移入新的分类收纳夹</span>
          </button>
        </div>
      </div>
    </div>
  );
}
