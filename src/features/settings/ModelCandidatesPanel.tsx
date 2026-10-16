import { useState } from 'react';
import { Search, Layers3 } from 'lucide-react';
import { ModelCandidateCard } from './ModelCandidateCard';
import type { AIModelItem } from '../../types';

export function ModelCandidatesPanel({
  models,
  active,
  keys,
  onEdit,
  onSelect,
  onDelete,
  onImageVerified,
}: {
  models: AIModelItem[];
  active?: string;
  keys: Record<string, string>;
  onEdit: (item: AIModelItem) => void;
  onSelect: (item: AIModelItem) => void;
  onDelete: (item: AIModelItem) => void;
  onImageVerified: (item: AIModelItem) => void;
}) {
  const [query, setQuery] = useState('');
  const visible = models.filter((item) =>
    `${item.name} ${item.model} ${item.url}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <section className="model-candidates-section">
      <div className="model-list-heading">
        <div>
          <span className="model-step">搭档</span>
          <h3>
            模型候选列表 <span>{models.length}</span>
          </h3>
        </div>
        <small>选择搭档，测试文字与图片能力，点击编辑调整配置。</small>
      </div>
      <div className="model-search">
        <Search size={16} />
        <input
          aria-label="搜索候选模型"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索名称、标识或服务地址"
        />
      </div>
      <div className="model-candidates">
        {visible.map((item) => (
          <ModelCandidateCard
            key={`${item.id}:${item.url}:${item.model}:${item.protocol}`}
            item={item}
            active={active === item.id}
            pendingKey={keys[item.id]}
            onEdit={() => onEdit(item)}
            onSelect={() => onSelect(item)}
            onDelete={() => onDelete(item)}
            onImageVerified={() => onImageVerified(item)}
          />
        ))}
      </div>
      {!visible.length && (
        <p className="model-empty">
          <Layers3 size={26} />
          没有找到模型，可以到“发现模型”添加新搭档。
        </p>
      )}
    </section>
  );
}
