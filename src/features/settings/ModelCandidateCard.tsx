import { ModelProbeButtons } from './ModelProbeButtons';
import type { AIModelItem } from '../../types';
import { Box, Check, Pencil, Trash2, Image, Type, KeyRound } from 'lucide-react';

export function ModelCandidateCard({
  item,
  active,
  pendingKey,
  onSelect,
  onEdit,
  onDelete,
  onImageVerified,
}: {
  item: AIModelItem;
  active: boolean;
  pendingKey?: string;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onImageVerified: () => void;
}) {
  return (
    <article className={`model-candidate ${active ? 'active' : ''}`}>
      <div className="model-card-heading">
        <span className="model-provider-icon">
          <Box size={21} />
        </span>
        <div className="model-card-title">
          <strong>{item.name}</strong>
          <small>{item.model}</small>
        </div>
        <button
          type="button"
          className={`model-select ${active ? 'selected' : ''}`}
          disabled={active}
          onClick={onSelect}
        >
          {active && <Check size={13} />}
          {active ? '当前选择' : '选用'}
        </button>
      </div>
      <small className="model-endpoint" title={item.url}>
        {item.url}
      </small>
      <div className="model-capabilities">
        <span>
          <Type size={12} />
          文字
        </span>
        <span className={item.supports_images ? 'enabled' : ''}>
          <Image size={12} />
          {item.supports_images ? '图片已启用' : '图片未启用'}
        </span>
        <span>{item.protocol === 'chat' ? 'Chat Completions' : 'Messages'}</span>
        <span>输出上限 {(item.max_tokens ?? 8192).toLocaleString()} Token</span>
        <span>
          上下文{' '}
          {item.context_window_tokens ? item.context_window_tokens.toLocaleString() : '未填写'}
        </span>
        <span>
          输入 {item.max_input_tokens ? item.max_input_tokens.toLocaleString() : '自动分配'}
        </span>
        <span>等待 {item.timeout_seconds ?? 300} 秒</span>
      </div>
      <div className="model-credential">
        <span>
          <KeyRound size={12} />
          {pendingKey ? '密钥待保存' : item.has_key ? '密钥已配置' : '尚未配置密钥'}
        </span>
        <div>
          <button type="button" aria-label={`编辑 ${item.name}`} title="编辑模型" onClick={onEdit}>
            <Pencil size={14} />
          </button>
          <button
            type="button"
            aria-label={`移除 ${item.name}`}
            title="移除候选"
            onClick={onDelete}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <ModelProbeButtons
        connection={{
          saved_id: item.id,
          url: item.url,
          protocol: item.protocol,
          model: item.model,
          api_key: pendingKey || '',
        }}
        disabled={!(pendingKey || item.has_key)}
        onImageVerified={onImageVerified}
      />
    </article>
  );
}
