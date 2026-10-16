import { useStudio } from '../state/StudioContext';
import { CottageRoomHeading } from '../components/CottageRoomHeading';
import { ExportButtons } from '../features/printing/ExportButtons';
import { call } from '../api/client';
import type { Profile } from '../types';
import { StudioLaunchButton } from '../features/printing/StudioLaunchButton';
export function Preparation() {
  const s = useStudio();
  const update = (p: Partial<Profile>) => s.setProfile((old) => ({ ...old, ...p }));
  return (
    <>
      <CottageRoomHeading
        room="prepare"
        description="选择实际喷嘴与材料，生成本地切片，再和家长检查打印预览。"
        actions={<StudioLaunchButton />}
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
            A1 mini · 180 × 180 × 180 mm。切片使用随 Bambu Studio 发布的官方机型参数。
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
            disabled={s.busy || s.running}
            onClick={() =>
              void s.act(async () => {
                s.setProfile(await call<Profile>('profile.save', { profile: s.profile }));
                const list = await s.refresh();
                const current = list.find((p) => p.id === s.project?.id);
                if (current) s.adopt(current);
                s.setNotice('打印配置已保存。参数改变后，旧体检和切片失效，请重新检查。');
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
            普通 3MF 保存模型；“已切片打印文件”另含实际打印路径。真实耗时与耗材来自本次切片报告。
          </div>
          <button className="link" onClick={() => s.setRoom('print')}>
            去打印站查看家庭操作清单 →
          </button>
        </section>
      </div>
    </>
  );
}
