import { useState } from 'react';
import { ShieldCheck, Cloud, CloudOff, Gauge, Lock, HardDrive, HeartHandshake, KeyRound, Check, AlertCircle, Eye, EyeOff } from 'lucide-react';

export function ParentGuardPanel({
  cloudEnabled,
  dailyLimit,
  onChangeCloudEnabled,
  onChangeDailyLimit,
  onUpdatePin,
  disabled,
}: {
  cloudEnabled: boolean;
  dailyLimit: number;
  onChangeCloudEnabled: (enabled: boolean) => void;
  onChangeDailyLimit: (limit: number) => void;
  onUpdatePin?: (oldPin: string, newPin: string) => Promise<boolean>;
  disabled?: boolean;
}) {
  const PRESET_LIMITS = [10, 20, 50, 0];
  const [isChangingPin, setIsChangingPin] = useState(false);
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');
  const [showNewPin, setShowNewPin] = useState(false);
  const [pinError, setPinError] = useState('');
  const [pinNotice, setPinNotice] = useState('');
  const [pinLoading, setPinLoading] = useState(false);

  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPin) {
      setPinError('请填写原家长密码以验证身份。');
      return;
    }
    if (newPin.length < 6 || newPin.length > 32) {
      setPinError('请填写 6 至 32 位新密码（支持大小写字母、数字及符号）。');
      return;
    }
    if (newPin !== confirmNewPin) {
      setPinError('两次输入的新密码不一致，请重新核对。');
      return;
    }
    if (!onUpdatePin) return;
    setPinLoading(true);
    setPinError('');
    try {
      const ok = await onUpdatePin(oldPin, newPin);
      if (ok) {
        setPinNotice('家长密码已成功更新！');
        setOldPin('');
        setNewPin('');
        setConfirmNewPin('');
        setIsChangingPin(false);
        setTimeout(() => setPinNotice(''), 4000);
      }
    } catch (err) {
      setPinError((err as Error).message || '更新密码失败，请检查原密码。');
    } finally {
      setPinLoading(false);
    }
  };

  return (
    <div className="guardian-panel-container">
      {/* 核心开关与配额控制卡片 */}
      <div className="guardian-controls-grid">
        {/* 卡片 1: 云端协同开关 */}
        <section className={`guardian-card ${cloudEnabled ? 'active-glow' : 'offline-glow'}`}>
          <div className="guardian-card-head">
            <div className="guardian-icon-pill">
              {cloudEnabled ? <Cloud size={22} className="icon-cloud-active" /> : <CloudOff size={22} className="icon-cloud-off" />}
            </div>
            <div className="guardian-card-title">
              <h3>云端 AI 协同授权</h3>
              <p>决定乌萨奇什么时候可以向云端大模型请教想法与方案。</p>
            </div>
            <label className="switch-toggle" title={cloudEnabled ? '点击关闭云端协同' : '点击开启云端协同'}>
              <input
                type="checkbox"
                checked={cloudEnabled}
                disabled={disabled}
                onChange={(e) => onChangeCloudEnabled(e.target.checked)}
              />
              <span className="slider round" />
            </label>
          </div>

          <div className="guardian-status-box">
            <div className="guardian-status-tag">
              <span className={`status-indicator-dot ${cloudEnabled ? 'online' : 'offline'}`} />
              <strong>{cloudEnabled ? '当前状态：已开启云端造物' : '当前状态：纯本地离线模式'}</strong>
            </div>
            <p className="guardian-status-explain">
              {cloudEnabled
                ? '开启后，乌萨奇可将孩子输入的文字和选定的照片安全传输至已配置的云端 AI 模型，生成精细三维建模方案。'
                : '关闭后，小屋仅运行本地 Blender 内置算法与已有模板，完全不向外网发送任何数据，保护绝对离线隐私。'}
            </p>
          </div>
        </section>

        {/* 卡片 2: 每日造物额度限制 */}
        <section className="guardian-card">
          <div className="guardian-card-head">
            <div className="guardian-icon-pill">
              <Gauge size={22} className="icon-gauge" />
            </div>
            <div className="guardian-card-title">
              <h3>每日云端造物额度</h3>
              <p>合理设定每天的使用频次，防沉迷并防止 API 额度意外超支。</p>
            </div>
          </div>

          <div className="guardian-quota-body">
            <div className="guardian-quota-input-row">
              <label htmlFor="daily-quota-input" className="guardian-quota-label">
                单日造物上限：
              </label>
              <div className="guardian-number-wrap">
                <input
                  id="daily-quota-input"
                  type="number"
                  min={0}
                  max={999}
                  value={dailyLimit}
                  disabled={disabled || !cloudEnabled}
                  onChange={(e) => onChangeDailyLimit(Math.max(0, Number(e.target.value)))}
                />
                <span className="unit-label">次 / 天</span>
              </div>
              <span className="quota-hint-pill">
                {dailyLimit === 0 ? '✨ 当前为不限次数' : `⚡ 每天最多生成 ${dailyLimit} 件方案`}
              </span>
            </div>

            {/* 快捷设置预设 */}
            <div className="guardian-presets">
              <span className="presets-label">常用预设：</span>
              <div className="preset-buttons">
                {PRESET_LIMITS.map((limit) => (
                  <button
                    key={limit}
                    type="button"
                    disabled={disabled || !cloudEnabled}
                    className={`preset-btn ${dailyLimit === limit ? 'active' : ''}`}
                    onClick={() => onChangeDailyLimit(limit)}
                  >
                    {limit === 0 ? '不限次' : `${limit} 次`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 卡片 3: 家长安全门禁口令管理 */}
        <section className="guardian-card">
          <div className="guardian-card-head">
            <div className="guardian-icon-pill">
              <KeyRound size={22} className="icon-key" style={{ color: '#d97706' }} />
            </div>
            <div className="guardian-card-title">
              <h3>家长安全门禁口令</h3>
              <p>工坊已上线公网，凭借此 6-12 位数字口令守护大模型密钥与核心设置。</p>
            </div>
            {!isChangingPin ? (
              <button
                type="button"
                className="preset-btn active"
                style={{ height: '34px', padding: '0 14px' }}
                onClick={() => setIsChangingPin(true)}
              >
                修改口令
              </button>
            ) : null}
          </div>

          <div className="guardian-quota-body" style={{ marginTop: '14px' }}>
            {pinNotice && (
              <div className="gate-error-message" style={{ background: '#ecfdf5', borderColor: '#a7f3d0', color: '#065f46', marginBottom: '12px' }}>
                <Check size={14} />
                <span>{pinNotice}</span>
              </div>
            )}

            {isChangingPin ? (
              <form onSubmit={handleSavePin} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.4fr 1.4fr', gap: '10px' }}>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                      type={showNewPin ? 'text' : 'password'}
                      maxLength={32}
                      value={oldPin}
                      onChange={(e) => {
                        setOldPin(e.target.value);
                        if (pinError) setPinError('');
                      }}
                      placeholder="原家长密码"
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: '10px',
                        border: '1.5px solid #d97706',
                        fontSize: '13.5px',
                        boxSizing: 'border-box',
                      }}
                      disabled={pinLoading}
                      autoFocus
                    />
                  </div>

                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                      type={showNewPin ? 'text' : 'password'}
                      maxLength={32}
                      value={newPin}
                      onChange={(e) => {
                        setNewPin(e.target.value);
                        if (pinError) setPinError('');
                      }}
                      placeholder="新密码（6-32位）"
                      style={{
                        width: '100%',
                        padding: '9px 36px 9px 12px',
                        borderRadius: '10px',
                        border: '1.5px solid #d97706',
                        fontSize: '13.5px',
                        boxSizing: 'border-box',
                      }}
                      disabled={pinLoading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPin(!showNewPin)}
                      style={{
                        position: 'absolute',
                        right: '10px',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#8c7b64',
                        padding: '2px',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                      title={showNewPin ? '隐藏明文' : '显示明文'}
                    >
                      {showNewPin ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>

                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                      type={showNewPin ? 'text' : 'password'}
                      maxLength={32}
                      value={confirmNewPin}
                      onChange={(e) => {
                        setConfirmNewPin(e.target.value);
                        if (pinError) setPinError('');
                      }}
                      placeholder="再次输入新密码确认"
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: '10px',
                        border: '1.5px solid #d97706',
                        fontSize: '13.5px',
                        boxSizing: 'border-box',
                      }}
                      disabled={pinLoading}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <button
                    type="submit"
                    className="primary"
                    disabled={pinLoading || !oldPin || newPin.length < 6 || confirmNewPin.length < 6}
                    style={{ padding: '8px 18px', borderRadius: '10px', fontSize: '13px' }}
                  >
                    {pinLoading ? '保存中…' : '确认更新密码'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsChangingPin(false);
                      setNewPin('');
                      setConfirmNewPin('');
                      setPinError('');
                    }}
                    disabled={pinLoading}
                    style={{ padding: '8px 14px', borderRadius: '10px', fontSize: '13px', background: '#f3f4f6', border: '1px solid #d1d5db' }}
                  >
                    取消
                  </button>
                </div>

                {pinError && (
                  <div className="gate-error-message" style={{ padding: '6px 10px', fontSize: '12px' }}>
                    <AlertCircle size={14} />
                    <span>{pinError}</span>
                  </div>
                )}
              </form>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#4b5563', fontSize: '13px' }}>
                <span className="status-indicator-dot online" />
                <span>已设置家长门禁保护，任何未解锁访问都无法查看或修改设置。</span>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* 隐私与安全基石 Bento 网格 */}
      <section className="guardian-trust-section">
        <div className="guardian-trust-head">
          <ShieldCheck size={20} className="trust-head-icon" />
          <div>
            <h3>系统级隐私与数据安全承诺</h3>
            <p>呀哈造物始终贯彻「本地优先、透明可控」设计原则，守护家庭与孩子的数字隐私。</p>
          </div>
        </div>

        <div className="guardian-trust-bento">
          <div className="trust-bento-card">
            <div className="bento-icon-box">
              <Lock size={20} />
            </div>
            <h4>本地加密凭据库</h4>
            <p>
              所有模型密钥（API Keys）由操作系统凭据库（Keychain / Credential Manager）本地硬件级加密存储，绝不进入源码、导出项目或公开日志。
            </p>
          </div>

          <div className="trust-bento-card">
            <div className="bento-icon-box">
              <ShieldCheck size={20} />
            </div>
            <h4>输入内容严格最小化</h4>
            <p>
              仅在您主动发起造物时，向所配置的模型端点发送当前的文字描述与所选照片；绝不扫描本地额外文件，绝不收集用户个人肖像与隐私数据。
            </p>
          </div>

          <div className="trust-bento-card">
            <div className="bento-icon-box">
              <HardDrive size={20} />
            </div>
            <h4>物理成果全量本地归属</h4>
            <p>
              生成的 Blender 工程（.blend）、网格模型（.glb / .stl）、制造切片（.gcode）全部物理保存在本地文件夹，您和孩子拥有作品的完整所有权。
            </p>
          </div>
        </div>
      </section>

      {/* 亲子共创寄语卡片 */}
      <div className="guardian-parent-tips">
        <HeartHandshake size={22} className="tips-icon" />
        <div className="tips-content">
          <strong>给家长的共创建议：</strong>
          <p>
            3D 造物不仅是技术的应用，更是想象力与空间感知的启蒙。在孩子喊出想法后，您可以陪孩子一起观察生成的 3D 模型轮廓，讨论尺寸与支撑，享受将灵感变为实物积木的快乐时光。
          </p>
        </div>
      </div>
    </div>
  );
}
