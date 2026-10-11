import { SlidersHorizontal, RotateCcw, Lightbulb, Layers, Printer } from 'lucide-react';
import { useStudio } from '../../state/StudioContext';
import type { Spec } from '../../types';
export function AdjustPanel() {
  const s = useStudio();
  const patch = (data: Partial<Spec>) => s.setSpec((old) => ({ ...old, ...data }));
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
    <aside className="adjust-stack">
      <section className="panel">
        <div className="panel-title">
          <h2>
            <SlidersHorizontal size={20} /> 调整作品
          </h2>
          <button
            className="link"
            disabled={!s.project}
            onClick={() => s.project && s.setSpec(s.project.spec)}
          >
            <RotateCcw size={14} /> 撤销修改
          </button>
        </div>
        {field('height_mm', '高度', 10, 170, 1, 'mm')}
        {field('width_mm', '宽度', 10, 170, 1, 'mm')}
        {field('depth_mm', '深度', 5, 170, 1, 'mm')}
        {field('thickness_mm', '厚度', 0.8, 10, 0.2, 'mm')}
        {['usagi', 'bunny'].includes(s.spec.template) &&
          s.spec.mode === 'text' &&
          s.spec.provider === 'local' &&
          field('ear_scale', '耳朵加长', 0.7, 2, 0.1, '倍')}
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
          <select
            aria-label="挂孔形状"
            value={s.spec.hole_shape}
            onChange={(e) => patch({ hole_shape: e.target.value })}
          >
            <option value="round">圆形孔</option>
            <option value="heart">爱心孔</option>
          </select>
        )}
        <small className="muted">
          {s.dirty ? '参数待应用：生成后保存为新版本。' : '当前参数已经保存。'}{' '}
          云端自由模型重新生成会消耗额度。
        </small>
      </section>
      {s.project?.model &&
        (s.spec.provider === 'meshy' || ['image', 'multiview', 'import'].includes(s.spec.mode)) && (
          <button
            className="secondary"
            disabled={s.busy || s.running}
            onClick={() => void s.generate(false, true)}
          >
            本地调整尺寸 / 底座 / 挂孔
          </button>
        )}
      <section className="panel print-tip">
        <h2>
          <Lightbulb size={21} /> 打印小贴士
        </h2>
        <p>
          <Printer size={20} /> 拓竹 A1 mini · 单色
        </p>
        <p>
          材料 <strong>{s.profile.material}</strong>
          <span>180 × 180 × 180 mm</span>
        </p>
        <div className="soft-notice">
          {s.project?.validation?.can_prepare
            ? '基础体检通过，继续检查切片与支撑。'
            : '模型体检后再进入打印准备。'}
        </div>
      </section>
      <section className="panel version-card">
        <h2>
          <Layers size={20} /> 版本 {String(s.project?.revision_count || 0).padStart(2, '0')}
        </h2>
        <p>{s.project?.model?.origin || '还没有模型'}</p>
        <span className="pill">
          {s.project?.model
            ? `${s.project.model.faces.toLocaleString()} 个三角面`
            : '等待第一次造物'}
        </span>
        <button className="link" onClick={() => s.setRoom('library')}>
          查看作品与版本 →
        </button>
      </section>
    </aside>
  );
}
