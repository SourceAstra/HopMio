import { AlertTriangle, Armchair, ArrowRight, Ban, X, Loader2 } from 'lucide-react';
import { Usagi } from './Usagi';
import type { Job } from '../types';
import { useRef, useState } from 'react';
import { useDialogFocus } from './useDialogFocus';

interface JobConflictModalProps {
  isOpen: boolean;
  job: Job | null;
  projectName?: string;
  actionTitle?: string;
  taskCount?: number;
  onCancelAndProceed: () => void | Promise<void>;
  onStayAndInspect: () => void;
  onClose: () => void;
}

export function JobConflictModal({
  isOpen,
  job,
  projectName = '当前作品',
  actionTitle = '开启新造物',
  taskCount = 1,
  onCancelAndProceed,
  onStayAndInspect,
  onClose,
}: JobConflictModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState(false);
  useDialogFocus(
    ref,
    () => {
      if (!pending) onClose();
    },
    isOpen && !!job,
  );
  if (!isOpen || !job) return null;

  const percent = Math.min(100, Math.max(0, Math.round(job.progress || 0)));

  return (
    <div
      ref={ref}
      className="job-conflict-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="job-conflict-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      <div className="job-conflict-modal-card">
        {/* 顶部标题栏 */}
        <header className="conflict-modal-header">
          <div className="conflict-header-left">
            <div className="conflict-avatar-wrap">
              <Usagi size={44} />
              <span className="conflict-alert-badge" aria-hidden="true">
                <AlertTriangle size={14} />
              </span>
            </div>
            <div>
              <div className="conflict-badge-row">
                <span className="conflict-pill-badge">任务冲突提示</span>
                <span className="conflict-sub-tag">正在雕刻中</span>
              </div>
              <h3 id="job-conflict-title" className="conflict-title">
                {taskCount > 1 ? `有 ${taskCount} 个造物任务正在进行` : '乌萨奇正在进行造物任务中'}
              </h3>
            </div>
          </div>

          <button
            type="button"
            className="conflict-close-btn"
            onClick={onClose}
            disabled={pending}
            aria-label="关闭提示"
          >
            <X size={16} />
          </button>
        </header>

        {/* 当前运行中的任务详情卡片 */}
        <div className="conflict-modal-body">
          <p className="conflict-desc-text">
            检测到 {taskCount} 个正在运行或排队的任务。如果现在{actionTitle}
            ，会先停止这些任务；已保存的作品版本保留。
          </p>

          <div className="current-running-job-card">
            <div className="running-job-info-row">
              <div className="job-project-tag">
                <strong>{projectName}</strong>
              </div>
              <span className="job-percent-badge">{percent}%</span>
            </div>

            <div className="running-job-message-row">
              <Loader2 size={13} className="spin-icon text-amber" />
              <span className="job-message-text">
                {job.message || '正在推演 3D 几何与执行雕刻…'}
              </span>
            </div>

            <div className="running-job-progress-bar">
              <div className="running-job-progress-fill" style={{ width: `${percent}%` }} />
            </div>
          </div>
        </div>

        {/* 底部抉择按钮 */}
        <footer className="conflict-modal-footer">
          <button
            type="button"
            className="conflict-stay-btn"
            onClick={onStayAndInspect}
            disabled={pending}
            title="返回造物桌继续查看当前进度"
          >
            <Armchair size={15} />
            <span>返回继续查看当前造物</span>
          </button>

          <button
            type="button"
            className="conflict-terminate-btn"
            disabled={pending}
            onClick={async () => {
              if (pending) return;
              setPending(true);
              try {
                await onCancelAndProceed();
              } finally {
                setPending(false);
              }
            }}
            title="终止当前后台任务并继续执行新操作"
          >
            <Ban size={15} />
            <span>
              {pending
                ? '正在停止，请稍候…'
                : `${taskCount > 1 ? '停止这些任务' : '终止当前造物'}并${actionTitle}`}
            </span>
            <ArrowRight size={14} />
          </button>
        </footer>
      </div>
    </div>
  );
}
