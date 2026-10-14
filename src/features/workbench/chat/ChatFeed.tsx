import { useEffect, useRef } from 'react';
import { Sparkles, Check, Pencil, Clock, User, Wand2, Box, Sliders } from 'lucide-react';
import { Usagi } from '../../../components/Usagi';
import { assetUrl } from '../../../api/client';
import type { ChatMessage, ProposalData, OrganizeData } from './types';

interface ChatFeedProps {
  messages: ChatMessage[];
  onConfirmProposal: (proposal: ProposalData) => void;
  onQuoteProposal: (proposal: ProposalData) => void;
  onSelectQuickPrompt?: (prompt: string) => void;
  onConfirmOrganize?: (organize: OrganizeData) => void;
  onOpenRibbon?: () => void;
  isBusy: boolean;
  busyMessage?: string;
}

export function ChatFeed({
  messages,
  onConfirmProposal,
  onQuoteProposal,
  onSelectQuickPrompt,
  onConfirmOrganize,
  onOpenRibbon,
  isBusy,
  busyMessage,
}: ChatFeedProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isBusy]);

  return (
    <div className="chat-feed-container" aria-label="AI 造物对话历史">
      {messages.map((msg) => {
        if (msg.type === 'welcome') {
          return (
            <div key={msg.id} className="chat-message-row assistant-row welcome-card">
              <div className="chat-avatar">
                <Usagi size={36} />
              </div>
              <div className="chat-bubble assistant-bubble">
                <div className="bubble-header">
                  <strong>乌萨奇 (Usagi)</strong>
                  <span className="bubble-badge">✦ AI 造物伙伴</span>
                </div>
                <p className="bubble-text">{msg.content}</p>
                {onSelectQuickPrompt && messages.length <= 1 && (
                  <div className="welcome-hints">
                    <span className="hints-label">试着喊出：</span>
                    <div className="hints-chips">
                      <button
                        type="button"
                        onClick={() =>
                          onSelectQuickPrompt('乌萨奇同款胡萝卜印章，底部平整带抓握手柄')
                        }
                      >
                        🥕 胡萝卜手办印章
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onSelectQuickPrompt('乌萨奇元气桌面立牌，高 80mm 自带稳固底座')
                        }
                      >
                        🐰 80mm 元气立牌
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectQuickPrompt('圆滚滚胖嘟嘟的呆萌绿色小恐龙桌面摆件')}
                      >
                        🦖 呆萌小恐龙
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        }

        if (msg.type === 'milestone' && msg.milestone) {
          return (
            <div key={msg.id} className="chat-milestone-row" aria-live="polite">
              <div className="milestone-pill">
                <Box size={14} className="milestone-icon" />
                <span className="milestone-text">
                  <strong>3D 物理模型已更新 · 版本 #{msg.milestone.revisionNumber}</strong>
                  <small>{msg.milestone.reason}</small>
                </span>
                <span className="milestone-time">{msg.milestone.time}</span>
              </div>
            </div>
          );
        }

        if (msg.sender === 'user') {
          return (
            <div key={msg.id} className="chat-message-row user-row">
              <div className="chat-bubble user-bubble">
                <div className="bubble-header user-header">
                  <span className="bubble-mode-tag">
                    {msg.mode === 'tune' ? '✨ 细节微调' : '✦ 整体灵感'}
                  </span>
                  <span className="bubble-time">
                    <Clock size={10} />
                    {new Date(msg.timestamp).toLocaleTimeString('zh-CN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="bubble-text">{msg.content}</p>

                {/* 圈注图片及标记点定位预览 */}
                {msg.locationImageId && (
                  <div className="user-marked-preview">
                    <div className="marked-img-wrap">
                      <img
                        src={assetUrl(msg.locationImageId)}
                        alt="用户标记的修改位置"
                        loading="lazy"
                      />
                      {msg.locationPoint && (
                        <i
                          className="marked-dot"
                          style={{
                            left: `${msg.locationPoint[0]}%`,
                            top: `${msg.locationPoint[1]}%`,
                          }}
                        />
                      )}
                    </div>
                    {msg.locationPoint && (
                      <span className="marked-coord-hint">
                        标记点：{msg.locationPoint[0]}%, {msg.locationPoint[1]}%
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="chat-avatar user-avatar">
                <User size={16} />
              </div>
            </div>
          );
        }

        // 默认 Assistant 回复或微调建议 Proposal 卡片
        if (msg.type === 'proposal' && msg.proposal) {
          const p = msg.proposal;
          return (
            <div key={msg.id} className="chat-message-row assistant-row">
              <div className="chat-avatar">
                <Usagi size={34} />
              </div>
              <div className="chat-bubble assistant-bubble proposal-bubble">
                <div className="bubble-header">
                  <div className="bubble-title-group">
                    <Wand2 size={13} className="sparkle-gold" />
                    <strong>乌萨奇的微调建议</strong>
                  </div>
                  {p.applied ? (
                    <span className="proposal-applied-pill">
                      <Check size={11} /> 已生成调整版本
                    </span>
                  ) : (
                    <span className="proposal-pending-pill">
                      {['queued', 'running'].includes(p.jobStatus || '')
                        ? '正在生成'
                        : p.jobStatus
                          ? '未应用'
                          : '待确认'}
                    </span>
                  )}
                </div>

                <p className="proposal-summary">{p.summary}</p>
                {p.jobStatus && !p.applied && !['queued', 'running'].includes(p.jobStatus) && (
                  <p className="proposal-summary" role="status">
                    {p.jobMessage}
                  </p>
                )}

                <div className="proposal-changes-box">
                  <span className="changes-label">预计形体改动：</span>
                  <ul className="proposal-changes-list">
                    {p.changes.map((change, idx) => (
                      <li key={`${idx}-${change}`}>{change}</li>
                    ))}
                  </ul>
                </div>

                {!p.applied && (
                  <div className="proposal-actions">
                    <button
                      type="button"
                      className="proposal-btn-edit"
                      onClick={() => onQuoteProposal(p)}
                      title="引用回输入框继续完善想法"
                    >
                      <Pencil size={12} /> 继续修改
                    </button>
                    <button
                      type="button"
                      className="proposal-btn-confirm"
                      disabled={isBusy}
                      onClick={() => onConfirmProposal(p)}
                      title="确认并立即提交管线生成 3D 模型"
                    >
                      <Check size={13} /> 确认并更新 3D 模型
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        }

        // 智能整理推测建议卡片
        if (msg.type === 'organize' && msg.organize) {
          const org = msg.organize;
          const templateNameMap: Record<string, string> = {
            cup: '笔筒 / 收纳筒',
            plaque: '立体标牌 / 挂牌',
            keychain: '个性钥匙扣',
            tray: '收纳托盘',
            seal: '印章手办',
            usagi: '乌萨奇手办',
            custom: '自由几何造型',
          };
          const templateLabel = templateNameMap[org.template] || org.template || '自由造型';

          return (
            <div key={msg.id} className="chat-message-row assistant-row">
              <div className="chat-avatar">
                <Usagi size={34} />
              </div>
              <div className="chat-bubble assistant-bubble organize-bubble">
                <div className="bubble-header">
                  <div className="bubble-title-group">
                    <Sparkles size={13} className="sparkle-gold" />
                    <strong>乌萨奇的智能整理建议</strong>
                  </div>
                  <span className="organize-pill">✦ 整理就绪</span>
                </div>

                <div className="organize-tags-grid">
                  <div className="org-tag-item">
                    <span className="org-tag-label">识别类型：</span>
                    <strong className="org-tag-value">{templateLabel}</strong>
                  </div>
                  {org.height_mm ? (
                    <div className="org-tag-item">
                      <span className="org-tag-label">预估高度：</span>
                      <strong className="org-tag-value">{org.height_mm} mm</strong>
                    </div>
                  ) : null}
                  {org.base !== undefined ? (
                    <div className="org-tag-item">
                      <span className="org-tag-label">稳固底座：</span>
                      <strong className="org-tag-value">{org.base ? '包含底座' : '无'}</strong>
                    </div>
                  ) : null}
                  {org.hole !== undefined ? (
                    <div className="org-tag-item">
                      <span className="org-tag-label">穿孔穿绳：</span>
                      <strong className="org-tag-value">{org.hole ? '打孔' : '无'}</strong>
                    </div>
                  ) : null}
                </div>

                {org.assumptions && org.assumptions.length > 0 && (
                  <div className="organize-assumptions-box">
                    <span className="assumptions-title">推测与物理假设：</span>
                    <ul className="assumptions-list">
                      {org.assumptions.map((item, idx) => (
                        <li key={`${idx}-${item}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="organize-actions">
                  {onOpenRibbon && (
                    <button
                      type="button"
                      className="org-btn-edit"
                      onClick={onOpenRibbon}
                      title="展开物理定标栏微调长宽高与细节"
                    >
                      <Sliders size={12} /> 微调参数
                    </button>
                  )}
                  {onConfirmOrganize && (
                    <button
                      type="button"
                      className="org-btn-confirm"
                      disabled={isBusy}
                      onClick={() => onConfirmOrganize(org)}
                      title="确认整理结果，启动管线生成 3D 模型"
                    >
                      <Sparkles size={13} /> 立即开始造物
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        }

        // 普通文本回复
        return (
          <div key={msg.id} className="chat-message-row assistant-row">
            <div className="chat-avatar">
              <Usagi size={34} />
            </div>
            <div className="chat-bubble assistant-bubble">
              <div className="bubble-header">
                <strong>乌萨奇 (Usagi)</strong>
                <span className="bubble-time">
                  {new Date(msg.timestamp).toLocaleTimeString('zh-CN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <p className="bubble-text">{msg.content}</p>
            </div>
          </div>
        );
      })}

      {/* AI 思考中指示气泡 */}
      {isBusy && (
        <div className="chat-message-row assistant-row typing-row" aria-live="polite">
          <div className="chat-avatar">
            <Usagi size={32} />
          </div>
          <div className="chat-bubble assistant-bubble typing-bubble">
            <div className="typing-dots">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
            </div>
            <span className="typing-text">{busyMessage || '乌萨奇正在推演 3D 几何方案…'}</span>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
