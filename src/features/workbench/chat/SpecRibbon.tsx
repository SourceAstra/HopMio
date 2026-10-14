import { useRef, type RefObject } from 'react';
import {
  ChevronDown,
  ChevronUp,
  ImagePlus,
  Plus,
  Sliders,
} from 'lucide-react';
import { useStudio } from '../../../state/StudioContext';
import { Usagi } from '../../../components/Usagi';
import { SelectedMaterials } from '../../materials/SelectedMaterials';
import type { Spec } from '../../../types';

interface SpecRibbonProps {
  isOpen: boolean;
  onToggle: () => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onInspectPhoto?: (id: string) => void;
  inspectAssetId?: string | null;
}

export function SpecRibbon({
  isOpen,
  onToggle,
  fileInputRef,
  onInspectPhoto,
  inspectAssetId,
}: SpecRibbonProps) {
  const s = useStudio();
  const patch = (data: Partial<Spec>) => s.setSpec((old) => ({ ...old, ...data }));
  const hasPhotos = s.spec.asset_ids.length > 0;

  const templateMap: Record<string, string> = {
    usagi: '🐰 乌萨奇',
    cup: '✏️ 小笔筒',
    plaque: '🏷️ 小屋名牌',
  };

  return (
    <div className={`spec-ribbon-container ${isOpen ? 'is-open' : 'is-collapsed'}`}>
      {/* 折叠模式下的概要摘要条 */}
      <div className="spec-ribbon-summary" onClick={onToggle} role="button" tabIndex={0}>
        <div className="summary-left">
          <Sliders size={13} className="summary-icon" />
          <span className="summary-tag">物理定标</span>
          <span className="summary-chip">📏 {s.spec.height_mm || 80} mm</span>
          <span className="summary-chip">{s.spec.base ? '🧱 稳固底座' : '⚪ 无底座'}</span>
          {s.spec.mode === 'text' && s.spec.provider === 'local' && (
            <span className="summary-chip">{templateMap[s.spec.template] || '🐰 乌萨奇'}</span>
          )}
          {hasPhotos && <span className="summary-chip">📸 {s.spec.asset_ids.length} 张照片</span>}
        </div>
        <div className="summary-right">
          <span className="summary-toggle-text">{isOpen ? '收起参数' : '展开参数'}</span>
          {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </div>
      </div>

      {/* 展开时的参数配置抽屉 */}
      {isOpen && (
        <div className="spec-ribbon-body">
          {/* 参考照片滑轨或空状态 */}
          <div className="ribbon-photos-section">
            <div className="ribbon-section-header">
              <span className="ribbon-label">实物参考照片</span>
              <div className="ribbon-header-actions">
                <button
                  type="button"
                  className="compact-action-btn"
                  disabled={s.busy || s.running}
                  onClick={() => fileInputRef.current?.click()}
                  title="上传实物参考照片"
                >
                  <Plus size={12} /> 上传照片
                </button>
                <button
                  type="button"
                  className="compact-action-btn"
                  onClick={() => s.setRoom('materials')}
                  title="前往素材架挑选"
                >
                  <ImagePlus size={12} /> 素材架
                </button>
              </div>
            </div>

            {hasPhotos ? (
              <SelectedMaterials
                compact
                onInspectPhoto={onInspectPhoto}
                activeInspectId={inspectAssetId}
              />
            ) : (
              <div
                className="inspiration-empty-card"
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
              >
                <Usagi size={32} />
                <div className="empty-card-text">
                  <strong>上传实物多角度照片</strong>
                  <small>支持单张或多角度照片进行 3D 逆向定标</small>
                </div>
              </div>
            )}
          </div>

          {/* 尺寸高度与底座设置 */}
          <div className="physical-spec-rail">
            <div className="spec-item height-item">
              <span className="spec-label">高度</span>
              <div className="height-input-wrap">
                <input
                  type="number"
                  aria-label="实物目标高度"
                  min={10}
                  max={300}
                  value={s.spec.height_mm || 80}
                  disabled={s.busy || s.running}
                  onChange={(e) => patch({ height_mm: Number(e.target.value) || 80 })}
                />
                <small>mm</small>
              </div>
              <div className="quick-presets-group">
                {[50, 80, 120].map((h) => (
                  <button
                    key={h}
                    type="button"
                    className={`quick-preset-pill ${s.spec.height_mm === h ? 'active' : ''}`}
                    disabled={s.busy || s.running}
                    onClick={() => patch({ height_mm: h })}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>

            <label className="spec-base-toggle">
              <input
                type="checkbox"
                checked={!!s.spec.base}
                disabled={s.busy || s.running}
                onChange={(e) => patch({ base: e.target.checked })}
              />
              <span>加稳固底座</span>
            </label>
          </div>

          {/* 模板与浮雕选择 */}
          {s.spec.mode === 'text' && s.spec.provider === 'local' && (
            <div className="pill-choice-row" role="radiogroup" aria-label="造物模板">
              <button
                type="button"
                className={`choice-pill ${s.spec.template === 'usagi' ? 'active' : ''}`}
                onClick={() => patch({ template: 'usagi' })}
              >
                🐰 乌萨奇摆件
              </button>
              <button
                type="button"
                className={`choice-pill ${s.spec.template === 'cup' ? 'active' : ''}`}
                onClick={() => patch({ template: 'cup' })}
              >
                ✏️ 小笔筒
              </button>
              <button
                type="button"
                className={`choice-pill ${s.spec.template === 'plaque' ? 'active' : ''}`}
                onClick={() => patch({ template: 'plaque' })}
              >
                🏷️ 小屋名牌
              </button>
            </div>
          )}

          {s.spec.mode === 'relief' && (
            <div className="pill-choice-row" role="radiogroup" aria-label="浮雕类型">
              <button
                type="button"
                className={`choice-pill ${s.spec.relief_kind !== 'lithophane' ? 'active' : ''}`}
                onClick={() => patch({ relief_kind: 'relief' })}
              >
                凸起浅浮雕
              </button>
              <button
                type="button"
                className={`choice-pill ${s.spec.relief_kind === 'lithophane' ? 'active' : ''}`}
                onClick={() => patch({ relief_kind: 'lithophane' })}
              >
                透光照片
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
