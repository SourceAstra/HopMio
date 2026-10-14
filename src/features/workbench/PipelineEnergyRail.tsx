import { Fragment } from 'react';
import { Camera, Cpu, Layers, Scissors, CheckCircle2, Check, Sparkles } from 'lucide-react';
import { useStudio } from '../../state/StudioContext';
import { isPhotoMode } from '../../theme/modes';

export function PipelineEnergyRail() {
  const s = useStudio();
  const model = s.project?.model;
  const photoCount = s.spec.asset_ids.length;
  const isPhoto = isPhotoMode(s.spec.mode);
  const hasModel = !!model;
  const stageAComplete = hasModel && (!!model.reconstruction || !!model.source_glb_id);
  const stageBComplete = hasModel && !s.dirty;

  // 1. 精确推导当前运行/就绪的步骤序号 (1 ~ 5)
  let activeStep = 1;
  if (s.running) {
    if (s.job?.kind === 'slice') {
      activeStep = 5;
    } else if (s.job?.kind === 'reconstruction') {
      activeStep = 3;
    } else if (s.job?.kind === 'plan') {
      activeStep = 2;
    } else {
      // kind === 'generate' | 'adjust' | 'repair'
      const p = s.job?.progress ?? 0;
      const msg = s.job?.message || '';
      if (p < 10) {
        activeStep = 2; // AI 规划/理解微调中
      } else if (p >= 58 && p <= 64) {
        activeStep = 2; // AI 外形多模态审阅与几何方案修订
      } else if (
        p >= 10 &&
        p < 30 &&
        (msg.includes('摄影测量') || msg.includes('稠密') || msg.includes('点云'))
      ) {
        activeStep = 3;
      } else {
        activeStep = 4; // Blender 实体构建、曲面融合、水平切平
      }
    }
  } else {
    if (!photoCount && isPhoto) {
      activeStep = 1;
    } else if (!hasModel && (!s.spec.modeling_plan || s.dirty)) {
      activeStep = 2;
    } else if (stageBComplete) {
      activeStep = 5;
    } else if (s.dirty) {
      activeStep = 4;
    } else {
      activeStep = 2;
    }
  }

  // 实时 AI 思考与流式进度提取
  const aiDiag = s.job?.ai_diagnostics;
  const aiElapsed = aiDiag?.elapsed_seconds ?? 0;
  const aiChars = aiDiag?.text_chars ?? 0;

  // 阶段 1：视觉多视角采集
  const step1Passed = photoCount > 0 || !isPhoto;
  const step1Running = s.running && activeStep === 1;
  const step1Status = step1Running
    ? '正在提取特征点与视角几何…'
    : photoCount > 0
      ? `${photoCount} 张实物照片已就位`
      : isPhoto
        ? '待选择或上传参考照片'
        : '纯文字模式，无须照片';

  // 阶段 2：AI 大脑拓扑推演
  const step2Passed = (hasModel || !!s.spec.modeling_plan) && (activeStep > 2 || !s.running);
  const step2Running = s.running && activeStep === 2;
  let step2Status = '待解析构型与拓扑意图';
  if (step2Running) {
    if (aiDiag?.phase === 'thinking') {
      step2Status = `AI 正在深度思考方案 (${aiElapsed}s)…`;
    } else if (aiDiag?.phase === 'content') {
      step2Status = `AI 正在输出几何拓扑 (已规划 ${aiChars} 字)…`;
    } else if (s.job?.progress && s.job.progress >= 58 && s.job.progress <= 64) {
      step2Status = s.job.message || '多模态审阅与方案修订中…';
    } else {
      step2Status = s.job?.message || 'AI 正在推演三维几何方案…';
    }
  } else if (step2Passed) {
    step2Status = s.spec.modeling_plan
      ? '参数拓扑约束已确立'
      : hasModel
        ? '形体拓扑已收敛'
        : '意图已解构';
  }

  // 阶段 3：阶段 A 表面稠密重构
  const step3Passed =
    (stageAComplete ||
      (hasModel && !isPhoto) ||
      (hasModel && s.spec.provider === 'parametric')) &&
    (activeStep > 3 || !s.running);
  const step3Running = s.running && activeStep === 3;
  let step3Status = '待高密点云与表面网格解算';
  if (step3Running) {
    step3Status = s.job?.message || 'Colmap+OpenMVS 稠密解算中…';
  } else if (step3Passed) {
    if (model?.reconstruction) {
      step3Status = `${model.reconstruction.registered_views} 视角已配准 · 稠密表面`;
    } else if (model?.source_glb_id) {
      step3Status = '物理扫描高密裸网格就绪';
    } else {
      step3Status = '几何表面起伏已映射对齐';
    }
  }

  // 阶段 4：阶段 B Blender 切平定标
  const step4Passed = stageBComplete && (activeStep > 4 || !s.running);
  const step4Running = s.running && activeStep === 4;
  let step4Status = '待工业微破洞缝合与切平定标';
  if (step4Running) {
    step4Status = s.job?.message || 'Blender 正在切平定标与水密闭合…';
  } else if (step4Passed) {
    step4Status = model?.size_mm
      ? `Bed Cut 已水平切平 · ${model.size_mm.map((v) => Math.round(v)).join('×')}mm`
      : 'Bed Cut 已水平切平 · 100% 流形水密';
  } else if (hasModel && s.dirty) {
    step4Status = '参数已变动 · 待重新切平定标';
  }

  // 阶段 5：3D 打印就绪
  const step5Passed = stageBComplete && !s.dirty;
  const step5Running = s.running && activeStep === 5;
  let step5Status = '待制造体检与成型复测';
  if (step5Running) {
    step5Status = s.job?.message || '正在切片生成 A1 mini 打印代码…';
  } else if (step5Passed) {
    step5Status = model?.faces
      ? `${model.faces.toLocaleString()} 水密面 · 制造就绪`
      : '100% 流形水密 · 打印就绪';
  }

  const stages = [
    {
      step: 1,
      title: '① 视觉多视角采集',
      duty: '特征点提取与空间视角标定',
      status: step1Status,
      icon: Camera,
      passed: step1Passed,
      current: step1Running || (!s.running && activeStep === 1),
      ready: false,
    },
    {
      step: 2,
      title: '② AI 大脑拓扑推演',
      duty: '多模态解构与参数化方案推导',
      status: step2Status,
      icon: Cpu,
      passed: step2Passed,
      current: step2Running || (!s.running && activeStep === 2 && !step5Passed),
      ready: false,
    },
    {
      step: 3,
      title: '③ 阶段 A: 表面稠密重构',
      duty: '摄影测量密集点云与曲面重建',
      status: step3Status,
      icon: Layers,
      passed: step3Passed,
      current: step3Running || (!s.running && activeStep === 3),
      ready: false,
    },
    {
      step: 4,
      title: '④ 阶段 B: Blender 切平定标',
      duty: '布尔装配、曲面融合与底面切平',
      status: step4Status,
      icon: Scissors,
      passed: step4Passed,
      current: step4Running || (!s.running && activeStep === 4 && !step5Passed),
      ready: false,
    },
    {
      step: 5,
      title: '⑤ 3D 打印就绪',
      duty: '流形水密校验与切片制造就绪',
      status: step5Status,
      icon: CheckCircle2,
      passed: step5Passed,
      current: step5Running,
      ready: step5Passed && !s.running,
    },
  ];

  return (
    <div className="pipeline-energy-rail" role="region" aria-label="A+B 深度融合逆向制造管线">
      <div className="pipeline-rail-track">
        {stages.map((st, idx) => {
          const IconComponent = st.icon;
          const isCurrent = st.current;
          const isPassed = st.passed;
          const isReady = st.ready;
          const nodeClass = `pipeline-rail-node ${isPassed ? 'passed' : ''} ${isCurrent ? 'current' : ''} ${isReady ? 'ready' : ''}`;
          const connectorFilled =
            st.passed && (stages[idx + 1]?.passed || stages[idx + 1]?.current);

          return (
            <Fragment key={st.step}>
              <div className={nodeClass}>
                <div className="node-top-bar">
                  <div className="node-icon-bubble">
                    {isPassed && !isCurrent ? (
                      <Check size={11} strokeWidth={3} />
                    ) : (
                      <IconComponent size={12} />
                    )}
                  </div>
                  <span className="node-title">{st.title}</span>
                  {isCurrent && s.running ? (
                    <span className="node-badge running">
                      <Sparkles size={9} className="sparkle-spin" /> 执行中
                    </span>
                  ) : isReady ? (
                    <span className="node-badge ready">就绪 ✦</span>
                  ) : isPassed ? (
                    <span className="node-badge done">已完成</span>
                  ) : (
                    <span className="node-badge wait">待进行</span>
                  )}
                </div>

                <div className="node-duty" title={st.duty}>
                  {st.duty}
                </div>

                <div className="node-dynamic-status">
                  {isCurrent && s.running && <span className="node-live-pulse" />}
                  <span className="node-status-text" title={st.status}>
                    {st.status}
                  </span>
                </div>
              </div>

              {idx < stages.length - 1 && (
                <div
                  className={`rail-connector ${connectorFilled ? 'filled' : ''} ${s.running && (isCurrent || stages[idx + 1]?.current) ? 'flowing' : ''}`}
                />
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
