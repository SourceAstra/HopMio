import { useState, useRef, useEffect, useTransition, useMemo } from 'react';
import { Sparkles, Sliders, Trash2 } from 'lucide-react';
import { useStudio } from '../../state/StudioContext';
import { Usagi } from '../../components/Usagi';
import { call, fileBase64 } from '../../api/client';
import type { Spec, Asset } from '../../types';
import { isPhotoMode, providerForMode } from '../../theme/modes';
import { selectMaterials } from '../materials/selection';
import { adjustmentSpec } from '../modeling/plan';
import { SpecRibbon } from './chat/SpecRibbon';
import { ChatFeed } from './chat/ChatFeed';
import { ChatInputDock } from './chat/ChatInputDock';
import { clearChatHistory } from './chat/storage';
import { useProjectConversation } from './chat/useProjectConversation';
import { proposalBlockReason } from './chat/proposal';
import {
  dialogueContext,
  dialogueMessage,
  appendDialogueReply,
  type DialogueReply,
} from './chat/dialogue';
import { PHOTO_PROMPT_PRESETS } from '../../theme/modes';
import { INSPIRATION_ITEMS } from '../../theme/inspirations';
import { ProviderChoice } from '../modeling/ProviderChoice';
import '../../styles/conversation.css';
import type { ChatMessage, ProposalData, OrganizeData } from './chat/types';

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

  // 物理定标抽屉折叠展开状态：默认紧凑收起以最大化对话历史空间，点击随时展开调整
  const hasModel = !!s.project?.model;
  const [isRibbonOpen, setIsRibbonOpen] = useState(false);

  // 模式感知与输入状态：若已有一键生成的实体模型，默认开启细节微调模式
  const [inputText, setInputText] = useState('');
  const [locationImage, setLocationImage] = useState<Asset | null>(null);
  const [locationPoint, setLocationPoint] = useState<[number, number] | null>(null);
  const [busyMessage, setBusyMessage] = useState('');

  // 聊天消息列表
  const projectId = s.project?.id || 'default';
  const {
    messages,
    setMessages,
    ready: conversationReady,
    error: conversationError,
  } = useProjectConversation(projectId, () => [
    createInitialWelcome(hasModel, s.project?.name, s.spec),
  ]);

  const prevProjectIdRef = useRef(projectId);
  const prevRevisionRef = useRef(s.project?.revision_id);
  const modelSpec = adjustmentSpec(s.project, s.spec);
  const selectedStep = modelSpec?.modeling_plan?.steps.find((step) => step.id === selectedPartId);
  const suggestionReferences = JSON.stringify(
    selectedStep || modelSpec?.modeling_plan?.steps || [],
  );
  const tuningSuggestions = Object.entries(modelSpec?.modeling_plan?.parameters || {})
    .filter(
      ([name, parameter]) =>
        !parameter.locked &&
        suggestionReferences.includes(JSON.stringify({ parameter: name }).slice(1, -1)),
    )
    .slice(0, 4)
    .map(([, parameter]) => ({
      label: `调整${parameter.label}`,
      value: `将${parameter.label}调整为${Number((parameter.value * 1.1).toFixed(2))} ${parameter.unit}，其余部件与细节保持不变`,
    }));
  const activeModelName =
    s.preferences?.models?.find((m) => m.id === s.preferences?.active_model)?.name ||
    s.preferences?.chat_model ||
    '云端 AI';

  // 针对当前造物模式与上下文动态准备乌萨奇快捷灵感与提示词气泡
  const contextQuickHints = useMemo(() => {
    // 1. 若当前工程已经设定了初始构想/Prompt，且尚未生成模型
    if (!hasModel && s.spec.prompt && s.spec.prompt.trim()) {
      return [
        { label: `✨ 立即推演此方案`, prompt: s.spec.prompt },
        {
          label: `📏 设定高 80mm 底面加平`,
          prompt: `${s.spec.prompt}，整体高度设定为 80mm，底面平整稳固便于 3D 打印站立`,
        },
        {
          label: `🥕 融入乌萨奇呆萌风格`,
          prompt: `${s.spec.prompt}，带有乌萨奇标志性的长耳朵与开心的ω嘴巴表情`,
        },
      ];
    }

    // 2. 照片模式（单张照片或多视角），提供高精度 3D 打印精准提示词
    if (['image', 'multiview'].includes(s.spec.mode)) {
      return PHOTO_PROMPT_PRESETS.map((preset) => ({
        label: `${preset.emoji} ${preset.title}`,
        prompt: preset.prompt,
      }));
    }

    // 3. 手绘涂鸦变挂件模式
    if (s.spec.mode === 'silhouette') {
      return [
        {
          label: '🎨 4mm 轮廓挤出挂件',
          prompt: '将手绘线稿轮廓拉伸为 4mm 厚度实体挂件，顶部预留 3.5mm 挂孔，四边平滑微倒角。',
        },
        {
          label: '🔑 钥匙扣加固边框',
          prompt: '加宽加固外轮廓线条，底面平整贴床，顶部钥匙扣孔增加 1.5mm 保护圈。',
        },
      ];
    }

    // 4. 照片小浮雕模式
    if (s.spec.mode === 'relief') {
      return [
        {
          label: '🖼️ 明暗深度立体浮雕',
          prompt: '基于照片明暗起伏映射为立体深度浮雕，基底厚度 2mm，浮雕深度 3mm，四边带加固边框。',
        },
        {
          label: '📐 透光薄板剪影效果',
          prompt: '最薄处 0.8mm，最厚处 3.2mm，背面平整光滑，适合背光透出层次剪影。',
        },
      ];
    }

    // 5. 喊出想法模式（纯文字），从灵感宝箱推荐精选点子
    return [
      {
        label: '🥕 乌萨奇胡萝卜印章',
        prompt: '乌萨奇同款胡萝卜手办印章，底部平整带抓握手柄，单色易打印',
      },
      {
        label: '✦ 80mm 元气立牌',
        prompt: '乌萨奇开心张臂招手立体桌面立牌，自带稳固加重底座与开心的ω嘴巴',
      },
      {
        label: '🦖 呆萌小恐龙',
        prompt: '圆滚滚胖嘟嘟的呆萌绿色小恐龙桌面摆件，四脚着地免支撑打印',
      },
      {
        label: '🍮 乌萨奇布丁收纳碟',
        prompt: '乌萨奇大耳朵轮廓边缘的桌面圆形收纳浅盘，平整底面，放回形针或小橡皮',
      },
    ];
  }, [hasModel, s.spec.prompt, s.spec.mode, s.spec.asset_ids.length]);

  // 当切换作品时，加载对应作品的历史记录并同步草稿
  useEffect(() => {
    if (projectId !== prevProjectIdRef.current) {
      prevProjectIdRef.current = projectId;
      prevRevisionRef.current = s.project?.revision_id;
      setIsRibbonOpen(false);
      setInputText(s.spec.prompt || '');
      setLocationImage(null);
      setLocationPoint(null);
    }
  }, [projectId, hasModel, s.project?.model, s.project?.revision_id, s.spec.prompt]);

  // 当模型版本发生递增更新时，自动追加模型已更新里程碑卡片
  useEffect(() => {
    if (
      prevRevisionRef.current &&
      s.project?.revision_id &&
      prevRevisionRef.current !== s.project?.revision_id
    ) {
      const revNum = s.project?.revision_count || 1;
      const milestoneMsg: ChatMessage = {
        id: `milestone-${Date.now()}`,
        sender: 'assistant',
        type: 'milestone',
        content: `3D 物理模型已更新至版本 #${revNum}！`,
        milestone: {
          revisionNumber: revNum,
          reason:
            s.project?.model?.adjustment?.instruction ||
            s.spec.prompt ||
            '根据调整建议完成 3D 几何精修',
          time: new Date().toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
          }),
        },
        timestamp: Date.now(),
      };

      setMessages((prev) => {
        const next = [...prev, milestoneMsg];
        return next;
      });
    }
    prevRevisionRef.current = s.project?.revision_id;
  }, [
    s.project?.revision_id,
    s.project?.revision_count,
    s.project?.model,
    s.spec.prompt,
    projectId,
  ]);

  // 建议只跟随自身任务；提交成功不等于模型生成成功。
  useEffect(() => {
    const job = s.job;
    if (!job || job.project_id !== projectId) return;
    setMessages((current) => {
      let changed = false;
      const next = current.map((message) => {
        const proposal = message.proposal;
        if (!proposal || proposal.jobId !== job.id || proposal.jobStatus === job.status)
          return message;
        changed = true;
        const revision = job.status === 'succeeded' && job.result?.applied !== false ? job.result?.project?.revision_id : undefined;
        return {
          ...message,
          proposal: {
            ...proposal,
            jobStatus: job.status,
            jobMessage: job.message,
            jobErrorCode: job.error_code,
            applied: !!revision,
            appliedRevisionId: revision,
          },
        };
      });
      if (!changed) return current;
      return next;
    });
  }, [s.job, projectId, conversationReady]);
  useEffect(() => {
    if (!conversationReady) return;
    let active = true;
    void call<import('../../types').Job[]>('job.list').then((jobs) => {
      if (!active) return;
      setMessages((current) => current.map((message) => {
        const proposal = message.proposal;
        const job = jobs.find((item) => item.id === proposal?.jobId && item.project_id === projectId);
        if (!proposal || !job || proposal.jobStatus === job.status) return message;
        const revision = job.status === 'succeeded' && job.result?.applied !== false ? job.result?.project?.revision_id : undefined;
        return { ...message, proposal: { ...proposal, jobStatus: job.status, jobMessage: job.message, jobErrorCode: job.error_code, applied: !!revision, appliedRevisionId: revision } };
      }));
    }).catch((error) => { if (active) s.setNotice(`任务记录暂未同步：${(error as Error).message}`); });
    return () => { active = false; };
  }, [projectId, conversationReady]);

  // 监听标记截图上传事件
  useEffect(() => {
    const handleUpload = async (e: Event) => {
      const custom = e as CustomEvent<File>;
      const file = custom.detail;
      if (!file) return;
      await s.act(async () => {
        const uploaded = await call<Asset>('asset.upload', {
          name: file.name,
          base64: await fileBase64(file),
        });
        setLocationImage(uploaded);
        setLocationPoint(null);
      });
    };
    window.addEventListener('upload-location-image', handleUpload);
    return () => window.removeEventListener('upload-location-image', handleUpload);
  }, [s]);

  // 一个作品一个入口，意图由助手结合当前模型与上下文判断。
  const handleSubmit = async () => {
    const text = inputText.trim();
    if (!text || s.busy || s.running || !conversationReady) return;
    if (text.length > 2000) {
      s.setNotice('每次请发送不超过 2000 字的想法。');
      return;
    }
    setIsRibbonOpen(false);
    const baseSpec = modelSpec || s.spec;
    const spec = {
      ...baseSpec,
      asset_ids: s.spec.asset_ids,
    };
    const revision = s.project?.revision_id || '';
    const context = dialogueContext(messages, revision, selectedPartId, selectedPointMm);
    const locationAssetId = locationImage?.id || context.pending_proposal?.locationAssetId;
    const marker = locationImage
      ? locationPoint
      : JSON.parse(context.pending_proposal?.locationPointSnapshot || 'null');
    setMessages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        sender: 'user',
        type: 'text',
        content: text,
        timestamp: Date.now(),
        locationImageId: locationImage?.id,
        locationPoint: locationPoint || undefined,
      },
    ]);
    setInputText('');
    setBusyMessage('乌萨奇正在结合这个作品的对话整理建议…');
    await s.act(async () => {
      try {
        const reply = await call<DialogueReply>('idea.converse', {
          text,
          spec,
          project_id: s.project?.id,
          revision_id: s.project?.revision_id,
          ...context,
          location_asset_id: locationAssetId,
          location_point: marker,
        });
        const message = dialogueMessage(
          reply,
          spec,
          revision,
          context.selection,
          locationAssetId,
          marker,
        );
        setMessages((current) => appendDialogueReply(current, message));
      } catch (error) {
        setInputText(text);
        throw error;
      } finally {
        setBusyMessage('');
      }
    });
  };

  // 确认智能整理建议，直接启动造物管线
  const handleConfirmOrganize = async (org: OrganizeData) => {
    if (s.busy || s.running || org.superseded) return;
    const rawSpec = org.specSnapshot ? JSON.parse(org.specSnapshot) : {};
    const { title: rawTitle, is_new_project, ...cleanRawSpec } = rawSpec;
    const targetMode = cleanRawSpec.mode || s.spec.mode;
    const requestSpec = {
      ...s.spec,
      ...cleanRawSpec,
      prompt: org.prompt || cleanRawSpec.prompt || s.spec.prompt,
      template: org.template || cleanRawSpec.template || s.spec.template,
      mode: targetMode,
      provider: providerForMode(targetMode, cleanRawSpec.provider || s.spec.provider),
      height_mm: org.height_mm ?? cleanRawSpec.height_mm ?? s.spec.height_mm,
      width_mm: org.width_mm ?? cleanRawSpec.width_mm ?? s.spec.width_mm,
      depth_mm: org.depth_mm ?? cleanRawSpec.depth_mm ?? s.spec.depth_mm,
      thickness_mm: org.thickness_mm ?? cleanRawSpec.thickness_mm ?? s.spec.thickness_mm,
      base: org.base ?? cleanRawSpec.base ?? s.spec.base,
      hole: org.hole ?? cleanRawSpec.hole ?? s.spec.hole,
      assumptions: org.assumptions || cleanRawSpec.assumptions || s.spec.assumptions,
      asset_ids: cleanRawSpec.asset_ids?.length ? cleanRawSpec.asset_ids : s.spec.asset_ids,
      modeling_plan: cleanRawSpec.modeling_plan || null,
      reconstruction_plan: null,
    };
    const shouldFork = !!org.is_new_project;
    setBusyMessage('乌萨奇正在启动造物管线解算 3D 模型…');
    try {
      if (shouldFork) {
        const title = org.title || rawTitle || (org.prompt ? org.prompt.slice(0, 16) : '新造物作品');
        const newProject = await s.create(requestSpec, title);
        if (newProject) {
          await s.generate(undefined, requestSpec, newProject.id);
        }
      } else {
        s.setSpec(requestSpec);
        await s.generate(undefined, requestSpec);
      }
    } finally {
      setBusyMessage('');
    }
  };

  // 确认并应用微调建议
  const handleConfirmProposal = async (proposal: ProposalData) => {
    if (!modelSpec || s.busy || s.running) return;

    const block = proposalBlockReason(proposal, s.project?.revision_id, modelSpec);
    if (block) {
      s.setNotice(block);
      return;
    }

    setBusyMessage('乌萨奇正在调整 3D 模型几何…');
    try {
      const effectiveSpec = {
        ...modelSpec,
        asset_ids: s.spec.asset_ids,
      };
      const ok = await s.generate(
        {
          schema_version: 1,
          instruction: proposal.instruction,
          target_part_id: modelSpec.modeling_plan?.steps.some((step) => step.id === proposal.targetPartId) ? proposal.targetPartId : undefined,
          location_point_mm: JSON.parse(proposal.selectionSnapshot || '{}').selectedPointMm || undefined,
          location_asset_id: proposal.locationAssetId,
          location_point: proposal.locationPointSnapshot
            ? JSON.parse(proposal.locationPointSnapshot)
            : undefined,
        },
        effectiveSpec,
      );

      if (ok) {
        // 记录任务关联，后续仅由对应任务的保存结果确认应用。
        setMessages((cur) => {
          const updated = cur.map((m) =>
            m.proposal === proposal
              ? {
                  ...m,
                  proposal: {
                    ...m.proposal,
                    jobId: ok.id,
                    jobStatus: ok.status,
                    jobMessage: ok.message,
                    applied: ok.status === 'succeeded' && ok.result?.applied !== false && !!ok.result?.project?.revision_id,
                    appliedRevisionId:
                      ok.status === 'succeeded' && ok.result?.applied !== false ? ok.result?.project?.revision_id : undefined,
                  },
                }
              : m,
          );
          return updated;
        });
        setLocationImage(null);
        setLocationPoint(null);
      }
    } finally {
      setBusyMessage('');
    }
  };

  // 引用微调建议继续修改
  const handleQuoteProposal = (proposal: ProposalData) => {
    setInputText(`在【${proposal.summary}】的基础上，`);
  };

  // 清空对话历史
  const handleClearHistory = () => {
    if (window.confirm('清空当前作品的聊天记录？（模型与参数均保留）')) {
      clearChatHistory(projectId);
      const fresh = [createInitialWelcome(hasModel)];
      setMessages(fresh);
    }
  };

  // 处理实物照片上传
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
        } catch (error) {
          s.setNotice(`上传 ${file.name} 失败：${(error as Error).message}`);
          throw error;
        }
      }
      const targetMode = ['silhouette', 'relief', 'image', 'multiview'].includes(s.spec.mode)
        ? s.spec.mode
        : 'image';
      s.setSpec((old) => selectMaterials(old, ids, targetMode));
      if (hasModel) {
        s.setNotice('已补充当前作品的参考材料，原照片与模型保留；可继续微调或按新照片重新生成。');
      }
    });
  };

  // 语音输入
  const handleVoice = () => {
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
      s.setNotice('当前桌面环境未探测到可用语音输入，可直接打字交流。');
      return;
    }
    const recognition = new Speech();
    recognition.lang = 'zh-CN';
    recognition.onresult = (e) => {
      const text = e.results[0][0].transcript;
      setInputText((prev) => (prev ? `${prev}，${text}` : text));
    };
    recognition.onerror = () => s.setNotice('没有听清，请检查麦克风设置后重试。');
    recognition.start();
  };

  return (
    <section className="panel idea-panel ai-chat-panel">
      {/* 隐藏式实物照片上传选择器 */}
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

      {/* 1. 对话中枢头部 */}
      <div className="chat-panel-header">
        <div className="header-identity">
          <div className="header-avatar-wrap">
            <Usagi size={28} />
            <span className="online-indicator-dot" title={s.preferences?.cloud_enabled && s.preferences?.chat_configured ? 'AI 已配置，连接状态以实际请求为准' : '本地整理可用，AI 尚未开启或配置'} />
          </div>
          <div className="header-title-box">
            <h2>
              <Sparkles size={15} className="sparkle-gold" />
              乌萨奇 AI 造物助手
            </h2>
            <span className="header-sub-model" title={`当前使用模型：${activeModelName}`}>
              {s.preferences?.cloud_enabled && s.preferences?.chat_configured ? `✦ 已配置 · ${activeModelName}` : '本地整理 · AI 待配置'}
            </span>
          </div>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className={`ribbon-toggle-btn ${isRibbonOpen ? 'active' : ''}`}
            onClick={() => setIsRibbonOpen(!isRibbonOpen)}
            title={isRibbonOpen ? '收起物理定标条' : '展开物理定标条（尺寸/底座/照片）'}
          >
            <Sliders size={13} />
            <span>参数</span>
          </button>

          <button
            type="button"
            className="chat-clear-btn"
            onClick={handleClearHistory}
            title="清空当前作品的聊天历史记录"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <div className="chat-session-context">
        <strong>作品会话 · {s.project?.name || '新作品'}</strong>
        <small>
          {conversationReady
            ? '连续理解对话与待确认方案'
            : conversationError
              ? '会话同步失败'
              : '正在读取作品对话…'}
        </small>
      </div>
      {conversationError && (
        <p className="chat-session-error" role="alert">
          {conversationError} 请刷新后继续。
        </p>
      )}

      {/* 2. 物理定标抽屉（尺寸、底座、模板、参考照片） */}
      <SpecRibbon
        isOpen={isRibbonOpen}
        onToggle={() => setIsRibbonOpen(!isRibbonOpen)}
        fileInputRef={fileInputRef}
        onInspectPhoto={onInspectPhoto}
        inspectAssetId={inspectAssetId}
      />
      <div className="creation-actions">
        <button type="button" className="primary" title={s.generationBlock || '按当前素材与参数生成模型'} disabled={s.busy || s.running || !s.canGenerate} onClick={() => {
          const requested = !hasModel && inputText.trim() ? { ...s.spec, prompt: inputText.trim() } : s.spec;
          s.setSpec(requested);
          void s.generate(undefined, requested);
        }}>{s.running ? '正在造物…' : s.dirty && hasModel ? '应用修改 · 生成新版本' : hasModel ? '重新生成模型' : '生成模型'}</button>
        <button type="button" className="secondary" onClick={() => setIsRibbonOpen(true)}>照片与参数</button>
      </div>
      {s.generationBlock && <p className="surface-warning" role="status">{s.generationBlock}</p>}
      {isRibbonOpen && (s.spec.mode === 'text' || isPhotoMode(s.spec.mode)) && <ProviderChoice />}
      {!s.preferences?.blender?.available && <button className="link" onClick={() => s.setRoom('settings')}>配置本地建模引擎</button>}
      {s.spec.provider === 'parametric' && !s.spec.modeling_plan && (!s.preferences?.cloud_enabled || !s.preferences?.chat_configured) && <p className="surface-warning">AI 建模需要在家长设置开启并配置 AI；已有本地模板可在参数中选择。</p>}

      {/* 3. AI 聊天历史流 */}
      <ChatFeed
        messages={messages}
        onConfirmProposal={handleConfirmProposal}
        onQuoteProposal={handleQuoteProposal}
        onConfirmOrganize={handleConfirmOrganize}
        onOpenRibbon={() => setIsRibbonOpen(true)}
        onSelectQuickPrompt={(prompt) => {
          setInputText(prompt);
        }}
        isBusy={s.busy || s.running || !conversationReady}
        busyMessage={busyMessage}
        reviewAvailable={!!s.preferences?.chat_supports_images}
        quickHints={contextQuickHints}
      />

      {/* 4. 底部 AI 输入坞 */}
      <ChatInputDock
        text={inputText}
        onTextChange={setInputText}
        onSubmit={handleSubmit}
        isBusy={s.busy || s.running || !conversationReady}
        tuningSuggestions={tuningSuggestions}
        hasModel={hasModel}
        selectedPartId={selectedPartId}
        selectedPointMm={selectedPointMm}
        locationImage={locationImage}
        locationPoint={locationPoint}
        onLocationImageChange={setLocationImage}
        onLocationPointChange={setLocationPoint}
        onVoiceInput={handleVoice}
      />
    </section>
  );
}

