import { Trash2, X, AlertCircle } from 'lucide-react';
import type { InspirationItem } from '../../theme/inspirations';

interface InspirationDeleteConfirmModalProps {
  isOpen: boolean;
  item: InspirationItem | null;
  onConfirm: () => void;
  onClose: () => void;
}

export function InspirationDeleteConfirmModal({
  isOpen,
  item,
  onConfirm,
  onClose,
}: InspirationDeleteConfirmModalProps) {
  if (!isOpen || !item) return null;

  return (
    <div className="craft-launch-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="craft-launch-card inspiration-delete-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="launch-card-header">
          <div className="launch-card-title-group">
            <span className="launch-card-icon-badge badge-warning">
              <Trash2 size={20} className="icon-orange" />
            </span>
            <div>
              <h2 className="launch-card-title">放飞这个灵感？</h2>
              <p className="launch-card-subtitle">
                乌萨奇会把它从宝箱中取出
              </p>
            </div>
          </div>
          <button
            type="button"
            className="launch-modal-close-btn"
            onClick={onClose}
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>

        <div className="delete-target-preview">
          <span className="target-emoji">{item.emoji}</span>
          <div className="target-info">
            <h4 className="target-title">{item.title}</h4>
            <p className="target-desc">{item.desc || item.prompt}</p>
          </div>
        </div>

        <p className="delete-confirm-hint">
          <AlertCircle size={14} /> 放飞后该灵感将从你的宝箱中移除。如果想念它，随时可以再次录入！
        </p>

        <div className="inspiration-editor-actions">
          <button
            type="button"
            className="secondary launch-btn-cancel"
            onClick={onClose}
          >
            保留灵感
          </button>
          <button
            type="button"
            className="danger-btn launch-btn-danger"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            <Trash2 size={16} />
            <span>确认放飞</span>
          </button>
        </div>
      </div>
    </div>
  );
}
