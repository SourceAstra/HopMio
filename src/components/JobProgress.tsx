import { useStudio } from '../state/StudioContext';
import { call } from '../api/client';
export function JobProgress() {
  const s = useStudio();
  if (!s.running || !s.job) return null;
  return (
    <div className="job-progress">
      <div>
        <strong>{s.job.message}</strong>
        <span>{s.job.progress}%</span>
      </div>
      <progress value={s.job.progress} max={100} />
      {s.job.kind === 'plan' && (
        <small>
          方案设计已等待{' '}
          {Math.max(0, Math.floor((Date.now() - Date.parse(s.job.created_at)) / 1000))} 秒
        </small>
      )}
      <button
        className="link"
        onClick={() => void s.act(() => call('job.cancel', { id: s.job!.id }))}
      >
        停止这次造物
      </button>
      {s.job.spec?.provider === 'parametric' && s.job.kind === 'plan' && (
        <small>云端任务已提交后，停止等待可能不会停止计费。</small>
      )}
    </div>
  );
}
