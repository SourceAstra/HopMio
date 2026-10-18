import { modes } from '../../theme/modes';
import type { Mode } from '../../types';

export function ModeSelector({
  activeMode,
  onSelectMode,
  disabled,
}: {
  activeMode: Mode;
  onSelectMode: (mode: Mode) => void;
  disabled?: boolean;
}) {
  const materialModes = modes.filter((m) => m.id !== 'text');

  const getModeHint = (id: Mode) => {
    switch (id) {
      case 'image':
        return '一张照片起步 · 补充多图继续细化';
      case 'multiview':
        return '需 8~96 张充分重叠的多角度环拍';
      case 'silhouette':
        return '清晰轮廓或涂鸦 · 生成有厚度挂件';
      case 'relief':
        return '单张照片 · 随明暗长出浮雕高低起伏';
      case 'import':
        return '支持 STL / GLB / 3MF 或 .usagi 工程';
      default:
        return '';
    }
  };

  return (
    <section className="materials-mode-section" aria-label="造物玩法选择">
      <div className="mode-section-head">
        <div>
          <h3>选择素材造物玩法</h3>
          <p>不同的素材类型对应不同的算法与制造形式，点击即可切换当前工坊模式。</p>
        </div>
      </div>

      <div className="mode-cards-grid" role="tablist" aria-label="模式玩法列表">
        {materialModes.map((m) => {
          const isSelected = activeMode === m.id;
          const hint = getModeHint(m.id);

          return (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              disabled={disabled}
              className={`mode-bento-card ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelectMode(m.id)}
            >
              <div className="mode-card-top-row">
                <span className="mode-emoji-box">{m.emoji}</span>
                <span className={`mode-badge-pill ${isSelected ? 'active' : ''}`}>{m.badge}</span>
              </div>

              <div className="mode-card-text">
                <strong>{m.name}</strong>
                <small>{m.description}</small>
              </div>

              {hint && (
                <div className="mode-card-footer-hint">
                  <span>💡 {hint}</span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
