import { useId, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useStudio } from '../../state/StudioContext';
import { adjustmentSpec } from './plan';

export function AiAdjustment() {
  const s = useStudio();
  const id = useId();
  const [instruction, setInstruction] = useState('');
  const available = !!s.preferences?.cloud_enabled && !!s.preferences.chat_configured;
  const modelSpec = adjustmentSpec(s.project, s.spec);
  const hasModel = !!modelSpec;
  const active = s.job?.kind === 'adjust' && s.job.project_id === s.project?.id;
  const latest = s.project?.model?.adjustment;
  const locked = Object.values(modelSpec?.modeling_plan?.parameters || {}).filter((p) => p.locked);

  return (
    <section className="modeling-plan ai-adjustment">
      <h3>
        <Sparkles size={17} /> AI 微调
      </h3>
      <p>告诉乌萨奇哪里要改，基于当前造型继续调整。</p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (!instruction.trim() || !available || !modelSpec || s.busy || s.running) return;
          s.setNotice('');
          if (await s.generate({ schema_version: 1, instruction: instruction.trim() }, modelSpec))
            setInstruction('');
        }}
      >
        <label htmlFor={id}>微调要求</label>
        <textarea
          id={id}
          rows={3}
          maxLength={2000}
          placeholder="说清想调整的部位、大小或方向；其余形状和尺寸保持不变。"
          value={instruction}
          disabled={s.busy || s.running}
          onChange={(event) => setInstruction(event.target.value)}
        />
        <div className="ai-adjustment-actions">
          <small>修改成功后保存新版本，原版本可回退。</small>
          <button
            type="submit"
            className="primary"
            disabled={
              s.busy ||
              s.running ||
              !available ||
              !hasModel ||
              !s.preferences?.chat_supports_images ||
              !instruction.trim() ||
              !s.preferences?.blender?.available
            }
          >
            <Sparkles size={16} /> {active && s.running ? '正在微调…' : 'AI 微调'}
          </button>
        </div>
      </form>
      {!hasModel && <p>先用一键建模生成初稿，再继续调整。</p>}
      {!available && (
        <button className="link" onClick={() => s.setRoom('settings')}>
          配置 AI 服务 →
        </button>
      )}
      {available && !s.preferences?.chat_supports_images && (
        <small>当前模型不支持图片输入，无法核对微调前后的实际造型；请选择支持图片的模型。</small>
      )}
      {locked.length > 0 && (
        <small>
          已固定：{locked.map((p) => p.label).join('、')}。需要 AI 修改时，请先解除固定。
        </small>
      )}
      {active && (
        <div aria-live="polite">
          <p>{s.job!.adjustment?.instruction}</p>
          {s.running ? (
            <p>
              {s.job!.message} · {s.job!.progress}%
            </p>
          ) : (
            <p>{s.job!.message}</p>
          )}
          {!s.running && s.job!.status !== 'succeeded' && (
            <button
              className="link"
              onClick={() => setInstruction(s.job!.adjustment?.instruction || '')}
            >
              修改这条要求
            </button>
          )}
        </div>
      )}
      {latest && (
        <details className="ai-adjustment-result">
          <summary>上次微调 · 已保存</summary>
          <p>{latest.instruction}</p>
          {latest.changes.length > 0 && <p>{latest.changes.slice(0, 4).join('；')}</p>}
          {latest.parts.length > 0 && (
            <small>
              涉及部件：{latest.parts.slice(0, 6).join('、')}
              {latest.parts.length > 6 ? '等' : ''}
            </small>
          )}
        </details>
      )}
    </section>
  );
}
