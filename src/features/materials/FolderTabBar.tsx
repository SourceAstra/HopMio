import { useState } from 'react';
import { Plus, Trash2, LayoutGrid, FolderTree, Search, X } from 'lucide-react';
import type { MaterialFolder } from './folders';

export type FolderViewMode = 'tab' | 'cabinet';

export function FolderTabBar({
  folders,
  activeFolderId,
  onSelectFolder,
  folderCounts,
  onOpenCreateModal,
  onDeleteCustomFolder,
  viewMode,
  onChangeViewMode,
  searchQuery,
  onSearchChange,
  disabled,
}: {
  folders: MaterialFolder[];
  activeFolderId: string;
  onSelectFolder: (folderId: string) => void;
  folderCounts: Record<string, number>;
  onOpenCreateModal: () => void;
  onDeleteCustomFolder: (folderId: string) => void;
  viewMode: FolderViewMode;
  onChangeViewMode: (mode: FolderViewMode) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  disabled?: boolean;
}) {
  const [hoveredFolderId, setHoveredFolderId] = useState<string | null>(null);

  return (
    <div className="folder-shelf-nav-wrap">
      {/* 顶部：文件夹书签收纳排 */}
      <div className="folder-tab-bar" role="tablist" aria-label="素材分类文件夹导航">
        <div className="folder-tabs-scroller">
          {folders.map((folder) => {
            const isActive = activeFolderId === folder.id;
            const count = folderCounts[folder.id] || 0;
            const isCustom = !folder.isBuiltIn;

            return (
              <div
                key={folder.id}
                className={`folder-tab-item ${isActive ? 'is-active' : ''} scheme-${folder.colorScheme}`}
                onMouseEnter={() => setHoveredFolderId(folder.id)}
                onMouseLeave={() => setHoveredFolderId(null)}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className="folder-tab-btn"
                  onClick={() => onSelectFolder(folder.id)}
                  title={folder.description}
                >
                  <span className="folder-tab-emoji" aria-hidden="true">
                    {folder.emoji}
                  </span>
                  <span className="folder-tab-name">{folder.name}</span>
                  <span className="folder-tab-count">{count}</span>
                </button>

                {/* 自定义文件夹允许删除 */}
                {isCustom && hoveredFolderId === folder.id && (
                  <button
                    type="button"
                    className="folder-tab-delete-btn"
                    title={`删除「${folder.name}」分类（素材将自动移至默认分类）`}
                    disabled={disabled}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (
                        window.confirm(
                          `确定删除分类文件夹“${folder.name}”吗？\n文件夹内的素材不会被删除，将自动回到对应默认分类中。`,
                        )
                      ) {
                        onDeleteCustomFolder(folder.id);
                      }
                    }}
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            );
          })}

          {/* 新建分类按钮 */}
          <button
            type="button"
            className="folder-tab-create-btn"
            disabled={disabled}
            onClick={onOpenCreateModal}
            title="新建一个自定义素材分类文件夹"
          >
            <Plus size={13} />
            <span>新建分类</span>
          </button>
        </div>
      </div>

      {/* 次级工具排：搜索框与视图模式切换 (单文件夹聚焦 / 全部分类抽屉柜) */}
      <div className="folder-sub-toolbar">
        {/* 搜索框 */}
        <div className="folder-search-wrap">
          <Search size={14} className="search-icon" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="搜索素材名称或类型…"
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

        {/* 右侧：视图模式切换 */}
        <div className="folder-view-switcher" role="radiogroup" aria-label="素材架展示模式">
          <button
            type="button"
            role="radio"
            aria-checked={viewMode === 'tab'}
            className={`view-switch-btn ${viewMode === 'tab' ? 'active' : ''}`}
            onClick={() => onChangeViewMode('tab')}
            title="单文件夹聚焦：仅展示当前选中分类的素材"
          >
            <LayoutGrid size={13} />
            <span>单分类聚焦</span>
          </button>

          <button
            type="button"
            role="radio"
            aria-checked={viewMode === 'cabinet'}
            className={`view-switch-btn ${viewMode === 'cabinet' ? 'active' : ''}`}
            onClick={() => onChangeViewMode('cabinet')}
            title="分类抽屉柜：像实体储物架一样，将每个文件夹作为独立抽屉分区分块展示"
          >
            <FolderTree size={13} />
            <span>分类抽屉柜</span>
          </button>
        </div>
      </div>
    </div>
  );
}
