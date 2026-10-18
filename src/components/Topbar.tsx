import { House, Settings, Sparkles } from 'lucide-react';
import { useStudio } from '../state/StudioContext';
import { Usagi } from './Usagi';

export function Topbar() {
  const s = useStudio();

  const handleGoHome = () => {
    s.setRoom('desk');
    window.dispatchEvent(new CustomEvent('yaha-reset-home'));
  };

  return (
    <header className="topbar">
      <div
        className="brand home-logo"
        onClick={handleGoHome}
        role="button"
        tabIndex={0}
        title="返回首页造物大厅"
        aria-label="返回首页造物大厅"
      >
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

      {/* 顶部中央保持极致纯净留白，任务感知下沉至大厅输入坞正下方 */}
      <div className="topbar-center-spacer" />

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

