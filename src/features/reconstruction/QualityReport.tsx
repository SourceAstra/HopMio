import { useStudio } from '../../state/StudioContext';
import { isPhotoMode } from '../../theme/modes';
import { reconstructionReport } from '../modeling/quality';

export function QualityReport() {
  const s = useStudio();
  const currentJob = s.job?.project_id === s.project?.id ? s.job : null;
  const report = reconstructionReport(s.project?.model, currentJob);
  const diagnostics = currentJob?.reconstruction_diagnostics;
  const matching = currentJob?.photo_matching;
  if (isPhotoMode(s.spec.mode) && s.spec.provider === 'parametric') return null;
  if (!report && !diagnostics && !matching) return null;
  return (
    <section className="panel reconstruction-report">
      <h2>重建报告</h2>
      {matching && (
        <>
          <dl>
            <div>
              <dt>有效照片匹配</dt>
              <dd>{matching.pair_count} 对</dd>
            </div>
            <div>
              <dt>最大共同视角组</dt>
              <dd>
                {matching.largest_group_views} / {matching.input_views}
              </dd>
            </div>
          </dl>
          {!!matching.isolated_asset_ids.length && (
            <p className="surface-warning">
              缺少共同特征：
              {matching.isolated_asset_ids
                .map((id) => s.assets.find((asset) => asset.id === id)?.name || '照片')
                .join('、')}
              。请补拍相邻角度。
            </p>
          )}
        </>
      )}
      {report && (
        <>
          <dl>
            <div>
              <dt>配准视角</dt>
              <dd>
                {report.registered_views} / {report.input_views}
              </dd>
            </div>
            <div>
              <dt>平均重投影误差</dt>
              <dd>
                {report.mean_reprojection_error_px.toFixed(2)} <small>px</small>
              </dd>
            </div>
            <div>
              <dt>相机求解三维点</dt>
              <dd>{report.sparse_points.toLocaleString()}</dd>
            </div>
            {typeof report.dense_points === 'number' && (
              <div>
                <dt>稠密表面点</dt>
                <dd>{report.dense_points.toLocaleString()}</dd>
              </div>
            )}
            <div>
              <dt>尺度来源</dt>
              <dd>
                {report.scale_status === 'reference_distance'
                  ? '实物标尺'
                  : report.scale_status === 'target_height'
                    ? '所设作品高度'
                    : '尚未标定'}
              </dd>
            </div>
          </dl>
          {typeof report.textured_surface_ratio === 'number' && (
            <p className="muted">
              真实照片覆盖 {(report.textured_surface_ratio * 100).toFixed(1)}%
              的扫描表面积；未观测区域使用中性色标识。
            </p>
          )}
          {!!report.removed_components && (
            <p className="surface-warning">
              制造副本移除了 {report.removed_components} 个微小孤岛，占总体积{' '}
              {((report.removed_volume_ratio || 0) * 100).toFixed(2)}%。扫描原件保留。
            </p>
          )}
          {!!report.unregistered_asset_ids.length && (
            <p className="surface-warning">
              {report.unregistered_asset_ids.length} 张照片未能配准；请检查缺失角度。
            </p>
          )}
          <p className="muted">
            像素误差反映照片配准，不等同于实物毫米精度。原件与制造副本分别保存。
          </p>
          {report.imported_history && (
            <p className="surface-warning">
              以上观测来自导入作品的历史记录，当前机器尚未重新重建。
            </p>
          )}
        </>
      )}
      {diagnostics && (
        <details>
          <summary>查看最近工具日志</summary>
          <pre className="modeling-log">
            {diagnostics.stage} · 退出状态 {diagnostics.exit_code}
            {'\n'}
            {diagnostics.log}
          </pre>
        </details>
      )}
    </section>
  );
}
