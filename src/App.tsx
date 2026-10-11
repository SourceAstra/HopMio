import { useStudio } from './state/StudioContext';
import { Topbar } from './components/Topbar';
import { Sidebar } from './components/Sidebar';
import { Usagi } from './components/Usagi';
import { Workbench } from './pages/Workbench';
import { Hall } from './pages/Hall';
import { Materials } from './pages/Materials';
import { Idea } from './pages/Idea';
import { Checkup } from './pages/Checkup';
import { Preparation } from './pages/Preparation';
import { PrintStation } from './pages/PrintStation';
import { Library } from './pages/Library';
import { Gallery } from './pages/Gallery';
import { Workshop } from './pages/Workshop';
import { Settings } from './pages/Settings';
import { JobProgress } from './components/JobProgress';
const pages = {
  desk: Workbench,
  hall: Hall,
  materials: Materials,
  idea: Idea,
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
  const Page = pages[s.room];
  return (
    <>
      <Topbar />
      <div className="app-body">
        <Sidebar />
        <main>
          {s.ready ? (
            <>
              {s.room !== 'desk' && <JobProgress />}
              <Page />
            </>
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
