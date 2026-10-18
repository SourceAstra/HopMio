import { ExternalLink, Download } from 'lucide-react';
import { useStudio } from '../../state/StudioContext';
import { call, download } from '../../api/client';
import type { Asset } from '../../types';

export function StudioLaunchButton({ includeModel = false }: { includeModel?: boolean }) {
  const s = useStudio();
  const isDesktop = typeof window !== 'undefined' && Boolean(window.yaha?.desktop && !window.location.origin.startsWith('http'));

  const open = () =>
    s.act(async () => {
      let assetId: string | undefined;
      if (includeModel) {
        if (!s.project?.model) return;
        const asset = await call<Asset>('project.export', { id: s.project.id, format: '3mf' });
        assetId = asset.id;
      }

      if (isDesktop) {
        const result = await call<{ handed_off: boolean }>('studio.open', { asset_id: assetId });
        if (result.handed_off)
          s.setNotice(
            includeModel
              ? '已请求 Bambu Studio 打开当前模型，请在软件中检查机型、摆放和切片。'
              : '已请求打开本机 Bambu Studio。',
          );
      } else {
        // 云端模式：将 3MF 交付文件直接下载到用户本地电脑侧
        if (assetId) {
          const res = await download(assetId, `${s.project?.name || 'yaha-craft'}.3mf`);
          if (res?.saved) {
            s.setNotice('已将 3MF 模型保存到您的电脑，请在您的电脑中双击在 Bambu Studio 中打开切片打印。');
          }
        } else {
          s.setNotice('云端模式下请直接在您的电脑上打开 Bambu Studio。');
        }
      }
    });

  return (
    <button
      className="secondary"
      disabled={includeModel ? !s.printReadiness.canOpenModel : s.busy || s.running}
      title={includeModel ? s.printReadiness.modelBlock || undefined : undefined}
      onClick={() => void open()}
    >
      {isDesktop ? <ExternalLink size={17} /> : <Download size={17} />}
      {isDesktop
        ? includeModel
          ? '在 Bambu Studio 中打开模型'
          : '打开 Bambu Studio'
        : includeModel
          ? '下载 3MF (本地 Bambu Studio 打开)'
          : '在本地 Bambu Studio 打开'}
    </button>
  );
}
