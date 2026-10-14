import { useStudio } from '../state/StudioContext';
import { PageHeading } from '../components/PageHeading';
import { ModelViewer } from '../components/ModelViewer';
import { History } from '../features/projects/History';
import { call } from '../api/client';
import type { Project } from '../types';
export function Library() {
  const s = useStudio();
  return (
    <div className="library-page">
      <PageHeading
        title="作品柜"
        description="保留每个造物版本，选择喜欢的作品放入乌萨奇展厅。"
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
            {p.model?.glb_id ? (
              <ModelViewer assetId={p.model.glb_id} compact />
            ) : (
              <div className="viewer compact">
                <div className="viewer-empty">把想法告诉乌萨奇，模型会出现在这里 ✨</div>
              </div>
            )}
            <div>
              <div className="project-card-heading">
                <h2>{p.name}</h2>
                {p.exhibited && <span className="project-exhibited-badge">已在展厅</span>}
              </div>
              <p>
                {p.revision_count} 个版本 · {p.model?.origin || '等待第一次造物'}
              </p>
              <div className="project-card-actions">
                <button
                  className="primary"
                  onClick={() => {
                    s.adopt(p);
                    s.setRoom('desk');
                  }}
                >
                  继续造物
                </button>
                <button className="secondary" onClick={() => s.adopt(p)}>
                  查看版本
                </button>
                <button
                  className="secondary"
                  disabled={s.busy || (!p.exhibited && !p.model)}
                  onClick={() => void s.updateProject(p.id, { exhibited: !p.exhibited })}
                  title={!p.model && !p.exhibited ? '生成模型后可以放入展厅' : undefined}
                >
                  {p.exhibited ? '收回作品柜' : '放入展厅'}
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
            <label>
              作品故事
              <textarea
                aria-label="作品故事"
                rows={3}
                defaultValue={s.project.story}
                key={s.project.id + s.project.story}
                placeholder="我做了什么？哪一步最有趣？"
                onBlur={(e) => {
                  if (e.target.value !== s.project?.story)
                    void s.updateProject(s.project!.id, { story: e.target.value });
                }}
              />
            </label>
          </section>
          <History />
        </>
      )}
    </div>
  );
}
