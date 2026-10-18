import { useState } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useStudio } from '../state/StudioContext';
import { navCategories, rooms, type Room } from '../theme/rooms';
import { House } from './House';

interface SidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function Sidebar({ collapsed = true, onToggleCollapse }: SidebarProps) {
  const s = useStudio();
  const roomMap = Object.fromEntries(rooms.map((r) => [r.id, r]));

  const handleGoHome = () => {
    s.setRoom('desk');
    // 派发重置并回到首页大聊天框事件
    window.dispatchEvent(new CustomEvent('yaha-reset-home'));
  };

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`} id="main-sidebar">
      {/* 顶部 Logo 锚点: 点击一键平滑归位回到首页大聊天框 */}
      <div className="brand">
        <button
          type="button"
          className={`brand-logo home-logo ${s.room === 'hall' || s.room === 'desk' ? 'active' : ''}`}
          onClick={handleGoHome}
          data-tooltip="呀哈造物 · 造物大厅（返回首页）"
          aria-label="返回首页造物大厅"
        >
          <div className="brand-logo-inner">
            <House />
          </div>
        </button>
        {!collapsed && (
          <div className="brand-text">
            <h1 className="brand-title">呀哈造物</h1>
            <p className="brand-subtitle">乌萨奇小屋造物之旅</p>
          </div>
        )}
      </div>

      <nav aria-label="小屋功能导航" className="sidebar-nav nav-container">
        {navCategories
          .filter((cat) => cat.id !== 'hall' && cat.id !== 'desk')
          .map((cat) => {
            const isCategoryActive = cat.rooms.includes(s.room);
            const hasMultipleRooms = cat.rooms.length > 1;

            return (
              <div
                key={cat.id}
                className={`nav-category-group ${isCategoryActive ? 'active' : ''}`}
                data-tooltip={`${cat.name} · ${cat.tagline}`}
              >
              <button
                className={`nav-main-btn ${isCategoryActive ? 'active' : ''}`}
                onClick={() => {
                  if (cat.id === 'hall' || cat.id === 'desk') {
                    handleGoHome();
                  } else if (s.room !== cat.defaultRoom) {
                    s.setRoom(cat.defaultRoom);
                  }
                }}
                aria-label={cat.name}
              >
                <div className="nav-btn-icon">
                  <cat.icon size={19} />
                </div>
                {!collapsed && (
                  <div className="nav-btn-text">
                    <div className="nav-btn-title-row">
                      <strong>{cat.name}</strong>
                      {cat.badge && <span className="category-badge">{cat.badge}</span>}
                    </div>
                    <small>{cat.tagline}</small>
                  </div>
                )}
                {!collapsed && cat.id === 'hall' && <span className="star-sparkle">✦</span>}
              </button>

              {/* 展开状态且选中包含多个房间时显示子药丸 */}
              {!collapsed && isCategoryActive && hasMultipleRooms && (
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

      {/* 底部折叠/展开侧栏开关 */}
      <div className="sidebar-footer">
        <button
          type="button"
          className="sidebar-toggle-btn"
          onClick={onToggleCollapse}
          data-tooltip={collapsed ? '展开侧边栏导航' : '收起侧边栏'}
          aria-label={collapsed ? '展开侧边栏导航' : '收起侧边栏'}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          {!collapsed && <span>收起导航</span>}
        </button>
      </div>
    </aside>
  );
}


