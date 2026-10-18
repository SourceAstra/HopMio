import type { Model } from '../../types';
import { isGeometryOnly } from './quality';
import '../../styles/geometry-review.css';

export function GeometryReviewNotice({ model }: { model?: Model | null }) {
  if (!isGeometryOnly(model) && !model?.photo_fidelity) return null;
  return (
    <div className="geometry-review-notice" role="status">
      {isGeometryOnly(model) && (
        <p>网格与尺寸已复测。当前模型未做视觉审阅，请旋转检查文字、位置与其他外观细节。</p>
      )}
      {model?.photo_fidelity && (
        <details>
          <summary>
            {model.photo_fidelity.edited
              ? '原网格编辑 · 查看来源与质量说明'
              : model.photo_fidelity.status === 'observed_surface'
                ? '实物观测表面 · 查看尺度与缺失说明'
                : '照片参考设计 · 查看补全与审阅说明'}
          </summary>
          {model.photo_fidelity.warnings.map((warning, index) => (
            <p key={index}>{warning}</p>
          ))}
          {model.reconstruction && (
            <p>
              尺度依据：
              {model.reconstruction.scale_status === 'reference_distance'
                ? '实物标尺'
                : '所设目标高度，尚不代表原尺寸 1:1'}
              。
            </p>
          )}
        </details>
      )}
    </div>
  );
}
