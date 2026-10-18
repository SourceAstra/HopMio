import { Usagi } from '../../components/Usagi';
import { UploadCloud } from 'lucide-react';

export function MaterialsEmptyState({
  isFiltered,
  onResetFilter,
}: {
  isFiltered?: boolean;
  onResetFilter?: () => void;
}) {
  return (
    <div className="materials-empty-shelf">
      <div className="empty-shelf-visual">
        <Usagi size={88} />
      </div>

      <div className="empty-shelf-text">
        <h4>{isFiltered ? '没有找到符合条件的素材' : '素材架还是空的呢～'}</h4>
        <p>
          {isFiltered
            ? '尝试更换搜索词或切换分类标签，看看其他素材。'
            : '拖拽照片或模型到上方虚线框，或者点击“选择文件”，把第一个灵感装进小屋吧！'}
        </p>

        {isFiltered && onResetFilter ? (
          <button type="button" className="secondary empty-shelf-btn" onClick={onResetFilter}>
            清除筛选条件
          </button>
        ) : (
          <span className="empty-shelf-tag">
            <UploadCloud size={13} />
            支持手机拍照、涂鸦画作与 3D 打印模型
          </span>
        )}
      </div>
    </div>
  );
}
