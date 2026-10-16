import { useState, useRef, useEffect, useTransition } from 'react';
import { Sparkles, Sliders, Trash2 } from 'lucide-react';
import { useStudio } from '../../state/StudioContext';
import { Usagi } from '../../components/Usagi';
import { call, fileBase64 } from '../../api/client';
import type { Spec, Asset } from '../../types';
import { isPhotoMode } from '../../theme/modes';
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
  } = useProjectConversation(projectId, () => [createInitialWelcome(hasModel)]);

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

  // 当切换作品时，加载对应作品的历史记录
  useEffect(() => {
    if (projectId !== prevProjectIdRef.current) {
      prevProjectIdRef.current = projectId;
      prevRevisionRef.current = s.project?.revision_id;
      setIsRibbonOpen(false);
      setInputText('');
      setLocationImage(null);
      setLocationPoint(null);
    }
  }, [projectId, hasModel, s.project?.model, s.project?.revision_id]);

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
        const revision = job.status === 'succeeded' ? job.result?.project?.revision_id : undefined;
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
  }, [s.job, projectId]);

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
    const spec = modelSpec || s.spec;
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
      } finally {
        setBusyMessage('');
      }
    });
  };

  // 确认智能整理建议，直接启动造物管线
  const handleConfirmOrganize = async (org: OrganizeData) => {
    if (s.busy || s.running || org.superseded) return;
    const requestSpec = org.specSnapshot
      ? JSON.parse(org.specSnapshot)
      : {
          ...s.spec,
          prompt: org.prompt || s.spec.prompt,
          template: org.template || s.spec.template,
          height_mm: org.height_mm ?? s.spec.height_mm,
          width_mm: org.width_mm ?? s.spec.width_mm,
          depth_mm: org.depth_mm ?? s.spec.depth_mm,
          thickness_mm: org.thickness_mm ?? s.spec.thickness_mm,
          base: org.base ?? s.spec.base,
          hole: org.hole ?? s.spec.hole,
          assumptions: org.assumptions || s.spec.assumptions,
          modeling_plan: null,
          reconstruction_plan: null,
        };
    s.setSpec(requestSpec);
    setBusyMessage('乌萨奇正在启动造物管线解算 3D 模型…');
    try {
      await s.generate(undefined, requestSpec);
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
      const ok = await s.generate(
        {
          schema_version: 1,
          instruction: proposal.instruction,
          target_part_id: proposal.targetPartId,
          location_asset_id: proposal.locationAssetId,
          location_point: proposal.locationPointSnapshot
            ? JSON.parse(proposal.locationPointSnapshot)
            : undefined,
        },
        modelSpec,
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
                    applied: ok.status === 'succeeded' && !!ok.result?.project?.revision_id,
                    appliedRevisionId:
                      ok.status === 'succeeded' ? ok.result?.project?.revision_id : undefined,
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
        } catch {
          // ignore
        }
      }
      const targetMode = ['silhouette', 'relief', 'image', 'multiview'].includes(s.spec.mode)
        ? s.spec.mode
        : 'image';
      s.setSpec((old) => selectMaterials(old, ids, targetMode));
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
            <span className="online-indicator-dot" title="AI 模型在线就绪" />
          </div>
          <div className="header-title-box">
            <h2>
              <Sparkles size={15} className="sparkle-gold" />
              乌萨奇 AI 造物助手
            </h2>
            <span className="header-sub-model" title={`当前使用模型：${activeModelName}`}>
              ✦ 在线 · {activeModelName}
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

function createInitialWelcome(hasModel: boolean): ChatMessage {
  return {
    id: `welcome-${Date.now()}`,
    sender: 'assistant',
    type: 'welcome',
    content: hasModel
      ? '呀哈！我是乌萨奇。我们接着聊这个作品吧！想加文字、改尺寸，还是重新设计，直接告诉我；也可以点选模型说明修改位置。'
      : '呀哈！我是乌萨奇。别动脑，喊出你的想法 — 比如“做一个 80mm 高的乌萨奇手办印章”，或者上传实物参考照片，剩下的交给我！',
    timestamp: Date.now(),
  };
}

interface SpeechLike {
  lang: string;
  start: () => void;
  onresult: (event: { results: { [i: number]: { [i: number]: { transcript: string } } } }) => void;
  onerror: () => void;
}
