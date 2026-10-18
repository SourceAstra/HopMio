import { Modal } from '../../components/Modal';
import { useStudio } from '../../state/StudioContext';
import { ParameterEditor } from './ParameterEditor';
import { ProviderChoice } from './ProviderChoice';
import { patchDimensions } from './dimensions';

export function ShapeDetails({ onClose }: { onClose: () => void }) {
  const s = useStudio();
  const plan = s.spec.modeling_plan;
  const review = s.project?.model?.photo_review;
  const outline = s.project?.model?.outline_fit;
  return (
    <Modal title="细节调整" onClose={onClose}>
      <p className="muted">调整尺寸、造型参数和参考设置。手动修改的参数会固定，可随时解锁。</p>
      <ProviderChoice />
      <div className="surface-details-grid">
        <section className="modeling-plan surface-plan">
          <h3>{plan?.title || '尺寸与造型'}</h3>
          {plan ? (
            <ParameterEditor />
          ) : (
            <label>
              作品高度（mm）
              <input
                type="number"
                min={10}
                max={500}
                value={s.spec.height_mm}
                disabled={s.busy || s.running}
                onChange={(e) => {
                  const val = e.target.value;
                  const num = parseInt(val, 10);
                  if (!isNaN(num) && num > 0) {
                    s.setSpec((old) => patchDimensions(old, { height_mm: num }));
                  }
                }}
                onBlur={(e) => {
                  const num = parseInt(e.target.value, 10);
                  if (isNaN(num) || num < 10) {
                    s.setSpec((old) => patchDimensions(old, { height_mm: 10 }));
                  } else if (num > 500) {
                    s.setSpec((old) => patchDimensions(old, { height_mm: 500 }));
                  }
                }}
              />
            </label>
          )}
          <label>
            <input
              type="checkbox"
              checked={s.spec.base}
              disabled={s.busy || s.running}
              onChange={(e) => s.setSpec((old) => ({ ...old, base: e.target.checked }))}
            />{' '}
            加底座
          </label>
          {s.spec.base && (
            <label>
              底座厚度（mm）
              <input
                type="number"
                min={0.8}
                max={20}
                value={s.spec.bottom_mm}
                disabled={s.busy || s.running}
                onChange={(e) => {
                  if (e.target.value && e.target.validity.valid)
                    s.setSpec((old) => ({ ...old, bottom_mm: e.target.valueAsNumber }));
                }}
              />
            </label>
          )}
          <small>完成调整后，点击一键建模保存新版本。</small>
        </section>
        <section className="modeling-plan surface-plan">
          <h3>参考与补全</h3>
          <p>
            已选 {s.spec.asset_ids.length}{' '}
            张照片。根据可见轮廓制作立体造型，补充侧面、背面或细节照片可提供更多依据。
          </p>
          {review && (
            <p className={review.status === 'draft_retained' ? 'surface-warning' : 'muted'}>
              {review.status === 'refined'
                ? '已根据实际三视图对照照片修订造型。'
                : review.status === 'accepted'
                  ? review.message
                  : review.status === 'unchanged'
                    ? '已完成实际三视图的照片对照。'
                    : `本次保留草稿，照片外观尚未通过：${review.message}`}
            </p>
          )}
          {outline?.status === 'fitted' && (
            <p className="muted">
              已按 {outline.used_views}{' '}
              张照片的实际主体边缘调整轮廓。视角为估计值，缺失表面仍是设计补全。
            </p>
          )}
          {plan?.assumptions.map((item, i) => (
            <p key={i} className="surface-warning">
              {item}
            </p>
          ))}
          <small>参考造型包含设计推测；成品尺寸检查与照片相似度分别记录。</small>
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
