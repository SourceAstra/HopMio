import { Check, Sparkles } from 'lucide-react';
import { useStudio } from '../../state/StudioContext';
import type { Room } from '../../theme/rooms';

const steps: { name: string; room: Room; desc: string }[] = [
  { name: '灵感取材', room: 'materials', desc: '选图与画' },
  { name: '3D造物', room: 'desk', desc: '生成与调整' },
  { name: '模型体检', room: 'check', desc: '安全与尺寸' },
  { name: '打印准备', room: 'prepare', desc: '切片打包' },
  { name: '展厅入驻', room: 'gallery', desc: '故事与成果' },
];

export function Workflow() {
  const s = useStudio();

  // 根据当前是否有模型、是否有体检等判断已完成进度
  const hasModel = !!s.project?.model;
  const hasCheck = !!s.project?.validation;

  return (
    <div className="workflow-rail-container">
      <div className="workflow" role="navigation" aria-label="造物旅程阶段">
        {steps.map((step, i) => {
          const isActive = step.room === s.room;
          const isComplete =
            (step.room === 'materials' && hasModel) ||
            (step.room === 'desk' && hasModel && !s.dirty) ||
            (step.room === 'check' && hasCheck);

          return (
            <button
              key={step.room}
              className={`workflow-step ${isActive ? 'active' : ''} ${isComplete ? 'complete' : ''}`}
              onClick={() => s.setRoom(step.room)}
              aria-current={isActive ? 'step' : undefined}
            >
              <div className="workflow-dot-wrapper">
                <span className="workflow-dot">
                  {isComplete ? (
                    <Check size={13} strokeWidth={2.8} />
                  ) : isActive ? (
                    <Sparkles size={12} />
                  ) : (
                    <span>{i + 1}</span>
                  )}
                </span>
                {isActive && <span className="workflow-dot-pulse" />}
              </div>
              <div className="workflow-label">
                <strong>{step.name}</strong>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
