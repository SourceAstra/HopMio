import { useEffect, useState, useCallback } from 'react';
import { useStudio } from '../state/StudioContext';
import { call } from '../api/client';
import type { Preferences, AIModelItem, Job } from '../types';
import { dataSnapshot } from '../utils/dataSnapshot';
import { ParentSettingsHero } from '../features/settings/ParentSettingsHero';
import { ParentSettingsTabs, type SettingsMainTab } from '../features/settings/ParentSettingsTabs';
import { AIModelsPanel } from '../features/settings/AIModelsPanel';
import { ParentGuardPanel } from '../features/settings/ParentGuardPanel';
import { BambuAccountPanel } from '../features/settings/BambuAccountPanel';
import { WorkshopEnginesPanel } from '../features/settings/WorkshopEnginesPanel';
import { RecentTasksPanel } from '../features/settings/RecentTasksPanel';
import { SettingsSavebar } from '../features/settings/SettingsSavebar';
import { Usagi } from '../components/Usagi';
import { ParentGate } from '../features/settings/ParentGate';
import type { ModelBudget } from '../features/settings/ModelBudgetFields';
import '../styles/model-settings.css';

export function Settings() {
  const s = useStudio();

  if (!s.preferences) {
    return (
      <div className="parent-settings-loading">
        <Usagi size={80} />
        <h2>乌萨奇正在准备工坊与设置…</h2>
        <p>正在读取云端配置与本地引擎状态，请稍候。</p>
      </div>
    );
  }

  return <SettingsReady preferences={s.preferences} />;
}

