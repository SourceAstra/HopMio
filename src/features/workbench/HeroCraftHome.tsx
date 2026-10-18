import { useState, useRef, useMemo, useEffect, type KeyboardEvent } from 'react';
import {
  Sparkles,
  ArrowRight,
  ArrowUp,
  Mic,
  ImagePlus,
  FolderOpen,
  Camera,
  Layers,
  Palette,
  MessageSquare,
  HelpCircle,
  X,
  Upload,
  RefreshCw,
  Cpu,
  Brain,
  History,
  ChevronDown,
} from 'lucide-react';
import { useStudio } from '../../state/StudioContext';
import { Usagi } from '../../components/Usagi';
import { House } from '../../components/House';
import { ShelfPicker } from '../materials/ShelfPicker';
import { fileBase64, call, assetUrl } from '../../api/client';
import type { Mode, Spec, Asset, Project } from '../../types';
import { providerForMode } from '../../theme/modes';
import type { InspirationItem } from '../../theme/inspirations';
import { getInspirations } from '../inspirations/inspirationsStore';
import type { LaunchParams } from './CraftLaunchModal';

interface HeroCraftHomeProps {
  onStartCraft: (params: LaunchParams) => void;
  onOpen3DDrawer: () => void;
  hasModel: boolean;
  isRunning: boolean;
}

// 门厅融合的四大核心造物大门
const CRAFT_MODES: Array<{
  id: Mode;
  name: string;
  icon: typeof MessageSquare;
  emoji: string;
  badge: string;
  desc: string;
  placeholder: string;
}> = [
  {
    id: 'text',
    name: '喊出一个想法',
    icon: MessageSquare,
    emoji: '💬',
    badge: '最快速 · AI推演',
    desc: '一句话描述，AI 大脑与 Blender 实时雕刻成型',
    placeholder: '告诉乌萨奇你想造什么？例如：“一只坐在胡萝卜上的呆萌小兔桌面摆件，高80mm”',
  },
  {
    id: 'multiview',
    name: '多视角实物还原',
    icon: Camera,
    emoji: '📸',
    badge: '1:1 真机环拍',
    desc: '环绕真实手办/泥塑拍一圈，工业级逆向 3D 表面',
    placeholder: '请从素材架选用多张环拍照片，描述需要还原的实物比例与细节要求…',
  },
  {
    id: 'image',
    name: '照片参考创作',
    icon: ImagePlus,
    emoji: '🧸',
    badge: '单张照片创作',
    desc: '单张照片转立体手办，未见背面由 AI 创意延伸',
    placeholder: '上传或选择一张心仪的照片，乌萨奇会以此为蓝本设计立体三维模型…',
  },
  {
    id: 'silhouette',
    name: '手绘涂鸦变挂件',
    icon: Palette,
    emoji: '🎨',
    badge: '纸上涂鸦线条',
    desc: '随手画的线条轮廓，一键拉伸为带挂孔实体吊坠',
    placeholder: '选用涂鸦线稿，描述挂件厚度、钥匙孔位置（默认预留 3.5mm 挂孔）…',
  },
  {
    id: 'relief',
    name: '照片小浮雕',
    icon: Layers,
    emoji: '🖼️',
    badge: '明暗深度雕刻',
    desc: '照片灰度转微米级三维凹凸，带平整加固底座',
    placeholder: '选用照片，乌萨奇将明暗转换为高低起伏的雕刻浮雕印章…',
  },
];

