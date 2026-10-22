import { useState, useRef, useEffect } from 'react';
import { Sparkles, Dice5, X, ArrowRight, Ban, Eye, Cpu, Brain, AlertTriangle, Layers, Palette, MessageSquare, Camera } from 'lucide-react';
import { Usagi } from '../../components/Usagi';
import { useStudio } from '../../state/StudioContext';
import { useDialogFocus } from '../../components/useDialogFocus';
import type { Mode, Spec } from '../../types';
import type { ReasoningLevel } from './HeroCraftHome';

// 乌萨奇萌系特色作品名候选库
const USAGI_CRAFT_NAMES = [
  '乌萨奇的胡萝卜秘密基地',
  '元气满满的桌面立牌',
  '圆滚滚呆萌小恐龙',
  '星星眨眼透光小夜灯',
  '草莓大福解压捏捏乐',
  '魔法齿轮收纳小盒',
  '飞天小猫掌心手办',
  '宇宙漫游宇航员徽章',
  '快乐布丁圆形收纳碟',
  '向日葵转转笔筒摆件',
  '森林小松鼠坚果托盘',
  '梦幻小马立体摆件',
  '乌萨奇开心ω嘴巴吊坠',
  '闪亮流星随身钥匙扣',
  '甜甜圈趣味手机支架',
  '迷你小雪人冬日挂件',
];

// 智能根据用户输入构想生成推荐作品名称
function extractSmartProjectName(prompt: string, mode: Mode): string {
  const clean = prompt.trim().replace(/^[，。！？\s]+|[，。！？\s]+$/g, '');
  if (!clean) {
    const randomPick = USAGI_CRAFT_NAMES[Math.floor(Math.random() * USAGI_CRAFT_NAMES.length)];
    return randomPick;
  }
  // 提取首个短句或前 12 个字符
  const firstSentence = clean.split(/[，。！？\n,!?]/)[0].trim();
  if (firstSentence.length >= 2 && firstSentence.length <= 14) {
    return firstSentence;
  }
  if (firstSentence.length > 14) {
    return firstSentence.slice(0, 12) + '…';
  }
  // 模式备选兜底
  const modeSuffix: Record<string, string> = {
    silhouette: '手绘挂件',
    relief: '浮雕印章',
    image: '照片立体作品',
    multiview: '实物还原模型',
    text: '创意小作品',
  };
  return (clean.slice(0, 8) || '乌萨奇') + (modeSuffix[mode] || '创意模型');
}

export interface LaunchParams {
  prompt: string;
  mode: Mode;
  assetIds: string[];
  modelId: string;
  modelName: string;
  reasoningEffort: ReasoningLevel;
}

interface CraftLaunchModalProps {
  isOpen: boolean;
  params: LaunchParams;
  onClose: () => void;
  onConfirmLaunch: (projectName: string) => Promise<void>;
  onInspectCurrentJob: () => void;
  mockConflict?: boolean;
}

