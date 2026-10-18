import { Usagi } from '../../components/Usagi';
import { Trophy, Plus, Library, Sparkles } from 'lucide-react';

export function CollectionEmptyState({
  mode,
  isFiltered,
  onResetFilter,
  onAction,
}: {
  mode: 'gallery' | 'library';
  isFiltered?: boolean;
  onResetFilter?: () => void;
  onAction?: () => void;
}) {
  const isGallery = mode === 'gallery';

  return (
    <div className="collection-empty-box">
      <div className="empty-box-visual">
        <Usagi size={110} />
      </div>

      <div className="empty-box-content">
        <div className="empty-box-badge">
          <Sparkles size={13} />
          <span>{isGallery ? '乌萨奇的故事展厅' : '灵感作品柜'}</span>
        </div>

        <h3>
          {isFiltered
            ? '没有找到符合条件的作品'
            : isGallery
              ? '展厅等待陈列你的第一件得意之作'
              : '给小屋添一件自己的专属作品'}
        </h3>

        <p>
          {isFiltered
            ? '尝试更换搜索词或选择其他分类标签。'
            : isGallery
              ? '在作品柜中挑选喜欢的作品，点击「放入展厅」，它们就会陈列在这面温暖的荣誉故事墙上。'
              : '说出你的想法、随手拍一张照片，乌萨奇会陪你把它在 3D 雕刻台上变成真正的形状。'}
        </p>

        <div className="empty-box-actions">
          {isFiltered && onResetFilter && (
            <button type="button" className="secondary empty-btn" onClick={onResetFilter}>
              清除筛选条件
            </button>
          )}

          {!isFiltered && onAction && (
            <button type="button" className="primary empty-btn" onClick={onAction}>
              {isGallery ? (
                <>
                  <Library size={16} />
                  <span>去作品柜挑选展品</span>
                </>
              ) : (
                <>
                  <Plus size={16} />
                  <span>开启第一件作品</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
