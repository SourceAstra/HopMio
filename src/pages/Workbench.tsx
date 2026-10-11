import { ArrowRight, Save, Box } from 'lucide-react';
import { useStudio } from '../state/StudioContext';
import { IdeaPanel } from '../features/workbench/IdeaPanel';
import { AdjustPanel } from '../features/workbench/AdjustPanel';
import { Workflow } from '../features/workbench/Workflow';
import { ModelViewer } from '../components/ModelViewer';
import { JobProgress } from '../components/JobProgress';
import { Usagi } from '../components/Usagi';
export function Workbench() {
  const s = useStudio();
  return (
    <>
      <header className="workbench-heading">
        <div>
          <h1>
            造物桌 <span>✦</span>
          </h1>
          <p>
            别动脑，喊出你的想法---
            <br />
            剩下的交给乌萨奇
          </p>
        </div>
        <div className="desk-companion">
          <Usagi size={72} />
          <div className="project-label">
            <strong>{s.project?.name || '欢迎来到小屋'}</strong>
            <span className={s.dirty ? 'unsaved' : 'saved'}>{s.dirty ? '待应用' : '✓ 已保存'}</span>
          </div>
        </div>
      </header>
      <Workflow />
      <JobProgress />
      <div className="workbench-grid">
        <IdeaPanel />
        <section className="panel model-panel">
          <div className="model-panel-heading">
            <span className="selected-tab">
              <Box size={18} /> 单色实体
            </span>
            <span className="pill">毫米 · 真实模型</span>
          </div>
          <ModelViewer assetId={s.project?.model?.glb_id} />
          <div className="model-stats">
            {s.project?.model?.size_mm.map((v) => v.toFixed(1)).join(' × ') || '—'} mm{' '}
            <span>{s.project?.model?.origin || '期待你的第一个作品'}</span>
          </div>
        </section>
        <AdjustPanel />
      </div>
      <footer className="workbench-footer">
        <button
          className="secondary"
          disabled={s.busy || s.running || !s.dirty}
          onClick={() => void s.generate()}
        >
          <Save size={19} /> 保存新版本
        </button>
        <p>每一次修改，都可以回到上一版。</p>
        <button
          className="primary"
          disabled={s.busy || s.running || s.dirty || !s.project?.model}
          onClick={() => void s.check()}
        >
          去模型体检 <ArrowRight size={20} />
        </button>
      </footer>
    </>
  );
}
