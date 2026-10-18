import { useState } from 'react';
import type { AIModelItem } from '../../types';
import { ModelConnectionForm } from './ModelConnectionForm';
import { ModelCandidatesPanel } from './ModelCandidatesPanel';
import { ModelDiscoveryPanel } from './ModelDiscoveryPanel';
import { ModelSettingsTabs, type ModelSettingsTab } from './ModelSettingsTabs';
import type { ModelBudget } from './ModelBudgetFields';
import { Compass, Bot } from 'lucide-react';

export function AIModelsPanel({
  models,
  activeModelId,
  keys,
  editing,
  saving,
  onSelectModel,
  onEditModel,
  onDeleteModel,
  onImageVerified,
  onAddCandidate,
  onSaveBudget,
  onBudgetChange,
}: {
  models: AIModelItem[];
  activeModelId?: string;
  keys: Record<string, string>;
  editing: AIModelItem | null;
  saving: boolean;
  onSelectModel: (item: AIModelItem) => void;
  onEditModel: (item: AIModelItem) => void;
  onDeleteModel: (item: AIModelItem) => void;
  onImageVerified: (item: AIModelItem) => void;
  onAddCandidate: (item: AIModelItem, key: string) => void;
  onSaveBudget: (budget: ModelBudget) => Promise<boolean>;
  onBudgetChange: (budget: ModelBudget) => void;
}) {
  const [subTab, setSubTab] = useState<ModelSettingsTab>('configure');

  return (
    <div className="model-settings ai-models-panel-wrap">
      {/* 顶部二级小分类：模型配置 vs 发现模型 */}
      <div className="models-subtab-bar">
        <ModelSettingsTabs value={subTab} onChange={setSubTab} disabled={saving} />
      </div>

      <fieldset disabled={saving} className="models-fieldset">
        {/* 子视图 1: 候选模型管理与配置 */}
        <div
          role="tabpanel"
          id="model-panel-configure"
          aria-labelledby="model-tab-configure"
          hidden={subTab !== 'configure'}
          className="model-config-grid"
        >
          <ModelCandidatesPanel
            models={models}
            active={activeModelId}
            keys={keys}
            onEdit={onEditModel}
            onSelect={onSelectModel}
            onImageVerified={onImageVerified}
            onDelete={onDeleteModel}
          />

          {editing ? (
            <ModelConnectionForm
              key={editing.id}
              initial={editing}
              initialKey={keys[editing.id]}
              onAdd={onAddCandidate}
              onSaveBudget={onSaveBudget}
              onBudgetChange={onBudgetChange}
            />
          ) : (
            <section className="model-connection model-empty-selection">
              <div className="model-empty-prompt">
                <Bot size={40} className="empty-prompt-icon" />
                <h3>选择一个造物搭档</h3>
                <p>点击左侧候选模型的“编辑”按钮，即可设置网络连接、API 密钥与预算。</p>
                <button type="button" className="primary" onClick={() => setSubTab('discover')}>
                  <Compass size={16} />
                  <span>去发现新模型</span>
                </button>
              </div>
            </section>
          )}
        </div>

        {/* 子视图 2: 发现与连接新服务 */}
        <div
          role="tabpanel"
          id="model-panel-discover"
          aria-labelledby="model-tab-discover"
          hidden={subTab !== 'discover'}
        >
          <ModelDiscoveryPanel
            onAdd={onAddCandidate}
            onAdded={() => setSubTab('configure')}
          />
        </div>
      </fieldset>
    </div>
  );
}
