import { useEffect, useState } from 'react';
import { call } from '../../api/client';
import { useStudio } from '../../state/StudioContext';
import type { Project, Revision } from '../../types';
export function History() {
  const s = useStudio();
  const [history, setHistory] = useState<Revision[]>([]);
  useEffect(() => {
    if (s.project)
      void s.act(async () =>
        setHistory(await call<Revision[]>('project.history', { id: s.project!.id })),
      );
  }, [s.project?.id, s.project?.revision_id, s.project?.revision_count]);
  return (
    <section className="panel form-panel">
      <h2>{s.project?.name} · 每一步都留着</h2>
      {history.map((r, i) => (
        <div className="history-row" key={r.id}>
          <span className="version-dot">{history.length - i}</span>
          <div>
            <strong>{r.reason}</strong>
            <p>
              {new Date(r.created_at).toLocaleString('zh-CN')} · {r.model.origin}
            </p>
          </div>
          <div className="history-actions" style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
            <button
              className="secondary"
              disabled={s.running || s.busy || r.id === s.project?.revision_id}
              onClick={() =>
                void s.act(async () => {
                  s.adopt(
                    await call<Project>('project.restore', { id: s.project!.id, revision_id: r.id }),
                  );
                  s.setNotice('回到了这个形状，原来的版本也保留着。');
                })
              }
            >
              {r.id === s.project?.revision_id ? '当前版本' : '回到这一版'}
            </button>
            <button
              className="secondary danger-btn"
              disabled={s.running || s.busy}
              title="删除此版本"
              onClick={() => {
                if (window.confirm(`确定要删除第 ${history.length - i} 版（${r.reason}）吗？`)) {
                  void s.deleteRevision(s.project!.id, r.id);
                }
              }}
            >
              删除版本
            </button>
          </div>
        </div>
      ))}
      {!history.length && <p>生成第一个模型后，这里会记录每个版本。</p>}
    </section>
  );
}
