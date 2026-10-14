import { useState } from 'react';
import { useStudio } from '../../state/StudioContext';
import { call } from '../../api/client';
import type { Preferences } from '../../types';
export function CloudForm({ token }: { token: string }) {
  const s = useStudio();
  const [values, setValues] = useState(s.preferences!);
  const [chatKey, setChatKey] = useState('');
  return (
    <section className="panel form-panel">
      <h2>云端造物配置</h2>
      <label className="checklist">
        <input
          type="checkbox"
          checked={values.cloud_enabled}
          onChange={(e) => setValues({ ...values, cloud_enabled: e.target.checked })}
        />
        允许上传描述和所选照片给 AI 服务
      </label>
      <label>
        每天最多几次云端提交
        <input
          type="number"
          min={1}
          max={50}
          value={values.daily_limit}
          onChange={(e) => setValues({ ...values, daily_limit: Number(e.target.value) })}
        />
      </label>
      <h3>AI 理解与参数建模</h3>
      {values.chat_registry_configured && (
        <small>
          模型由本项目 config/models.yaml 配置。密钥可在这里保存，也可由家长通过环境变量提供。
        </small>
      )}
      <label>
        接口协议
        <select
          value={values.chat_protocol || 'chat'}
          disabled={values.chat_registry_configured}
          onChange={(e) =>
            setValues({
              ...values,
              chat_protocol: e.target.value as 'chat' | 'messages',
            })
          }
        >
          <option value="chat">Chat Completions</option>
          <option value="messages">Messages（智谱 / Claude 兼容）</option>
        </select>
      </label>
      <label>
        HTTPS API 地址（支持完整端点）
        <input
          placeholder="https://服务商地址/v1"
          value={values.chat_url}
          disabled={values.chat_registry_configured}
          onChange={(e) => setValues({ ...values, chat_url: e.target.value })}
        />
      </label>
      <label>
        模型名称
        <input
          value={values.chat_model}
          disabled={values.chat_registry_configured}
          onChange={(e) => setValues({ ...values, chat_model: e.target.value })}
        />
      </label>
      <label>
        API 密钥 {s.preferences?.chat_configured ? '（已配置）' : ''}
        <input
          type="password"
          autoComplete="off"
          value={chatKey}
          onChange={(e) => setChatKey(e.target.value)}
        />
      </label>
      <button
        className="primary"
        disabled={s.busy}
        onClick={() =>
          void s.act(async () => {
            const prefs = await call<Preferences>('settings.update', {
              token,
              values: { ...values, chat_key: chatKey },
            });
            s.setPreferences(prefs);
            setValues(prefs);
            setChatKey('');
            s.setNotice('配置已保存，密钥保存在系统凭据库。');
          })
        }
      >
        保存家长设置
      </button>
      <p className="soft-notice">
        云端生成可能计费，次数限制不是金额上限。启用后会发送所选图片及描述，请勿上传个人隐私。停止等待不保证取消远程任务。
      </p>
    </section>
  );
}
