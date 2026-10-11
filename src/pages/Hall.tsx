import { useStudio } from '../state/StudioContext';
import { modes } from '../theme/modes';
import { PageHeading } from '../components/PageHeading';
import { House } from '../components/House';
export function Hall() {
  const s = useStudio();
  return (
    <>
      <PageHeading
        title="呀哈，欢迎来到小屋！"
        description="选一种开始方式，让你的想法变成能拿在手里的作品。"
      />
      <div className="welcome-banner">
        <House />
        <div>
          <h2>从一句话，到一件属于你的作品。</h2>
          <p>乌萨奇陪你找灵感、试形状、检查模型，再和家长一起打印。</p>
          <button className="primary" onClick={() => void s.create()}>
            ＋ 开始一件新作品
          </button>
        </div>
      </div>
      <div className="mode-grid">
        {modes.map((mode) => (
          <button
            className="mode-card"
            key={mode.id}
            onClick={() => {
              s.setSpec((old) => ({
                ...old,
                mode: mode.id,
                provider: ['image', 'multiview'].includes(mode.id) ? 'meshy' : 'local',
                asset_ids: [],
              }));
              s.setRoom(mode.id === 'text' ? 'desk' : 'materials');
            }}
          >
            <span className="mode-emoji">{mode.emoji}</span>
            <span className="pill">{mode.badge}</span>
            <h2>{mode.name}</h2>
            <p>{mode.description}</p>
            <strong>进去试试 →</strong>
          </button>
        ))}
      </div>
    </>
  );
}
