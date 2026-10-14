import { PageHeading } from '../components/PageHeading';
import { Usagi } from '../components/Usagi';
import { ModelViewer } from '../components/ModelViewer';
import { useStudio } from '../state/StudioContext';
export function Gallery() {
  const s = useStudio();
  const shown = s.projects.filter((p) => p.exhibited);
  return (
    <div className="gallery-page">
      <PageHeading
        title="乌萨奇展厅"
        description="这里展示从作品柜中选出的作品。展厅只保存在本机。"
        actions={
          <button className="primary" onClick={() => s.setRoom('library')}>
            从作品柜选作品
          </button>
        }
      />
      <div className="gallery-banner">
        <Usagi size={130} />
        <div>
          <h2>呀哈！这里有我的第一件作品。</h2>
          <p>不是只看最后的成品。每一次修改、每一个小发现，都可以摆进展厅。</p>
        </div>
        <span className="gallery-star">✦</span>
      </div>
      <div className="gallery-grid">
        {shown.map((p) => (
          <article className="gallery-card" key={p.id}>
            {p.model?.glb_id ? (
              <ModelViewer assetId={p.model.glb_id} compact />
            ) : (
              <div className="viewer compact">
                <div className="viewer-empty">把想法告诉乌萨奇，模型会出现在这里 ✨</div>
              </div>
            )}
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
      {!shown.length && <p className="empty-state">展厅还没有作品。去作品柜选择已生成的作品，点击“放入展厅”。</p>}
    </div>
  );
}
