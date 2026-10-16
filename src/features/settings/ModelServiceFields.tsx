import { useState } from 'react';
import { Eye, EyeOff, Globe2, KeyRound } from 'lucide-react';
export interface ModelServiceConnection {
  url: string;
  api_key: string;
  protocol: 'chat' | 'messages';
}

export function ModelServiceFields({
  value,
  onChange,
  hasKey,
  disabled,
  discovery = false,
}: {
  value: ModelServiceConnection;
  onChange: (value: ModelServiceConnection) => void;
  hasKey?: boolean;
  disabled: boolean;
  discovery?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <>
      <div className="model-fields">
        <label>
          <span className="model-label-icon">
            <Globe2 size={13} />
            {discovery ? '发现模型服务地址' : '模型服务地址'}
          </span>
          <input
            disabled={disabled}
            placeholder="https://api.example.com/v1"
            value={value.url}
            onChange={(e) => onChange({ ...value, url: e.target.value })}
          />
        </label>
        <label>
          <span className="model-label-icon">
            <KeyRound size={13} />
            {discovery ? '发现服务 API Key' : 'API Key'}
          </span>
          <div className="model-key">
            <input
              aria-label={discovery ? '发现服务 API Key' : 'API Key'}
              disabled={disabled}
              type={visible ? 'text' : 'password'}
              autoComplete="off"
              placeholder={hasKey ? '留空使用已保存密钥' : '粘贴服务商提供的 API Key'}
              value={value.api_key}
              onChange={(e) => onChange({ ...value, api_key: e.target.value })}
            />
            <button
              type="button"
              aria-label={visible ? '隐藏 API Key' : '显示 API Key'}
              onClick={() => setVisible(!visible)}
            >
              {visible ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </label>
      </div>
      <label>
        {discovery ? '发现接口协议' : '接口协议'}
        <select
          value={value.protocol}
          disabled={disabled}
          onChange={(e) =>
            onChange({ ...value, protocol: e.target.value as ModelServiceConnection['protocol'] })
          }
        >
          <option value="chat">Chat Completions（兼容格式）</option>
          <option value="messages">Messages</option>
        </select>
      </label>
    </>
  );
}
