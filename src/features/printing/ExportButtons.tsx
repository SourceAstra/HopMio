import { Download } from 'lucide-react';
import { useStudio } from '../../state/StudioContext';
import { call, download } from '../../api/client';
import type { Asset } from '../../types';
import { SlicePanel } from './SlicePanel';
import { StudioLaunchButton } from './StudioLaunchButton';
export function ExportButtons() {
  const s = useStudio();
  const exportFile = (format: string) =>
    s.act(async () => {
      if (!s.project) return;
      const asset = await call<Asset>('project.export', { id: s.project.id, format });
      const filename =
        s.project.name +
        (format === 'source_glb'
          ? '.source.glb'
          : format === 'manufacturing_glb'
            ? '.manufacturing.glb'
            : '.' + format);
      const res = await download(asset.id, filename);
      if (res?.saved) {
        s.setNotice(`已成功将 ${filename} 保存到您的本地设备！`);
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
      <StudioLaunchButton includeModel />
    </>
  );
}
