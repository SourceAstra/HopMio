import { useState } from 'react';
import { Search, Sparkles, Plus } from 'lucide-react';
import { call } from '../../api/client';
import type { AIModelItem } from '../../types';
import { ModelServiceFields, type ModelServiceConnection } from './ModelServiceFields';

export function ModelDiscoveryPanel({
  onAdd,
  onAdded,
}: {
  onAdd: (item: AIModelItem, key: string) => void;
  onAdded: () => void;
}) {
  const [connection, setConnection] = useState<ModelServiceConnection>({
    url: '',
    api_key: '',
    protocol: 'chat',
  });
  const [found, setFound] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const canDiscover = !!connection.url.trim() && !!connection.api_key.trim();
  async function discover() {
    setBusy(true);
    setMessage('');
    setError(false);
    try {
      const result = await call<{
        models: typeof found;
        url: string;
        message: string;
        has_more: boolean;
      }>('settings.models.discover', connection);
      setConnection((previous) => ({ ...previous, url: result.url }));
      setFound(result.models);
      setSelected([]);
      setMessage(
        `${result.models.length ? `发现 ${result.models.length} 个模型。` : ''}${result.message}${result.has_more ? '更多模型可手动填写标识。' : ''}`,
      );
    } catch (reason) {
      setError(true);
      setMessage((reason as Error).message + ' 也可以手动填写模型标识。');
    } finally {
      setBusy(false);
    }
  }
  function add(items: { id: string; name: string }[]) {
    for (const item of items)
      onAdd(
        {
          id: crypto.randomUUID(),
          name: item.name,
          model: item.id,
          url: connection.url.trim(),
          protocol: connection.protocol,
          supports_images: false,
          max_tokens: 8192,
          timeout_seconds: 300,
          reasoning_effort: null,
          context_window_tokens: 0,
          max_input_tokens: 0,
        },
        connection.api_key.trim(),
      );
    setSelected([]);
    setMessage('已加入候选列表，请在模型配置中测试、调整并保存。');
    onAdded();
  }
  return (
    <div className="model-discovery-layout">
      <section className="model-connection">
        <div className="model-connect-heading">
          <span className="model-step">
            <Search size={17} />
          </span>
          <div>
            <h3>连接模型服务</h3>
            <small>找到新搭档后，前往“模型配置”管理。</small>
          </div>
        </div>
        <ModelServiceFields
          value={connection}
          onChange={(next) => {
            setConnection(next);
            setFound([]);
            setSelected([]);
            setMessage('');
          }}
          disabled={busy}
          discovery
        />
        <button
          type="button"
          className="primary model-discover-button"
          disabled={busy || !canDiscover}
          onClick={() => void discover()}
        >
          <Sparkles size={16} />
          {busy ? '正在发现模型…' : '发现可用模型'}
        </button>
        <details className="model-manual">
          <summary>
            <Plus size={14} />
            手动添加模型
          </summary>
          <label>
            新模型标识
            <input
              aria-label="新模型标识"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="服务未提供发现接口时填写 Model ID"
            />
          </label>
          <button
            type="button"
            className="secondary"
            disabled={busy || !canDiscover || !manual.trim()}
            onClick={() => add([{ id: manual.trim(), name: manual.trim() }])}
          >
            添加到模型配置
          </button>
        </details>
        <small className="model-secret-note">密钥仅用于连接服务，保存后由系统凭据库保管。</small>
      </section>
      <section className="model-candidates-section">
        <div className="model-list-heading">
          <div>
            <span className="model-step">结果</span>
            <h3>
              发现结果 <span>{found.length}</span>
            </h3>
          </div>
          <small>勾选要添加的模型，再到配置页测试与设置预算。</small>
        </div>
        {message && (
          <p role="status" className={error ? 'model-status error' : 'model-status'}>
            {message}
          </p>
        )}
        {found.length > 0 ? (
          <div className="model-discovery">
            <label>
              筛选发现结果
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="输入模型名称或标识"
              />
            </label>
            <div className="model-discovery-list">
              {found
                .filter((item) =>
                  `${item.id} ${item.name}`.toLowerCase().includes(query.toLowerCase()),
                )
                .map((item) => (
                  <label className="checklist" key={item.id}>
                    <input
                      type="checkbox"
                      checked={selected.includes(item.id)}
                      onChange={(e) =>
                        setSelected((previous) =>
                          e.target.checked
                            ? [...previous, item.id]
                            : previous.filter((id) => id !== item.id),
                        )
                      }
                    />
                    <span>
                      {item.name}
                      <small>{item.id}</small>
                    </span>
                  </label>
                ))}
            </div>
            <button
              type="button"
              className="primary"
              disabled={busy || !selected.length}
              onClick={() => add(found.filter((item) => selected.includes(item.id)))}
            >
              加入候选列表（{selected.length}）
            </button>
          </div>
        ) : (
          <div className="model-empty">
            <Search size={32} />
            <p>填好服务地址与密钥，发现可用模型。</p>
          </div>
        )}
      </section>
    </div>
  );
}
