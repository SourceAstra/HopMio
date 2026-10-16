import { useState } from 'react';
import { useStudio } from '../../state/StudioContext';
import { call } from '../../api/client';
import type { Preferences, AIModelItem } from '../../types';
import { ModelConnectionForm } from './ModelConnectionForm';
import { ModelCandidatesPanel } from './ModelCandidatesPanel';
import { ModelDiscoveryPanel } from './ModelDiscoveryPanel';
import { ModelSettingsTabs, type ModelSettingsTab } from './ModelSettingsTabs';
import { ModelSettingsHeader } from './ModelSettingsHeader';
import type { ModelBudget } from './ModelBudgetFields';
import { dataSnapshot } from '../../utils/dataSnapshot';
import { Save, ShieldCheck } from 'lucide-react';
import '../../styles/model-settings.css';

export function CloudForm() {
  const s = useStudio();
  const [values, setValues] = useState<Preferences>(s.preferences!);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<AIModelItem | null>(
    () => s.preferences?.models?.find((item) => item.id === s.preferences?.active_model) || null,
  );
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<ModelSettingsTab>('configure');
  const models = values.models || [];
  async function saveBudget(budget: ModelBudget) {
    if (!editing || !s.preferences?.models?.some((item) => item.id === editing.id)) {
      setNotice('请先保存候选列表，再单独保存这个模型的预算。');
      return false;
    }
    setSaving(true);
    try {
      const result = await call<Preferences>('settings.update', {
        values: {
          models: s.preferences.models.map((item) =>
            item.id === editing.id ? { ...item, ...budget } : item,
          ),
        },
      });
      s.setPreferences(result);
      const nextValues = {
        ...values,
        models: values.models?.map((item) =>
          item.id === editing.id ? { ...item, ...budget } : item,
        ),
      };
      setValues(nextValues);
      const content = (value: Preferences) => ({
        cloud_enabled: value.cloud_enabled,
        daily_limit: value.daily_limit,
        active_model: value.active_model,
        models: value.models?.map(({ has_key, ...model }) => model),
      });
      setDirty(
        dataSnapshot(content(nextValues)) !== dataSnapshot(content(result)) ||
          Object.keys(keys).length > 0,
      );
      setEditing((previous) => (previous ? { ...previous, ...budget } : previous));
      setNotice('模型预算已保存，下次调用生效。');
      return true;
    } catch (error) {
      setNotice((error as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  }
  function add(item: AIModelItem, key: string) {
    setDirty(true);
    const existing = models.find(
      (m) =>
        m.id === item.id ||
        (m.url.replace(/\/$/, '') === item.url.replace(/\/$/, '') &&
          m.model === item.model &&
          m.protocol === item.protocol),
    );
    const id = existing?.id || item.id;
    setValues((previous) => {
      const candidates = previous.models || [];
      const previousItem = candidates.find(
        (m) =>
          m.id === id ||
          (m.url === item.url && m.model === item.model && m.protocol === item.protocol),
      );
      return {
        ...previous,
        models: previousItem
          ? candidates.map((m) =>
              m.id === previousItem.id
                ? {
                    ...item,
                    id: previousItem.id,
                    has_key: m.has_key,
                    supports_images:
                      item.id === previousItem.id
                        ? item.supports_images
                        : m.supports_images || item.supports_images,
                  }
                : m,
            )
          : [...candidates, item],
      };
    });
    if (key) setKeys((previous) => ({ ...previous, [id]: key }));
    setNotice('候选列表有更改，点击“保存模型配置”后生效。');
    setEditing({ ...item, id });
  }
  async function save() {
    setSaving(true);
    setNotice('');
    try {
      const result = await call<Preferences>('settings.update', {
        values: {
          cloud_enabled: values.cloud_enabled,
          daily_limit: values.daily_limit,
          models,
          active_model: values.active_model,
          model_keys: keys,
        },
      });
      setValues(result);
      s.setPreferences(result);
      setKeys({});
      setDirty(false);
      setNotice('模型候选列表与密钥已保存。');
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="model-settings">
      <ModelSettingsHeader
        count={models.length}
        ready={models.filter((item) => item.has_key || keys[item.id]).length}
        active={models.find((item) => item.id === values.active_model)?.name}
      />
      <ModelSettingsTabs value={tab} onChange={setTab} disabled={saving} />
      <fieldset disabled={saving}>
        <div
          role="tabpanel"
          id="model-panel-configure"
          aria-labelledby="model-tab-configure"
          hidden={tab !== 'configure'}
          className="model-config-grid"
        >
          <ModelCandidatesPanel
            models={models}
            active={values.active_model}
            keys={keys}
            onEdit={setEditing}
            onSelect={(item) => {
              setDirty(true);
              setValues((previous) => ({ ...previous, active_model: item.id }));
              setNotice('模型选择待保存。');
            }}
            onImageVerified={(item) => {
              setDirty(true);
              setValues((previous) => ({
                ...previous,
                models: previous.models?.map((model) =>
                  model.id === item.id ? { ...model, supports_images: true } : model,
                ),
              }));
              setNotice('图片识别通过，已启用图片能力，保存配置后生效。');
            }}
            onDelete={(item) => {
              if (models.length <= 1) {
                setNotice('请至少保留一个候选模型。');
                return;
              }
              const remaining = models.filter((model) => model.id !== item.id);
              setDirty(true);
              setValues((previous) => ({
                ...previous,
                models: remaining,
                active_model:
                  previous.active_model === item.id ? remaining[0].id : previous.active_model,
              }));
              setEditing((previous) => (previous?.id === item.id ? remaining[0] : previous));
              setKeys((previous) => {
                const next = { ...previous };
                delete next[item.id];
                return next;
              });
              setNotice('模型已从待保存列表移除。');
            }}
          />
          {editing ? (
            <ModelConnectionForm
              key={editing.id}
              initial={editing}
              initialKey={keys[editing.id]}
              onAdd={add}
              onSaveBudget={saveBudget}
              onBudgetChange={(budget) => {
                setDirty(true);
                setValues((previous) => ({
                  ...previous,
                  models: previous.models?.map((item) =>
                    item.id === editing.id ? { ...item, ...budget } : item,
                  ),
                }));
              }}
            />
          ) : (
            <section className="model-connection">
              <h3>选择一个造物搭档</h3>
              <p>点击候选模型的编辑按钮，即可设置连接与预算。</p>
              <button type="button" className="primary" onClick={() => setTab('discover')}>
                去发现模型
              </button>
            </section>
          )}
        </div>
        <div
          role="tabpanel"
          id="model-panel-discover"
          aria-labelledby="model-tab-discover"
          hidden={tab !== 'discover'}
        >
          <ModelDiscoveryPanel onAdd={add} onAdded={() => setTab('configure')} />
        </div>
        <div className="model-global" hidden={tab !== 'configure'}>
          <div className="model-global-title">
            <ShieldCheck size={22} />
            <div>
              <h3>家长守护</h3>
              <small>决定什么时候与云端搭档合作。</small>
            </div>
          </div>
          <label className="checklist model-cloud-switch">
            <input
              type="checkbox"
              checked={values.cloud_enabled}
              onChange={(e) => {
                setDirty(true);
                setValues({ ...values, cloud_enabled: e.target.checked });
              }}
            />
            <span>
              开启云端造物<small>允许发送描述和所选照片</small>
            </span>
          </label>
          <label className="model-quota">
            每日造物额度
            <div>
              <input
                type="number"
                min={0}
                max={999}
                value={values.daily_limit}
                onChange={(e) => {
                  setDirty(true);
                  setValues({ ...values, daily_limit: Math.max(0, Number(e.target.value)) });
                }}
              />
              <span>次 / 天</span>
            </div>
            <small>0 表示不限次数</small>
          </label>
        </div>
      </fieldset>
      {notice && (
        <p className="model-status" role="status">
          {notice}
        </p>
      )}
      <footer className="model-savebar">
        <div>
          <span className={`model-save-dot ${dirty ? 'dirty' : ''}`} />
          <strong>{dirty ? '有未保存的更改' : '配置已保存'}</strong>
          <small>密钥安全存放在系统凭据库</small>
        </div>
        <button
          type="button"
          className="primary"
          disabled={saving || !dirty}
          onClick={() => void save()}
        >
          <Save size={16} />
          {saving ? '正在保存…' : '保存模型配置'}
        </button>
      </footer>
    </section>
  );
}
