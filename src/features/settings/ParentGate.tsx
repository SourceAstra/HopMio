import { useState, useRef, useEffect } from 'react';
import { Lock, ShieldCheck, KeyRound, ArrowLeft, Sparkles, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { Usagi } from '../../components/Usagi';
import { call } from '../../api/client';

interface ParentGateProps {
  pinSet: boolean;
  onUnlock: (token: string) => void;
  onCancel: () => void;
}

export function ParentGate({ pinSet, onUnlock, onCancel }: ParentGateProps) {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [isConfirming]);

  const triggerError = (msg: string) => {
    setError(msg);
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 500);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError('');

    if (!pinSet) {
      // 首次设置流程：需两次输入确认
      if (!isConfirming) {
        if (pin.length < 6 || pin.length > 32) {
          triggerError('请使用 6 至 32 位家长密码（支持大小写字母、数字与符号）。');
          return;
        }
        setIsConfirming(true);
        return;
      }

      if (pin !== confirmPin) {
        triggerError('两次输入的密码不一致，请重新确认。');
        setConfirmPin('');
        return;
      }
    } else {
      if (pin.length < 6 || pin.length > 32) {
        triggerError('请输入 6 至 32 位家长密码。');
        return;
      }
    }

    setLoading(true);
    try {
      const res = await call<{ token: string; expires_in: number }>('settings.unlock', { pin });
      if (res?.token) {
        onUnlock(res.token);
      } else {
        triggerError('未能获得有效解锁凭证，请重试。');
      }
    } catch (err) {
      triggerError((err as Error).message || '密码不正确，请重新输入。');
      setPin('');
      setConfirmPin('');
      setIsConfirming(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="parent-gate-overlay">
      <div className={`parent-gate-card ${isShaking ? 'shake-animation' : ''}`}>
        <div className="gate-header">
          <div className="gate-icon-badge">
            {pinSet ? <Lock size={26} className="gate-lock-icon" /> : <KeyRound size={26} className="gate-setup-icon" />}
          </div>
          <div className="gate-usagi-avatar">
            <Usagi size={64} />
          </div>
        </div>

        <h2 className="gate-title">
          {pinSet ? '家长安全门禁' : '首次启用家长密码'}
        </h2>
        <p className="gate-desc">
          {pinSet
            ? '工坊已连接公网。每次进入家长设置均需输入家长密码认证。'
            : isConfirming
              ? '请再次输入密码以完成确认。'
              : '为了保护云端 AI 密钥与工坊安全，请设定 6-32 位家长密码（支持大小写字母、数字与符号）。'}
        </p>

        <form onSubmit={handleSubmit} className="gate-form">
          <div className="gate-input-wrapper" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              ref={inputRef}
              type={showPassword ? 'text' : 'password'}
              maxLength={32}
              autoComplete="off"
              value={!pinSet && isConfirming ? confirmPin : pin}
              onChange={(e) => {
                const val = e.target.value;
                if (!pinSet && isConfirming) {
                  setConfirmPin(val);
                } else {
                  setPin(val);
                }
                if (error) setError('');
              }}
              placeholder={!pinSet && isConfirming ? '再次输入密码以确认' : '输入 6-32 位密码（含字母/数字/符号）'}
              className="gate-pin-input"
              style={{ letterSpacing: showPassword ? '1px' : '4px', paddingRight: '48px' }}
              disabled={loading}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: 'absolute',
                right: '14px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#8c7b64',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title={showPassword ? '隐藏密码' : '显示明文'}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {error && (
            <div className="gate-error-message" role="alert">
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
          )}

          <div className="gate-actions">
            <button
              type="button"
              className="gate-cancel-btn"
              onClick={onCancel}
              disabled={loading}
            >
              <ArrowLeft size={16} />
              <span>返回造物桌</span>
            </button>

            <button
              type="submit"
              className="primary gate-submit-btn"
              disabled={loading || (!pinSet && isConfirming ? confirmPin.length < 6 : pin.length < 6)}
            >
              {loading ? (
                <span>正在校验…</span>
              ) : !pinSet && !isConfirming ? (
                <span>下一步 · 确认口令</span>
              ) : (
                <>
                  <ShieldCheck size={16} />
                  <span>{pinSet ? '解锁设置' : '完成设定并进入'}</span>
                </>
              )}
            </button>
          </div>
        </form>

        <div className="gate-security-hint">
          <Sparkles size={13} />
          <span>口令经由加盐安全哈希存储在本地，保护密钥与工坊配置不被外部篡改</span>
        </div>
      </div>
    </div>
  );
}
