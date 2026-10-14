import { Download, ExternalLink } from 'lucide-react';
import { useStudio } from '../../state/StudioContext';
import { call, download } from '../../api/client';
import type { Asset } from '../../types';
import { SlicePanel } from './SlicePanel';
export function ExportButtons() {
  const s = useStudio();
  const exportFile = (format: string) =>
    s.act(async () => {
      if (!s.project) return;
      const asset = await call<Asset>('project.export', { id: s.project.id, format });
      await download(
        asset.id,
        s.project.name +
          (format === 'source_glb'
            ? '.source.glb'
            : format === 'manufacturing_glb'
              ? '.manufacturing.glb'
              : '.' + format),
      );
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
      <SlicePanel />
      <div className="export-grid">
        {[
          'stl',
          '3mf',
          'glb',
          ...(s.project?.model?.source_glb_id ? ['source_glb', 'manufacturing_glb'] : []),
          ...(s.project?.model?.blend_id ? ['blend'] : []),
          'usagi',
        ].map((format) => (
          <button
            className="secondary"
            key={format}
            disabled={s.busy || s.running || !s.project?.model || s.dirty}
            onClick={() => void exportFile(format)}
          >
            <Download size={17} />
            {format === 'usagi'
              ? '作品包 .usagi'
              : format === 'source_glb'
                ? '原始扫描 GLB'
                : format === 'manufacturing_glb'
                  ? '制造实体 GLB'
                  : format.toUpperCase()}
          </button>
        ))}
      </div>
      <button
        className="secondary"
        disabled={s.busy || s.running || !s.canPrepare}
        onClick={() => void handoff()}
      >
        <ExternalLink size={18} /> 交给 Bambu Studio
      </button>
    </>
  );
}
