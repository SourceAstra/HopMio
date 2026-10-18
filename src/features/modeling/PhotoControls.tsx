import { useState, useEffect } from 'react';
import { Sparkles, SlidersHorizontal, Cpu, Layers } from 'lucide-react';
import { useStudio } from '../../state/StudioContext';
import { ReconstructionDetails } from '../reconstruction/ReconstructionDetails';
import { ShapeDetails } from './ShapeDetails';
import { hasCurrentPlan } from './plan';
import { patchDimensions } from './dimensions';

export function PhotoBuildButton({ compact = false }: { compact?: boolean }) {
  const s = useStudio();
  return (
    <button
      className={compact ? 'primary' : 'primary generate pipeline-launch-btn'}
      disabled={s.busy || s.running || !s.canGenerate}
      onClick={() => {
        s.setRoom('desk');
        void s.generate();
      }}
      title="根据所选照片生成模型，按实际输出审阅造型。"
    >
      <Sparkles size={19} />
      <span className="launch-btn-main">
        {s.running ? '乌萨奇正在高速建模中…' : '✦ 一键建模'}
      </span>
      {!compact && (
        <span className="launch-btn-sub">照片建模 · 造型审阅与版本保存</span>
      )}
    </button>
  );
}

export function PhotoControls() {
  const s = useStudio();
  const [details, setDetails] = useState(false);
  const scan = s.spec.photo_policy !== 'parameters';
  const configured =
    hasCurrentPlan(s.spec) ||
    (!!s.preferences?.cloud_enabled &&
      !!s.preferences?.chat_configured &&
      !!s.preferences?.chat_supports_images);
  const photoCount = s.spec.asset_ids.length;
  const canScan = !!s.preferences?.reconstruction?.available && photoCount >= (s.preferences.reconstruction.min_photos || 3);
  const fidelity = s.project?.model?.photo_fidelity;
  const review = s.project?.model?.photo_review;
  const labels = { silhouette: '外轮廓', proportions: '主要比例', pose: '姿态', parts: '部件关系', details: '可见细节' };

  const [heightStr, setHeightStr] = useState<string>(String(s.spec.height_mm || 80));

  // 同步外部状态变更
  useEffect(() => {
    setHeightStr(String(s.spec.height_mm || 80));
  }, [s.spec.height_mm]);

  const handleHeightChange = (valStr: string) => {
    const sanitized = valStr.replace(/[^\d]/g, '');
    setHeightStr(sanitized);
    const num = parseInt(sanitized, 10);
    if (!isNaN(num) && num >= 10 && num <= 500) {
      s.setSpec((old) => patchDimensions(old, { height_mm: num }));
    }
  };

  const handleHeightBlur = () => {
    let num = parseInt(heightStr, 10);
    if (isNaN(num) || num < 10) {
      num = 10;
    } else if (num > 500) {
      num = 500;
    }
    setHeightStr(String(num));
    s.setSpec((old) => patchDimensions(old, { height_mm: num }));
  };

  const setPresetHeight = (h: number) => {
    setHeightStr(String(h));
    s.setSpec((old) => patchDimensions(old, { height_mm: h }));
  };

  return (
    <section className="modeling-plan surface-plan">
        <div className="pipeline-intent-badge">
          <Cpu size={14} /> AI 大脑 · 形体逆向定标
        </div>
        <div className="reconstruction-quick-params">
          <div className="quick-param-row">
            <label>
              <strong>实物目标高度</strong>
              <div className="number-input-group">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  aria-label="实物目标高度（毫米）"
                  value={heightStr}
                  disabled={s.busy || s.running}
                  onChange={(e) => handleHeightChange(e.target.value)}
                  onBlur={handleHeightBlur}
                />
                <span>mm</span>
              </div>
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={s.spec.base}
                disabled={s.busy || s.running}
                onChange={(e) => s.setSpec((old) => ({ ...old, base: e.target.checked }))}
              />
              <strong>加稳固底座</strong>
            </label>
          </div>

          <div className="quick-height-presets">
            <span className="preset-label">快捷高度：</span>
            {[
              { label: '50mm (小巧)', val: 50 },
              { label: '80mm (推荐)', val: 80 },
              { label: '120mm (大件)', val: 120 },
            ].map((p) => (
              <button
                key={p.val}
                type="button"
                className={`preset-pill ${s.spec.height_mm === p.val ? 'active' : ''}`}
                disabled={s.busy || s.running}
                onClick={() => setPresetHeight(p.val)}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="surface-actions">
            <PhotoBuildButton />
            <button className="secondary" onClick={() => setDetails(true)}>
              <SlidersHorizontal size={16} /> 细节调整
            </button>
          </div>

          <small>
            {scan
              ? `实物重建至少需要 ${s.preferences?.reconstruction?.min_photos || 3} 张重叠视角照片，建议覆盖正面、侧面、背面及顶部；照片数量达到门槛仍需通过实际配准。`
              : '当前是照片参考创作：AI 会推测深度、背面与缺失细节，不能保证实物精确还原。'}
          </small>
        </div>
      {fidelity && (
        <div className="photo-fidelity" role="status">
          <strong>{fidelity.status === 'observed_surface' ? '当前版本 · 观测表面' : review?.status === 'accepted' ? review.scope === 'design_intent' ? '当前版本 · 造型意图已审阅' : '当前版本 · 照片外观已审阅' : '当前版本 · 待改进草稿'}</strong>
          {review?.message && <p>{review.message}</p>}
          <p>
            {fidelity.basis === 'calibrated_views'
              ? `有效配准 ${fidelity.used_views}/${fidelity.input_views} 张，平均重投影误差 ${fidelity.reprojection_error_px?.toFixed(2)} px。`
              : `已参考 ${fidelity.input_views} 张照片，深度与缺失细节包含设计推测。`}
          </p>
          <details>
            <summary>观测与补全说明</summary>
            {fidelity.warnings.map((warning, index) => <p key={index}>{warning}</p>)}
            {review?.findings && Object.entries(review.findings).filter(([, finding]) => finding.status !== 'pass').map(([key, finding]) => (
              <p key={key}>{labels[key as keyof typeof labels]}：{finding.observation}</p>
            ))}
          </details>
        </div>
      )}
      {photoCount === 0 && <p className="surface-warning">先上传一张参考照片。</p>}
      {!canScan && !configured && (
        <button className="link" onClick={() => s.setRoom('settings')}>
          配置支持图片的 AI 服务 →
        </button>
      )}
      {!s.preferences?.blender?.available && (
        <button className="link" onClick={() => s.setRoom('settings')}>
          安装本地 Blender →
        </button>
      )}
      {details &&
        (scan ? (
          <ReconstructionDetails onClose={() => setDetails(false)} />
        ) : (
          <ShapeDetails onClose={() => setDetails(false)} />
        ))}
    </section>
  );
}
