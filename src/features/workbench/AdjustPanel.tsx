import {
  SlidersHorizontal,
  RotateCcw,
  Scissors,
  Blocks,
  X,
  Layers,
} from 'lucide-react';
import { useStudio } from '../../state/StudioContext';
import { ParameterEditor } from '../modeling/ParameterEditor';
import type { Spec } from '../../types';
import { QualityReport } from '../reconstruction/QualityReport';
import { isPhotoMode } from '../../theme/modes';

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
  const patch = (data: Partial<Spec>) => s.setSpec((old) => ({ ...old, ...data }));
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
    </label>
  );

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
            <span className="pill success">Bed Cut 刀刃切平</span>
          </div>
          <p className="tuning-desc">
            接管阶段 A 裸网格：执行微破洞缝合、拉普拉斯微光顺与<strong>打印床水平切平</strong>，消除悬空点，确保首层 100% 牢固附着。
          </p>
          <div className="tuning-items">
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={s.spec.base}
                onChange={(e) => patch({ base: e.target.checked })}
              />
              <strong>加厚稳固打印基座 (Bed Plate)</strong>
            </label>
            <div className="tuning-metric-row">
              <span>接触面平整度</span>
              <strong className="text-green">Bed Cut: 水平校准</strong>
            </div>
            <div className="tuning-metric-row">
              <span>毫米级定标尺寸</span>
              <strong>{s.spec.height_mm || 80} mm 物理约束</strong>
            </div>
          </div>
        </section>
      )}

      {/* 参数调校面板 */}
      {(activeStage === 2 || activeStage === null || !isPhotoMode(s.spec.mode)) && (
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

          {s.spec.provider === 'parametric' ? (
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
              <div className="adjust-actions">
                <button
                  type="button"
                  className="primary generate adjust-apply-btn"
                  disabled={s.running || s.busy || !s.canGenerate}
                  onClick={() => void s.generate()}
                  title="按修改后的参数在本地 Blender 重新生成模型（不消耗云端 AI）"
                >
                  <Blocks size={15} /> {s.dirty ? '应用修改 · 重新生成模型' : '重新生成 3D 模型'}
                </button>
              </div>
              <p className="muted">
                {s.spec.modeling_plan
                  ? '只修改方案参数；部件尺寸和壁厚由方案关系推导。生成不调用 AI。'
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
    </aside>
  );
}