function SettingsReady({ preferences }: { preferences: Preferences }) {
  const s = useStudio();
  // 每次进入家长设置均需重新输入密码解锁，不跨次持久缓存
  const [guardianToken, setGuardianToken] = useState<string>('');
  const [mainTab, setMainTab] = useState<SettingsMainTab>('models');

  // 本地草稿状态（单一真实源 SSOT）
  const [values, setValues] = useState<Preferences>(preferences);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<AIModelItem | null>(() => {
    return preferences.models?.find((item) => item.id === preferences.active_model) || preferences.models?.[0] || null;
  });

  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // 任务历史列表
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);

  const fetchJobs = useCallback(async () => {
    setLoadingJobs(true);
    try {
      const list = await call<Job[]>('job.list');
      setJobs(list || []);
    } catch {
      // 保持安静，不阻断界面
    } finally {
      setLoadingJobs(false);
    }
  }, []);

  useEffect(() => {
    void fetchJobs();
  }, [fetchJobs]);

  // 当外部 preferences 发生变化且未 dirty 时同步
  useEffect(() => {
    if (!dirty) {
      setValues(preferences);
      if (!editing && preferences.models?.length) {
        setEditing(preferences.models.find((m) => m.id === preferences.active_model) || preferences.models[0]);
      }
    }
  }, [preferences, dirty]);

  const models = values.models || [];
  const activeModelItem = models.find((m) => m.id === values.active_model);
  const readyKeyCount = models.filter((item) => item.has_key || keys[item.id]).length;

  // 保存单个模型预算
  async function handleSaveBudget(budget: ModelBudget): Promise<boolean> {
    const currentPrefs = s.preferences;
    if (!editing || !currentPrefs?.models?.some((item) => item.id === editing.id)) {
      setNotice('请先保存候选列表，再单独保存这个模型的预算。');
      return false;
    }
    setSaving(true);
    try {
      const result = await call<Preferences>('settings.update', {
        token: guardianToken,
        values: {
          models: currentPrefs.models.map((item) =>
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
      setEditing((prev) => (prev ? { ...prev, ...budget } : prev));
      setNotice('模型预算已保存，下次调用生效。');
      return true;
    } catch (error) {
      const msg = (error as Error).message;
      if (msg.includes('家长解锁') || msg.includes('口令')) {
        setGuardianToken('');
        sessionStorage.removeItem('yaha_guardian_token');
      }
      setNotice(msg);
      return false;
    } finally {
      setSaving(false);
    }
  }

  // 添加或更新候选模型
  function handleAddCandidate(item: AIModelItem, key: string) {
    setDirty(true);
    const existing = models.find(
      (m) =>
        m.id === item.id ||
        (m.url.replace(/\/$/, '') === item.url.replace(/\/$/, '') &&
          m.model === item.model &&
          m.protocol === item.protocol),
    );
    const id = existing?.id || item.id;
    setValues((prev) => {
      const candidates = prev.models || [];
      const previousItem = candidates.find(
        (m) =>
          m.id === id ||
          (m.url === item.url && m.model === item.model && m.protocol === item.protocol),
      );
      return {
        ...prev,
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
    if (key) setKeys((prev) => ({ ...prev, [id]: key }));
    setNotice('候选列表有更改，点击下方“保存所有设置”后生效。');
    setEditing({ ...item, id });
  }

  // 保存所有全局设置
  async function handleSaveAll() {
    setSaving(true);
    setNotice('');
    try {
      const result = await call<Preferences>('settings.update', {
        token: guardianToken,
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
      setNotice('设置已全部保存，密钥安全保存在本地凭据库。');
    } catch (error) {
      const msg = (error as Error).message;
      if (msg.includes('家长解锁') || msg.includes('口令')) {
        setGuardianToken('');
        sessionStorage.removeItem('yaha_guardian_token');
      }
      setNotice(msg);
    } finally {
      setSaving(false);
    }
  }

  // 修改家长密码（复用白名单接口 settings.unlock 原子更新）
  const handleUpdatePin = async (oldPin: string, newPin: string): Promise<boolean> => {
    const res = await call<{ token: string }>('settings.unlock', {
      pin: oldPin,
      new_pin: newPin,
    });
    if (res?.token) {
      setGuardianToken(res.token);
      setValues((prev) => ({ ...prev, pin_set: true }));
      return true;
    }
    return false;
  };

  // 手动锁定设置
  const handleLock = () => {
    setGuardianToken('');
    setNotice('已手动锁定家长设置。');
  };

  // 若尚未解锁，呈现家长安全门禁 Gate
  if (!guardianToken) {
    return (
      <ParentGate
        pinSet={values.pin_set ?? preferences.pin_set}
        onUnlock={(tok) => {
          setGuardianToken(tok);
          setValues((prev) => ({ ...prev, pin_set: true }));
        }}
        onCancel={() => s.setRoom('desk')}
      />
    );
  }

  return (
    <div className="parent-settings-page">
      {/* 1. 统一顶栏 Hero 展台 */}
      <ParentSettingsHero
        preferences={values}
        activeModelName={activeModelItem?.name}
        modelCount={models.length}
        readyKeyCount={readyKeyCount}
        jobCount={jobs.length}
        onLock={handleLock}
      />

      {/* 2. 主分类导航 Tabs */}
      <ParentSettingsTabs
        value={mainTab}
        onChange={setMainTab}
        disabled={saving}
        badges={{
          models: models.length,
          guardian: values.cloud_enabled ? '已开启' : '离线',
          bambu: values.bambu?.configured
            ? values.bambu.online
              ? '在线'
              : '已绑定'
            : '未绑定',
          engines: values.blender?.available ? '引擎就绪' : '待配置',
          tasks: jobs.length,
        }}
      />

      {/* 3. 动态内容区 */}
      <div className="parent-settings-body">
        {/* Tab 1: AI 伙伴与模型 */}
        <section
          role="tabpanel"
          id="parent-panel-models"
          aria-labelledby="parent-tab-models"
          hidden={mainTab !== 'models'}
          className="tab-panel-container"
        >
          <AIModelsPanel
            models={models}
            activeModelId={values.active_model}
            keys={keys}
            editing={editing}
            saving={saving}
            onSelectModel={(item) => {
              setDirty(true);
              setValues((prev) => ({ ...prev, active_model: item.id }));
              setNotice('已更改活跃模型，点击保存生效。');
            }}
            onEditModel={setEditing}
            onImageVerified={(item) => {
              setDirty(true);
              setValues((prev) => ({
                ...prev,
                models: prev.models?.map((model) =>
                  model.id === item.id ? { ...model, supports_images: true } : model,
                ),
              }));
              setNotice('图片识别测试通过，已标记支持图片输入。');
            }}
            onDeleteModel={(item) => {
              if (models.length <= 1) {
                setNotice('请至少保留一个候选模型。');
                return;
              }
              const remaining = models.filter((model) => model.id !== item.id);
              setDirty(true);
              setValues((prev) => ({
                ...prev,
                models: remaining,
                active_model: prev.active_model === item.id ? remaining[0].id : prev.active_model,
              }));
              setEditing((prev) => (prev?.id === item.id ? remaining[0] : prev));
              setKeys((prev) => {
                const next = { ...prev };
                delete next[item.id];
                return next;
              });
              setNotice('模型已从列表移除。');
            }}
            onAddCandidate={handleAddCandidate}
            onSaveBudget={handleSaveBudget}
            onBudgetChange={(budget) => {
              setDirty(true);
              setValues((prev) => ({
                ...prev,
                models: prev.models?.map((item) =>
                  item.id === editing?.id ? { ...item, ...budget } : item,
                ),
              }));
            }}
          />
        </section>

        {/* Tab 2: 家长守护与隐私 */}
        <section
          role="tabpanel"
          id="parent-panel-guardian"
          aria-labelledby="parent-tab-guardian"
          hidden={mainTab !== 'guardian'}
          className="tab-panel-container"
        >
          <ParentGuardPanel
            cloudEnabled={values.cloud_enabled}
            dailyLimit={values.daily_limit}
            disabled={saving}
            onChangeCloudEnabled={(enabled) => {
              setDirty(true);
              setValues((prev) => ({ ...prev, cloud_enabled: enabled }));
              setNotice(`已${enabled ? '开启' : '关闭'}云端协同，点击保存生效。`);
            }}
            onChangeDailyLimit={(limit) => {
              setDirty(true);
              setValues((prev) => ({ ...prev, daily_limit: limit }));
              setNotice('已调整每日限额，点击保存生效。');
            }}
            onUpdatePin={handleUpdatePin}
          />
        </section>

        {/* Tab 3: 拓竹云打印设备 */}
        <section
          role="tabpanel"
          id="parent-panel-bambu"
          aria-labelledby="parent-tab-bambu"
          hidden={mainTab !== 'bambu'}
          className="tab-panel-container"
        >
          <BambuAccountPanel
            token={guardianToken}
            preferences={values}
            onPreferencesChange={(next) => {
              setValues(next);
              s.setPreferences(next);
            }}
            onNotice={setNotice}
          />
        </section>

        {/* Tab 4: 工坊引擎与能力 */}
        <section
          role="tabpanel"
          id="parent-panel-engines"
          aria-labelledby="parent-tab-engines"
          hidden={mainTab !== 'engines'}
          className="tab-panel-container"
        >
          <WorkshopEnginesPanel
            preferences={values}
            onRefresh={() => void s.act(async () => {
              const res = await call<Preferences>('settings.get');
              if (res) {
                setValues((prev) => ({ ...prev, ...res }));
                s.setPreferences(res);
              }
            })}
          />
        </section>

        {/* Tab 4: 造物任务流水线 */}
        <section
          role="tabpanel"
          id="parent-panel-tasks"
          aria-labelledby="parent-tab-tasks"
          hidden={mainTab !== 'tasks'}
          className="tab-panel-container"
        >
          <RecentTasksPanel
            jobs={jobs}
            loading={loadingJobs}
            onRefresh={() => void fetchJobs()}
          />
        </section>
      </div>

      {/* 4. 全局浮动吸底保存栏 */}
      <SettingsSavebar
        dirty={dirty}
        saving={saving}
        notice={notice}
        onSave={() => void handleSaveAll()}
      />
    </div>
  );
}
