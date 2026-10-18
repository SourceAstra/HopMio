import { useState } from 'react';
import { Images, X, ChevronDown, ChevronUp, LayoutGrid } from 'lucide-react';
import { assetUrl } from '../../api/client';
import { useStudio } from '../../state/StudioContext';
import { selectMaterials } from './selection';
import { isPhotoMode } from '../../theme/modes';
import { isImageAsset } from './folders';

interface SelectedMaterialsProps {
  compact?: boolean;
  onInspectPhoto?: (id: string) => void;
  activeInspectId?: string | null;
}

export function SelectedMaterials({
  compact = false,
  onInspectPhoto,
  activeInspectId,
}: SelectedMaterialsProps = {}) {
  const s = useStudio();
  const [isWallOpen, setIsWallOpen] = useState(false);
  const photos = s.spec.mode !== 'import';
  const minimum = s.preferences?.reconstruction?.min_photos || 3;
  const count = s.spec.asset_ids.length;
  const change = (ids: string[]) => s.setSpec((old) => selectMaterials(old, ids));
  if (!count) return null;
  return (
    <section className={`selected-materials ${compact ? 'compact' : ''}`} aria-label="本次造物材料">
      <div className="selected-materials-heading">
        <div className="selected-materials-title-group">
          <strong>
            <Images size={15} /> 已选 {count} {photos ? '张照片' : '份材料'}
          </strong>
          {photos && count > 1 && (
            <button
              type="button"
              className={`photo-wall-toggle-btn ${isWallOpen ? 'active' : ''}`}
              onClick={() => setIsWallOpen(!isWallOpen)}
              title={isWallOpen ? '收起为单行胶卷' : '下拉展开为照片墙'}
            >
              <LayoutGrid size={12} />
              <span>{isWallOpen ? '收起胶卷' : '照片墙'}</span>
              {isWallOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          )}
        </div>
        <div className="selected-materials-header-actions">
          {onInspectPhoto && (
            <span className="materials-click-tip">点击比对视角</span>
          )}
          <button className="link" disabled={s.busy || s.running} onClick={() => change([])}>
            清空
          </button>
        </div>
      </div>
      {!compact && s.spec.provider === 'reconstruction' && (
        <p className="selected-materials-hint">
          {count < minimum ? `还需 ${minimum - count} 张重叠视角照片` : '照片已选好，可以一键建模'}
        </p>
      )}
      {!compact && isPhotoMode(s.spec.mode) && s.spec.provider === 'parametric' && (
        <p className="selected-materials-hint">一张开始，补充照片继续细化当前造型</p>
      )}
      <div className={`selected-materials-list ${compact ? (isWallOpen ? 'photo-wall' : 'filmstrip') : ''}`}>
        {s.spec.asset_ids.map((id, index) => {
          const asset = s.assets.find((a) => a.id === id);
          const name = asset?.name || '材料信息暂未加载';
          const isActive = activeInspectId === id;
          return (
            <article key={id} className={`selected-material ${isActive ? 'active-inspect' : ''}`} data-asset-id={id}>
              <button
                className={`selected-material-preview ${isActive ? 'active-view' : ''}`}
                aria-label={`${name}，点击在中间视口比对`}
                title={`${name} (点击切换中间视口实物比对)`}
                disabled={s.busy || s.running}
                onClick={() => {
                  if (onInspectPhoto) {
                    onInspectPhoto(id);
                  } else {
                    change([id, ...s.spec.asset_ids.filter((value) => value !== id)]);
                  }
                }}
              >
                {isImageAsset(asset) ? (
                  <img src={assetUrl(id)} alt={name} />
                ) : (
                  <Images size={24} />
                )}
                <span className="photo-index-pill">{index === 0 ? '主' : index + 1}</span>
              </button>
              <button
                className="selected-material-remove"
                aria-label={`移除 ${name}`}
                title={`移除 ${name}`}
                disabled={s.busy || s.running}
                onClick={(e) => {
                  e.stopPropagation();
                  change(s.spec.asset_ids.filter((value) => value !== id));
                }}
              >
                <X size={12} />
              </button>
              {!compact && <small title={name}>{name}</small>}
            </article>
          );
        })}
      </div>
      {!compact && photos && (
        <small>第一张为主参考，可点缩略图更换；不要求必须是正面。× 只移除本次选择。</small>
      )}
    </section>
  );
}
