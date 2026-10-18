import { useState, useEffect } from 'react';
import { useStudio } from './state/StudioContext';
import { Topbar } from './components/Topbar';
import { Sidebar } from './components/Sidebar';
import { Usagi } from './components/Usagi';
import { Workbench } from './pages/Workbench';
import { Hall } from './pages/Hall';
import { Materials } from './pages/Materials';
import { Checkup } from './pages/Checkup';
import { Preparation } from './pages/Preparation';
import { PrintStation } from './pages/PrintStation';
import { Library } from './pages/Library';
import { Gallery } from './pages/Gallery';
import { Workshop } from './pages/Workshop';
import { Settings } from './pages/Settings';
import { Inspirations } from './pages/Inspirations';
import { JobConflictModal } from './components/JobConflictModal';

const pages = {
  desk: Workbench,
  hall: Workbench, // 深度整合门厅与造物桌为统一 Hero 聊天造物大厅
  inspirations: Inspirations,
  materials: Materials,
  check: Checkup,
  prepare: Preparation,
  print: PrintStation,
  library: Library,
  gallery: Gallery,
  workshop: Workshop,
  settings: Settings,
};

export function App() {
  const s = useStudio();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  // 确保 body 拥有 sidebar-collapsed 类名以激活全局高紧凑样式
  useEffect(() => {
    if (sidebarCollapsed) {
      document.body.classList.add('sidebar-collapsed');
    } else {
      document.body.classList.remove('sidebar-collapsed');
    }
  }, [sidebarCollapsed]);

  const Page = pages[s.room] || Workbench;

  return (
    <>
      <Topbar />
      <div className={`app-body ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
        />
        <main>
          {s.ready ? (
            <Page />
          ) : (
            <div className="loading">
              <Usagi size={130} />
              <h1>乌萨奇正在打开小屋…</h1>
              <p>乌萨奇正在准备小屋的欢迎礼物。</p>
              {!s.busy && (
                <button className="secondary" onClick={() => location.reload()}>
                  重新打开
                </button>
              )}
            </div>
          )}
        </main>
      </div>
      <JobConflictModal
        isOpen={Boolean(s.jobConflict?.isOpen)}
        job={s.job}
        projectName={s.projects.find((project) => project.id === s.job?.project_id)?.name}
        actionTitle={s.jobConflict?.actionTitle}
        taskCount={s.jobConflict?.taskCount}
        onCancelAndProceed={() => s.jobConflict?.onConfirm()}
        onStayAndInspect={() => void s.continueCurrentJob()}
        onClose={() => s.setJobConflict(null)}
      />
      {s.notice && (
        <div className="toast" role="status">
          <span>✦</span>
          <p>{s.notice}</p>
          <button aria-label="关闭提示" onClick={() => s.setNotice('')}>
            ×
          </button>
        </div>
      )}
    </>
  );
}
