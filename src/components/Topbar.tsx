import { House, Settings } from 'lucide-react';
import { useStudio } from '../state/StudioContext';
import { Usagi } from './Usagi';
export function Topbar() {
  const s = useStudio();
  return (
    <header className="topbar">
      <div className="brand">
        <House size={30} />
        <strong>呀哈造物</strong>
        <span>YaHa Craft</span>
        <i />
        <small>小屋造物之旅</small>
      </div>
      <div className="topbar-right">
        <span className="family-badge">亲子共创版</span>
        <button className="avatar" title="去乌萨奇展厅" onClick={() => s.setRoom('gallery')}>
          <Usagi size={34} />
        </button>
        <button className="icon-button" title="家长与设置" onClick={() => s.setRoom('settings')}>
          <Settings size={22} />
        </button>
      </div>
    </header>
  );
}
