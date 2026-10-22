import { SlidersHorizontal, RotateCcw, Scissors, Blocks, X, Layers } from 'lucide-react';
import { useStudio } from '../../state/StudioContext';
import { ParameterEditor } from '../modeling/ParameterEditor';
import { ParameterPanel } from '../modeling/ParameterPanel';
import type { Spec } from '../../types';
import { QualityReport } from '../reconstruction/QualityReport';
import { isPhotoMode } from '../../theme/modes';
import { patchDimensions } from '../modeling/dimensions';
import { ReconstructionDetails } from '../reconstruction/ReconstructionDetails';
import { useState } from 'react';

interface AdjustPanelProps {
  selectedPartId?: string | null;
  selectedPointMm?: [number, number, number] | null;
  activeStage?: number | null;
  onClose?: () => void;
}

export function AdjustPanel({
  selectedPartId,
  selectedPointMm,
  activeStage,
  onClose,
}: AdjustPanelProps = {}) {
  const s = useStudio();
  const patch = (data: Partial<Spec>) => s.setSpec((old) => patchDimensions(old, data));
  const [showPhotoDetails, setShowPhotoDetails] = useState(false);
  const selectedPart = s.spec.modeling_plan?.steps.find((step) => step.id === selectedPartId);

  const field = (
    name: keyof Spec,
    label: string,
    min: number,
    max: number,
    step: number,
    unit: string,
  ) => (
    <label className="slider-field" key={name}>
      <span>{label}</span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={Number(s.spec[name])}
        onChange={(e) => patch({ [name]: Number(e.target.value) })}
      />
      <div className="number-field">
        <input
          type="number"
          aria-label={label + '数值'}
          min={min}
          max={max}
          step={step}
          value={Number(s.spec[name])}
          onChange={(e) => patch({ [name]: Number(e.target.value) })}
        />
        <small>{unit}</small>
      </div>
      {isPhotoMode(s.spec.mode) && (
        <section className="panel">
          <h2>照片与尺度</h2>
          <p className="muted">原尺寸还原需要实物标尺；没有标尺时按所设高度等比制作。</p>
          <button
            className="secondary"
            disabled={s.busy || s.running}
            onClick={() => setShowPhotoDetails(true)}
          >
            主体范围、标尺与造物方式
          </button>
        </section>
      )}
    </label>
  );

  if (s.project?.model && (activeStage === 2 || activeStage === 4 || activeStage === null)) {
    return <aside className="adjust-stack local-parameter-inspector" aria-label="本地参数微调">
      <div className="adjust-drawer-header"><strong>参数微调</strong>{onClose && <button className="drawer-close-btn" onClick={onClose}><X size={14} />收起</button>}</div>
      <ParameterPanel project={s.project} />
    </aside>;
  }

  return (
    <aside className="adjust-stack" aria-label="阶段检视与微调面板">
      {/* 顶部检视栏标题与收起按钮 */}
      <div className="adjust-drawer-header">
        <div className="drawer-title-wrap">
          <SlidersHorizontal size={15} className="sparkle-gold" />
          <div className="drawer-title-text">
            <strong>
              {activeStage === 3
                ? '阶段 A: 摄影测量表面重构详情'
                : activeStage === 4
                  ? '阶段 B: Blender 切平定标微调'
                  : activeStage === 2
                    ? '② AI 大脑拓扑参数精修'
                    : activeStage === 1
                      ? '① 视觉视角与照片详情'
                      : activeStage === 5
                        ? '⑤ 3D 打印切片与就绪指标'
                        : '制造管线阶段微调'}
            </strong>
            <small>参数将作为下一版本的物理输入约束</small>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            className="drawer-close-btn"
            onClick={onClose}
            title="收起检视面板，腾出桌面空间"
          >
            <X size={14} /> 收起
          </button>
        )}
      </div>

      {/* 阶段 B：Blender 工业制造精修与切平控制 */}
      {(activeStage === 4 || activeStage === null || isPhotoMode(s.spec.mode)) && (
        <section className="panel stage-b-tuning-panel">
          <div className="panel-title">
            <h2>
              <Scissors size={18} /> 阶段 B: Blender 切平定标
            </h2>
            <span className="pill">制造参数</span>
          </div>
          <p className="tuning-desc">
            制作制造副本并复测尺寸。底座可以增加支撑面积；首层接触、薄壁和悬空部位需要在实际切片预览中检查。
          </p>
          <div className="tuning-items">
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={s.spec.base}
                onChange={(e) => patch({ base: e.target.checked })}
              />
              <strong>附加制造底座</strong>
            </label>
            <div className="tuning-metric-row">
              <span>首层接触检查</span>
              <strong>待实际切片确认</strong>
            </div>
            <div className="tuning-metric-row">
              <span>毫米级定标尺寸</span>
              <strong>{s.spec.height_mm || 80} mm 物理约束</strong>
            </div>
          </div>
        </section>
      )}

      {/* 参数调校面板 */}
      {!s.project?.model && (activeStage === 2 ||
        activeStage === 4 ||
        activeStage === null ||
        !isPhotoMode(s.spec.mode)) && (
        <section className="panel">
          <div className="panel-title">
            <h2>
              <SlidersHorizontal size={18} /> 调整作品参数
            </h2>
            <button
              className="link"
              disabled={!s.project}
              onClick={() => s.project && s.setSpec(s.project.spec)}
            >
              <RotateCcw size={13} /> 撤销修改
            </button>
          </div>

          {s.spec.provider === 'parametric' || s.spec.provider === 'reconstruction' ? (
            <>
              <ParameterEditor selectedPartId={selectedPartId} />
              {(selectedPart || selectedPointMm) && (
                <div className="selected-part-actions">
                  <strong>已选中：{selectedPart?.name || '模型表面位置'}</strong>
                  {selectedPointMm && (
                    <small>
                      X/Y/Z {selectedPointMm.map((value) => value.toFixed(1)).join(' / ')} mm。AI
                      微调会优先检查此处。
                    </small>
                  )}
                </div>
              )}
              <p className="muted">
                {s.spec.modeling_plan
                  ? '部件尺寸和壁厚由方案关系推导；生成后调用 AI 审阅成品，必要时提出一次修订。'
                  : '先让 AI 设计方案，再在这里确认和调整参数。'}
              </p>
            </>
          ) : s.spec.mode === 'import' ? (
            <p className="muted">导入模型保留原始尺寸。在体检室可通过 Blender 修复网格。</p>
          ) : (
            <>
              {field('height_mm', '高度', 10, 170, 1, 'mm')}
              {field(
                'width_mm',
                s.spec.template === 'cup' && s.spec.mode === 'text' ? '外径' : '宽度',
                10,
                170,
                1,
                'mm',
              )}
              {s.spec.mode === 'text' &&
                !['cup', 'plaque'].includes(s.spec.template) &&
                field('depth_mm', '深度', 5, 170, 1, 'mm')}
              {(s.spec.mode !== 'text' || ['cup', 'plaque'].includes(s.spec.template)) &&
                field(
                  'thickness_mm',
                  s.spec.template === 'cup' ? '壁厚' : '厚度',
                  0.8,
                  10,
                  0.2,
                  'mm',
                )}
              {s.spec.mode === 'text' &&
                s.spec.template === 'cup' &&
                field('bottom_mm', '底厚', 0.8, 10, 0.2, 'mm')}
              <div className="toggle-row">
                <label>
                  <input
                    type="checkbox"
                    checked={s.spec.base}
                    onChange={(e) => patch({ base: e.target.checked })}
                  />{' '}
                  加底座
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={s.spec.hole}
                    onChange={(e) => patch({ hole: e.target.checked })}
                  />{' '}
                  开挂孔
                </label>
              </div>
              {s.spec.hole && (
                <div className="pill-choice-row" role="radiogroup" aria-label="挂孔形状">
                  <button
                    type="button"
                    className={`choice-pill ${s.spec.hole_shape !== 'heart' ? 'active' : ''}`}
                    onClick={() => patch({ hole_shape: 'round' })}
                  >
                    圆形孔
                  </button>
                  <button
                    type="button"
                    className={`choice-pill ${s.spec.hole_shape === 'heart' ? 'active' : ''}`}
                    onClick={() => patch({ hole_shape: 'heart' })}
                  >
                    爱心孔
                  </button>
                </div>
              )}
            </>
          )}
          <small className="muted">
            {s.dirty ? '参数待应用：生成后保存为新版本。' : '当前参数已经保存。'}
          </small>
        </section>
      )}

      {/* 阶段 A：摄影测量质量报告 */}
      {(activeStage === 3 || activeStage === null || s.project?.model?.reconstruction) && (
        <QualityReport />
      )}
      {s.generationBlock && (
        <p className="surface-warning" role="status">
          {s.generationBlock}
        </p>
      )}
      <button
        type="button"
        className="primary generate adjust-apply-btn"
        title={s.generationBlock || '保存为新版本'}
        disabled={s.running || s.busy || !s.canGenerate}
        onClick={() => void s.generate()}
      >
        <Blocks size={15} /> {s.dirty ? '应用修改 · 生成新版本' : '生成模型'}
      </button>
      {showPhotoDetails && <ReconstructionDetails onClose={() => setShowPhotoDetails(false)} />}
    </aside>
  );
}