export function CraftLaunchModal({
  isOpen,
  params,
  onClose,
  onConfirmLaunch,
  onInspectCurrentJob,
  mockConflict = false,
}: CraftLaunchModalProps) {
  const s = useStudio();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [projectName, setProjectName] = useState(() =>
    extractSmartProjectName(params.prompt, params.mode),
  );
  const [submitting, setSubmitting] = useState(false);

  // 当重新打开或 prompt 变化时，重新预填智能名称
  useEffect(() => {
    if (isOpen) {
      setProjectName(extractSmartProjectName(params.prompt, params.mode));
      setSubmitting(false);
    }
  }, [isOpen, params.prompt, params.mode]);

  useDialogFocus(dialogRef, onClose, isOpen);

  if (!isOpen) return null;

  // 感知当前后台是否有正在进行的任务 (支持真实任务与模拟感知)
  const hasRunningJob = Boolean(mockConflict || (s.running && s.job));
  const runningJob = s.job || (mockConflict ? ({
    id: 'job-running-mock',
    project_id: s.project?.id || 'mock-id',
    status: 'running',
    progress: 68,
    message: '正在根据三维拓扑进行 3D 打印水密实体精修…',
  } as any) : null);
  const runningProjectName =
    s.projects.find((p) => p.id === runningJob?.project_id)?.name ||
    s.project?.name ||
    '正在进行的造物';
  const progressPercent = Math.min(
    100,
    Math.max(0, Math.round(runningJob?.progress || 0)),
  );

  // 掷骰子随机换名
  const handleRandomizeName = () => {
    const pool = USAGI_CRAFT_NAMES.filter((n) => n !== projectName);
    const pick = pool[Math.floor(Math.random() * pool.length)];
    setProjectName(pick);
  };

  // 确认开启造物
  const handleProceed = async () => {
    if (submitting) return;
    const finalName = projectName.trim() || extractSmartProjectName(params.prompt, params.mode);
    setSubmitting(true);
    try {
      await onConfirmLaunch(finalName);
    } finally {
      setSubmitting(false);
    }
  };

  // 模式文本映射
  const modeNames: Record<Mode, string> = {
    text: '喊出想法造物',
    multiview: '多视角实物还原',
    image: '照片参考创作',
    silhouette: '手绘涂鸦变挂件',
    relief: '照片小浮雕',
    import: '老作品焕新',
  };

  const reasoningNames: Record<ReasoningLevel, string> = {
    off: '思考: 关',
    low: '思考: 低',
    medium: '思考: 中',
    high: '思考: 高',
  };

  return (
    <div
      ref={dialogRef}
      className="craft-launch-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="craft-launch-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="craft-launch-card">
        {/* 顶部标题区 */}
        <header className="launch-card-header">
          <div className="launch-header-left">
            <div className="launch-usagi-badge">
              <Usagi size={48} />
              <span className="launch-sparkle-dot">✦</span>
            </div>
            <div>
              <div className="launch-pill-tag">
                <Sparkles size={12} />
                <span>乌萨奇工坊 · 造物启程确认</span>
              </div>
              <h3 id="craft-launch-title" className="launch-title">
                {hasRunningJob ? '准备开启新作品（检测到进行中的任务）' : '为你的新作品起个好听的名字'}
              </h3>
            </div>
          </div>

          <button
            type="button"
            className="launch-close-btn"
            onClick={onClose}
            disabled={submitting}
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </header>

        {/* 核心配置概览微胶囊群 */}
        <div className="launch-summary-strip">
          <span className="summary-pill mode-pill">
            <Layers size={12} />
            <span>{modeNames[params.mode] || '创意造物'}</span>
          </span>
          <span className="summary-pill model-pill">
            <Cpu size={12} />
            <span>{params.modelName || '乌萨奇 3D 引擎'}</span>
          </span>
          <span className="summary-pill reasoning-pill">
            <Brain size={12} />
            <span>{reasoningNames[params.reasoningEffort] || '思考: 中'}</span>
          </span>
          {params.assetIds.length > 0 && (
            <span className="summary-pill photo-pill">
              <Camera size={12} />
              <span>{params.assetIds.length} 张照片素材</span>
            </span>
          )}
        </div>

        {/* 提示词微摘要 */}
        {params.prompt && (
          <div className="launch-prompt-preview">
            <span className="prompt-quote-icon">“</span>
            <p className="prompt-quote-text">{params.prompt}</p>
          </div>
        )}

        {/* 核心功能 1：新作品命名区 */}
        <div className="launch-field-group">
          <label htmlFor="launch-project-name" className="launch-field-label">
            <span>作品名称</span>
            <small className="field-hint">（将在工坊展厅与 3D 打印切片文件中呈现）</small>
          </label>
          <div className="launch-name-input-wrap">
            <input
              id="launch-project-name"
              type="text"
              className="launch-name-input"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="例如：呆萌小恐龙桌面摆件…"
              maxLength={36}
              disabled={submitting}
              autoFocus
            />
            <button
              type="button"
              className="launch-random-btn"
              onClick={handleRandomizeName}
              title="掷骰子换一个好玩的名字"
              disabled={submitting}
            >
              <Dice5 size={15} />
              <span>换个名</span>
            </button>
          </div>
        </div>

        {/* 核心功能 2：当前正在造物感知与冲突选择 */}
        {hasRunningJob ? (
          <div className="launch-conflict-card">
            <div className="conflict-card-top">
              <div className="conflict-warning-icon">
                <AlertTriangle size={18} />
              </div>
              <div className="conflict-text-group">
                <div className="conflict-title-row">
                  <strong>乌萨奇正在雕刻当前作品：</strong>
                  <span className="conflict-active-name">【{runningProjectName}】</span>
                </div>
                <div className="conflict-progress-row">
                  <div className="conflict-progress-bar">
                    <div
                      className="conflict-progress-fill"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <span className="conflict-progress-pct">{progressPercent}%</span>
                </div>
                <p className="conflict-desc">
                  工坊同一时间专注雕刻一个作品。开启新作品将终止旧雕刻，或者你可以返回继续查看旧雕刻：
                </p>
              </div>
            </div>

            {/* 决策双分支按钮 */}
            <div className="conflict-actions-row">
              <button
                type="button"
                className="btn-terminate-and-start"
                onClick={handleProceed}
                disabled={submitting}
              >
                <Ban size={15} />
                <span>终止之前造物，开启新作品</span>
              </button>

              <button
                type="button"
                className="btn-cancel-and-inspect"
                onClick={onInspectCurrentJob}
                disabled={submitting}
              >
                <Eye size={15} />
                <span>取消本次，继续查看当前雕刻</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="launch-ready-banner">
            <span className="ready-sparkle">✦</span>
            <span>工坊雕刻台已空闲就绪，确认后将自动为你创建新作品并立即开始 3D 雕刻！</span>
          </div>
        )}

        {/* 底部按钮栏 (当无冲突时的标准确认) */}
        {!hasRunningJob && (
          <footer className="launch-footer-actions">
            <button
              type="button"
              className="launch-cancel-btn"
              onClick={onClose}
              disabled={submitting}
            >
              取消
            </button>
            <button
              type="button"
              className="launch-submit-btn"
              onClick={handleProceed}
              disabled={submitting}
            >
              {submitting ? (
                <span>⚡ 乌萨奇正在启动造物…</span>
              ) : (
                <>
                  <span>🚀 立即开启造物</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