function createInitialWelcome(
  hasModel: boolean,
  projectName?: string,
  spec?: Spec,
): ChatMessage {
  if (hasModel) {
    return {
      id: `welcome-${Date.now()}`,
      sender: 'assistant',
      type: 'welcome',
      content:
        '呀哈！我是乌萨奇。我们接着聊这个作品吧！想加文字、改尺寸，还是重新设计，直接告诉我；也可以点选模型说明修改位置。',
      timestamp: Date.now(),
    };
  }

  // 1. 若带有初始造物构想/灵感 Prompt
  if (spec?.prompt && spec.prompt.trim()) {
    return {
      id: `welcome-${Date.now()}`,
      sender: 'assistant',
      type: 'welcome',
      content: `呀哈！已为你开启新作品【${projectName || '新作品'}】！乌萨奇已经准备好了你的造物构想：“${spec.prompt}”。点击下方快捷选项可立即开始推演雕刻，或在输入框补充具体要求！`,
      timestamp: Date.now(),
    };
  }

  // 2. 若带有参考照片素材
  if (spec && ['image', 'multiview', 'relief'].includes(spec.mode) && spec.asset_ids.length > 0) {
    return {
      id: `welcome-${Date.now()}`,
      sender: 'assistant',
      type: 'welcome',
      content: `呀哈！已为【${projectName || '新作品'}】准备好 ${spec.asset_ids.length} 张参考照片。乌萨奇将按照片特征进行 3D 实体推演，你可以在下方挑选精准提示词，为模型指定造型风格与打印要求！`,
      timestamp: Date.now(),
    };
  }

  // 3. 默认欢迎词
  return {
    id: `welcome-${Date.now()}`,
    sender: 'assistant',
    type: 'welcome',
    content: `呀哈！我是乌萨奇。欢迎来到【${projectName || '造物桌'}】！别动脑，喊出你的想法 — 比如挑选下方的灵感点子，或者在输入框说出愿望，剩下的交给我！`,
    timestamp: Date.now(),
  };
}

interface SpeechLike {
  lang: string;
  start: () => void;
  onresult: (event: { results: { [i: number]: { [i: number]: { transcript: string } } } }) => void;
  onerror: () => void;
}
