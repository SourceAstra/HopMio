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
  }, [s.project?.id, s.project?.revision_id]);
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
        </div>
      ))}
      {!history.length && <p>生成第一个模型后，这里会记录每个版本。</p>}
    </section>
  );
}
