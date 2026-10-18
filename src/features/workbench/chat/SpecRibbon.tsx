import { useState, useRef, type RefObject } from 'react';
import {
  ChevronDown,
  ChevronUp,
  ImagePlus,
  Plus,
  Sliders,
  FolderOpen,
} from 'lucide-react';
import { useStudio } from '../../../state/StudioContext';
import { Usagi } from '../../../components/Usagi';
import { SelectedMaterials } from '../../materials/SelectedMaterials';
import { MaterialPickerModal } from '../../materials/MaterialPickerModal';
import type { Spec } from '../../../types';
import { canSetHeight, patchDimensions } from '../../modeling/dimensions';
import { selectMaterials } from '../../materials/selection';

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
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const patch = (data: Partial<Spec>) => s.setSpec((old) => patchDimensions(old, data));
  const hasPhotos = s.spec.asset_ids.length > 0;

  const handleConfirmPicker = (selectedIds: string[]) => {
    s.setSpec((old) => selectMaterials(old, selectedIds));
    s.setNotice(`已更新当前作品的参考照片（共 ${selectedIds.length} 张）`);
  };

  const templateMap: Record<string, string> = {
    usagi: '乌萨奇',
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
            <span className="summary-chip">{templateMap[s.spec.template] || '乌萨奇'}</span>
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
                  title="上传本地参考照片"
                >
                  <Plus size={12} /> 本地上传
                </button>
                <button
                  type="button"
                  className="compact-action-btn highlight"
                  disabled={s.busy || s.running}
                  onClick={() => setIsPickerOpen(true)}
                  title="从素材灵感架挑选已有照片加入当前作品"
                >
                  <FolderOpen size={12} /> 从素材架挑选
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
              <div className="inspiration-empty-card">
                <Usagi size={32} />
                <div className="empty-card-text">
                  <strong>添加实物参考照片</strong>
                  <small>支持单张或多角度照片进行 3D 逆向定标与细节雕刻</small>
                </div>
                <div className="empty-card-actions-row">
                  <button
                    type="button"
                    className="compact-action-btn primary-action"
                    onClick={() => setIsPickerOpen(true)}
                  >
                    <FolderOpen size={12} /> 从素材架选用
                  </button>
                  <button
                    type="button"
                    className="compact-action-btn secondary-action"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Plus size={12} /> 本地上传
                  </button>
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
                  disabled={s.busy || s.running || !canSetHeight(s.spec) || !!s.spec.reconstruction_plan?.scale_reference}
                  title={canSetHeight(s.spec) ? '按有效方案设置高度' : '此方案请在右侧参数面板调整实际尺寸'}
                  onChange={(e) => { if (e.target.value && e.target.validity.valid) patch({ height_mm: Number(e.target.value) }); }}
                />
                <small>mm</small>
              </div>
              <div className="quick-presets-group">
                {[50, 80, 120].map((h) => (
                  <button
                    key={h}
                    type="button"
                    className={`quick-preset-pill ${s.spec.height_mm === h ? 'active' : ''}`}
                    disabled={s.busy || s.running || !canSetHeight(s.spec) || !!s.spec.reconstruction_plan?.scale_reference}
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
              <span>附加制造底座</span>
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
                乌萨奇摆件
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

      {/* 从素材灵感架挑选照片加入当前作品弹窗 */}
      <MaterialPickerModal
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        onConfirm={handleConfirmPicker}
        currentAssetIds={s.spec.asset_ids}
        limit={['relief', 'silhouette'].includes(s.spec.mode) ? 1 : 96}
      />
    </div>
  );
}
