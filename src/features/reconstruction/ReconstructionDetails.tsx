import { useState } from 'react';
import { Check } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { assetUrl } from '../../api/client';
import { useStudio } from '../../state/StudioContext';
import { ParameterEditor } from '../modeling/ParameterEditor';
import { ProviderChoice } from '../modeling/ProviderChoice';
import { PhotoRegion } from './PhotoRegion';

export function ReconstructionDetails({ onClose }: { onClose: () => void }) {
  const s = useStudio();
  const [selected, setSelected] = useState(0);
  const plan = s.spec.reconstruction_plan;
  const current =
    !!plan &&
    plan.source_prompt === s.spec.prompt &&
    JSON.stringify(plan.source_asset_ids) === JSON.stringify(s.spec.asset_ids);
  const index = Math.min(selected, Math.max(0, (plan?.observations.length || 1) - 1));
  const photo = current ? plan?.observations[index] : null;
  return (
    <Modal title="细节调整" onClose={onClose}>
      <p className="muted">这些设置均可选。一键建模会自动检查照片并提取主体。</p>
      <ProviderChoice />
      <div className="surface-details-grid">
        <section className="modeling-plan surface-plan">
          <h3>照片主体与实物标尺</h3>
          <button
            className="secondary"
            disabled={s.busy || s.running || !s.spec.asset_ids.length}
            onClick={() => void s.design()}
          >
            <Check size={16} /> {plan ? '重新检查照片' : '检查照片以手动调整'}
          </button>
          {current && plan && (
            <div className="photo-filmstrip" aria-label="重建照片视角">
              {plan.observations.map((view, i) => (
                <button
                  key={view.asset_id}
                  aria-label={`查看第${i + 1}张重建照片`}
                  aria-pressed={index === i}
                  onClick={() => setSelected(i)}
                >
                  <img src={assetUrl(view.asset_id)} alt="" />
                  <span>{i + 1}</span>
                </button>
              ))}
            </div>
          )}
          {photo && (
            <>
              <PhotoRegion key={photo.asset_id} observation={photo} index={index} />
              <div className="photo-quality">
                <span>
                  清晰度 <b>{photo.blur_score.toFixed(0)}</b>
                </span>
                <span>
                  图像特征 <b>{photo.feature_count}</b>
                </span>
              </div>
              {photo.warnings.map((warning) => (
                <p className="surface-warning" key={warning}>
                  {warning}
                </p>
              ))}
            </>
          )}
          {plan && !current && <p>照片已改变，检查后可手动调整；直接建模会自动重新检查。</p>}
        </section>
        <section className="modeling-plan surface-plan">
          <h3>尺寸、方向与制造细节</h3>
          {current ? (
            <ParameterEditor />
          ) : (
            <>
              <label>
                作品高度（mm）
                <input
                  type="number"
                  min={10}
                  max={500}
                  value={s.spec.height_mm}
                  disabled={s.busy || s.running}
                  onChange={(event) => {
                    const val = event.target.value;
                    const num = parseInt(val, 10);
                    if (!isNaN(num) && num > 0) {
                      s.setSpec((old) => ({ ...old, height_mm: num }));
                    }
                  }}
                  onBlur={(event) => {
                    const num = parseInt(event.target.value, 10);
                    if (isNaN(num) || num < 10) {
                      s.setSpec((old) => ({ ...old, height_mm: 10 }));
                    } else if (num > 500) {
                      s.setSpec((old) => ({ ...old, height_mm: 500 }));
                    }
                  }}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={s.spec.base}
                  disabled={s.busy || s.running}
                  onChange={(event) => s.setSpec((old) => ({ ...old, base: event.target.checked }))}
                />{' '}
                加底座
              </label>
            </>
          )}
          <p>
            {current && plan?.scale_reference
              ? '使用实物标尺确定尺度，再应用打印比例。'
              : '按作品高度等比制作，宽深由实际造型决定。'}
          </p>
          <small>制造修补精度表示体素大小，不表示实物测量精度。</small>
        </section>
      </div>
      <div className="surface-details-footer">
        <button className="primary" onClick={onClose}>
          完成调整
        </button>
      </div>
    </Modal>
  );
}
