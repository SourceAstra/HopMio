import { useState } from 'react';
import { PageHeading } from '../components/PageHeading';
import { Usagi } from '../components/Usagi';
import { ModelViewer } from '../components/ModelViewer';
import { useStudio } from '../state/StudioContext';
import { call } from '../api/client';
import type { Project } from '../types';
export function Gallery() {
  const s = useStudio();
  const [story, setStory] = useState('');
  const shown = s.projects.filter((p) => p.exhibited);
  return (
    <>
      <PageHeading
        title="乌萨奇展厅"
        description="给你的作品一个位置，也给你的尝试写一句故事。展厅只保存在本机。"
      />
      <div className="gallery-banner">
        <Usagi size={130} />
        <div>
          <h2>呀哈！这里有我的第一件作品。</h2>
          <p>不是只看最后的成品。每一次修改、每一个小发现，都可以摆进展厅。</p>
        </div>
        <span className="gallery-star">✦</span>
      </div>
      {s.project && (
        <section className="panel form-panel">
          <h2>展出「{s.project.name}」</h2>
          <textarea
            aria-label="作品故事"
            rows={3}
            placeholder="我做了什么？哪一步最有趣？爸爸妈妈和我分别做了什么？"
            value={story}
            onChange={(e) => setStory(e.target.value)}
          />
          <div className="button-row">
            <button
              className="primary"
              disabled={!s.project.model || s.busy}
              onClick={() =>
                void s.act(async () => {
                  s.adopt(
                    await call<Project>('project.update', {
                      id: s.project!.id,
                      story: story || s.project!.story,
                      exhibited: true,
                    }),
                  );
                  s.setNotice('作品已经摆进本机展厅！');
                })
              }
            >
              摆进我的展厅 ✦
            </button>
            {s.project.exhibited && (
              <button
                className="secondary"
                onClick={() =>
                  void s.act(async () =>
                    s.adopt(
                      await call<Project>('project.update', {
                        id: s.project!.id,
                        exhibited: false,
                      }),
                    ),
                  )
                }
              >
                收回作品柜
              </button>
            )}
          </div>
        </section>
      )}
      <div className="gallery-grid">
        {shown.map((p) => (
          <article className="gallery-card" key={p.id}>
            <ModelViewer assetId={p.model?.glb_id} compact />
            <div>
              <span className="pill">我的小屋收藏</span>
              <h2>{p.name}</h2>
              <p>{p.story || '这件作品的故事，等我来写。'}</p>
              <button
                className="link"
                onClick={() => {
                  s.adopt(p);
                  s.setRoom('desk');
                }}
              >
                看看它怎么做的 →
              </button>
            </div>
          </article>
        ))}
      </div>
      {!shown.length && <p className="empty-state">展台留好了，等你的作品来住。</p>}
    </>
  );
}
