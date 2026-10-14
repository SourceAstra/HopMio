import { PageHeading } from '../components/PageHeading';
import { Upload } from '../features/materials/Upload';
import { SelectedMaterials } from '../features/materials/SelectedMaterials';
import { selectMaterials } from '../features/materials/selection';
import { useStudio } from '../state/StudioContext';
import { assetUrl } from '../api/client';
import { modes } from '../theme/modes';
export function Materials() {
  const s = useStudio();
  const ordered = [
    ...s.spec.asset_ids.flatMap((id) => s.assets.filter((a) => a.id === id)),
    ...s.assets,
  ];
  const seen = new Set<string>();
  const relevant = ordered.filter((a) => {
    const key = `${a.kind}:${a.sha256}`;
    const duplicate = seen.has(key);
    seen.add(key);
    return !duplicate && a.kind === (s.spec.mode === 'import' ? 'model-input' : 'image');
  });
  const toggle = (id: string) => {
    const limit =
      s.spec.provider === 'reconstruction'
        ? s.preferences?.reconstruction?.max_photos || 96
        : s.spec.provider === 'parametric'
          ? 96
          : 1;
    const ids = s.spec.asset_ids.includes(id)
      ? s.spec.asset_ids.filter((value) => value !== id)
      : limit === 1
        ? [id]
        : [...s.spec.asset_ids, id];
    if (ids.length > limit) {
      s.setNotice(`本次最多选择 ${limit} 份材料，请先移除一份再添加。`);
      return;
    }
    s.setSpec((old) => selectMaterials(old, ids));
  };
  return (
    <>
      <PageHeading
        title="取材角"
        description="上传和选择参考照片、画作或已有模型，带到造物桌说出你的想法。"
        actions={
          <button
            className="primary"
            disabled={s.busy || s.running || !s.spec.asset_ids.length}
            onClick={() => s.setRoom('desk')}
          >
            带着 {s.spec.asset_ids.length} 份材料去造物 →
          </button>
        }
      />
      <div className="mode-strip">
        {modes.filter((m) => m.id !== 'text').map((m) => (
          <button
            className={s.spec.mode === m.id ? 'selected' : ''}
            key={m.id}
            disabled={s.busy || s.running}
            onClick={() =>
              s.setSpec((old) =>
                old.mode === m.id
                  ? old
                  : selectMaterials(
                      old,
                      ['image', 'multiview'].includes(old.mode) &&
                        ['image', 'multiview'].includes(m.id)
                        ? old.asset_ids
                        : [],
                      m.id,
                    ),
              )
            }
          >
            {m.emoji} {m.name}
          </button>
        ))}
      </div>
      <Upload />
      <SelectedMaterials />
      <div className="soft-notice">
        照片参考造型可以从一张开始，补充照片继续细化。多视角扫描需要充分重叠的照片，可在细节调整中选择。
      </div>
      <h2 className="material-library-heading">
        素材架 <small>{relevant.length} 份 · 点选加入本次造物</small>
      </h2>
      <div className="asset-grid">
        {relevant.map((a) => (
          <button
            key={a.id}
            className={`asset-card ${s.spec.asset_ids.includes(a.id) ? 'selected' : ''}`}
            aria-pressed={s.spec.asset_ids.includes(a.id)}
            disabled={s.busy || s.running}
            onClick={() => toggle(a.id)}
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
