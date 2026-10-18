import { ShieldCheck, Sparkles, Cpu, Bot, CheckCircle2, AlertCircle } from 'lucide-react';
import { Usagi } from '../../components/Usagi';
import { House } from '../../components/House';
import type { Preferences } from '../../types';

export function ParentSettingsHero({
  preferences,
  activeModelName,
  modelCount,
  readyKeyCount,
  jobCount,
  onLock,
}: {
  preferences?: Preferences;
  activeModelName?: string;
  modelCount: number;
  readyKeyCount: number;
  jobCount: number;
  onLock?: () => void;
}) {
  const isCloudEnabled = preferences?.cloud_enabled ?? false;
  const isBlenderReady = preferences?.blender?.available ?? false;

  return (
    <header className="parent-hero-banner" aria-label="家长与工坊设置概览">
      <div className="parent-hero-main">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div className="parent-hero-badge">
            <Sparkles size={13} />
            <span>USAGI&apos;S COTTAGE · 小屋造物之旅</span>
          </div>

          {onLock && (
            <button
              type="button"
              className="parent-lock-trigger-btn"
              onClick={onLock}
              title="立即锁定家长设置，防止孩子或外部访客操作"
            >
              <span>🔒 锁定设置</span>
            </button>
          )}
        </div>

        <h1 className="parent-hero-title">
          家长与设置
          <span className="parent-hero-subtitle"> · 工坊守护控制台</span>
        </h1>

        <p className="parent-hero-desc">
          陪孩子一起创造，安心管理云端服务、隐私边界、造物预算与本地建模引擎。
        </p>

        {/* 关键状态指标徽章群 */}
        <div className="parent-hero-chips">
          <div className={`parent-chip ${isCloudEnabled ? 'active' : 'idle'}`}>
            <ShieldCheck size={14} />
            <span>
              云端守护：
              <strong>{isCloudEnabled ? `已开启 (${preferences?.daily_limit ? `${preferences.daily_limit}次/天` : '不限次'})` : '纯本地离线'}</strong>
            </span>
          </div>

          <div className="parent-chip">
            <Bot size={14} />
            <span>
              活跃伙伴：
              <strong>{activeModelName || '未指定'}</strong>
              <small className="parent-chip-extra">({readyKeyCount}/{modelCount} 密钥就绪)</small>
            </span>
          </div>

          <div className={`parent-chip ${isBlenderReady ? 'active' : 'warn'}`}>
            <Cpu size={14} />
            <span>
              Blender 建模：
              <strong>{isBlenderReady ? '已就绪' : '待配置'}</strong>
            </span>
            {isBlenderReady ? <CheckCircle2 size={12} className="chip-status-icon success" /> : <AlertCircle size={12} className="chip-status-icon warning" />}
          </div>

          <div className="parent-chip">
            <Sparkles size={14} />
            <span>
              造物流水线：
              <strong>{jobCount}</strong> 项历史记录
            </span>
          </div>
        </div>
      </div>

      {/* 右侧乌萨奇小屋陪伴与欢迎形象 */}
      <div className="parent-hero-visual">
        <div className="parent-cottage-backdrop">
          <House />
        </div>
        <div className="parent-usagi-welcomer">
          <Usagi size={92} />
          <span className="parent-usagi-speech">呀哈！安全交给我！✦</span>
        </div>
      </div>
    </header>
  );
}
