import { Download, ExternalLink } from 'lucide-react';
import { useStudio } from '../../state/StudioContext';
import { call, download } from '../../api/client';
import type { Asset } from '../../types';
export function ExportButtons() {
  const s = useStudio();
  const exportFile = (format: string) =>
    s.act(async () => {
      if (!s.project) return;
      const asset = await call<Asset>('project.export', { id: s.project.id, format });
      await download(asset.id, s.project.name + '.' + format);
    });
  const handoff = () =>
    s.act(async () => {
      if (!s.project) return;
      const asset = await call<Asset>('project.export', { id: s.project.id, format: '3mf' });
      if (window.yaha) {
        const result = await window.yaha.openStudio(asset.id);
        if (result.handed_off)
          s.setNotice('模型已交给 Bambu Studio，请选择机型、材料并检查实际切片。');
      } else {
        await download(asset.id, s.project.name + '.3mf');
        s.setNotice('3MF 已下载，请在 Bambu Studio 中打开。');
      }
    });
  return (
    <>
      <div className="export-grid">
        {['stl', '3mf', 'glb', 'usagi'].map((format) => (
          <button
            className="secondary"
            key={format}
            disabled={s.busy || !s.project?.model}
            onClick={() => void exportFile(format)}
          >
            <Download size={17} />
            {format === 'usagi' ? '作品包 .usagi' : format.toUpperCase()}
          </button>
        ))}
      </div>
      <button className="primary" disabled={s.busy || !s.canPrepare} onClick={() => void handoff()}>
        <ExternalLink size={18} /> 交给 Bambu Studio
      </button>
    </>
  );
}
