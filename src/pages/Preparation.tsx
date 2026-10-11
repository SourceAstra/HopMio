import { useStudio } from '../state/StudioContext';
import { PageHeading } from '../components/PageHeading';
import { ExportButtons } from '../features/printing/ExportButtons';
import { call } from '../api/client';
import type { Profile } from '../types';
export function Preparation() {
  const s = useStudio();
  const update = (p: Partial<Profile>) => s.setProfile((old) => ({ ...old, ...p }));
  return (
    <>
      <PageHeading
        title="打印准备台"
        description="作品打包好，和家长一起在 Bambu Studio 检查切片。"
      />
      <div className="two-columns">
        <section className="panel form-panel">
          <h2>我的打印机</h2>
          <label>
            机型
            <select value={s.profile.machine} onChange={(e) => update({ machine: e.target.value })}>
              <option>A1 mini</option>
            </select>
          </label>
          <p className="soft-notice">
            单色版 · 180 × 180 × 180 mm。当前设备配置只验证 A1 mini 的尺寸。
          </p>
          <div className="form-grid">
            <label>
              喷嘴直径
              <select
                value={s.profile.nozzle_mm}
                onChange={(e) => update({ nozzle_mm: Number(e.target.value) })}
              >
                <option value={0.2}>0.2 mm</option>
                <option value={0.4}>0.4 mm</option>
                <option value={0.6}>0.6 mm</option>
              </select>
            </label>
            <label>
              层高
              <input
                type="number"
                min={0.06}
                max={0.4}
                step={0.02}
                value={s.profile.layer_mm}
                onChange={(e) => update({ layer_mm: Number(e.target.value) })}
              />
            </label>
            <label>
              材料
              <select
                value={s.profile.material}
                onChange={(e) => update({ material: e.target.value })}
              >
                <option>PLA</option>
                <option>PETG</option>
              </select>
            </label>
            <label>
              四周留边（mm）
              <input
                type="number"
                min={0}
                max={20}
                value={s.profile.margin_mm}
                onChange={(e) => update({ margin_mm: Number(e.target.value) })}
              />
            </label>
          </div>
          <button
            className="secondary"
            disabled={s.busy}
            onClick={() =>
              void s.act(async () => {
                s.setProfile(await call<Profile>('profile.save', { profile: s.profile }));
                const list = await s.refresh();
                const current = list.find((p) => p.id === s.project?.id);
                if (current) s.adopt(current);
                s.setNotice('打印配置已保存。变化后的旧体检已失效，请重新检查。');
              })
            }
          >
            保存打印配置
          </button>
        </section>
        <section className="panel form-panel">
          <h2>把作品带走</h2>
          <p>STL 是单色打印网格；3MF 保留毫米单位；GLB 用于预览；.usagi 保存模型、想法和材料。</p>
          <ExportButtons />
          <div className="soft-notice">
            这里导出的是模型文件，尚未切片。真实耗时、耗材和支撑由 Bambu Studio 的切片结果确定。
          </div>
          <button className="link" onClick={() => s.setRoom('print')}>
            去打印站查看家庭操作清单 →
          </button>
        </section>
      </div>
    </>
  );
}
