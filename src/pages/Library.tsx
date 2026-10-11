import { useStudio } from '../state/StudioContext';
import { PageHeading } from '../components/PageHeading';
import { ModelViewer } from '../components/ModelViewer';
import { History } from '../features/projects/History';
import { call } from '../api/client';
import type { Project } from '../types';
export function Library() {
  const s = useStudio();
  return (
    <>
      <PageHeading
        title="作品柜"
        description="第一次尝试、第二次修改，每个版本都属于你的造物旅程。"
        actions={
          <button className="primary" onClick={() => void s.create()}>
            ＋ 新作品
          </button>
        }
      />
      <div className="project-grid">
        {s.projects.map((p) => (
          <article
            className={`panel project-card ${p.id === s.project?.id ? 'selected' : ''}`}
            key={p.id}
          >
            <ModelViewer assetId={p.model?.glb_id} compact />
            <div>
              <h2>{p.name}</h2>
              <p>
                {p.revision_count} 个版本 · {p.model?.origin || '等待第一次造物'}
              </p>
              <div className="button-row">
                <button className="secondary" onClick={() => s.adopt(p)}>
                  查看版本
                </button>
                <button
                  className="primary"
                  onClick={() => {
                    s.adopt(p);
                    s.setRoom('desk');
                  }}
                >
                  继续造物
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {s.project && (
        <>
          <section className="panel form-panel">
            <label>
              作品名称
              <input
                aria-label="作品名称"
                defaultValue={s.project.name}
                key={s.project.id + s.project.name}
                maxLength={80}
                onBlur={(e) => {
                  if (e.target.value !== s.project?.name)
                    void s.act(async () =>
                      s.adopt(
                        await call<Project>('project.update', {
                          id: s.project!.id,
                          name: e.target.value,
                        }),
                      ),
                    );
                }}
              />
            </label>
          </section>
          <History />
        </>
      )}
    </>
  );
}
