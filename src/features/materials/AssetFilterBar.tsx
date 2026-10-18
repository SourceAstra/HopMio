import { Search, Layers, Images, Box, X } from 'lucide-react';

export type AssetFilterType = 'all' | 'image' | 'model';

export function AssetFilterBar({
  filter,
  onFilterChange,
  searchQuery,
  onSearchChange,
  totalCount,
  selectedCount,
  onClearSelected,
  disabled,
}: {
  filter: AssetFilterType;
  onFilterChange: (type: AssetFilterType) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  totalCount: number;
  selectedCount: number;
  onClearSelected?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="asset-filter-bar">
      {/* 左侧分类小药丸 */}
      <div className="filter-pill-group" role="tablist" aria-label="素材类型过滤">
        <button
          type="button"
          role="tab"
          aria-selected={filter === 'all'}
          className={`filter-pill ${filter === 'all' ? 'active' : ''}`}
          onClick={() => onFilterChange('all')}
        >
          <Layers size={13} />
          <span>全部</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={filter === 'image'}
          className={`filter-pill ${filter === 'image' ? 'active' : ''}`}
          onClick={() => onFilterChange('image')}
        >
          <Images size={13} />
          <span>参考照片</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={filter === 'model'}
          className={`filter-pill ${filter === 'model' ? 'active' : ''}`}
          onClick={() => onFilterChange('model')}
        >
          <Box size={13} />
          <span>3D 模型</span>
        </button>
      </div>

      {/* 中间搜索框 */}
      <div className="filter-search-wrap">
        <Search size={14} className="search-icon" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="搜索素材名称…"
          aria-label="搜索素材"
        />
        {searchQuery && (
          <button
            type="button"
            className="clear-search-btn"
            onClick={() => onSearchChange('')}
            title="清空搜索"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* 右侧统计与清空操作 */}
      <div className="filter-right-meta">
        <span className="shelf-total-badge">
          显示 <strong>{totalCount}</strong> 份
        </span>

        {selectedCount > 0 && onClearSelected && (
          <button
            type="button"
            className="clear-selected-link"
            disabled={disabled}
            onClick={onClearSelected}
            title="清空当前所有选中素材"
          >
            清空本次选择 ({selectedCount})
          </button>
        )}
      </div>
    </div>
  );
}
