import { Trash2, FolderInput, CheckSquare, Sparkles, X, Check } from 'lucide-react';

export function BatchActionBar({
  selectedCount,
  totalVisibleCount,
  onSelectAll,
  onInvert,
  onClear,
  onBatchStartProject,
  onAddToProject,
  onBatchDelete,
  onBatchMove,
  disabled,
}: {
  selectedCount: number;
  totalVisibleCount: number;
  onSelectAll: () => void;
  onInvert: () => void;
  onClear: () => void;
  onBatchStartProject?: () => void;
  onAddToProject?: () => void;
  onBatchDelete: () => void;
  onBatchMove: () => void;
  disabled?: boolean;
}) {
  if (selectedCount === 0) return null;

  const isAllSelected = selectedCount >= totalVisibleCount && totalVisibleCount > 0;

  return (
    <aside className="materials-batch-action-bar" aria-label="素材批量管理栏">
      {/* 左侧：已选计数与全选/清空快捷按钮 */}
      <div className="batch-bar-left">
        <div className="batch-count-pill">
          <CheckSquare size={14} className="batch-count-icon" />
          <span>
            已多选 <strong>{selectedCount}</strong> 份素材
          </span>
        </div>

        <div className="batch-quick-toggles">
          <button
            type="button"
            className="batch-toggle-btn"
            onClick={isAllSelected ? onClear : onSelectAll}
            title={isAllSelected ? '取消全选' : '全选当前分类全部素材'}
          >
            {isAllSelected ? '取消全选' : `全选 (${totalVisibleCount})`}
          </button>

          <button
            type="button"
            className="batch-toggle-btn"
            onClick={onInvert}
            title="反向选择当前分类素材"
          >
            反选
          </button>
        </div>
      </div>

      {/* 右侧：批量操作动作群 */}
      <div className="batch-bar-actions">
        {onAddToProject && <button type="button" className="batch-action-btn" disabled={disabled} onClick={onAddToProject}><Check size={14} />加入当前作品</button>}
        {/* 批量立项新造物 */}
        {onBatchStartProject && (
          <button
            type="button"
            className="batch-action-btn create-btn primary-batch-btn"
            disabled={disabled}
            onClick={onBatchStartProject}
            title="围绕所选素材立项开启全新造物工程"
          >
            <Sparkles size={14} />
            <span>立项新造物 ({selectedCount})</span>
          </button>
        )}

        {/* 批量移至分类文件夹 */}
        <button
          type="button"
          className="batch-action-btn move-btn"
          disabled={disabled}
          onClick={onBatchMove}
          title="将选中的素材批量移动到指定分类文件夹"
        >
          <FolderInput size={14} />
          <span>批量移入收纳夹</span>
        </button>



        {/* 核心需求：批量删除 */}
        <button
          type="button"
          className="batch-action-btn delete-btn"
          disabled={disabled}
          onClick={onBatchDelete}
          title="从素材架移除，保留作品历史引用"
        >
          <Trash2 size={14} />
          <span>从素材架移除 ({selectedCount})</span>
        </button>

        {/* 退出多选 */}
        <button
          type="button"
          className="batch-close-btn"
          onClick={onClear}
          title="清空选择并关闭批量管理"
          aria-label="关闭批量操作"
        >
          <X size={14} />
        </button>
      </div>
    </aside>
  );
}