// 抽取随机灵感工具函数 (只放4个，保持横向对称与视觉秩序，单一数据源)
function getRandomInspirations(count = 4): InspirationItem[] {
  const pool = getInspirations();
  const shuffled = [...pool].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

export type ReasoningLevel = 'off' | 'low' | 'medium' | 'high';

interface ModelOption {
  id: string;
  name: string;
}

const DEFAULT_MODEL_OPTIONS: ModelOption[] = [
  { id: 'default', name: '乌萨奇 3D 快速引擎 (推荐)' },
  { id: 'deepseek-r1', name: 'DeepSeek-R1 (深度推演)' },
  { id: 'claude-3-5', name: 'Claude 3.5 Sonnet (高精实物)' },
  { id: 'glm-4-plus', name: 'GLM-4-Plus (多模态感知)' },
];

export function HeroCraftHome({
  onStartCraft,
  onOpen3DDrawer,
  hasModel,
  isRunning,
}: HeroCraftHomeProps) {
  const s = useStudio();
  const [selectedMode, setSelectedMode] = useState<Mode>(s.spec.mode || 'text');
  const [promptText, setPromptText] = useState(s.spec.prompt || '');
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>(s.spec.asset_ids || []);
  const [showShelfModal, setShowShelfModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [inspirations, setInspirations] = useState<InspirationItem[]>(() => getRandomInspirations(4));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 监听灵感宝箱装填事件与数据更新
  useEffect(() => {
    const handleApplyInspiration = (e: Event) => {
      const customEvent = e as CustomEvent<{ prompt: string; name?: string }>;
      if (customEvent.detail?.prompt) {
        setPromptText(customEvent.detail.prompt);
        setSelectedMode('text');
        s.setNotice(`✦ 已装填灵感：「${customEvent.detail.name || customEvent.detail.prompt.slice(0, 10)}」，点击发送开启造物！`);
      }
    };
    const handleInspirationsChanged = () => {
      setInspirations(getRandomInspirations(4));
    };

    window.addEventListener('yaha-apply-inspiration', handleApplyInspiration);
    window.addEventListener('yaha-inspirations-changed', handleInspirationsChanged);
    return () => {
      window.removeEventListener('yaha-apply-inspiration', handleApplyInspiration);
      window.removeEventListener('yaha-inspirations-changed', handleInspirationsChanged);
    };
  }, [s]);

  // 外部规格更新时同步主输入框内容
  useEffect(() => {
    if (s.spec.prompt) {
      setPromptText(s.spec.prompt);
    }
  }, [s.spec.prompt]);

  // 模型候选列表 (优先使用设置中已配置的模型)
  const availableModels: ModelOption[] = useMemo(() => {
    if (s.preferences?.models && s.preferences.models.length > 0) {
      return s.preferences.models.map((m) => ({
        id: m.id,
        name: m.name || m.model,
      }));
    }
    return DEFAULT_MODEL_OPTIONS;
  }, [s.preferences?.models]);

  const [selectedModelId, setSelectedModelId] = useState<string>(() => {
    return s.preferences?.active_model || 'default';
  });

  const [reasoningEffort, setReasoningEffort] = useState<ReasoningLevel>('medium');

  // 最近作品切换下拉浮层控制
  const [isRecentDropdownOpen, setIsRecentDropdownOpen] = useState(false);
  const recentDropdownRef = useRef<HTMLDivElement>(null);

  // 监听点击外部或 ESC 自动收起最近作品浮层
  useEffect(() => {
    if (!isRecentDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (recentDropdownRef.current && !recentDropdownRef.current.contains(e.target as Node)) {
        setIsRecentDropdownOpen(false);
      }
    };
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsRecentDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isRecentDropdownOpen]);

  // 最近 5 个作品（按更新时间降序）
  const recentProjects = useMemo(() => {
    return [...s.projects]
      .sort((a, b) => {
        const timeA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
        const timeB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
        return timeB - timeA;
      })
      .slice(0, 5);
  }, [s.projects]);

  // 快速切换作品并直达造物桌
  const handleSelectAndGo = (project: Project) => {
    s.adopt(project);
    setIsRecentDropdownOpen(false);
    s.setNotice(`已切换至《${project.name}》，正在前往造物桌…`);
    onOpen3DDrawer();
  };

  // 归一化任务进度数值 (闭环根因：防 0~1 小数与 0~100 百分比混淆，严格归一为 0~100 整数)
  const normalizedProgress = useMemo(() => {
    if (!s.job) return 0;
    const p = Number(s.job.progress) || 0;
    const pct = p > 0 && p <= 1 ? p * 100 : p;
    return Math.min(100, Math.max(0, Math.round(pct)));
  }, [s.job?.progress]);

  const handleModelSelect = (id: string) => {
    setSelectedModelId(id);
    const chosen = availableModels.find((m) => m.id === id);
    if (chosen) {
      s.setNotice(`已选用造物模型：${chosen.name}`);
    }
  };

  const handleReasoningChange = (level: ReasoningLevel) => {
    setReasoningEffort(level);
    const labelMap: Record<ReasoningLevel, string> = {
      off: '关 (快速直出)',
      low: '低 (轻量推演)',
      medium: '中 (标准深度推演)',
      high: '高 (极限思维链)',
    };
    s.setNotice(`已设置推理强度为：${labelMap[level]}`);
  };

  // 刷新下一批灵感 (每次只抽4个)
  const handleRefreshInspirations = () => {
    setIsRefreshing(true);
    setInspirations(getRandomInspirations(4));
    setTimeout(() => {
      setIsRefreshing(false);
    }, 450);
  };

  const currentModeInfo = CRAFT_MODES.find((m) => m.id === selectedMode) || CRAFT_MODES[0];
  const isPhotoRequired = ['multiview', 'image', 'silhouette', 'relief'].includes(selectedMode);

  // 提交造物 (呼出造物启程过渡页)
  const handleTriggerCraft = () => {
    if (isPhotoRequired && selectedAssetIds.length === 0) {
      setShowShelfModal(true);
      s.setNotice('请先选用或上传至少一张照片素材！');
      return;
    }
    const currentModelName =
      availableModels.find((m) => m.id === selectedModelId)?.name || '乌萨奇 3D 快速引擎';
    onStartCraft({
      prompt: promptText.trim(),
      mode: selectedMode,
      assetIds: selectedAssetIds,
      modelId: selectedModelId,
      modelName: currentModelName,
      reasoningEffort,
    });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleTriggerCraft();
    }
  };

  // 本地直传照片
  const handleUploadLocalFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const b64 = await fileBase64(file);
      const asset = await call<Asset>('asset.create', {
        name: file.name,
        type: 'image',
        data: b64,
      });
      setSelectedAssetIds((prev) => [...prev, asset.id]);
      s.setNotice(`已成功添加素材照片：${file.name}`);
    } catch (err) {
      s.setNotice('上传照片失败，请检查文件格式。');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="hero-craft-home" id="view-search">
      <div className="knowledge-home">
        {/* 顶部中央大标题与乌萨奇欢迎向导 (左侧大号小屋乌萨奇 + 右侧呀哈造物与标语，极简无冗余) */}
        <div className="hero-home-header">
          <div className="hero-brand-hero-row">
            {/* 左侧：放大后的小木屋与乌萨奇工坊立绘 */}
            <div
              className="hero-cottage-welcomer"
              onClick={() => s.setRoom('gallery')}
              title="去乌萨奇展厅"
            >
              <div className="welcomer-cottage-wrap">
                <House />
              </div>
              <div className="welcomer-usagi-wrap">
                <Usagi size={110} />
                <span className="welcomer-speech-bubble">呀哈！欢迎回家！✦</span>
              </div>
            </div>

            {/* 右侧：呀哈造物品牌名 + Slogan 标语 (拿掉冗余长句，极致简洁优雅) */}
            <div className="hero-brand-text-column">
              <div className="hero-badge-pill">
                <Sparkles size={13} />
                <span>乌萨奇小屋造物之旅 · 亲子 3D 创想空间</span>
              </div>
              <h1 className="hero-brand-main-title">
                呀哈造物
                <span className="hero-brand-en-tag">YaHa Craft</span>
              </h1>
              <h2 className="knowledge-home-prompt">
                别动脑，喊出你的想法
                <span className="prompt-highlight"> — 剩下的交给乌萨奇</span>
              </h2>
            </div>
          </div>
        </div>

        {/* 核心造物大输入坞 (对标 Mint knowledge-search-box 纯白大圆角) */}
        <div className="knowledge-search-box hero-craft-dock">
          {/* 模式选择药丸群 (4个造物大门融入输入框) */}
          <div className="dock-mode-pills-bar" role="tablist" aria-label="造物大门模式选择">
            {CRAFT_MODES.map((m) => {
              const active = selectedMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  className={`dock-mode-pill ${active ? 'active' : ''}`}
                  onClick={() => setSelectedMode(m.id)}
                  title={m.desc}
                >
                  <span className="pill-emoji">{m.emoji}</span>
                  <span className="pill-name">{m.name}</span>
                  {active && <span className="pill-badge">{m.badge}</span>}
                </button>
              );
            })}
          </div>

          {/* 当处于照片或涂鸦模式时展开选图状态胶囊 */}
          {isPhotoRequired && (
            <div className="dock-photo-selection-row">
              <button
                type="button"
                className="dock-shelf-trigger-btn"
                onClick={() => setShowShelfModal(true)}
              >
                <FolderOpen size={14} />
                <span>
                  {selectedAssetIds.length > 0
                    ? `已从素材架挑选 ${selectedAssetIds.length} 张照片 ▾`
                    : '从素材灵感架挑图 ▾'}
                </span>
              </button>

              <button
                type="button"
                className="dock-upload-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <Upload size={14} />
                <span>{uploading ? '正在上传…' : '上传本地照片'}</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleUploadLocalFile}
              />

              {/* 缩略图横排预览 */}
              {selectedAssetIds.length > 0 && (
                <div className="dock-thumbnails-strip">
                  {selectedAssetIds.map((id) => (
                    <div key={id} className="thumb-item">
                      <img src={assetUrl(id)} alt="参考素材" />
                      <button
                        type="button"
                        className="thumb-remove"
                        onClick={() => setSelectedAssetIds((prev) => prev.filter((x) => x !== id))}
                        title="移除此照片"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="thumb-clear-all"
                    onClick={() => setSelectedAssetIds([])}
                  >
                    清空
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 大号文本输入域 */}
          <textarea
            className="hero-craft-input"
            rows={2}
            placeholder={currentModeInfo.placeholder}
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />

          {/* 底部操作工具栏 (左下角模型与推理控制 + 右下角动作群) */}
          <div className="knowledge-input-actions dock-actions-bar">
            {/* 左下角：模型切换与推理强度控制群 (取代上方已有的模式切换) */}
            <div className="dock-left-controls">
              {/* 模型选择胶囊 */}
              <div className="dock-control-pill dock-model-pill" title="选择和切换 3D 造物底座模型">
                <Cpu size={14} className="control-icon text-amber" />
                <select
                  className="dock-select-ghost"
                  value={selectedModelId}
                  onChange={(e) => handleModelSelect(e.target.value)}
                  aria-label="选择和切换造物模型"
                >
                  {availableModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 推理强度设置 (关 / 低 / 中 / 高) */}
              <div
                className={`dock-control-pill dock-reasoning-pill ${reasoningEffort !== 'off' ? 'active-reasoning' : ''}`}
                title="设置 AI 深度推演思维链强度：关 / 低 / 中 / 高"
              >
                <Brain size={14} className="control-icon text-purple" />
                <span className="control-prefix">思考:</span>
                <select
                  className="dock-select-ghost reasoning-select"
                  value={reasoningEffort}
                  onChange={(e) => handleReasoningChange(e.target.value as ReasoningLevel)}
                  aria-label="设置推理强度"
                >
                  <option value="off">关 (快速直出)</option>
                  <option value="low">低 (轻量推演)</option>
                  <option value="medium">中 (深度推演)</option>
                  <option value="high">高 (极限思考)</option>
                </select>
              </div>
            </div>

            {/* 右下角：语音输入 + 立即造物大按钮 */}
            <div className="dock-submit-group">
              <button
                type="button"
                className="knowledge-analyze dock-voice-btn"
                onClick={() => {
                  s.setNotice('语音识别已就绪，请直接清晰说出您的造物愿望…');
                }}
                title="按住语音输入想法"
              >
                <Mic size={14} />
                <span>语音造物</span>
              </button>

              <button
                type="button"
                className={`knowledge-submit dock-craft-submit ${isRunning ? 'has-running-job' : ''}`}
                onClick={handleTriggerCraft}
                disabled={uploading}
                aria-label="立即造物"
                title={isRunning ? "当前有正在雕刻的任务 · 点击管理或开启新造物" : "立即造物（Enter 发送）"}
              >
                {isRunning ? (
                  <span className="dock-spinner" title="乌萨奇正在雕刻中">⚡</span>
                ) : (
                  <ArrowUp size={20} strokeWidth={2.6} />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* 对话框正下方：当前执行任务感知与进度卡片 (位置1下沉重构) */}
        {s.running && s.job ? (
          <div
            className="hero-active-job-dock-card is-running"
            onClick={() => {
              void s.continueCurrentJob();
              onOpen3DDrawer();
            }}
            role="button"
            tabIndex={0}
            title="点击前往造物桌查看该任务实时进度与模型"
          >
            <div className="active-job-left-status">
              <div className="active-job-pulse-spinner">
                <span className="dock-spinner">⚡</span>
              </div>
              <div className="active-job-text-content">
                <div className="active-job-title-row">
                  <span className="active-job-tag-badge">● 正在执行造物</span>
                  <strong className="active-job-name">
                    {s.projects.find((p) => p.id === s.job?.project_id)?.name || s.project?.name || '当前造物作品'}
                  </strong>
                  <span className="active-job-stage-text">
                    {s.job.message || '正在进行 3D 几何推演…'}
                  </span>
                </div>
                <div className="active-job-progress-rail">
                  <div
                    className="active-job-progress-fill"
                    style={{ width: `${Math.max(5, Math.min(100, normalizedProgress))}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="active-job-right-action">
              <span className="active-job-progress-percent">
                {normalizedProgress}%
              </span>
              <span className="active-job-goto-btn">
                <span>前往造物桌</span>
                <ArrowRight size={14} />
              </span>
            </div>
          </div>
        ) : (s.project || recentProjects.length > 0) ? (() => {
          const currentDisplayProject = s.project || recentProjects[0];
          return (
            <div
              className={`hero-active-job-dock-card is-ready ${isRecentDropdownOpen ? 'has-dropdown-open' : ''}`}
              onClick={() => {
                if (s.project) {
                  void s.continueCurrentJob();
                  onOpen3DDrawer();
                } else {
                  handleSelectAndGo(currentDisplayProject);
                }
              }}
              role="button"
              tabIndex={0}
              title="点击进入造物桌查看当前作品与 3D 模型"
            >
              <div className="active-job-left-status">
                <span className="active-job-ready-dot">✦</span>
                <div className="active-job-title-row">
                  <span className="active-job-label-sub">{s.project ? '当前作品:' : '最近作品:'}</span>
                  <strong className="active-job-name">{currentDisplayProject.name}</strong>
                  <span className={`active-job-status-pill ${s.dirty ? 'dirty' : 'clean'}`}>
                    {s.dirty ? '● 待应用新版' : currentDisplayProject.model ? '✓ 已雕刻完成' : '等待造物'}
                  </span>

                  {/* 切换小按钮：呼出最近五个作品，支持直达 */}
                  {recentProjects.length > 0 && (
                    <div className="hero-recent-switcher-wrapper" ref={recentDropdownRef}>
                      <button
                        type="button"
                        className={`hero-switch-project-btn ${isRecentDropdownOpen ? 'active' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsRecentDropdownOpen((prev) => !prev);
                        }}
                        title="调出最近 5 个作品，点击可直接切换并直达造物桌"
                        aria-expanded={isRecentDropdownOpen}
                        aria-haspopup="true"
                      >
                        <History size={12} className="switch-btn-icon" />
                        <span>最近 5 个</span>
                        <ChevronDown size={12} className={`switch-btn-arrow ${isRecentDropdownOpen ? 'rotate' : ''}`} />
                      </button>

                      {/* 下拉微浮层 */}
                      {isRecentDropdownOpen && (
                        <div
                          className="hero-recent-projects-dropdown"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="recent-dropdown-header">
                            <div className="header-left">
                              <History size={13} className="text-amber" />
                              <span>最近创作的作品</span>
                            </div>
                            <span className="header-tip">点击直达造物桌</span>
                          </div>

                          <div className="recent-dropdown-list">
                            {recentProjects.map((p) => {
                              const isCurrent = p.id === s.project?.id;
                              const hasModel = Boolean(p.model);
                              return (
                                <button
                                  key={p.id}
                                  type="button"
                                  className={`recent-dropdown-item ${isCurrent ? 'is-active-item' : ''}`}
                                  onClick={() => handleSelectAndGo(p)}
                                  title={`切换并直达《${p.name}》`}
                                >
                                  <div className="recent-item-meta">
                                    <span className="recent-item-status-icon">
                                      {isCurrent ? '●' : hasModel ? '🐰' : '🌱'}
                                    </span>
                                    <span className="recent-item-name" title={p.name}>
                                      {p.name}
                                    </span>
                                  </div>
                                  <div className="recent-item-right">
                                    {isCurrent ? (
                                      <span className="recent-item-badge current">当前</span>
                                    ) : (
                                      <span className="recent-item-direct-go">
                                        <span>直达</span>
                                        <ArrowRight size={12} />
                                      </span>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>

                          {s.projects.length > 5 && (
                            <div className="recent-dropdown-footer">
                              <span className="footer-total-hint">共 {s.projects.length} 个作品</span>
                              <button
                                type="button"
                                className="footer-all-link"
                                onClick={() => {
                                  setIsRecentDropdownOpen(false);
                                  s.setRoom('gallery');
                                }}
                              >
                                <span>查看展厅全部</span>
                                <ArrowRight size={11} />
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="active-job-right-action">
                <span className="active-job-goto-btn">
                  <span>查看 3D 模型</span>
                  <ArrowRight size={14} />
                </span>
              </div>
            </div>
          );
        })() : null}

        {/* 下方快捷灵感单行药丸流（换一批与4个标签优雅并列，告别多余标题） */}
        <div className="knowledge-quick-chips-single-row">
          {inspirations.map((item) => (
            <button
              key={item.id}
              type="button"
              className="quick-chip"
              onClick={() => {
                setPromptText(item.prompt);
              }}
              title={item.desc}
            >
              <span className="chip-emoji">{item.emoji}</span>
              <span>{item.title}</span>
            </button>
          ))}
          <button
            type="button"
            className={`quick-chips-refresh-btn ${isRefreshing ? 'refreshing' : ''}`}
            onClick={handleRefreshInspirations}
            title="换下一批灵感点子"
            aria-label="换下一批灵感点子"
          >
            <RefreshCw size={13} className={isRefreshing ? 'spin-icon' : ''} />
            <span>换一批</span>
          </button>
        </div>


        {/* 右侧 3D 视口常驻呼出浮标 (当已有模型或任务时在右侧边缘展现) */}
        {(hasModel || isRunning) && (
          <button
            type="button"
            className="floating-3d-trigger-pill"
            onClick={onOpen3DDrawer}
            title="呼出右侧 3D 模型实物视口"
          >
            <span className="pill-dot pulse" />
            <span className="pill-text">
              {isRunning ? '⚡ 乌萨奇正在 3D 雕刻中 · 点击查看 ↗' : '🐰 3D 模型视口 (已就绪) ⇥'}
            </span>
          </button>
        )}
      </div>

      {/* 从素材灵感架挑图弹窗 (复用 ShelfPicker) */}
      {showShelfModal && (
        <div className="hero-shelf-modal-overlay" onClick={() => setShowShelfModal(false)}>
          <div className="hero-shelf-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-group">
                <FolderOpen size={18} className="text-yellow" />
                <h3>从素材灵感架挑选照片</h3>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowShelfModal(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <p className="modal-hint">
                根据素材文件夹分类挑选用于 3D 逆向或参考创作的高清照片：
              </p>
              <ShelfPicker
                value={selectedAssetIds}
                onChange={setSelectedAssetIds}
                disabled={s.busy}
                limit={selectedMode === 'multiview' ? 96 : 1}
              />
            </div>
            <div className="modal-footer">
              <span className="selected-count-badge">
                已选中 {selectedAssetIds.length} 张照片
              </span>
              <button
                type="button"
                className="modal-confirm-btn"
                onClick={() => setShowShelfModal(false)}
              >
                确认选用
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
