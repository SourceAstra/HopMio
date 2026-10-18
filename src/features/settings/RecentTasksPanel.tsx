import { useState } from 'react';
import {
  ListTodo,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileCode,
  Copy,
  Check,
  RefreshCw,
  Terminal,
  Activity,
  Layers,
  Wrench,
  Palette,
  Sparkles,
} from 'lucide-react';
import type { Job } from '../../types';

export function RecentTasksPanel({
  jobs,
  loading,
  onRefresh,
}: {
  jobs: Job[];
  loading?: boolean;
  onRefresh?: () => void;
}) {
  const [copiedJobId, setCopiedJobId] = useState<string | null>(null);

  const copyLog = (id: string, log: string) => {
    void navigator.clipboard.writeText(log);
    setCopiedJobId(id);
    setTimeout(() => setCopiedJobId(null), 2000);
  };

  const getJobMeta = (kind: string) => {
    switch (kind) {
      case 'plan':
        return { label: '建模方案规划', icon: Sparkles, color: 'accent' };
      case 'adjust':
        return { label: 'AI 细节调整', icon: Palette, color: 'blue' };
      case 'repair':
        return { label: '网格修复', icon: Wrench, color: 'coral' };
      case 'slice':
        return { label: '3D 切片制造', icon: Layers, color: 'purple' };
      default:
        return { label: '模型造物', icon: Activity, color: 'green' };
    }
  };

  const completedCount = jobs.filter((j) => j.status === 'completed' || j.status === 'success' || j.status === 'done').length;
  const runningCount = jobs.filter((j) => j.status === 'running' || j.status === 'pending' || j.status === 'in_progress').length;
  const failedCount = jobs.filter((j) => j.status === 'failed' || j.status === 'error').length;

  return (
    <div className="recent-tasks-container">
      {/* 头部统计与操作 */}
      <div className="tasks-header-bar">
        <div>
          <div className="tasks-title-wrap">
            <ListTodo size={20} className="tasks-head-icon" />
            <h3>造物任务流水线与诊断</h3>
          </div>
          <p>实时跟踪几何规划、AI 调优、网格修复与切片操作的执行进度与后台记录。</p>
        </div>

        <div className="tasks-header-actions">
          <div className="tasks-stats-pills">
            <span className="stat-pill success">
              <CheckCircle2 size={12} /> {completedCount} 项已完成
            </span>
            {runningCount > 0 && (
              <span className="stat-pill running">
                <Clock size={12} /> {runningCount} 项处理中
              </span>
            )}
            {failedCount > 0 && (
              <span className="stat-pill failed">
                <AlertCircle size={12} /> {failedCount} 项异常
              </span>
            )}
          </div>

          {onRefresh && (
            <button
              type="button"
              className="secondary icon-btn-refresh"
              onClick={onRefresh}
              disabled={loading}
              title="刷新最新任务列表"
            >
              <RefreshCw size={14} className={loading ? 'model-spinning' : ''} />
              <span>刷新任务</span>
            </button>
          )}
        </div>
      </div>

      {/* 任务流水线卡片列表 */}
      <div className="tasks-timeline-list">
        {jobs.slice(0, 12).map((j) => {
          const meta = getJobMeta(j.kind);
          const Icon = meta.icon;
          const isDone = j.status === 'completed' || j.status === 'success' || j.status === 'done';
          const isRunning = j.status === 'running' || j.status === 'pending' || j.status === 'in_progress';
          const isFailed = j.status === 'failed' || j.status === 'error';

          const primaryLog =
            j.diagnostics?.log ||
            j.reconstruction_diagnostics?.log ||
            j.slicing_diagnostics?.log;

          const jobIdStr = String(j?.id || '');
          const safeDate = (() => {
            if (!j?.created_at) return '';
            try {
              const d = new Date(j.created_at);
              return isNaN(d.getTime()) ? String(j.created_at) : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            } catch {
              return String(j.created_at);
            }
          })();

          return (
            <article key={jobIdStr || Math.random()} className={`task-timeline-card ${j.status || 'default'}`}>
              <div className="task-card-main">
                <div className={`task-kind-avatar ${meta.color}`}>
                  <Icon size={18} />
                </div>

                <div className="task-content">
                  <div className="task-row-top">
                    <span className="task-kind-name">{meta.label}</span>
                    <span className="task-id-code">#{jobIdStr.slice(0, 8) || '任务'}</span>

                    <span className={`task-status-chip ${isDone ? 'done' : isRunning ? 'running' : isFailed ? 'failed' : 'default'}`}>
                      {isDone && <CheckCircle2 size={11} />}
                      {isRunning && <span className="running-dot-mini" />}
                      {isFailed && <AlertCircle size={11} />}
                      {isDone ? '已完成' : isRunning ? '正在处理' : isFailed ? '执行异常' : (j.status || '未知')}
                    </span>

                    {safeDate && (
                      <time className="task-time" dateTime={j.created_at}>
                        <Clock size={11} />
                        {safeDate}
                      </time>
                    )}
                  </div>

                  <p className="task-message-text">{j.message || '任务进行中…'}</p>

                  {/* 进度指示条 */}
                  {isRunning && typeof j.progress === 'number' && j.progress > 0 && j.progress < 100 && (
                    <div className="task-progress-bar-wrap">
                      <div className="task-progress-fill" style={{ width: `${j.progress}%` }} />
                    </div>
                  )}

                  {/* AI 诊断简要指标 */}
                  {j.ai_diagnostics && (
                    <div className="task-ai-metric-pills">
                      <span>阶段：{j.ai_diagnostics.phase || '推理完成'}</span>
                      {typeof j.ai_diagnostics.elapsed_seconds === 'number' && (
                        <span>耗时：{j.ai_diagnostics.elapsed_seconds.toFixed(1)}s</span>
                      )}
                      {j.ai_diagnostics.received_chars && <span>接收字符：{j.ai_diagnostics.received_chars}</span>}
                    </div>
                  )}
                </div>
              </div>

              {/* 诊断日志查看展开抽屉 */}
              {primaryLog && (
                <details className="task-log-details">
                  <summary className="task-log-summary">
                    <Terminal size={13} />
                    <span>查看工坊底层诊断日志</span>
                    <button
                      type="button"
                      className="task-log-copy-btn"
                      onClick={(e) => {
                        e.preventDefault();
                        copyLog(j.id, primaryLog);
                      }}
                      title="复制完整日志"
                    >
                      {copiedJobId === j.id ? (
                        <>
                          <Check size={12} className="copied" />
                          <span>已复制</span>
                        </>
                      ) : (
                        <>
                          <Copy size={12} />
                          <span>复制日志</span>
                        </>
                      )}
                    </button>
                  </summary>
                  <pre className="task-log-terminal-code">{primaryLog}</pre>
                </details>
              )}
            </article>
          );
        })}
      </div>

      {/* 空状态占位卡片 */}
      {!jobs.length && (
        <div className="tasks-empty-card">
          <div className="empty-icon-wrap">
            <Sparkles size={36} />
          </div>
          <h4>暂无造物任务历史</h4>
          <p>每一次点击「造物规划」、「表面修复」或「打印切片」，后台任务记录都将在此井然有序地呈现。</p>
        </div>
      )}
    </div>
  );
}
