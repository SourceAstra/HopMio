import { ExternalLink } from 'lucide-react';
import { useStudio } from '../../state/StudioContext';
import { call } from '../../api/client';
import type { Asset } from '../../types';

export function StudioLaunchButton({ includeModel = false }: { includeModel?: boolean }) {
  const s = useStudio();
  const open = () =>
    s.act(async () => {
      let assetId: string | undefined;
      if (includeModel) {
        if (!s.project?.model) return;
        const asset = await call<Asset>('project.export', { id: s.project.id, format: '3mf' });
        assetId = asset.id;
      }
      const result = await call<{ handed_off: boolean }>('studio.open', { asset_id: assetId });
      if (result.handed_off)
        s.setNotice(
          includeModel
            ? '已请求 Bambu Studio 打开当前模型，请在软件中检查机型、摆放和切片。'
            : '已请求打开本机 Bambu Studio。',
        );
    });
  return (
    <button
      className="secondary"
      disabled={includeModel ? !s.printReadiness.canOpenModel : s.busy || s.running}
      title={includeModel ? s.printReadiness.modelBlock || undefined : undefined}
      onClick={() => void open()}
    >
      <ExternalLink size={17} />
      {includeModel ? '在 Bambu Studio 中打开模型' : '打开 Bambu Studio'}
    </button>
  );
}
