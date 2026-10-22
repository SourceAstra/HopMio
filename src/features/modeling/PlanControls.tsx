import { Blocks, Sparkles } from 'lucide-react';
import { useStudio } from '../../state/StudioContext';
import { hasCurrentPlan } from './plan';

const shapeNames = {
  box: '方块',
  rounded_box: '精确圆角板',
  text: '真实文字实体',
  cylinder: '圆柱',
  ellipsoid: '椭球',
  star: '五角星',
  polygon: '轮廓挤出',
  revolve: '轮廓旋转',
  loft: '截面放样',
  sweep: '曲面扫掠',
  cushion: '轮廓曲面',
  cup: '带壁厚圆筒',
  usagi: '乌萨奇',
};

export function PlanControls() {
  const s = useStudio();
  const plan = s.spec.modeling_plan;
  const current = hasCurrentPlan(s.spec);
  const configured = !!s.preferences?.cloud_enabled && !!s.preferences?.chat_configured;
  return (
    <div className="modeling-plan">
      <div className="modeling-plan-heading">
        <Blocks size={18} />
        <strong>乌萨奇的造物方案</strong>
      </div>
      <p>{plan?.generator ? '注册生成器直接驱动本地 Blender，调整参数后保存新版本。照片仅供比对。' : 'AI 设计参数，Blender 在本地制作。照片用于外观参考，请确认尺寸与简化。'}</p>
      {!s.preferences?.blender?.available && (
        <button className="link" onClick={() => s.setRoom('settings')}>
          先安装本地 Blender →
        </button>
      )}
      {!plan?.generator && !configured && (
        <button className="link" onClick={() => s.setRoom('settings')}>
          请家长配置 AI 服务并开启云端 →
        </button>
      )}
      {!plan?.generator && <button
        className="secondary"
        disabled={
          s.busy || s.running || !configured || (!s.spec.prompt.trim() && !s.spec.asset_ids.length)
        }
        onClick={() => void s.design()}
      >
        <Sparkles size={16} /> {plan ? '让 AI 重新设计' : '让 AI 设计方案'}
      </button>}
      {plan && (
        <>
          <h3>{plan.title}</h3>
          <small>{plan.generator ? `本地生成器 v${plan.generator.version}` : `${plan.steps.length} 个步骤`} · 尺寸可在“调整作品”中修改</small>
          <ol className="modeling-steps">
            {plan.steps.map((step, index) => (
              <li key={index}>
                <span>{step.operation === 'add' ? '添' : '挖'}</span>
                <div>
                  <strong>{step.name}</strong>
                  <small>{shapeNames[step.shape]}</small>
                </div>
              </li>
            ))}
          </ol>
          {!!plan.assumptions.length && (
            <div className="modeling-assumptions">
              <strong>请一起确认</strong>
              {plan.assumptions.map((item, index) => (
                <p key={index}>{item}</p>
              ))}
            </div>
          )}
          {!current && <p className="modeling-assumptions">想法或材料已改变，请重新设计方案。</p>}
          <button
            className="primary generate"
            disabled={s.busy || s.running || !current || !s.preferences?.blender?.available}
            onClick={() => void s.generate()}
          >
            <Blocks size={18} /> 按方案生成模型
          </button>
          <small>执行现有方案不调用云端；每次生成保存为新版本。</small>
        </>
      )}
    </div>
  );
}
