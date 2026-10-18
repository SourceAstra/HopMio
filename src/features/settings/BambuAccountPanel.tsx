import { useState, useEffect, useCallback } from 'react';
import {
  Printer,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  LogOut,
  Radio,
  Thermometer,
  Gauge,
  Clock,
  Layers,
  ChevronRight,
  Lock,
} from 'lucide-react';
import { call } from '../../api/client';
import type { BambuStatus, BambuDevice, Preferences } from '../../types';

interface BambuAccountPanelProps {
  token: string;
  preferences: Preferences;
  onPreferencesChange: (next: Preferences) => void;
  onNotice: (msg: string) => void;
}

export function BambuAccountPanel({
  token,
  preferences,
  onPreferencesChange,
  onNotice,
}: BambuAccountPanelProps) {
  const bambu = preferences.bambu;
  const isConfigured = Boolean(bambu?.configured);

  // 登录表单状态
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [region, setRegion] = useState<'cn' | 'global'>('cn');
  const [code, setCode] = useState('');
  const [needsCode, setNeedsCode] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 打印密码管理
  const isPrintPinSet = Boolean(preferences.print_pin_set);
  const [editingPrintPin, setEditingPrintPin] = useState(false);
  const [newPrintPin, setNewPrintPin] = useState('');
  const [confirmPrintPin, setConfirmPrintPin] = useState('');
  const [savingPrintPin, setSavingPrintPin] = useState(false);
  const [printPinError, setPrintPinError] = useState('');

  const handleSavePrintPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPrintPin.length < 6 || newPrintPin.length > 32) {
      setPrintPinError('打印密码长度需在 6 至 32 位之间');
      return;
    }
    if (newPrintPin !== confirmPrintPin) {
      setPrintPinError('两次输入的打印密码不一致');
      return;
    }
    setSavingPrintPin(true);
    setPrintPinError('');
    try {
      const res = await call<{ print_pin_set?: boolean }>('settings.unlock', {
        token,
        action: 'set_print_pin',
        new_print_pin: newPrintPin.trim(),
      });
      if (res?.print_pin_set) {
        onPreferencesChange({ ...preferences, print_pin_set: true });
        onNotice('专属打印密码已设置成功！与家长设置密码相互独立。');
        setEditingPrintPin(false);
        setNewPrintPin('');
        setConfirmPrintPin('');
      }
    } catch (err) {
      setPrintPinError((err as Error).message);
    } finally {
      setSavingPrintPin(false);
    }
  };

  // 设备列表状态
  const [devices, setDevices] = useState<BambuDevice[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [selectingDevId, setSelectingDevId] = useState<string | null>(null);

  // 刷新设备列表
  const refreshDevices = useCallback(async () => {
    if (!isConfigured) return;
    setLoadingDevices(true);
    try {
      const res = await call<{ devices?: BambuDevice[]; status?: BambuStatus }>('settings.unlock', {
        token,
        action: 'bambu_devices',
      });
      if (res?.devices) {
        setDevices(res.devices);
      }
      if (res?.status) {
        onPreferencesChange({ ...preferences, bambu: res.status });
      }
    } catch (err) {
      onNotice((err as Error).message);
    } finally {
      setLoadingDevices(false);
    }
  }, [token, isConfigured, preferences, onPreferencesChange, onNotice]);

  useEffect(() => {
    if (isConfigured) {
      void refreshDevices();
    }
  }, [isConfigured]);

  // 登录提交
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account.trim() || !password.trim()) {
      onNotice('请输入拓竹账号与密码');
      return;
    }
    setSubmitting(true);
    try {
      const res = await call<{
        bambu?: { success?: boolean; needs_code?: boolean; message?: string; devices?: BambuDevice[] };
        status?: BambuStatus;
      }>('settings.unlock', {
        token,
        action: 'bambu_login',
        account: account.trim(),
        password,
        region,
        ...(needsCode && code ? { code: code.trim() } : {}),
      });

      if (res?.bambu?.needs_code) {
        setNeedsCode(true);
        onNotice(res.bambu.message || '请输入邮箱安全验证码');
      } else if (res?.bambu?.success) {
        onNotice('拓竹账号登录成功！');
        setNeedsCode(false);
        setPassword('');
        setCode('');
        if (res.bambu.devices) {
          setDevices(res.bambu.devices);
        }
        if (res.status) {
          onPreferencesChange({ ...preferences, bambu: res.status });
        }
      }
    } catch (err) {
      onNotice((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  // 选择当前打印机
  const handleSelectDevice = async (devId: string) => {
    setSelectingDevId(devId);
    try {
      const res = await call<{ status?: BambuStatus }>('settings.unlock', {
        token,
        action: 'bambu_select',
        dev_id: devId,
      });
      if (res?.status) {
        onPreferencesChange({ ...preferences, bambu: res.status });
        setDevices((prev) =>
          prev.map((d) => ({ ...d, selected: d.dev_id === devId })),
        );
        onNotice('已选择当前拓竹打印机！');
      }
    } catch (err) {
      onNotice((err as Error).message);
    } finally {
      setSelectingDevId(null);
    }
  };

  // 退出登录
  const handleLogout = async () => {
    if (!confirm('确定退出当前绑定的拓竹账号吗？')) return;
    setSubmitting(true);
    try {
      const res = await call<{ status?: BambuStatus }>('settings.unlock', {
        token,
        action: 'bambu_logout',
      });
      if (res?.status) {
        onPreferencesChange({ ...preferences, bambu: res.status });
      }
      setDevices([]);
      onNotice('已断开拓竹云账号连接。');
    } catch (err) {
      onNotice((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const tele = bambu?.telemetry;

  return (
    <div className="parent-panel" id="parent-panel-bambu" role="tabpanel" aria-labelledby="parent-tab-bambu">
      <header className="parent-section-heading">
        <div className="parent-heading-lead">
          <Printer size={22} className="parent-heading-icon" />
          <div>
            <h3>拓竹云打印与设备绑定 (Bambu Lab)</h3>
            <p>通过拓竹官方云协议，在云端直接向实体 3D 打印机派发切片并实时遥测状态。</p>
          </div>
        </div>
      </header>

      {/* 专属 3D 打印密码管理卡片 */}
      <section className="parent-card" style={{ marginBottom: 16 }}>
        <div className="parent-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h4 style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Lock size={16} color="var(--accent, #f59e0b)" />
              专属 3D 打印制造密码
            </h4>
            <span className="parent-badge-soft">独立于家长设置密码 · 物理制造专防</span>
          </div>
          {!editingPrintPin && (
            <button
              type="button"
              className="parent-btn-secondary"
              onClick={() => {
                setEditingPrintPin(true);
                setPrintPinError('');
              }}
            >
              {isPrintPinSet ? '修改专属打印密码' : '设置专属打印密码'}
            </button>
          )}
        </div>
        <p className="parent-hint" style={{ marginTop: 6 }}>
          专属打印密码专门用于在造物制造站启动实机制造或急停。与家长设置密码分开后，即使孩子拥有打印密码，也无法随意更改家长全局配置与 AI 模型密钥。
        </p>

        {editingPrintPin ? (
          <form onSubmit={handleSavePrintPin} style={{ maxWidth: 440, marginTop: 14 }}>
            <label className="parent-field">
              <span className="parent-field-label">新专属打印密码 (6-32位)</span>
              <input
                type="password"
                value={newPrintPin}
                onChange={(e) => setNewPrintPin(e.target.value)}
                placeholder="输入 6 至 32 位新打印密码"
                required
                disabled={savingPrintPin}
                className="parent-input"
              />
            </label>
            <label className="parent-field" style={{ marginTop: 10 }}>
              <span className="parent-field-label">再次确认新打印密码</span>
              <input
                type="password"
                value={confirmPrintPin}
                onChange={(e) => setConfirmPrintPin(e.target.value)}
                placeholder="再次输入以确认"
                required
                disabled={savingPrintPin}
                className="parent-input"
              />
            </label>
            {printPinError && (
              <p style={{ margin: '8px 0 0 0', fontSize: 12, color: '#ef4444' }}>
                {printPinError}
              </p>
            )}
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button type="submit" className="parent-btn-primary" disabled={savingPrintPin}>
                {savingPrintPin ? '正在保存…' : '保存专属打印密码'}
              </button>
              <button
                type="button"
                className="parent-btn-secondary"
                disabled={savingPrintPin}
                onClick={() => setEditingPrintPin(false)}
              >
                取消
              </button>
            </div>
          </form>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 13 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: isPrintPinSet ? '#22c55e' : '#f59e0b',
                display: 'inline-block',
              }}
            />
            <span style={{ color: isPrintPinSet ? '#15803d' : '#b45309', fontWeight: 500 }}>
              {isPrintPinSet
                ? '已配置独立打印密码 · 每次实机启动打印均须校验'
                : '尚未配置独立打印密码 · 首次实机打印时将引导设定'}
            </span>
          </div>
        )}
      </section>

      {!isConfigured ? (
        <section className="parent-card">
          <div className="parent-card-header">
            <h4>登录拓竹官方账号</h4>
            <span className="parent-badge-soft">支持 A1 / P1 / X1 全系列</span>
          </div>
          <p className="parent-hint">
            呀哈造物仅通过官方加密安全信道与您的拓竹云同步设备，密钥保存在本地 SQLite，绝不泄露给第三方。
          </p>

          <form onSubmit={handleLogin} className="parent-form-vertical" style={{ maxWidth: 460, marginTop: 16 }}>
            <label className="parent-field">
              <span className="parent-field-label">服务区域</span>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value as 'cn' | 'global')}
                disabled={submitting}
                className="parent-select"
              >
                <option value="cn">中国大陆服务区 (bambulab.cn)</option>
                <option value="global">全球国际服务区 (bambulab.com)</option>
              </select>
            </label>

            <label className="parent-field">
              <span className="parent-field-label">拓竹账号 (邮箱 / 手机号)</span>
              <input
                type="text"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                placeholder="例如 yourname@example.com"
                disabled={submitting}
                required
                className="parent-input"
              />
            </label>

            <label className="parent-field">
              <span className="parent-field-label">拓竹密码</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="输入拓竹账号密码"
                disabled={submitting}
                required
                className="parent-input"
              />
            </label>

            {needsCode && (
              <label className="parent-field">
                <span className="parent-field-label">二次安全验证码 (2FA)</span>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="请输入邮箱中收到的 6 位验证码"
                  disabled={submitting}
                  required
                  className="parent-input"
                />
              </label>
            )}

            <div style={{ marginTop: 12 }}>
              <button type="submit" className="parent-btn-primary" disabled={submitting}>
                {submitting ? '正在连接拓竹云…' : needsCode ? '确认验证码并登录' : '连接拓竹云'}
              </button>
            </div>
          </form>
        </section>
      ) : (
        <>
          {/* 已绑定账号信息 */}
          <section className="parent-card">
            <div className="parent-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: 13, color: 'var(--text-muted, #888)' }}>已绑定的拓竹账号</span>
                <h4 style={{ margin: '4px 0 0 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckCircle2 size={18} color="#22c55e" />
                  {bambu?.account || '已连接'}
                </h4>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="parent-btn-secondary"
                  onClick={() => void refreshDevices()}
                  disabled={loadingDevices}
                  title="刷新设备列表与在线状态"
                >
                  <RefreshCw size={15} className={loadingDevices ? 'spin' : ''} />
                  刷新设备
                </button>
                <button
                  type="button"
                  className="parent-btn-secondary"
                  onClick={() => void handleLogout()}
                  disabled={submitting}
                  style={{ color: '#ef4444' }}
                >
                  <LogOut size={15} />
                  解绑账号
                </button>
              </div>
            </div>
          </section>

          {/* 设备选择列表 */}
          <section className="parent-card">
            <div className="parent-card-header">
              <h4>我的拓竹打印机列表</h4>
              <span className="parent-badge-soft">选择一台作为默认远程打印机</span>
            </div>

            {devices.length === 0 ? (
              <div style={{ padding: '16px 0', color: 'var(--text-muted, #888)' }}>
                {loadingDevices ? '正在拉取绑定的设备列表…' : '该账号下暂未发现绑定的拓竹 3D 打印机，请在 Bambu Handy App 中绑定机器。'}
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
                {devices.map((device) => {
                  const isSelected = device.dev_id === bambu?.selected_dev_id || device.selected;
                  return (
                    <div
                      key={device.dev_id}
                      style={{
                        padding: 14,
                        borderRadius: 8,
                        border: isSelected ? '2px solid var(--accent, #f59e0b)' : '1px solid var(--border, #e5e7eb)',
                        background: isSelected ? 'rgba(245, 158, 11, 0.05)' : 'transparent',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Printer size={18} />
                          <strong>{device.name}</strong>
                          <span
                            style={{
                              fontSize: 12,
                              padding: '2px 8px',
                              borderRadius: 12,
                              background: device.online ? '#dcfce7' : '#f3f4f6',
                              color: device.online ? '#15803d' : '#6b7280',
                            }}
                          >
                            {device.online ? '在线' : '离线'}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted, #888)', marginTop: 4 }}>
                          机型：{device.model} · 序列号：{device.dev_id}
                        </div>
                      </div>

                      <button
                        type="button"
                        className={isSelected ? 'parent-btn-primary' : 'parent-btn-secondary'}
                        disabled={isSelected || selectingDevId === device.dev_id}
                        onClick={() => void handleSelectDevice(device.dev_id)}
                      >
                        {isSelected ? '已选中' : '设为默认打印机'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* 实时遥测仪表盘 */}
          {tele && (
            <section className="parent-card">
              <div className="parent-card-header">
                <h4>实机实时遥测 (MQTT TLS)</h4>
                <span
                  style={{
                    fontSize: 12,
                    padding: '2px 8px',
                    borderRadius: 12,
                    background: bambu?.online ? '#dcfce7' : '#fee2e2',
                    color: bambu?.online ? '#15803d' : '#b91c1c',
                  }}
                >
                  {bambu?.online ? '实时通讯中' : '设备未连线或休眠'}
                </span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                  gap: 12,
                  marginTop: 14,
                }}
              >
                <div style={{ padding: 12, borderRadius: 8, background: 'var(--bg-subtle, #f9fafb)', textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted, #888)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <Gauge size={14} /> 运行状态
                  </div>
                  <strong style={{ fontSize: 16, marginTop: 4, display: 'block' }}>
                    {tele.gcode_state === 'RUNNING'
                      ? '打印中'
                      : tele.gcode_state === 'PAUSE'
                        ? '已暂停'
                        : tele.gcode_state === 'FINISH'
                          ? '打印完成'
                          : tele.gcode_state || '空闲'}
                  </strong>
                </div>

                <div style={{ padding: 12, borderRadius: 8, background: 'var(--bg-subtle, #f9fafb)', textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted, #888)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <Thermometer size={14} /> 喷嘴温度
                  </div>
                  <strong style={{ fontSize: 16, marginTop: 4, display: 'block' }}>
                    {tele.nozzle_temper}°C{' '}
                    <span style={{ fontSize: 12, color: 'var(--text-muted, #888)' }}>/ {tele.nozzle_target}°C</span>
                  </strong>
                </div>

                <div style={{ padding: 12, borderRadius: 8, background: 'var(--bg-subtle, #f9fafb)', textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted, #888)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <Thermometer size={14} /> 热床温度
                  </div>
                  <strong style={{ fontSize: 16, marginTop: 4, display: 'block' }}>
                    {tele.bed_temper}°C{' '}
                    <span style={{ fontSize: 12, color: 'var(--text-muted, #888)' }}>/ {tele.bed_target}°C</span>
                  </strong>
                </div>

                <div style={{ padding: 12, borderRadius: 8, background: 'var(--bg-subtle, #f9fafb)', textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted, #888)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <Clock size={14} /> 剩余时间
                  </div>
                  <strong style={{ fontSize: 16, marginTop: 4, display: 'block' }}>
                    {tele.remaining_minutes > 0 ? `${tele.remaining_minutes} 分钟` : '-'}
                  </strong>
                </div>

                <div style={{ padding: 12, borderRadius: 8, background: 'var(--bg-subtle, #f9fafb)', textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted, #888)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <Layers size={14} /> 打印层数
                  </div>
                  <strong style={{ fontSize: 16, marginTop: 4, display: 'block' }}>
                    {tele.layer_num} / {tele.total_layers || '-'}
                  </strong>
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
