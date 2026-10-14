import { useStudio } from '../state/StudioContext';
import { navCategories, rooms, type Room } from '../theme/rooms';
import { House } from './House';

export function Sidebar() {
  const s = useStudio();
  const roomMap = Object.fromEntries(rooms.map((r) => [r.id, r]));

  return (
    <aside className="sidebar">
      <div
        className="sidebar-brand-cottage"
        onClick={() => s.setRoom('hall')}
        role="button"
        tabIndex={0}
        title="推门回到小屋门厅"
        style={{ cursor: 'pointer' }}
      >
        <House />
        <span className="cottage-caption">乌萨奇的造物小屋</span>
      </div>

      <nav aria-label="小屋功能导航" className="sidebar-nav">
        {navCategories.map((cat) => {
          const isCategoryActive =
            cat.rooms.includes(s.room) || (cat.id === 'hall' && s.room === 'inspirations');
          const hasMultipleRooms = cat.rooms.length > 1;

          return (
            <div
              key={cat.id}
              className={`nav-category-group ${isCategoryActive ? 'active' : ''}`}
            >
              <button
                className={`nav-main-btn ${isCategoryActive ? 'active' : ''}`}
                onClick={() => {
                  if (s.room !== cat.defaultRoom) {
                    s.setRoom(cat.defaultRoom);
                  }
                }}
              >
                <div className="nav-btn-icon">
                  <cat.icon size={20} />
                </div>
                <div className="nav-btn-text">
                  <div className="nav-btn-title-row">
                    <strong>{cat.name}</strong>
                    {cat.badge && <span className="category-badge">{cat.badge}</span>}
                  </div>
                  <small>{cat.tagline}</small>
                </div>
                {cat.id === 'hall' && <span className="star-sparkle">✦</span>}
              </button>

              {/* 当选中且包含多个房间时展开精致二级药丸 */}
              {isCategoryActive && hasMultipleRooms && (
                <div className="nav-sub-pills" role="tablist">
                  {cat.rooms.map((roomId: Room) => {
                    const r = roomMap[roomId];
                    const isRoomActive = s.room === roomId;
                    return (
                      <button
                        key={roomId}
                        className={`nav-sub-pill ${isRoomActive ? 'active' : ''}`}
                        onClick={() => s.setRoom(roomId)}
                        title={r?.hint}
                      >
                        <span className="sub-pill-dot" />
                        <span>{r?.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

