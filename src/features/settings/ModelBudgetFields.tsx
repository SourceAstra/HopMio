import type { AIModelItem } from '../../types';

export type ModelBudget = Required<
  Pick<
    AIModelItem,
    | 'max_tokens'
    | 'timeout_seconds'
    | 'reasoning_effort'
    | 'context_window_tokens'
    | 'max_input_tokens'
  >
>;
export const validModelBudget = (budget: ModelBudget) =>
  Number.isInteger(budget.max_tokens) &&
  budget.max_tokens >= 256 &&
  budget.max_tokens <= 1048576 &&
  Number.isInteger(budget.timeout_seconds) &&
  budget.timeout_seconds >= 30 &&
  budget.timeout_seconds <= 1800 &&
  [budget.context_window_tokens, budget.max_input_tokens].every(
    (value) => Number.isInteger(value) && value >= 0 && value <= 16777216,
  ) &&
  (!budget.context_window_tokens ||
    (budget.max_tokens < budget.context_window_tokens &&
      budget.max_input_tokens <= budget.context_window_tokens - budget.max_tokens));

export function ModelBudgetFields({
  value,
  onChange,
  disabled,
  onSave,
  target,
  status,
}: {
  value: ModelBudget;
  onChange: (budget: ModelBudget) => void;
  disabled: boolean;
  onSave?: () => void;
  target?: string;
  status?: string;
}) {
  return (
    <section className="model-budget-settings">
      <h4>输入、输出与等待设置</h4>
      <small>{target ? `当前编辑：${target}` : '新模型的初始预算，将随候选模型一起保存。'}</small>
      <div className="model-fields">
        <label>
          上下文窗口 Token
          <input
            aria-label="上下文窗口 Token"
            type="number"
            min={0}
            max={16777216}
            step={1}
            value={value.context_window_tokens}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, context_window_tokens: Number(e.target.value) })}
          />
          <small>输入＋预留输出的总空间，0 表示未知。</small>
        </label>
        <label>
          最大输入 Token
          <input
            aria-label="最大输入 Token"
            type="number"
            min={0}
            max={16777216}
            step={1}
            value={value.max_input_tokens}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, max_input_tokens: Number(e.target.value) })}
          />
          <small>0 自动使用上下文扣除输出后的空间；窗口未知时不设本地上限。</small>
        </label>
      </div>
      <div className="model-fields">
        <label>
          最大输出 Token
          <input
            aria-label="最大输出 Token"
            type="number"
            min={256}
            max={1048576}
            step={1}
            value={value.max_tokens || ''}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, max_tokens: Number(e.target.value) })}
          />
        </label>
        <label>
          最长等待时间（秒）
          <input
            aria-label="最长等待时间（秒）"
            type="number"
            min={30}
            max={1800}
            step={1}
            value={value.timeout_seconds || ''}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, timeout_seconds: Number(e.target.value) })}
          />
        </label>
      </div>
      <label>
        思考强度
        <select
          aria-label="思考强度"
          value={value.reasoning_effort || ''}
          disabled={disabled}
          onChange={(e) =>
            onChange({
              ...value,
              reasoning_effort: (e.target.value as ModelBudget['reasoning_effort']) || null,
            })
          }
        >
          <option value="">模型默认（不额外传参）</option>
          <option value="low">低</option>
          <option value="medium">中</option>
          <option value="high">高</option>
          <option value="max">最高（需服务支持）</option>
        </select>
      </label>
      <small>
        K 由服务商定义，请填写准确的 Token 数；输出 256K 可填写 262144（若服务商按十进制则填写
        256000）。部分模型的思考也占用输出。输入为本地文本估算，图片用量与精确 Token
        以厂商为准。仅在超出预算时移除最早历史，不截断当前模型与最新要求。保存后下次调用生效。
      </small>
      {!validModelBudget(value) && (
        <p className="model-status error" role="alert">
          请填写范围内的整数，输入上限＋预留输出不能超过上下文窗口；输入设为 0 可自动分配。
        </p>
      )}
      {onSave && (
        <button
          type="button"
          className="primary"
          disabled={disabled || !validModelBudget(value)}
          onClick={onSave}
        >
          {disabled ? '正在保存…' : '保存此模型预算'}
        </button>
      )}
      {onSave && <small>直接保存并生效，无需再点页底保存；地址和密钥等改动仍需单独保存。</small>}
      {status && (
        <p className="model-status" role="status">
          {status}
        </p>
      )}
    </section>
  );
}
