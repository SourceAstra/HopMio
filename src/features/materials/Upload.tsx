import { useEffect, useRef, useState } from 'react';
import { ImagePlus, UploadCloud } from 'lucide-react';
import { useStudio } from '../../state/StudioContext';
import { call, fileBase64 } from '../../api/client';
import type { Asset, Mode, Project } from '../../types';
import { selectMaterials } from './selection';
import '../../styles/materials.css';
import { isPhotoMode } from '../../theme/modes';

interface UploadProgress {
  total: number;
  completed: number;
  name: string;
  failures: { name: string; message: string }[];
}

export function Upload({ compact = false }: { compact?: boolean }) {
  const s = useStudio();
  const input = useRef<HTMLInputElement>(null);
  const append = useRef(false);
  const uploading = useRef(false);
  const mounted = useRef(true);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const choose = (add = false) => {
    append.current = add;
    input.current?.click();
  };
  const upload = async (files: File[], add = false) => {
    if (!files.length || uploading.current || s.busy || s.running) return;
    setProgress(null);
    const photos = files.every((file) => /\.(png|jpe?g|webp)$/i.test(file.name));
    const mode: Mode = photos
      ? ['silhouette', 'relief', 'image', 'multiview'].includes(s.spec.mode)
        ? s.spec.mode
        : 'image'
      : 'import';
    const limit = ['image', 'multiview'].includes(mode)
      ? s.preferences?.reconstruction?.max_photos || 96
      : 1;
    const ids = add ? [...s.spec.asset_ids] : [];
    if (files.length + ids.length > limit || (!photos && files.length !== 1)) {
      s.setNotice(
        `本次最多选择 ${limit} ${photos ? '张照片' : '个模型或作品包'}，没有截断或上传文件。`,
      );
      return;
    }
    files.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }));
    uploading.current = true;
    const failures: UploadProgress['failures'] = [];
    const known = new Map(s.assets.map((a) => [`${a.kind}:${a.sha256}`, a]));
    let completed = 0;
    setProgress({ total: files.length, completed, name: files[0].name, failures: [] });
    try {
      await s.act(async () => {
        for (const file of files) {
          if (!mounted.current) break;
          setProgress({ total: files.length, completed, name: file.name, failures: [...failures] });
          try {
            const base64 = await fileBase64(file);
            if (file.name.toLowerCase().endsWith('.usagi')) {
              const project = await call<Project>('project.import', { base64 });
              s.setAssets(await call<Asset[]>('asset.list'));
              if (mounted.current) {
                s.adopt(project);
                s.setRoom('desk');
                s.setNotice('作品包已恢复为一个新副本。');
              }
              return;
            }
            const uploaded = await call<Asset>('asset.upload', { name: file.name, base64 });
            const key = `${uploaded.kind}:${uploaded.sha256}`;
            const asset = known.get(key) || uploaded;
            known.set(key, asset);
            s.setAssets((old) => [asset, ...old.filter((a) => a.id !== asset.id)]);
            if (!ids.includes(asset.id)) ids.push(asset.id);
            if (mounted.current) s.setSpec((old) => selectMaterials(old, [...ids], mode));
          } catch (error) {
            failures.push({
              name: file.name,
              message: error instanceof Error ? error.message : '文件读取失败，请重新选择。',
            });
          }
          completed++;
          if (mounted.current)
            setProgress({ total: files.length, completed, name: '', failures: [...failures] });
        }
        s.setNotice(
          mounted.current
            ? `已上传 ${completed - failures.length}/${files.length} 份材料${failures.length ? `，${failures.length} 份失败，请查看文件旁的原因。` : '，已加入本次选择。'}`
            : `已保存 ${completed - failures.length} 份到素材架；离开上传页后已停止后续上传。`,
        );
      });
    } finally {
      uploading.current = false;
    }
  };
  return (
    <div
      className={compact ? 'material-upload compact' : 'material-upload upload-zone'}
      aria-busy={uploading.current}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void upload(Array.from(e.dataTransfer.files));
      }}
    >
      {!compact && (
        <>
          <UploadCloud size={30} />
          <h2>把灵感放进小屋</h2>
          <p>拖入或选择照片、模型或作品包 · 每份最多 12 MB，作品包 256 MB</p>
        </>
      )}
      <div className="material-upload-actions">
        <button className="secondary" disabled={s.busy || s.running} onClick={() => choose()}>
          <ImagePlus size={16} />{' '}
          {compact ? (s.spec.asset_ids.length ? '换一组照片' : '上传照片') : '选择文件'}
        </button>
        {!!s.spec.asset_ids.length && isPhotoMode(s.spec.mode) && (
          <button className="secondary" disabled={s.busy || s.running} onClick={() => choose(true)}>
            补充照片
          </button>
        )}
      </div>
      <small>选择新的一组会替换本次材料；补充照片会保留已选照片。</small>
      {progress && (
        <div className="material-upload-progress" role="status" aria-live="polite">
          <strong>
            {progress.completed < progress.total
              ? `正在上传 ${progress.completed + 1}/${progress.total} · ${progress.name}`
              : `本次 ${progress.completed - progress.failures.length}/${progress.total} 份上传成功`}
          </strong>
          <progress value={progress.completed} max={progress.total} aria-label="文件上传进度" />
          {progress.failures.map((failure, i) => (
            <p className="material-upload-error" key={i}>
              {failure.name}：{failure.message}
            </p>
          ))}
        </div>
      )}
      <input
        ref={input}
        hidden
        type="file"
        multiple
        accept=".png,.jpg,.jpeg,.webp,.stl,.glb,.3mf,.usagi"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          e.target.value = '';
          void upload(files, append.current);
        }}
      />
    </div>
  );
}
