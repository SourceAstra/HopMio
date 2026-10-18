import { Search, Trophy, Library, BookOpen, Printer, Plus, X } from 'lucide-react';

export type CollectionFilterTab = 'all' | 'exhibited' | 'unexhibited' | 'with_story' | 'printed';

export function CollectionFilterBar({
  mode,
  filter,
  onFilterChange,
  searchQuery,
  onSearchChange,
  displayedCount,
  onAction,
  actionDisabled,
}: {
  mode: 'gallery' | 'library';
  filter: CollectionFilterTab;
  onFilterChange: (tab: CollectionFilterTab) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  displayedCount: number;
  onAction: () => void;
  actionDisabled?: boolean;
}) {
  const isGallery = mode === 'gallery';

  const filterTabs = isGallery
    ? [
        { id: 'all' as const, label: '全部展品', Icon: Trophy },
        { id: 'with_story' as const, label: '有造物故事', Icon: BookOpen },
        { id: 'printed' as const, label: '已实物制造', Icon: Printer },
      ]
    : [
        { id: 'all' as const, label: '全部作品', Icon: Library },
        { id: 'exhibited' as const, label: '已在展厅', Icon: Trophy },
        { id: 'unexhibited' as const, label: '未入展厅', Icon: Library },
        { id: 'printed' as const, label: '已实物制造', Icon: Printer },
      ];

  return (
    <div className="collection-filter-bar">
      {/* 分类药丸组 */}
      <div className="filter-pill-group" role="tablist" aria-label="作品分类筛选">
        {filterTabs.map(({ id, label, Icon }) => {
          const isActive = filter === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`filter-pill ${isActive ? 'active' : ''}`}
              onClick={() => onFilterChange(id)}
            >
              <Icon size={13} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      {/* 搜索框 */}
      <div className="filter-search-wrap">
        <Search size={14} className="search-icon" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="搜索作品名称或故事…"
          aria-label="搜索作品"
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

      {/* 右侧统计与主操作 */}
      <div className="filter-right-meta">
        <span className="shelf-total-badge">
          显示 <strong>{displayedCount}</strong> 件
        </span>

        <button
          type="button"
          className="primary filter-action-btn"
          disabled={actionDisabled}
          onClick={onAction}
          title={isGallery ? '去作品柜挑选心爱作品加入展厅' : '创建一件全新的作品'}
        >
          {isGallery ? (
            <>
              <Library size={14} />
              <span>挑选展品</span>
            </>
          ) : (
            <>
              <Plus size={15} />
              <span>新作品</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
