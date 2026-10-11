import { Plus } from 'lucide-react';
import { useStudio } from '../state/StudioContext';
import { rooms } from '../theme/rooms';
import { House } from './House';
import { Usagi } from './Usagi';
export function Sidebar() {
  const s = useStudio();
  return (
    <aside className="sidebar">
      <House />
      <nav aria-label="小屋房间">
        {rooms.map((room) => (
          <button
            key={room.id}
            className={s.room === room.id ? 'active' : ''}
            onClick={() => s.setRoom(room.id)}
          >
            <room.icon size={21} />
            <span>{room.name}</span>
            {room.id === 'desk' && <small>✦</small>}
          </button>
        ))}
      </nav>
      <button className="new-project" onClick={() => void s.create()} disabled={s.busy}>
        <Plus size={18} /> 开始新作品
      </button>
      <div className="sidebar-gallery">
        <Usagi size={66} />
        <div>
          <strong>我的小小展厅</strong>
          <p>把开心摆出来</p>
        </div>
        <button onClick={() => s.setRoom('gallery')}>去展厅看看 →</button>
      </div>
    </aside>
  );
}
