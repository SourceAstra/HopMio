import { useRef } from 'react';
import { UploadCloud } from 'lucide-react';
import { useStudio } from '../../state/StudioContext';
import { call, fileBase64 } from '../../api/client';
import type { Asset, Project } from '../../types';
export function Upload() {
  const s = useStudio();
  const input = useRef<HTMLInputElement>(null);
  const upload = async (files: FileList | null) => {
    if (!files) return;
    await s.act(async () => {
      const uploaded: Asset[] = [];
      for (const file of Array.from(files).slice(0, 4)) {
        const encoded = await fileBase64(file);
        if (file.name.toLowerCase().endsWith('.usagi')) {
          s.adopt(await call<Project>('project.import', { base64: encoded }));
          s.setRoom('desk');
          s.setNotice('作品包已恢复为一个新副本。');
          return;
        }
        uploaded.push(await call<Asset>('asset.upload', { name: file.name, base64: encoded }));
      }
      s.setAssets((old) => [...uploaded, ...old]);
      s.setSpec((old) => ({
        ...old,
        asset_ids: uploaded.slice(0, old.mode === 'multiview' ? 4 : 1).map((a) => a.id),
      }));
      s.setNotice('材料收好啦，选择素材后可以回造物桌。');
    });
  };
  return (
    <div
      className="upload-zone"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void upload(e.dataTransfer.files);
      }}
    >
      <UploadCloud size={34} />
      <h2>把灵感放进小屋</h2>
      <p>照片、自己的画，STL / GLB / 3MF 模型或 .usagi 作品包 · 每个文件最多 12 MB</p>
      <button className="secondary" disabled={s.busy} onClick={() => input.current?.click()}>
        选择文件
      </button>
      <input
        ref={input}
        hidden
        type="file"
        multiple
        accept=".png,.jpg,.jpeg,.webp,.stl,.glb,.3mf,.usagi"
        onChange={(e) => void upload(e.target.files)}
      />
    </div>
  );
}
