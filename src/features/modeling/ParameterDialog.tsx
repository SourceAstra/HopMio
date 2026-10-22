import { useEffect, useId, useRef } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { ModelViewer } from '../../components/ModelViewer';
import { useStudio } from '../../state/StudioContext';
import type { Project } from '../../types';
import { ParameterPanel } from './ParameterPanel';

export function ParameterDialog({ project, onClose, onChat }: {
  project: Project;
  onClose: () => void;
  onChat: () => void;
}) {
  const s = useStudio();
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const assetId = project.model?.manufacturing_glb_id || project.model?.glb_id;
  useEffect(() => {
    const node = dialog.current!;
    const previous = document.activeElement as HTMLElement | null;
    node.showModal();
    return () => {
      node.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  return <dialog ref={dialog} className="parameter-dialog" aria-labelledby={title}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="parameter-dialog-shell">
      <header className="parameter-dialog-header">
        <div><span className="parameter-dialog-eyebrow"><SlidersHorizontal size={13} />本地微调</span><h2 id={title}>让细节，恰到好处。</h2></div>
        <button className="parameter-dialog-close" onClick={onClose} aria-label="关闭参数微调"><X size={19} /></button>
      </header>
      <ParameterPanel project={project} onChat={onChat} preview={<section className="parameter-dialog-preview" aria-label="当前版本模型">
        {assetId && <ModelViewer assetId={assetId} compact transparent />}
        <div className="parameter-dialog-model-caption"><strong>{project.name}</strong><span>当前版本 · v{project.revision_number ?? '—'}</span></div>
        <p>{s.dirty ? '基于已保存模型调整；对话中的待应用方案不参与本次修改。' : '应用后保存新版本，原版本可回退。'}</p>
      </section>} />
    </div>
  </dialog>;
}
