import { PageHeading } from '../components/PageHeading';
import { Upload } from '../features/materials/Upload';
import { useStudio } from '../state/StudioContext';
import { assetUrl } from '../api/client';
import { modes } from '../theme/modes';
export function Materials() {
  const s = useStudio();
  const relevant = s.assets.filter((a) =>
    s.spec.mode === 'import' ? a.kind === 'model-input' : a.kind === 'image',
  );
  return (
    <>
      <PageHeading
        title="取材角"
        description="这里收藏你的照片、画和模型。多视角照片要拍同一件物品，第一张放正面。"
        actions={
          <button className="primary" onClick={() => s.setRoom('desk')}>
            带着材料去造物 →
          </button>
        }
      />
      <div className="mode-strip">
        {modes.map((m) => (
          <button
            className={s.spec.mode === m.id ? 'selected' : ''}
            key={m.id}
            onClick={() =>
              s.setSpec((old) => ({
                ...old,
                mode: m.id,
                provider: ['image', 'multiview'].includes(m.id) ? 'meshy' : 'local',
                asset_ids: [],
              }))
            }
          >
            {m.emoji} {m.name}
          </button>
        ))}
      </div>
      <Upload />
      <div className="soft-notice">
        画画变挂件：建议白底深色轮廓或透明背景。照片变立体：AI 会猜想背面，生成后要仔细体检。
      </div>
      <div className="asset-grid">
        {relevant.map((a) => (
          <button
            key={a.id}
            className={`asset-card ${s.spec.asset_ids.includes(a.id) ? 'selected' : ''}`}
            onClick={() =>
              s.setSpec((old) => ({
                ...old,
                asset_ids:
                  old.mode === 'multiview'
                    ? old.asset_ids.includes(a.id)
                      ? old.asset_ids.filter((id) => id !== a.id)
                      : [...old.asset_ids, a.id].slice(-4)
                    : [a.id],
              }))
            }
          >
            {a.kind === 'image' ? (
              <img src={assetUrl(a.id)} alt={a.name} />
            ) : (
              <span className="model-file">📦 {a.extension}</span>
            )}
            <strong>{a.name}</strong>
            <small>
              {s.spec.asset_ids.includes(a.id)
                ? `已选择 · ${s.spec.asset_ids.indexOf(a.id) + 1}`
                : `${Math.round(a.bytes / 1024)} KB`}
            </small>
          </button>
        ))}
      </div>
      {!relevant.length && <p className="empty-state">素材架还是空的，上传第一张灵感吧。</p>}
    </>
  );
}
