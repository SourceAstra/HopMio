import { useState } from 'react';
import type { AIModelItem } from '../../types';
import { ModelProbeButtons } from './ModelProbeButtons';
import { ModelBudgetFields, validModelBudget, type ModelBudget } from './ModelBudgetFields';
import { ModelServiceFields, type ModelServiceConnection } from './ModelServiceFields';
import { SlidersHorizontal } from 'lucide-react';

export function ModelConnectionForm({
  initial,
  initialKey,
  onAdd,
  onSaveBudget,
  onBudgetChange,
}: {
  initial: AIModelItem;
  initialKey?: string;
  onAdd: (model: AIModelItem, key: string) => void;
  onSaveBudget: (budget: ModelBudget) => Promise<boolean>;
  onBudgetChange: (budget: ModelBudget) => void;
}) {
  const [connection, setConnection] = useState<ModelServiceConnection>({
    url: initial.url,
    api_key: initialKey || '',
    protocol: initial.protocol,
  });
  const [model, setModel] = useState(initial.model);
  const [name, setName] = useState(initial.name);
  const [images, setImages] = useState(initial.supports_images);
  const [budget, setBudget] = useState<ModelBudget>({
    max_tokens: initial.max_tokens ?? 8192,
    timeout_seconds: initial.timeout_seconds ?? 300,
    reasoning_effort: initial.reasoning_effort || null,
    context_window_tokens: initial.context_window_tokens ?? 0,
    max_input_tokens: initial.max_input_tokens ?? 0,
  });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  async function saveBudget() {
    setSaving(true);
    setStatus('');
    try {
      const ok = await onSaveBudget(budget);
      setStatus(ok ? '预算已保存，下次调用生效。' : '预算未保存，请查看页面提示。');
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="model-connection">
      <div className="model-connect-heading">
        <span className="model-step">
          <SlidersHorizontal size={17} />
        </span>
        <div>
          <h3>编辑模型配置</h3>
          <small>连接信息、输入输出预算与能力测试。</small>
        </div>
      </div>
      <ModelBudgetFields
        value={budget}
        onChange={(next) => {
          setBudget(next);
          onBudgetChange(next);
          setStatus('有未保存的预算修改。');
        }}
        disabled={saving}
        target={initial.name}
        status={status}
        onSave={() => void saveBudget()}
      />
      <details className="model-manual" open>
        <summary>连接信息与能力测试</summary>
        <div className="model-manual-body">
          <ModelServiceFields
            value={connection}
            onChange={setConnection}
            hasKey={initial.has_key}
            disabled={saving}
          />
          <div className="model-fields">
            <label>
              模型标识（也可手动填写）
              <input value={model} onChange={(e) => setModel(e.target.value)} />
            </label>
            <label>
              显示名称
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
          </div>
          <label className="checklist">
            <input type="checkbox" checked={images} onChange={(e) => setImages(e.target.checked)} />
            启用图片输入（图片测试通过后自动勾选）
          </label>
          <ModelProbeButtons
            connection={{ ...connection, model, saved_id: initial.id }}
            disabled={
              saving ||
              !model.trim() ||
              !connection.url.trim() ||
              !(connection.api_key.trim() || initial.has_key)
            }
            onImageVerified={() => setImages(true)}
          />
          <button
            type="button"
            className="primary"
            disabled={
              saving || !model.trim() || !connection.url.trim() || !validModelBudget(budget)
            }
            onClick={() => {
              onAdd(
                {
                  ...initial,
                  ...budget,
                  url: connection.url.trim(),
                  protocol: connection.protocol,
                  model: model.trim(),
                  name: name.trim() || model.trim(),
                  supports_images: images,
                },
                connection.api_key.trim(),
              );
              setStatus('已更新候选模型，请点击“保存模型配置”保存连接信息。');
            }}
          >
            更新候选模型
          </button>
        </div>
      </details>
      <small className="model-secret-note">
        预算可以直接保存；连接信息更新后，请保存模型配置。
      </small>
    </section>
  );
}
