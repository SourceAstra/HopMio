import { useState } from 'react';
import { useStudio } from '../../state/StudioContext';
import { call } from '../../api/client';
import type { Preferences, AIModelItem } from '../../types';
import { Plus, Trash2, Edit3, Sparkles } from 'lucide-react';

export function CloudForm({ token }: { token: string }) {
  const s = useStudio();
  const [values, setValues] = useState<Preferences>(s.preferences!);
  const [chatKey, setChatKey] = useState('');
  const [modelKeys, setModelKeys] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<AIModelItem | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newModel, setNewModel] = useState<AIModelItem>({
    id: '',
    name: '',
    model: '',
    url: '',
    protocol: 'chat',
    supports_images: true,
  });
  const [newKey, setNewKey] = useState('');

  const models = values.models || [];
  const activeModel = models.find((m) => m.id === values.active_model) || models[0];

  const handleSelectActive = (id: string) => {
    setValues({
      ...values,
      active_model: id,
    });
  };

  const handleStartEdit = (m: AIModelItem) => {
    setEditingId(m.id);
    setEditForm({ ...m });
  };

  const handleSaveEdit = () => {
    if (!editForm) return;
    if (!editForm.name.trim() || !editForm.model.trim() || !editForm.url.trim()) {
      alert('请完整填写模型名称、模型标识与 HTTPS 服务地址。');
      return;
    }
    const updated = models.map((m) => (m.id === editForm.id ? editForm : m));
    setValues({ ...values, models: updated });
    setEditingId(null);
    setEditForm(null);
  };

  const handleDeleteModel = (id: string) => {
    if (models.length <= 1) {
      alert('至少需要保留一个模型配置。');
      return;
    }
    if (window.confirm('确定要删除这个模型配置吗？')) {
      const remaining = models.filter((m) => m.id !== id);
      const nextActive = values.active_model === id ? remaining[0].id : values.active_model;
      setValues({
        ...values,
        models: remaining,
        active_model: nextActive,
      });
    }
  };

  const handleAddModel = () => {
    if (!newModel.name.trim() || !newModel.model.trim() || !newModel.url.trim()) {
      alert('请完整填写显示名称、模型标识与 HTTPS 服务地址。');
      return;
    }
    const id = newModel.id.trim() || newModel.model.trim() + '-' + Date.now().toString(36).slice(-4);
    const item: AIModelItem = {
      ...newModel,
      id,
    };
    if (newKey.trim()) {
      setModelKeys((prev) => ({ ...prev, [id]: newKey.trim() }));
    }
    setValues({
      ...values,
      models: [...models, item],
      active_model: id,
    });
    setShowAdd(false);
    setNewModel({
      id: '',
      name: '',
      model: '',
      url: '',
      protocol: 'chat',
      supports_images: true,
    });
    setNewKey('');
  };

  const applyTemplate = (type: string) => {
    if (type === 'deepseek') {
      setNewModel({
        id: 'deepseek-chat',
        name: 'DeepSeek-V3 (官方端点)',
        model: 'deepseek-chat',
        url: 'https://api.deepseek.com/v1',
        protocol: 'chat',
        supports_images: false,
      });
    } else if (type === 'glm-flash') {
      setNewModel({
        id: 'glm-5.3-flash',
        name: '智谱 GLM-5.3-Flash',
        model: 'glm-5.3-flash',
        url: 'https://open.bigmodel.cn/api/anthropic/v1/messages',
        protocol: 'messages',
        supports_images: true,
      });
    } else if (type === 'glm') {
      setNewModel({
        id: 'glm-5.3',
        name: '智谱 GLM-5.3',
        model: 'glm-5.3',
        url: 'https://open.bigmodel.cn/api/anthropic/v1/messages',
        protocol: 'messages',
        supports_images: true,
      });
    } else if (type === 'qwen') {
      setNewModel({
        id: 'qwen-max',
        name: '阿里通义千问 Qwen-Max',
        model: 'qwen-max',
        url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        protocol: 'chat',
        supports_images: true,
      });
    } else if (type === 'openai') {
      setNewModel({
        id: 'gpt-4o',
        name: 'OpenAI GPT-4o',
        model: 'gpt-4o',
        url: 'https://api.openai.com/v1',
        protocol: 'chat',
        supports_images: true,
      });
    }
  };

  const handleSaveAll = () => {
    void s.act(async () => {
      const keysToSave = { ...modelKeys };
      if (chatKey.trim() && activeModel?.id) {
        keysToSave[activeModel.id] = chatKey.trim();
      }
      const prefs = await call<Preferences>('settings.update', {
        token,
        values: {
          cloud_enabled: values.cloud_enabled,
          daily_limit: values.daily_limit,
          models: values.models,
          active_model: values.active_model,
          model_keys: keysToSave,
          chat_key: chatKey.trim() || undefined,
        },
      });
      s.setPreferences(prefs);
      setValues(prefs);
      setChatKey('');
      setModelKeys({});
      s.setNotice('家长设置与模型列表已保存。');
    });
  };

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
        每天最多几次云端提交（设为 0 表示不限制）
        <input
          type="number"
          min={0}
          max={999}
          value={values.daily_limit}
          onChange={(e) => setValues({ ...values, daily_limit: Math.max(0, Number(e.target.value)) })}
        />
      </label>

      <div className="model-section-divider" style={{ borderTop: '1px solid #ebd499', margin: '4px 0 10px' }} />

      <h3>当前生效模型（下拉选择）</h3>
      <label>
        选择要用于造物的 AI 模型
        <select
          value={values.active_model || activeModel?.id || ''}
          onChange={(e) => handleSelectActive(e.target.value)}
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} ({m.model}) · {m.protocol === 'messages' ? 'Anthropic 格式' : 'OpenAI 格式'}
              {m.has_key ? ' [已配密钥]' : ' [未配密钥]'}
            </option>
          ))}
        </select>
      </label>

      {activeModel && (
        <div
          className="active-model-card"
          style={{
            background: '#fffbf0',
            border: '1.5px solid #ebd499',
            borderRadius: '12px',
            padding: '12px 14px',
            fontSize: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: '13.5px', color: '#2b2207' }}>
              ✦ {activeModel.name}
            </strong>
            <span
              style={{
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: '12px',
                background: activeModel.has_key ? '#e6fffa' : '#fff5f5',
                color: activeModel.has_key ? '#234e52' : '#c53030',
                border: activeModel.has_key ? '1px solid #b2f5ea' : '1px solid #fed7d7',
                fontWeight: 700,
              }}
            >
              {activeModel.has_key ? '✓ API 密钥已就绪' : '⚠️ 尚未配置 API 密钥'}
            </span>
          </div>
          <div style={{ color: '#8c7e68' }}>
            端点: <code>{activeModel.url}</code> · 协议: {activeModel.protocol} · {activeModel.supports_images ? '📷 支持图片分析' : '📄 仅文字'}
          </div>
        </div>
      )}

      <label>
        为【{activeModel?.name || '当前模型'}】配置 / 更新 API 密钥
        <input
          type="password"
          autoComplete="off"
          placeholder={activeModel?.has_key ? '留空保持原有密钥不变；输入新密钥以覆盖' : '请输入该模型的 API Key'}
          value={chatKey}
          onChange={(e) => setChatKey(e.target.value)}
        />
      </label>

      <div className="model-section-divider" style={{ borderTop: '1px solid #ebd499', margin: '8px 0 10px' }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>模型配置列表 ({models.length})</h3>
        <button
          type="button"
          className="secondary"
          style={{ padding: '4px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
          onClick={() => setShowAdd(!showAdd)}
        >
          <Plus size={14} /> ＋ 添加新模型
        </button>
      </div>

      {showAdd && (
        <div
          className="add-model-panel"
          style={{
            background: '#fff9e6',
            border: '1.5px dashed #f6ad55',
            borderRadius: '12px',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#ad7714', flexWrap: 'wrap' }}>
            <Sparkles size={14} /> 快速选用模板：
            <button type="button" className="secondary" style={{ padding: '2px 8px', fontSize: '11px' }} onClick={() => applyTemplate('deepseek')}>DeepSeek</button>
            <button type="button" className="secondary" style={{ padding: '2px 8px', fontSize: '11px' }} onClick={() => applyTemplate('glm-flash')}>GLM-Flash</button>
            <button type="button" className="secondary" style={{ padding: '2px 8px', fontSize: '11px' }} onClick={() => applyTemplate('glm')}>GLM-5.3</button>
            <button type="button" className="secondary" style={{ padding: '2px 8px', fontSize: '11px' }} onClick={() => applyTemplate('qwen')}>通义千问</button>
            <button type="button" className="secondary" style={{ padding: '2px 8px', fontSize: '11px' }} onClick={() => applyTemplate('openai')}>OpenAI</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <label style={{ fontSize: '11.5px' }}>
              显示名称
              <input
                placeholder="例如 DeepSeek-V3"
                value={newModel.name}
                onChange={(e) => setNewModel({ ...newModel, name: e.target.value })}
              />
            </label>
            <label style={{ fontSize: '11.5px' }}>
              模型标识 (Model ID)
              <input
                placeholder="例如 deepseek-chat"
                value={newModel.model}
                onChange={(e) => setNewModel({ ...newModel, model: e.target.value })}
              />
            </label>
          </div>
          <label style={{ fontSize: '11.5px' }}>
            HTTPS API 端点地址
            <input
              placeholder="https://api.deepseek.com/v1"
              value={newModel.url}
              onChange={(e) => setNewModel({ ...newModel, url: e.target.value })}
            />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <label style={{ fontSize: '11.5px' }}>
              接口协议
              <select
                value={newModel.protocol}
                onChange={(e) => setNewModel({ ...newModel, protocol: e.target.value as 'chat' | 'messages' })}
              >
                <option value="chat">Chat Completions (OpenAI 格式)</option>
                <option value="messages">Messages (Claude / 智谱 格式)</option>
              </select>
            </label>
            <label style={{ fontSize: '11.5px' }}>
              初始 API 密钥 (可选)
              <input
                type="password"
                placeholder="直接填入 API Key"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
              />
            </label>
          </div>
          <label className="checklist" style={{ fontSize: '11.5px' }}>
            <input
              type="checkbox"
              checked={newModel.supports_images}
              onChange={(e) => setNewModel({ ...newModel, supports_images: e.target.checked })}
            />
            支持图片分析（Vision 多模态输入）
          </label>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
            <button type="button" className="secondary" onClick={() => setShowAdd(false)}>取消</button>
            <button type="button" className="primary" onClick={handleAddModel}>确认加入模型列表</button>
          </div>
        </div>
      )}

      <div className="model-items-container" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {models.map((m) => (
          <div
            key={m.id}
            style={{
              padding: '10px 14px',
              borderRadius: '10px',
              border: m.id === values.active_model ? '2px solid #f59e0b' : '1px solid #e2d9c8',
              background: m.id === values.active_model ? '#fffdf5' : '#ffffff',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            {editingId === m.id && editForm ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <label style={{ fontSize: '11px' }}>
                    显示名称
                    <input
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    />
                  </label>
                  <label style={{ fontSize: '11px' }}>
                    模型标识
                    <input
                      value={editForm.model}
                      onChange={(e) => setEditForm({ ...editForm, model: e.target.value })}
                    />
                  </label>
                </div>
                <label style={{ fontSize: '11px' }}>
                  API 服务地址
                  <input
                    value={editForm.url}
                    onChange={(e) => setEditForm({ ...editForm, url: e.target.value })}
                  />
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <label style={{ fontSize: '11px' }}>
                    协议
                    <select
                      value={editForm.protocol}
                      onChange={(e) => setEditForm({ ...editForm, protocol: e.target.value as 'chat' | 'messages' })}
                    >
                      <option value="chat">Chat Completions</option>
                      <option value="messages">Messages</option>
                    </select>
                  </label>
                  <label style={{ fontSize: '11px' }}>
                    设置新密钥
                    <input
                      type="password"
                      placeholder="留空保持不变"
                      value={modelKeys[m.id] || ''}
                      onChange={(e) => setModelKeys({ ...modelKeys, [m.id]: e.target.value })}
                    />
                  </label>
                </div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
                  <button type="button" className="secondary" onClick={() => setEditingId(null)}>取消</button>
                  <button type="button" className="primary" onClick={handleSaveEdit}>保存修改</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <strong style={{ fontSize: '13px', color: '#2b2207' }}>{m.name}</strong>
                    {m.id === values.active_model && (
                      <span style={{ fontSize: '10px', background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', borderRadius: '4px', padding: '1px 5px', fontWeight: 700 }}>
                        当前生效
                      </span>
                    )}
                    <span style={{ fontSize: '10.5px', color: '#92846e' }}>({m.model})</span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#8c7e68' }}>
                    {m.protocol} · {m.supports_images ? '📷 多模态' : '📄 纯文本'} · {m.has_key ? '🔑 密钥已配' : '⚠️ 密钥未配'}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                  {m.id !== values.active_model && (
                    <button
                      type="button"
                      className="secondary"
                      style={{ padding: '3px 8px', fontSize: '11px' }}
                      onClick={() => handleSelectActive(m.id)}
                    >
                      设为当前
                    </button>
                  )}
                  <button
                    type="button"
                    className="secondary"
                    title="编辑此模型配置"
                    style={{ padding: '4px 6px', display: 'flex', alignItems: 'center' }}
                    onClick={() => handleStartEdit(m)}
                  >
                    <Edit3 size={13} />
                  </button>
                  <button
                    type="button"
                    className="secondary danger-btn"
                    title="删除此模型"
                    style={{ padding: '4px 6px', display: 'flex', alignItems: 'center' }}
                    onClick={() => handleDeleteModel(m.id)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <button
        className="primary"
        style={{ marginTop: '12px' }}
        disabled={s.busy}
        onClick={handleSaveAll}
      >
        保存家长设置与模型列表
      </button>

      <p className="soft-notice">
        云端生成可能计费，次数限制不是金额上限。启用后会发送所选图片及描述，请勿上传个人隐私。停止等待不保证取消远程任务。
      </p>
    </section>
  );
}
