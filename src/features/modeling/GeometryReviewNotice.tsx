import type { Model } from '../../types';
import { isGeometryOnly } from './quality';
import '../../styles/geometry-review.css';

export function GeometryReviewNotice({ model }: { model?: Model | null }) {
  if (!isGeometryOnly(model)) return null;
  return (
    <p className="geometry-review-notice" role="status">
      网格与尺寸已复测。当前模型未做视觉审阅，请旋转检查文字、位置与其他外观细节，再和家长一起准备打印。
    </p>
  );
}
