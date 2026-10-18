import { useState } from 'react';
import {
  Printer,
  ShieldCheck,
  Sliders,
  Download,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { useStudio } from '../state/StudioContext';
import { call, download } from '../api/client';
import type { Profile, Asset } from '../types';
import { CottageRoomHeading } from '../components/CottageRoomHeading';
import { BambuPrinterCard } from '../features/printing/BambuPrinterCard';
import { SlicePanel } from '../features/printing/SlicePanel';
import { StudioLaunchButton } from '../features/printing/StudioLaunchButton';

export function PrintStation() {
  const s = useStudio();

  // 安全检查清单
  const [checked, setChecked] = useState<string[]>([
    '家长已检查首层、薄壁与支撑',
    '打印板干净，材料与喷嘴配置正确',
  ]);
  const checklist = [
    '家长已检查首层、薄壁与支撑',
    '打印板干净，材料与喷嘴配置正确',
    '打印机周围留出空间，不触摸热喷嘴与热床',
    '由家长输入密码确认并启动实机打印',
  ];

  // 打印配置修改
  const [configOpen, setConfigOpen] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  const updateProfile = (p: Partial<Profile>) => {
    s.setProfile((old) => ({ ...old, ...p }));
  };

  const handleSaveProfile = async () => {
    setSavingConfig(true);
    try {
      const saved = await call<Profile>('profile.save', { profile: s.profile });
      s.setProfile(saved);
      const list = await s.refresh();
      const current = list.find((p) => p.id === s.project?.id);
      if (current) s.adopt(current);
      s.setNotice('打印配置已保存。若参数改变，请重新生成切片。');
    } catch (err) {
      s.setNotice((err as Error).message);
    } finally {
      setSavingConfig(false);
    }
  };

  // 导出单文件
  const exportFile = (format: string) =>
    s.act(async () => {
      if (!s.project) return;
      const asset = await call<Asset>('project.export', { id: s.project.id, format });
      const filename =
        s.project.name +
        (format === 'source_glb'
          ? '.source.glb'
          : format === 'manufacturing_glb'
            ? '.manufacturing.glb'
            : '.' + format);
      const res = await download(asset.id, filename);
      if (res?.saved) {
        s.setNotice(`已成功将 ${filename} 保存到您的本地设备！`);
      }
    });

  return (
    <div className="print-station-page">
      <CottageRoomHeading
        room="print"
        description="从切片路径生成、参数微调到拓竹实机云打印，一站式与家长共同完成制造。"
        actions={<StudioLaunchButton includeModel />}
      />

      <div className="two-columns print-station-grid" style={{ alignItems: 'start', gap: 20 }}>
        {/* 左栏：拓竹实机遥测与制造主控 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 1. 实机遥测与云打印卡片 */}
          <BambuPrinterCard />

          {/* 2. 家庭安全与实机检查清单 */}
          <section className="panel form-panel" style={{ padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <ShieldCheck size={20} color="var(--accent, #f59e0b)" />
              <h3 style={{ margin: 0, fontSize: 16 }}>和家长一起检查</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {checklist.map((text) => {
                const isChecked = checked.includes(text);
                return (
                  <label
                    className="checklist"
                    key={text}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 12px',
                      borderRadius: 6,
                      background: isChecked ? 'rgba(34, 197, 94, 0.06)' : 'var(--bg-subtle, #f9fafb)',
                      border: isChecked ? '1px solid rgba(34, 197, 94, 0.25)' : '1px solid var(--border, #e5e7eb)',
                      cursor: 'pointer',
                      fontSize: 13,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) =>
                        setChecked((old) =>
                          e.target.checked ? [...old, text] : old.filter((t) => t !== text),
                        )
                      }
                      style={{ accentColor: '#16a34a' }}
                    />
                    <span>{text}</span>
                  </label>
                );
              })}
            </div>
            <p className="soft-notice" style={{ marginTop: 12, marginBottom: 0 }}>
              支持拓竹官方云协议直传实机；3D 打印喷嘴温度高达 200°C 以上，开始打印后切勿触摸机身内部。
            </p>
          </section>
        </div>

        {/* 右栏：真实切片、机型参数微调与导出交付 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 1. A1 mini 真实物理切片面板 */}
          <div className="panel form-panel" style={{ padding: 18 }}>
            <SlicePanel />
          </div>

          {/* 2. 机型与切片参数微调抽屉 */}
          <section className="panel form-panel" style={{ padding: 18 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                cursor: 'pointer',
              }}
              onClick={() => setConfigOpen(!configOpen)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sliders size={18} color="var(--accent, #f59e0b)" />
                <h3 style={{ margin: 0, fontSize: 16 }}>打印机与耗材参数配置</h3>
              </div>
              <button
                type="button"
                className="link"
                style={{ fontSize: 12, padding: 0 }}
                onClick={(e) => {
                  e.stopPropagation();
                  setConfigOpen(!configOpen);
                }}
              >
                {configOpen ? '收起配置 ▲' : '展开微调 ▼'}
              </button>
            </div>

            {configOpen && (
              <div style={{ marginTop: 14 }}>
                <label>
                  机型
                  <select
                    value={s.profile.machine}
                    onChange={(e) => updateProfile({ machine: e.target.value })}
                  >
                    <option value="A1 mini">Bambu Lab A1 mini (180 × 180 × 180 mm)</option>
                  </select>
                </label>

                <div className="form-grid" style={{ marginTop: 8 }}>
                  <label>
                    喷嘴直径
                    <select
                      value={s.profile.nozzle_mm}
                      onChange={(e) => updateProfile({ nozzle_mm: Number(e.target.value) })}
                    >
                      <option value={0.2}>0.2 mm (超精细雕刻)</option>
                      <option value={0.4}>0.4 mm (标准推荐)</option>
                      <option value={0.6}>0.6 mm (粗壮快速)</option>
                    </select>
                  </label>
                  <label>
                    层高 (mm)
                    <input
                      type="number"
                      min={0.06}
                      max={0.4}
                      step={0.02}
                      value={s.profile.layer_mm}
                      onChange={(e) => updateProfile({ layer_mm: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    耗材材料
                    <select
                      value={s.profile.material}
                      onChange={(e) => updateProfile({ material: e.target.value })}
                    >
                      <option value="PLA">PLA (儿童友好 · 易打印)</option>
                      <option value="PETG">PETG (耐温韧性更好)</option>
                    </select>
                  </label>
                  <label>
                    四周留边 (mm)
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={s.profile.margin_mm}
                      onChange={(e) => updateProfile({ margin_mm: Number(e.target.value) })}
                    />
                  </label>
                </div>

                <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="secondary"
                    disabled={s.busy || s.running || savingConfig}
                    onClick={() => void handleSaveProfile()}
                  >
                    {savingConfig ? '正在保存…' : '保存打印配置'}
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* 3. 把作品带走 · 格式导出 */}
          <section className="panel form-panel" style={{ padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Download size={18} color="var(--accent, #f59e0b)" />
              <h3 style={{ margin: 0, fontSize: 16 }}>保存与导出作品交付包</h3>
            </div>
            <p style={{ margin: '0 0 12px 0', fontSize: 13, color: 'var(--text-muted, #666)' }}>
              可随时将模型直接保存到您的本地电脑设备，方便离线归档或在其他切片软件中查看：
            </p>

            <div className="export-grid" style={{ marginBottom: 12 }}>
              {[
                'stl',
                '3mf',
                'glb',
                ...(s.project?.model?.source_glb_id ? ['source_glb', 'manufacturing_glb'] : []),
                ...(s.project?.model?.blend_id ? ['blend'] : []),
                'usagi',
              ].map((format) => (
                <button
                  className="secondary"
                  key={format}
                  disabled={s.busy || s.running || !s.project?.model || s.dirty}
                  onClick={() => void exportFile(format)}
                >
                  <Download size={15} />
                  {format === 'usagi'
                    ? '作品包 .usagi'
                    : format === 'source_glb'
                      ? '原始扫描 GLB'
                      : format === 'manufacturing_glb'
                        ? '制造实体 GLB'
                        : format.toUpperCase()}
                </button>
              ))}
            </div>

            <StudioLaunchButton includeModel />
          </section>
        </div>
      </div>
    </div>
  );
}
