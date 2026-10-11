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
      <button
        className="link"
        onClick={() => void s.act(() => call('job.cancel', { id: s.job!.id }))}
      >
        停止这次造物
      </button>
      <small>云端任务已提交后，停止等待可能不会停止计费。</small>
    </div>
  );
}
