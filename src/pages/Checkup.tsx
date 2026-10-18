import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { useStudio } from '../state/StudioContext';
import { CottageRoomHeading } from '../components/CottageRoomHeading';
import { ModelViewer } from '../components/ModelViewer';
import { call } from '../api/client';
import type { Job } from '../types';
import { StudioLaunchButton } from '../features/printing/StudioLaunchButton';
export function Checkup() {
  const s = useStudio();
  const report = s.project?.validation;
  return (
    <>
      <CottageRoomHeading
        room="check"
        description="看看作品装不装得下、有没有网格开口，以及需要家长检查的细节。"
      />
      <div className="two-columns">
        <section className="panel">
          <ModelViewer assetId={s.project?.model?.glb_id} />
        </section>
        <section className="panel form-panel">
          <h2>
            {report ? (report.can_prepare ? '基础体检完成 ✓' : '先处理这些问题') : '作品等着体检'}
          </h2>
          {report ? (
            report.items.map((item) => (
              <div className={`check-item ${item.status}`} key={item.name}>
                {item.status === 'pass' ? (
                  <CheckCircle2 />
                ) : item.status === 'fail' ? (
                  <XCircle />
                ) : (
                  <AlertTriangle />
                )}
                <div>
                  <strong>{item.name}</strong>
                  <p>{item.detail}</p>
                </div>
              </div>
            ))
          ) : (
            <p>点击“开始体检”检查当前模型的尺寸与网格，再进入打印准备。</p>
          )}
          <button
            className="primary"
            disabled={!s.printReadiness.canCheck}
            onClick={() => void s.check()}
          >
            {report ? '重新体检' : '开始体检'}
          </button>
          {!s.canPrepare && (
            <p className="soft-notice" role="status">
              {s.printReadiness.prepareBlock}
            </p>
          )}
          {s.dirty && s.project?.model && !s.busy && !s.running && (
            <button
              className="secondary"
              onClick={() => {
                s.setSpec(s.project!.spec);
                s.setNotice('已使用保存的模型，未保存的参数修改已放弃。');
              }}
            >
              放弃未保存修改，使用已保存模型
            </button>
          )}
          <button
            className="secondary"
            disabled={s.busy || s.running || !s.project?.model}
            onClick={() =>
              void s.act(async () => {
                s.setJob(await call<Job>('model.repair', { id: s.project!.id }));
                s.setNotice('Blender 正在修复，成功后保存新版本；复杂开口可能仍需手动处理。');
              })
            }
          >
            尝试修正法线与补小孔
          </button>
          <p className="soft-notice">
            通过基础体检不等于可以直接打印。切片后的首层、壁厚、支撑与摆放仍需家长检查。
          </p>
          <button
            className="primary"
            disabled={!s.canPrepare}
            title={s.printReadiness.prepareBlock || undefined}
            onClick={() => s.setRoom('print')}
          >
            去打印制造站 →
          </button>
          <StudioLaunchButton includeModel />
        </section>
      </div>
    </>
  );
}
