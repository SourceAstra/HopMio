import { useState } from 'react';
import { assetUrl } from '../../api/client';
import type { Model } from '../../types';

export function PhotoComparison({ model }: { model: Model }) {
  const [opacity, setOpacity] = useState(60);
  if (model.photo_fidelity?.edited)
    return <div className="comparison-empty">当前编辑版本尚无同相机对照图，请使用实物比对查看。</div>;
  if (!model.comparison_id || !model.reference_id)
    return <div className="comparison-empty">完成照片重建后，在这里比对原照片和观测表面。</div>;
  return (
    <section className="photo-comparison">
      <div className="comparison-image">
        <img src={assetUrl(model.reference_id)} alt="经相机畸变校正的参考照片" />
        <img
          className="comparison-render"
          style={{ opacity: opacity / 100 }}
          src={assetUrl(model.comparison_id)}
          alt="同一相机角度的制造模型"
        />
      </div>
      <label>
        制造模型叠加{' '}
        <input
          type="range"
          aria-label="制造模型叠加透明度"
          min={0}
          max={100}
          value={opacity}
          onChange={(event) => setOpacity(Number(event.target.value))}
        />
        <span>{opacity}%</span>
      </label>
      <p>对齐照片与制造模型，检查轮廓和细节；补齐的表面仍需人工核对。</p>
    </section>
  );
}
