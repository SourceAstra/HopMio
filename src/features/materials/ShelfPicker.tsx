import { useMemo, useState } from 'react';
import { Check, FolderOpen } from 'lucide-react';
import { assetUrl } from '../../api/client';
import { useStudio } from '../../state/StudioContext';
import {
  BUILT_IN_FOLDERS,
  isImageAsset,
  isModelAsset,
  isShelfMaterial,
  resolveAssetFolderId,
} from './folders';

export function ShelfPicker({
  value,
  onChange,
  kind = 'image',
  limit = 96,
  disabled = false,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  kind?: 'image' | 'model';
  limit?: number;
  disabled?: boolean;
}) {
  const s = useStudio();
  const [folder, setFolder] = useState('all');
  const [query, setQuery] = useState('');
  const folders = [...BUILT_IN_FOLDERS, ...s.materialLibrary.folders];
  const assets = useMemo(() => {
    const seen = new Set<string>();
    return s.assets.filter((asset) => {
      if (
        !isShelfMaterial(asset) ||
        !(kind === 'image' ? isImageAsset(asset) : isModelAsset(asset))
      )
        return false;
      const key = `${asset.kind}:${asset.sha256}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [s.assets, kind]);
  const folderId = (asset: (typeof assets)[number]) =>
    resolveAssetFolderId(asset, s.materialLibrary.assignments, folders);
  const visible = assets.filter(
    (asset) =>
      (folder === 'all' || folderId(asset) === folder) &&
      asset.name.toLowerCase().includes(query.toLowerCase()),
  );
  const choose = (ids: string[]) => {
    if (disabled) return;
    if (ids.length > limit) {
      s.setNotice(`当前方式最多选 ${limit} 份素材，请减少选择或更换造物方式。`);
      return;
    }
    onChange(ids);
  };
  return (
    <section className="shelf-picker" aria-label="按文件夹选择素材">
      <div className="shelf-picker-toolbar">
        <strong>
          <FolderOpen size={15} /> 素材灵感架 · 已选 {value.length} 份
        </strong>
        <input
          type="search"
          disabled={disabled}
          aria-label="搜索可选素材"
          placeholder="搜索名称…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="shelf-picker-folders" aria-label="素材文件夹">
        {folders
          .filter(
            (item) => item.id === 'all' || assets.some((asset) => folderId(asset) === item.id),
          )
          .map((item) => (
            <button
              type="button"
              disabled={disabled}
              key={item.id}
              aria-pressed={folder === item.id}
              onClick={() => setFolder(item.id)}
            >
              {item.emoji} {item.name}
            </button>
          ))}
      </div>
      <div className="shelf-picker-actions">
        <small>
          {visible.length} 份可选 ·{' '}
          {limit === 1 ? '选择一份作为输入' : '请为同一物体选择照片，避免混入其他对象'}
        </small>
        {limit > 1 && visible.length > 0 && (
          <button
            type="button"
            disabled={disabled}
            className="link"
            onClick={() => choose([...new Set([...value, ...visible.map((asset) => asset.id)])])}
          >
            选用本组
          </button>
        )}
        {value.length > 0 && (
          <button type="button" disabled={disabled} className="link" onClick={() => choose([])}>
            清空
          </button>
        )}
      </div>
      {visible.length ? (
        <div className="shelf-picker-grid">
          {visible.map((asset) => (
            <button
              type="button"
              disabled={disabled}
              key={asset.id}
              aria-pressed={value.includes(asset.id)}
              onClick={() =>
                choose(
                  value.includes(asset.id)
                    ? value.filter((id) => id !== asset.id)
                    : limit === 1
                      ? [asset.id]
                      : [...value, asset.id],
                )
              }
            >
              {isImageAsset(asset) ? (
                <img src={assetUrl(asset.id)} alt={asset.name} loading="lazy" />
              ) : (
                <FolderOpen size={32} />
              )}
              <span title={asset.name}>{asset.name}</span>
              {value.includes(asset.id) && <Check size={15} className="shelf-picker-check" />}
            </button>
          ))}
        </div>
      ) : (
        <p className="muted">此文件夹暂无可用素材。可更换分类，或上传新素材。</p>
      )}
    </section>
  );
}
