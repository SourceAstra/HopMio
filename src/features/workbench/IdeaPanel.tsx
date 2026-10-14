import { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Mic,
  ImagePlus,
  Plus,
  Check,
  Pencil,
  RotateCcw,
  Wand2,
} from 'lucide-react';
import { useStudio } from '../../state/StudioContext';
import { Usagi } from '../../components/Usagi';
import { call, fileBase64, assetUrl } from '../../api/client';
import type { Spec, Asset } from '../../types';
import { isPhotoMode } from '../../theme/modes';
import { SelectedMaterials } from '../materials/SelectedMaterials';
import { selectMaterials } from '../materials/selection';
import { adjustmentSpec } from '../modeling/plan';
import { IdeaSuggestions } from './IdeaSuggestions';

interface IdeaPanelProps {
  onInspectPhoto?: (id: string) => void;
  inspectAssetId?: string | null;
  selectedPartId?: string | null;
  selectedPointMm?: [number, number, number] | null;
}

export function IdeaPanel({
  onInspectPhoto,
  inspectAssetId,
  selectedPartId,
  selectedPointMm,
}: IdeaPanelProps = {}) {
  const s = useStudio();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const locationInputRef = useRef<HTMLInputElement>(null);
  const [locationImage, setLocationImage] = useState<Asset | null>(null);
  const [locationPoint, setLocationPoint] = useState<[number, number] | null>(null);
  const [tuneInstruction, setTuneInstruction] = useState('');
  const [adjustmentProposal, setAdjustmentProposal] = useState<{
    summary: string;
    instruction: string;
    changes: string[];
    revision: string;
    specSnapshot: string;
    selectionSnapshot: string;
    locationAssetId?: string;
    locationPointSnapshot?: string;
  } | null>(null);
  const patch = (data: Partial<Spec>) => s.setSpec((old) => ({ ...old, ...data }));

  const hasPhotos = s.spec.asset_ids.length > 0;
  const isPhoto = isPhotoMode(s.spec.mode) || hasPhotos;
  const hasModel = !!s.project?.model;
  const hasAssumptions = s.spec.assumptions.length > 0;
  const modelSpec = adjustmentSpec(s.project, s.spec);
  const canAdjust = !!modelSpec;
  const cloudReady = !!s.preferences?.cloud_enabled && !!s.preferences?.chat_configured;

  // 统一对话框当前激活模式：'tune'（AI 细节微调）或 'prompt'（整体灵感与一键建模）
  const [dialogMode, setDialogMode] = useState<'tune' | 'prompt'>('prompt');
  const prevModelRef = useRef<boolean>(hasModel);
  const prevProjectIdRef = useRef<string | undefined>(s.project?.id);

  useEffect(() => {
    // 当作品切换或首次生成模型时自适应激活微调
    if (s.project?.id !== prevProjectIdRef.current) {
      prevProjectIdRef.current = s.project?.id;
      setDialogMode(hasModel ? 'tune' : 'prompt');
    } else if (!prevModelRef.current && hasModel) {
      setDialogMode('tune');
    }
    prevModelRef.current = hasModel;
  }, [hasModel, s.project?.id]);

  const activeMode = !hasModel ? 'prompt' : dialogMode;

  // 快捷气泡预设
  const quickChips =
    activeMode === 'tune'
      ? [
          { label: '+耳朵长一点', value: '让耳朵再长一点' },
          { label: '+身体更圆滚滚', value: '身体更矮胖圆润' },
          { label: '+去掉多余底座', value: '去掉多余底座，脚掌直接平整落地' },
          { label: '+加厚稳固底座', value: '加厚平整稳固底座' },
          { label: '+放大微笑', value: '把开心的ω微笑嘴角加大加深' },
        ]
      : [
          { label: '🥕 胡萝卜印章', value: '乌萨奇同款胡萝卜手办印章，底部平整带抓握手柄' },
          { label: '🐰 桌面立牌', value: '乌萨奇开心招手元气立牌，自带稳固底座' },
          { label: '🦖 呆萌小恐龙', value: '圆滚滚胖嘟嘟的呆萌绿色小恐龙桌面摆件' },
          { label: '🏷️ 名字钥匙扣', value: '带有挂绳圆孔的个性防丢名字钥匙扣，四周圆润倒角' },
        ];

  const currentText = activeMode === 'tune' ? tuneInstruction : s.spec.prompt;

  // 语音识别录入
  const voice = () => {
    const Speech =
      (
        window as unknown as {
          SpeechRecognition?: new () => SpeechLike;
          webkitSpeechRecognition?: new () => SpeechLike;
        }
      ).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechLike })
        .webkitSpeechRecognition;
    if (!Speech) {
      s.setNotice('当前桌面环境不支持语音识别，可以直接输入想法。');
      return;
    }
    const recognition = new Speech();
    recognition.lang = 'zh-CN';
    recognition.onresult = (e) => {
      const text = e.results[0][0].transcript;
      if (activeMode === 'tune') {
        setTuneInstruction((old) => (old ? `${old}，${text}` : text));
      } else {
        patch({ prompt: text });
      }
    };
    recognition.onerror = () => s.setNotice('没有听清楚，请检查麦克风或用文字输入。');
    recognition.start();
  };

  // 文件快速上传
  const handleFiles = async (files: File[]) => {
    if (!files.length || s.busy || s.running) return;
    await s.act(async () => {
      const ids = [...s.spec.asset_ids];
      for (const file of files) {
        try {
          const base64 = await fileBase64(file);
          const uploaded = await call<Asset>('asset.upload', { name: file.name, base64 });
          s.setAssets((old) => [uploaded, ...old.filter((a) => a.id !== uploaded.id)]);
          if (!ids.includes(uploaded.id)) ids.push(uploaded.id);
        } catch {
          // ignore individual file error
        }
      }
      const mode = ['silhouette', 'relief', 'image', 'multiview'].includes(s.spec.mode)
        ? s.spec.mode
        : 'image';
      s.setSpec((old) => selectMaterials(old, ids, mode));
    });
  };

  // 先把大白话整理成可确认的建议，不触碰模型；确认后才提交真实调整任务。
  const handleAiTune = async () => {
    if (!tuneInstruction.trim() || !modelSpec || s.busy || s.running || !cloudReady) return;
    const selectedPart = modelSpec.modeling_plan?.steps.find((step) => step.id === selectedPartId);
    const point = selectedPointMm?.map((value) => value.toFixed(1)).join(', ');
    const target = selectedPart
      ? `用户在3D模型中点选了“${selectedPart.name}”（部件${selectedPart.id}）`
      : selectedPointMm
        ? '用户在3D模型中点选了一个网格表面位置'
        : '';
    const scopedTarget = target
      ? `${target}${point ? `，表面坐标为 X/Y/Z = ${point} mm` : ''}。请结合当前模型视图定位该处，只修改该局部，其他造型与尺寸保持不变。`
      : '';
    const instruction = scopedTarget
      ? `${scopedTarget}用户要求：${tuneInstruction.trim()}`
      : tuneInstruction.trim();
    s.setNotice('');
    const specSnapshot = JSON.stringify(modelSpec);
    const revision = s.project?.revision_id || '';
    const selectionSnapshot = JSON.stringify({ selectedPartId, selectedPointMm });
    await s.act(async () => {
      const locationAssetId = locationImage?.id;
      const proposal = await call<{ summary: string; instruction: string; changes: string[] }>(
        'idea.adjustment',
        { instruction, spec: modelSpec, location_asset_id: locationAssetId, location_point: locationPoint },
      );
      setAdjustmentProposal({
        ...proposal,
        instruction: scopedTarget ? `${scopedTarget}用户要求：${proposal.instruction}` : proposal.instruction,
        revision,
        specSnapshot,
        selectionSnapshot,
        locationAssetId,
        locationPointSnapshot: JSON.stringify(locationPoint),
      });
    });
  };

  const confirmAdjustment = async () => {
    const proposal = adjustmentProposal;
    if (
      !proposal ||
      !modelSpec ||
      proposal.revision !== s.project?.revision_id ||
      proposal.specSnapshot !== JSON.stringify(modelSpec) ||
      proposal.selectionSnapshot !== JSON.stringify({ selectedPartId, selectedPointMm }) ||
      proposal.locationAssetId !== locationImage?.id ||
      proposal.locationPointSnapshot !== JSON.stringify(locationPoint)
    ) {
      setAdjustmentProposal(null);
      s.setNotice('作品或参数已变化，请重新整理调整建议。');
      return;
    }
    if (await s.generate({ schema_version: 1, instruction: proposal.instruction, location_asset_id: proposal.locationAssetId, location_point: proposal.locationPointSnapshot ? JSON.parse(proposal.locationPointSnapshot) : undefined }, modelSpec)) {
      setTuneInstruction('');
      setAdjustmentProposal(null);
    }
  };

  const placeholderText = isPhoto
    ? '输入想保留的外貌、尺寸或补充说明，也可直接一键建模…'
    : '做一个乌萨奇摆件，高 80 毫米，细长耳朵、开心的呀哈表情…';

  return (
    <section className="panel idea-panel">
      {/* 隐藏式文件上传选择器 */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".png,.jpg,.jpeg,.webp,.stl,.glb,.3mf,.usagi"
        style={{ display: 'none' }}
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          e.target.value = '';
          void handleFiles(files);
        }}
      />
      <input
        ref={locationInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          void s.act(async () => {
            const uploaded = await call<Asset>('asset.upload', { name: file.name, base64: await fileBase64(file) });
            setLocationImage(uploaded);
            setLocationPoint(null);
            setAdjustmentProposal(null);
          });
        }}
      />

      <div className="idea-panel-top">
        <h2>
          <Sparkles size={18} /> 我的灵感
        </h2>
        <div className="idea-panel-top-actions">
          {hasPhotos && (
            <button
              type="button"
              className="compact-action-btn"
              disabled={s.busy || s.running}
              onClick={() => fileInputRef.current?.click()}
              title="补充更多视角照片"
            >
              <Plus size={13} /> 补充照片
            </button>
          )}
          <button
            type="button"
            className="compact-action-btn"
            onClick={() => s.setRoom('materials')}
            title="前往素材架选择"
          >
            <ImagePlus size={13} /> 素材架
          </button>
        </div>
      </div>

      {/* 视角参考照片胶卷：横向紧凑滑轨，点击直达视口对比 */}
      {hasPhotos ? (
        <SelectedMaterials
          compact
          onInspectPhoto={onInspectPhoto}
          activeInspectId={inspectAssetId}
        />
      ) : (
        <div
          className="inspiration-empty-card"
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') fileInputRef.current?.click();
          }}
        >
          <Usagi size={38} />
          <div className="empty-card-text">
            <strong>点击上传实物参考照片</strong>
            <small>支持单张或多角度实物照片一键 3D 逆向定标</small>
          </div>
        </div>
      )}

      {/* 物理定标与参数快捷设置条 */}
      <div className="physical-spec-rail">
        <div className="spec-item height-item">
          <span className="spec-label">高度</span>
          <div className="height-input-wrap">
            <input
              type="number"
              aria-label="实物目标高度"
              min={10}
              max={300}
              value={s.spec.height_mm || 80}
              disabled={s.busy || s.running}
              onChange={(e) => patch({ height_mm: Number(e.target.value) || 80 })}
            />
            <small>mm</small>
          </div>
          <div className="quick-presets-group">
            {[50, 80, 120].map((h) => (
              <button
                key={h}
                type="button"
                className={`quick-preset-pill ${s.spec.height_mm === h ? 'active' : ''}`}
                disabled={s.busy || s.running}
                onClick={() => patch({ height_mm: h })}
              >
                {h}
              </button>
            ))}
          </div>
        </div>

        <label className="spec-base-toggle">
          <input
            type="checkbox"
            checked={!!s.spec.base}
            disabled={s.busy || s.running}
            onChange={(e) => patch({ base: e.target.checked })}
          />
          <span>加稳固底座</span>
        </label>
      </div>

      {/* 模板与浮雕选择（纯 Pill 按钮，无下拉框） */}
      {s.spec.mode === 'text' && s.spec.provider === 'local' && (
        <div className="pill-choice-row" role="radiogroup" aria-label="造物模板">
          <button
            type="button"
            className={`choice-pill ${s.spec.template === 'usagi' ? 'active' : ''}`}
            onClick={() => patch({ template: 'usagi' })}
          >
            🐰 乌萨奇摆件
          </button>
          <button
            type="button"
            className={`choice-pill ${s.spec.template === 'cup' ? 'active' : ''}`}
            onClick={() => patch({ template: 'cup' })}
          >
            ✏️ 小笔筒
          </button>
          <button
            type="button"
            className={`choice-pill ${s.spec.template === 'plaque' ? 'active' : ''}`}
            onClick={() => patch({ template: 'plaque' })}
          >
            🏷️ 小屋名牌
          </button>
        </div>
      )}

      {s.spec.mode === 'relief' && (
        <div className="pill-choice-row" role="radiogroup" aria-label="浮雕类型">
          <button
            type="button"
            className={`choice-pill ${s.spec.relief_kind !== 'lithophane' ? 'active' : ''}`}
            onClick={() => patch({ relief_kind: 'relief' })}
          >
            凸起浅浮雕
          </button>
          <button
            type="button"
            className={`choice-pill ${s.spec.relief_kind === 'lithophane' ? 'active' : ''}`}
            onClick={() => patch({ relief_kind: 'lithophane' })}
          >
            透光照片
          </button>
        </div>
      )}

      {/* 统一智能造物对话中枢 (Unified Creator Dialog Console) */}
      <div className="unified-dialog-console">
        {/* 顶部：模式感知与切换标签 */}
        {hasModel ? (
          <div className="dialog-mode-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeMode === 'tune'}
              className={`dialog-mode-pill ${activeMode === 'tune' ? 'active' : ''}`}
              onClick={() => setDialogMode('tune')}
            >
              <Wand2 size={13} />
              <span>✨ 细节微调</span>
              <span className="mode-ready-dot" />
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeMode === 'prompt'}
              className={`dialog-mode-pill ${activeMode === 'prompt' ? 'active' : ''}`}
              onClick={() => setDialogMode('prompt')}
            >
              <Sparkles size={13} />
              <span>✦ 整体灵感</span>
              {hasAssumptions && (
                <span className="mode-bubble-count">{s.spec.assumptions.length}</span>
              )}
            </button>
          </div>
        ) : (
          <div className="dialog-status-hint">
            <Sparkles size={13} className="sparkle-gold" />
            <span>描述造物想法，乌萨奇会为你推演 3D 几何</span>
          </div>
        )}

        {/* 动态快捷气泡标签 */}
        <div className="dialog-quick-chips">
          {quickChips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              className="quick-chip-pill"
              disabled={s.running || s.busy}
              onClick={() => {
                if (activeMode === 'tune') {
                  setTuneInstruction((prev) => (prev ? `${prev}，${chip.value}` : chip.value));
                  setAdjustmentProposal(null);
                } else {
                  patch({ prompt: chip.value });
                }
              }}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* 统一多功能输入框 */}
        <div className="unified-input-wrapper">
          <textarea
            id="idea-prompt-textarea"
            aria-label={activeMode === 'tune' ? 'AI 微调调整要求' : '造物想法与描述'}
            placeholder={
              activeMode === 'tune'
                ? '先点选模型中要改的位置。例：去掉这里多出的突起，其余造型保持不变。'
                : placeholderText
            }
            maxLength={activeMode === 'tune' ? 2000 : 3000}
            value={currentText}
            disabled={s.running || s.busy}
            onChange={(e) => {
              if (activeMode === 'tune') {
                setTuneInstruction(e.target.value);
                setAdjustmentProposal(null);
              } else {
                patch({ prompt: e.target.value });
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.ctrlKey) {
                if (activeMode === 'tune') {
                  void handleAiTune();
                } else {
                  void s.generate();
                }
              }
            }}
          />

          {activeMode === 'tune' && (
            <p className="tune-howto">
              {selectedPointMm
                ? '模型上的红点是已选位置；也可上传截图并点击截图标记问题处。写明怎么改后先整理建议，再确认生成。'
                : '点模型表面留下红色位置点，或上传截图后点击问题位置；再描述修改内容、整理建议并确认生成。'}
            </p>
          )}

          {activeMode === 'tune' && (
            <div className="tune-location-image">
              {locationImage ? (
                <>
                  <div className="tune-location-preview" onClick={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    setLocationPoint([Math.round(((event.clientX - rect.left) / rect.width) * 1000) / 10, Math.round(((event.clientY - rect.top) / rect.height) * 1000) / 10]);
                    setAdjustmentProposal(null);
                  }} title="点击图片标出需要修改的位置">
                    <img src={assetUrl(locationImage.id)} alt="点击标出需要修改的位置" />
                    {locationPoint && <i style={{ left: `${locationPoint[0]}%`, top: `${locationPoint[1]}%` }} />}
                  </div>
                  <div className="tune-location-copy">{locationPoint ? `已标记截图位置 ${locationPoint[0]}%、${locationPoint[1]}%` : '点击截图，在问题位置放置标记'}<button type="button" onClick={() => { setLocationImage(null); setLocationPoint(null); setAdjustmentProposal(null); }} aria-label="移除圈注截图">移除</button></div>
                </>
              ) : (
                <button type="button" onClick={() => locationInputRef.current?.click()} disabled={s.busy || s.running}>
                  <ImagePlus size={14} /> 上传圈注截图（可选）
                </button>
              )}
            </div>
          )}

          <div className="unified-input-footer">
            <div className="input-footer-left">
              <button
                type="button"
                className="input-icon-btn"
                title="喊出你的想法（语音输入）"
                onClick={voice}
                disabled={s.running || s.busy}
              >
                <Mic size={14} />
              </button>
              {activeMode === 'prompt' && s.spec.mode !== 'import' && (
                <button
                  type="button"
                  className="input-organize-btn"
                  disabled={s.busy || s.running || (!s.spec.prompt.trim() && !hasPhotos)}
                  title={
                    s.preferences?.cloud_enabled && s.preferences?.chat_configured
                      ? '使用 AI 整理文字与照片中的尺寸和要求'
                      : '使用本地规则整理文字；配置并开启 AI 后可整理照片'
                  }
                  onClick={() => void s.organizeIdea()}
                >
                  <Sparkles size={13} /> 智能整理
                </button>
              )}
              {currentText && (
                <button
                  type="button"
                  className="input-clear-btn"
                  title="清空输入"
                  onClick={() => {
                    if (activeMode === 'tune') {
                      setTuneInstruction('');
                      setAdjustmentProposal(null);
                    } else {
                      patch({ prompt: '' });
                    }
                  }}
                >
                  清空
                </button>
              )}
            </div>

            <div className="input-footer-right">
              <span className="char-count">
                {currentText.length}/{activeMode === 'tune' ? 2000 : 3000}
              </span>
            </div>
          </div>
        </div>

        {/* 统一建议与协商卡片区域 */}
        {activeMode === 'tune' && adjustmentProposal ? (
          <div className="unified-proposal-card" aria-live="polite">
            <div className="proposal-header">
              <Sparkles size={14} />
              <strong>乌萨奇的调整建议</strong>
            </div>
            <p className="proposal-summary">{adjustmentProposal.summary}</p>
            <ul className="proposal-changes-list">
              {adjustmentProposal.changes.map((change, index) => (
                <li key={`${index}-${change}`}>{change}</li>
              ))}
            </ul>
            <div className="proposal-actions">
              <button
                type="button"
                className="proposal-btn-edit"
                onClick={() => setAdjustmentProposal(null)}
                disabled={s.busy || s.running}
              >
                <Pencil size={13} /> 继续修改想法
              </button>
              <button
                type="button"
                className="proposal-btn-confirm"
                onClick={() => void confirmAdjustment()}
                disabled={s.busy || s.running}
              >
                <Check size={14} /> 确认并开始调整模型
              </button>
            </div>
          </div>
        ) : activeMode === 'prompt' && hasAssumptions ? (
          <div className="unified-suggestions-wrap">
            <IdeaSuggestions />
          </div>
        ) : activeMode === 'tune' && !canAdjust && hasModel ? (
          <div className="dialog-notice-box">
            <span>当前作品没有可编辑的参数方案，请先重新设计。</span>
          </div>
        ) : activeMode === 'tune' && canAdjust && !cloudReady ? (
          <div className="dialog-notice-box">
            <button
              type="button"
              className="ai-tune-config-link"
              onClick={() => s.setRoom('settings')}
            >
              请先在设置中开启并配置云端 AI 服务 →
            </button>
          </div>
        ) : null}

        {/* 统一主操作执行栏 */}
        <div className="unified-action-row">
          {activeMode === 'tune' ? (
            <>
              <button
                type="button"
                className="primary generate unified-build-btn"
                disabled={
                  !canAdjust ||
                  !cloudReady ||
                  !tuneInstruction.trim() ||
                  s.running ||
                  s.busy
                }
                onClick={() => void handleAiTune()}
                title="提交微调想法并由乌萨奇生成变更清单"
              >
                <Sparkles size={18} />
                <div className="unified-btn-content">
                  <span className="unified-btn-title">
                    {s.running
                      ? '乌萨奇正在调整模型…'
                      : s.busy
                        ? '乌萨奇正在整理建议…'
                        : '✨ 整理微调建议'}
                  </span>
                  <span className="unified-btn-subtitle">
                    先看建议与形体变化，确认无误再修改模型
                  </span>
                </div>
              </button>
              <button
                type="button"
                className="unified-rebuild-link"
                disabled={s.running || s.busy || !s.canGenerate}
                onClick={() => void s.generate()}
                title="放弃当前微调，按整体灵感重新生成模型"
              >
                <RotateCcw size={12} />
                <span>按整体灵感重新生成 3D 模型</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              className="primary generate unified-build-btn"
              disabled={s.running || s.busy || !s.canGenerate}
              onClick={() => void s.generate()}
              title="一键启动造物管线生成 3D 打印模型"
            >
              <Sparkles size={18} />
              <div className="unified-btn-content">
                <span className="unified-btn-title">
                  {s.running
                    ? '乌萨奇正在高速建模中…'
                    : hasModel
                      ? '✦ 重新生成 3D 模型'
                      : '✦ 一键建模'}
                </span>
                <span className="unified-btn-subtitle">
                  {isPhoto
                    ? 'A+B 物理逆向管线 · 阶段 A 高密扫描 + 阶段 B 水平切平'
                    : '基于当前灵感与参数生成 3D 模型'}
                </span>
              </div>
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

interface SpeechLike {
  lang: string;
  start: () => void;
  onresult: (event: { results: { [i: number]: { [i: number]: { transcript: string } } } }) => void;
  onerror: () => void;
}
