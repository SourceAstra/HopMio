import { House, Plus, Settings, Sparkles } from 'lucide-react';
import { useStudio } from '../state/StudioContext';
import { Usagi } from './Usagi';
import { isModelDraft } from '../features/modeling/quality';

export function Topbar() {
  const s = useStudio();

  return (
    <header className="topbar">
      <div className="brand" onClick={() => s.setRoom('hall')} role="button" tabIndex={0} title="回到小屋门厅">
        <div className="brand-icon-wrap">
          <House size={26} />
          <span className="brand-sparkle">✦</span>
        </div>
        <div className="brand-text">
          <div className="brand-title-line">
            <strong>呀哈造物</strong>
            <span className="brand-en">YaHa Craft</span>
          </div>
          <small className="brand-subtitle">乌萨奇小屋造物之旅</small>
        </div>
      </div>

      <div className="topbar-center-group">
        {s.project && (
          <div className="topbar-project-indicator" onClick={() => s.setRoom('desk')} title="当前造物项目">
            <span className="indicator-project-name">{s.project.name}</span>
            <span className={`indicator-status-pill ${s.dirty ? 'dirty' : 'clean'}`}>
              {s.dirty ? '● 待应用新版' : isModelDraft(s.project.model) ? '● 待改进草稿' : s.project.model ? '✓ 已生成' : '等待造物'}
            </span>
          </div>
        )}
        <button
          className="topbar-new-project-btn"
          onClick={() => void s.create()}
          disabled={s.busy}
          title="开启一份全新的造物作品"
        >
          <Plus size={14} />
          <span>开始新作品</span>
        </button>
      </div>

      <div className="topbar-right">
        <span className="family-badge">
          <Sparkles size={13} />
          <span>亲子共创版</span>
        </span>
        <button
          className="avatar-btn"
          title="去乌萨奇展厅看看"
          onClick={() => s.setRoom('gallery')}
          aria-label="乌萨奇展厅"
        >
          <Usagi size={32} />
        </button>
        <button
          className={`icon-button ${s.room === 'settings' ? 'active' : ''}`}
          title="家长管理与设置"
          onClick={() => s.setRoom('settings')}
          aria-label="设置"
        >
          <Settings size={20} />
        </button>
      </div>
    </header>
  );
}

