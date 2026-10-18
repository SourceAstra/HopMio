import { useState, useEffect } from 'react';
import {
  Printer,
  Thermometer,
  Layers,
  Clock,
  Send,
  AlertTriangle,
  Play,
  Pause,
  Square,
  Lock,
  ExternalLink,
  CheckCircle2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useStudio } from '../../state/StudioContext';
import { call } from '../../api/client';
import type { Preferences, Project } from '../../types';

export function BambuPrinterCard() {
  const s = useStudio();
  const bambu = s.preferences?.bambu;
  const tele = bambu?.telemetry;
  const isConfigured = Boolean(bambu?.configured);
  const isOnline = Boolean(bambu?.online);

  // 打印弹窗与家长确认
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [controlling, setControlling] = useState(false);

  // 定期轮询拓竹实机遥测（每 4 秒拉取一次最新状态）
  useEffect(() => {
    if (!isConfigured) return;
    const timer = setInterval(() => {
      void call<Preferences>('settings.get').then((res) => {
        if (res) {
          s.setPreferences(res);
        }
      }).catch(() => {
        // 静默处理，不打扰用户
      });
    }, 4000);
    return () => clearInterval(timer);
  }, [isConfigured, s]);

  const hasSliced = Boolean(s.project?.slicing?.asset_id);
  const isRunning = tele?.gcode_state === 'RUNNING';
  const isPaused = tele?.gcode_state === 'PAUSE';

  const isPrintPinSet = Boolean(s.preferences?.print_pin_set);

  // 派发实机打印
  const handlePrintSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!s.project?.id) return;
    const cleanPin = pin.trim();
    if (!cleanPin) {
      setPinError('请输入专属打印密码');
      return;
    }
    if (cleanPin.length < 6 || cleanPin.length > 32) {
      setPinError('打印密码长度应为 6 至 32 位');
      return;
    }

    setPinError('');
    setSubmitting(true);
    try {
      const res = await call<{
        project?: Project;
        bambu?: { dispatched: boolean; dev_id: string; task_name: string };
      }>('settings.unlock', {
        print_pin: cleanPin,
        action: 'bambu_print',
        project_id: s.project.id,
      });

      if (res?.project) {
        await s.refresh();
      }
      setShowPrintModal(false);
      setPin('');
      setPinError('');
      s.setNotice('✨ 专属打印密码校验通过！3MF 切片已直传拓竹云，实机打印已启动！');
    } catch (err) {
      const msg = (err as Error).message || '打印密码校验失败';
      setPinError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // 设备控制（暂停/继续/急停）
  const handleControl = async (command: 'pause' | 'resume' | 'stop') => {
    if (command === 'stop' && !confirm('确定要紧急停止当前实机打印吗？')) {
      return;
    }
    setControlling(true);
    try {
      // 拓竹实机控制：输入专属打印密码
      const printPin = prompt('操作实机前请输入专属打印密码：');
      if (!printPin) return;

      await call('settings.unlock', {
        print_pin: printPin.trim(),
        action: 'bambu_control',
        command,
      });
      s.setNotice(`已向拓竹打印机下发指令：${command === 'pause' ? '暂停' : command === 'resume' ? '继续' : '停止'}`);
    } catch (err) {
      s.setNotice((err as Error).message);
    } finally {
      setControlling(false);
    }
  };

  return (
    <section className="panel form-panel" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Printer size={22} color="var(--accent, #f59e0b)" />
          <h2 style={{ margin: 0, fontSize: 18 }}>拓竹远程实机 · 云打印</h2>
        </div>
        <span
          style={{
            fontSize: 12,
            padding: '3px 10px',
            borderRadius: 12,
            background: !isConfigured ? '#f3f4f6' : isOnline ? '#dcfce7' : '#fee2e2',
            color: !isConfigured ? '#6b7280' : isOnline ? '#15803d' : '#b91c1c',
            fontWeight: 500,
          }}
        >
          {!isConfigured ? '未绑定实机' : isOnline ? '在线遥测' : '设备离线'}
        </span>
      </div>

      {!isConfigured ? (
        <div
          style={{
            padding: 16,
            borderRadius: 8,
            background: 'var(--bg-subtle, #f9fafb)',
            border: '1px dashed var(--border, #e5e7eb)',
            textAlign: 'center',
          }}
        >
          <p style={{ margin: '0 0 12px 0', fontSize: 14, color: 'var(--text-muted, #666)' }}>
            当前尚未绑定拓竹官方设备。在家长设置中登录拓竹账号后，即可在此直接向实机发送打印并实时监控！
          </p>
          <a
            href="#settings"
            onClick={(e) => {
              e.preventDefault();
              s.setRoom('settings');
            }}
            className="secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
          >
            前往家长设置绑定拓竹设备 <ExternalLink size={15} />
          </a>
        </div>
      ) : (
        <>
          {/* 实机温度与状态仪表 */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 10,
            }}
          >
            <div style={{ padding: 10, borderRadius: 8, background: 'var(--bg-subtle, #f9fafb)' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted, #888)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Thermometer size={14} /> 喷嘴温度
              </div>
              <strong style={{ fontSize: 16, marginTop: 4, display: 'block' }}>
                {tele?.nozzle_temper ?? 0}°C{' '}
                <span style={{ fontSize: 12, color: 'var(--text-muted, #888)' }}>/ {tele?.nozzle_target ?? 0}°C</span>
              </strong>
            </div>

            <div style={{ padding: 10, borderRadius: 8, background: 'var(--bg-subtle, #f9fafb)' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted, #888)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Thermometer size={14} /> 热床温度
              </div>
              <strong style={{ fontSize: 16, marginTop: 4, display: 'block' }}>
                {tele?.bed_temper ?? 0}°C{' '}
                <span style={{ fontSize: 12, color: 'var(--text-muted, #888)' }}>/ {tele?.bed_target ?? 0}°C</span>
              </strong>
            </div>
          </div>

          {/* 实时打印进度 */}
          <div style={{ padding: 12, borderRadius: 8, background: 'var(--bg-subtle, #f9fafb)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
              <span>
                状态：<strong>{isRunning ? '正在打印' : isPaused ? '已暂停' : tele?.gcode_state === 'FINISH' ? '打印完成' : '就绪待命'}</strong>
              </span>
              <span><strong>{tele?.progress_percent ?? 0}%</strong></span>
            </div>
            <progress value={tele?.progress_percent ?? 0} max={100} style={{ width: '100%', height: 8 }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12, color: 'var(--text-muted, #888)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Clock size={13} />
                剩余用时：{tele?.remaining_minutes ? `${tele.remaining_minutes} 分钟` : '-'}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Layers size={13} />
                层数：{tele?.layer_num ?? 0} / {tele?.total_layers || '-'}
              </span>
            </div>

            {tele?.subtask_name && (
              <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted, #666)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                当前任务：{tele.subtask_name}
              </div>
            )}
          </div>

          {/* 控制按钮组 */}
          {(isRunning || isPaused) && (
            <div style={{ display: 'flex', gap: 8 }}>
              {isRunning && (
                <button
                  type="button"
                  className="secondary"
                  disabled={controlling}
                  onClick={() => void handleControl('pause')}
                  style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 4 }}
                >
                  <Pause size={15} /> 暂停打印
                </button>
              )}
              {isPaused && (
                <button
                  type="button"
                  className="primary"
                  disabled={controlling}
                  onClick={() => void handleControl('resume')}
                  style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 4 }}
                >
                  <Play size={15} /> 继续打印
                </button>
              )}
              <button
                type="button"
                className="secondary"
                disabled={controlling}
                onClick={() => void handleControl('stop')}
                style={{ flex: 1, color: '#ef4444', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 4 }}
              >
                <Square size={15} /> 紧急停止
              </button>
            </div>
          )}

          {/* 一键云打印入口 */}
          <div style={{ marginTop: 4 }}>
            {!hasSliced ? (
              <div style={{ fontSize: 13, color: 'var(--text-muted, #888)', background: '#fffbeb', padding: 10, borderRadius: 6, border: '1px solid #fef3c7' }}>
                💡 请先在右侧面板点击<strong>“生成 A1 mini 切片”</strong>，生成物理切片路径后即可一键云打印。
              </div>
            ) : (
              <button
                type="button"
                className="primary"
                style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, padding: '10px 16px' }}
                disabled={!isOnline || s.busy || submitting}
                onClick={() => setShowPrintModal(true)}
              >
                <Send size={16} />
                发送到拓竹打印机 (云打印)
              </button>
            )}
          </div>
        </>
      )}

      {/* 专属打印密码确认弹窗 */}
      {showPrintModal && (
        <div className="modal-backdrop" onClick={() => setShowPrintModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Lock size={20} color="var(--accent, #f59e0b)" />
              <h3 style={{ margin: 0 }}>
                {isPrintPinSet ? '输入打印密码 · 启动实机制造' : '设置打印密码 · 启动实机制造'}
              </h3>
            </div>
            <p style={{ fontSize: 14, color: 'var(--text-muted, #666)', lineHeight: 1.5, margin: '0 0 16px 0' }}>
              即将向拓竹打印机发送作品 <strong>{s.project?.name}</strong> 的真实制造任务。
              {isPrintPinSet
                ? ' 请输入专属打印密码以确认制造（独立于家长设置密码，保障实机安全）。'
                : ' 首次启动实机打印，请设置 6-32 位专属打印密码（与家长设置密码相互独立，专用于日常实机制造安全授权）。'}
            </p>

            <form onSubmit={handlePrintSubmit}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>
                  {isPrintPinSet ? '专属打印密码 (6-32位)' : '设置专属打印密码 (6-32位)'}
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={pin}
                    onChange={(e) => {
                      setPin(e.target.value);
                      if (pinError) setPinError('');
                    }}
                    placeholder={isPrintPinSet ? '输入专属打印密码' : '设置 6-32 位专属打印密码'}
                    autoFocus
                    required
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '9px 38px 9px 12px',
                      borderRadius: 6,
                      border: pinError ? '1.5px solid #ef4444' : '1px solid var(--border, #d1d5db)',
                      outline: 'none',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    style={{
                      position: 'absolute',
                      right: 8,
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 4,
                      color: 'var(--text-muted, #888)',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {pinError && (
                  <p style={{ margin: '6px 0 0 0', fontSize: 12, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <AlertTriangle size={13} /> {pinError}
                  </p>
                )}
                <small style={{ display: 'block', marginTop: 6, color: 'var(--text-muted, #888)', fontSize: 11 }}>
                  🔒 独立安全防线：打印密码与家长设置密码物理隔离，每次实机制造必须校验通过才可启动。
                </small>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  className="secondary"
                  disabled={submitting}
                  onClick={() => {
                    setShowPrintModal(false);
                    setPinError('');
                  }}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="primary"
                  disabled={submitting || !pin}
                >
                  {submitting ? '正在校验密码并下发…' : '校验密码并启动实机'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
