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
import { loadChatHistory, saveChatHistory, clearChatHistory } from './chat/storage';
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
  const [mode, setMode] = useState<'tune' | 'prompt'>(() => (hasModel ? 'tune' : 'prompt'));
  const [inputText, setInputText] = useState('');
  const [locationImage, setLocationImage] = useState<Asset | null>(null);
  const [locationPoint, setLocationPoint] = useState<[number, number] | null>(null);
  const [busyMessage, setBusyMessage] = useState('');

  // 监听实体生成生命周期：一旦实体模型就绪，默认自动切换为细节微调模式
  const prevHasModelRef = useRef(hasModel);
  useEffect(() => {
    if (!prevHasModelRef.current && hasModel) {
      setMode('tune');
    }
    prevHasModelRef.current = hasModel;
  }, [hasModel]);

  // 当点选 3D 实体表面部件或拾取坐标红点时，自动切入细节微调模式
  useEffect(() => {
    if (hasModel && (selectedPartId || selectedPointMm)) {
      setMode('tune');
    }
  }, [hasModel, selectedPartId, selectedPointMm]);

  // 聊天消息列表
  const projectId = s.project?.id || 'default';
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = loadChatHistory(projectId);
    if (saved.length > 0) return saved;
    return [createInitialWelcome(hasModel)];
  });

  const prevProjectIdRef = useRef(projectId);
  const prevRevisionRef = useRef(s.project?.revision_id);
  const modelSpec = adjustmentSpec(s.project, s.spec);
  const canTune = !!modelSpec;
  const cloudReady = !!s.preferences?.cloud_enabled && !!s.preferences?.chat_configured;
  const activeModelName =
    s.preferences?.models?.find((m) => m.id === s.preferences?.active_model)?.name ||
    s.preferences?.chat_model ||
    '云端 AI';

  // 当切换作品时，加载对应作品的历史记录
  useEffect(() => {
    if (projectId !== prevProjectIdRef.current) {
      prevProjectIdRef.current = projectId;
      prevRevisionRef.current = s.project?.revision_id;
      const history = loadChatHistory(projectId);
      if (history.length > 0) {
        setMessages(history);
      } else {
        setMessages([createInitialWelcome(hasModel)]);
      }
      setMode(s.project?.model ? 'tune' : 'prompt');
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
        saveChatHistory(projectId, next);
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
            applied: !!revision,
            appliedRevisionId: revision,
          },
        };
      });
      if (!changed) return current;
      saveChatHistory(projectId, next);
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

  // 发送消息与提交微调/生成
  const handleSubmit = async () => {
    const text = inputText.trim();
    if (!text || s.busy || s.running) return;
    setIsRibbonOpen(false);

    if (mode === 'tune') {
      if (!modelSpec || !cloudReady) return;

      // 提取点选位置上下文
      const selectedPart = modelSpec.modeling_plan?.steps.find(
        (step) => step.id === selectedPartId,
      );
      const point = selectedPointMm?.map((value) => value.toFixed(1)).join(', ');
      const target = selectedPart
        ? `用户点选了“${selectedPart.name}”`
        : selectedPointMm
          ? '用户点选了表面局部'
          : '';
      const scopedTarget = target
        ? `${target}${point ? `（X/Y/Z = ${point} mm）` : ''}。只修改该局部，其余保持不变。`
        : '';
      const instruction = scopedTarget ? `${scopedTarget}用户要求：${text}` : text;

      // 追加用户发言至历史
      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        sender: 'user',
        type: 'text',
        mode: 'tune',
        content: text,
        locationImageId: locationImage?.id,
        locationPoint: locationPoint || undefined,
        timestamp: Date.now(),
      };

      const nextMessages = [...messages, userMsg];
      setMessages(nextMessages);
      saveChatHistory(projectId, nextMessages);
      setInputText('');
      setBusyMessage('乌萨奇正在梳理微调规划…');

      const specSnapshot = JSON.stringify(modelSpec);
      const revision = s.project?.revision_id || '';
      const selectionSnapshot = JSON.stringify({ selectedPartId, selectedPointMm });
      const locationAssetId = locationImage?.id;
      const locationPointSnapshot = JSON.stringify(locationPoint);

      await s.act(async () => {
        try {
          const proposal = await call<{ summary: string; instruction: string; changes: string[] }>(
            'idea.adjustment',
            {
              instruction,
              spec: modelSpec,
              location_asset_id: locationAssetId,
              location_point: locationPoint,
            },
          );

          const aiProposalMsg: ChatMessage = {
            id: `ai-${Date.now()}`,
            sender: 'assistant',
            type: 'proposal',
            timestamp: Date.now(),
            proposal: {
              ...proposal,
              instruction: scopedTarget
                ? `${scopedTarget}用户要求：${proposal.instruction}`
                : proposal.instruction,
              revision,
              specSnapshot,
              selectionSnapshot,
              locationAssetId,
              locationPointSnapshot,
              applied: false,
            },
          };

          setMessages((cur) => {
            const updated = [...cur, aiProposalMsg];
            saveChatHistory(projectId, updated);
            return updated;
          });
        } finally {
          setBusyMessage('');
        }
      });
    } else {
      // 整体灵感模式
      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        sender: 'user',
        type: 'text',
        mode: 'prompt',
        content: text,
        timestamp: Date.now(),
      };

      const nextMessages = [...messages, userMsg];
      setMessages(nextMessages);
      saveChatHistory(projectId, nextMessages);
      setInputText('');
      s.setSpec((old) => ({ ...old, prompt: text }));
      setBusyMessage('乌萨奇正在启动造物管线解算 3D 模型…');

      try {
        const ok = await s.generate();
        if (ok) {
          setMode('tune');
        }
      } finally {
        setBusyMessage('');
      }
    }
  };

  // 智能整理：提取用户想法与照片特征，并以建议卡片的形式反馈至聊天流
  const handleOrganizeIdea = async () => {
    if (s.busy || s.running) return;
    const query = inputText.trim() || s.spec.prompt.trim();
    if (!query && !s.spec.asset_ids.length) {
      s.setNotice('请先输入造物想法或上传照片，再使用智能整理。');
      return;
    }

    // 1. 发送用户整理请求消息
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      type: 'text',
      mode: 'prompt',
      content: `请帮我智能整理这个造物想法：${query || '根据所选照片推断几何特征'}`,
      timestamp: Date.now(),
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    saveChatHistory(projectId, nextMessages);
    setBusyMessage('乌萨奇正在提取尺寸并整理物理特征…');

    try {
      // 2. 调用后端进行推测解析
      const organized = await s.organizeIdea(query);
      if (organized) {
        // 3. 将 AI 智能整理建议卡片送入聊天流
        const aiOrganizeMsg: ChatMessage = {
          id: `ai-org-${Date.now()}`,
          sender: 'assistant',
          type: 'organize',
          timestamp: Date.now(),
          organize: {
            prompt: organized.prompt,
            template: organized.template,
            height_mm: organized.height_mm,
            thickness_mm: organized.thickness_mm,
            base: organized.base,
            hole: organized.hole,
            assumptions: organized.assumptions || [],
          },
        };

        setMessages((cur) => {
          const updated = [...cur, aiOrganizeMsg];
          saveChatHistory(projectId, updated);
          return updated;
        });
        setInputText('');
      }
    } finally {
      setBusyMessage('');
    }
  };

  // 确认智能整理建议，直接启动造物管线
  const handleConfirmOrganize = async (_org: OrganizeData) => {
    if (s.busy || s.running) return;
    setBusyMessage('乌萨奇正在启动造物管线解算 3D 模型…');
    try {
      const ok = await s.generate();
      if (ok) {
        setMode('tune');
      }
    } finally {
      setBusyMessage('');
    }
  };

  // 确认并应用微调建议
  const handleConfirmProposal = async (proposal: ProposalData) => {
    if (!modelSpec || s.busy || s.running) return;

    if (
      proposal.revision !== s.project?.revision_id ||
      proposal.specSnapshot !== JSON.stringify(modelSpec) ||
      proposal.selectionSnapshot !== JSON.stringify({ selectedPartId, selectedPointMm })
    ) {
      s.setNotice('作品版本或参数已更新，请重新输入想法整理建议。');
      return;
    }

    setBusyMessage('乌萨奇正在调整 3D 模型几何…');
    try {
      const ok = await s.generate(
        {
          schema_version: 1,
          instruction: proposal.instruction,
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
          saveChatHistory(projectId, updated);
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
    setMode('tune');
  };

  // 清空对话历史
  const handleClearHistory = () => {
    if (window.confirm('清空当前作品的聊天记录？（模型与参数均保留）')) {
      clearChatHistory(projectId);
      const fresh = [createInitialWelcome(hasModel)];
      setMessages(fresh);
      saveChatHistory(projectId, fresh);
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
          setMode('prompt');
        }}
        isBusy={s.busy || s.running}
        busyMessage={busyMessage}
      />

      {/* 4. 底部 AI 输入坞 */}
      <ChatInputDock
        mode={!hasModel ? 'prompt' : mode}
        onModeChange={(m) => setMode(m)}
        text={inputText}
        onTextChange={setInputText}
        onSubmit={handleSubmit}
        isBusy={s.busy || s.running}
        canTune={canTune}
        cloudReady={cloudReady}
        hasModel={hasModel}
        selectedPartId={selectedPartId}
        selectedPointMm={selectedPointMm}
        locationImage={locationImage}
        locationPoint={locationPoint}
        onLocationImageChange={setLocationImage}
        onLocationPointChange={setLocationPoint}
        onVoiceInput={handleVoice}
        onOrganizeIdea={handleOrganizeIdea}
        hasPhotos={s.spec.asset_ids.length > 0}
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
      ? '呀哈！我是乌萨奇。当前 3D 实体模型已就绪。你可以在中间造物桌旋转观察，想调整哪里直接点选模型并告诉我（如：“让耳朵再长一点”），我来帮你规划几何方案！'
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
