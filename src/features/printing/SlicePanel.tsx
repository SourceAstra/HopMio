import { Download, Layers3 } from 'lucide-react';
import { download } from '../../api/client';
import { useStudio } from '../../state/StudioContext';

export function SlicePanel() {
  const s = useStudio();
  const report = s.sliceMatches ? s.project?.slicing : null;
  const diagnostics = s.job?.project_id === s.project?.id ? s.job?.slicing_diagnostics : null;
  return (
    <section className="slice-panel">
      <div className="slice-heading">
        <Layers3 size={20} />
        <div>
          <strong>A1 mini · 实际切片</strong>
          <small>官方机型与材料参数 · 本地生成支撑和打印路径</small>
        </div>
      </div>
      {report ? (
        <>
          <dl className="slice-stats">
            <div>
              <dt>切片层数</dt>
              <dd>{report.layers}</dd>
            </div>
            <div>
              <dt>预计用时</dt>
              <dd>{report.estimated_time || '见切片预览'}</dd>
            </div>
            <div>
              <dt>耗材重量</dt>
              <dd>{report.filament_grams ? `${report.filament_grams} g` : '见切片预览'}</dd>
            </div>
            <div>
              <dt>支撑方式</dt>
              <dd>{report.support === 'tree(auto)' ? '自动树状支撑' : report.support}</dd>
            </div>
          </dl>
          <button
            className="primary"
            disabled={s.busy || s.running}
            onClick={() =>
              void s.act(async () => {
                const res = await download(report.asset_id, `${s.project!.name}.gcode.3mf`);
                if (res?.saved) s.setNotice('已将切片打印文件 (.gcode.3mf) 成功保存到本地设备！');
              })
            }
          >
            <Download size={18} />
            下载已切片打印文件
          </button>
          <button
            className="link"
            onClick={() =>
              void s.act(async () => {
                const res = await download(report.report_id, '实际切片报告.json');
                if (res?.saved) s.setNotice('已将实际切片报告保存到本地设备！');
              })
            }
          >
            下载切片报告
          </button>
          <small className="slice-note">
            切片已完成，尚未实际打印。请在 Bambu Studio 检查首层、支撑和细节后交给打印机。
          </small>
          {!!report.warnings?.length && (
            <details>
              <summary>切片器提示</summary>
              <ul>
                {[...new Set(report.warnings.map((item) => item.msg))].map((message) => (
                  <li key={message}>
                    {message === 'not_support_traditional_timelapse'
                      ? '当前机型不支持所设延时摄影方式，请在 Bambu Studio 核对。'
                      : message}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      ) : (
        <p>体检完成后生成真实切片。模型或打印参数改变后，需要重新切片。</p>
      )}
      <button
        className="secondary"
        disabled={s.busy || s.running || !s.canPrepare || !s.preferences?.slicer?.available}
        onClick={() => void s.slice()}
      >
        {report ? '重新切片' : '生成 A1 mini 切片'}
      </button>
      {!s.preferences?.slicer?.available && (
        <small>{s.preferences?.slicer?.message || '切片运行时尚未配置'}</small>
      )}
      {diagnostics && (
        <details>
          <summary>切片诊断</summary>
          <pre>{diagnostics.log}</pre>
        </details>
      )}
    </section>
  );
}
