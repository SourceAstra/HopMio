import { SlidersHorizontal, Search } from 'lucide-react';
export type ModelSettingsTab = 'configure' | 'discover';

export function ModelSettingsTabs({
  value,
  onChange,
  disabled,
}: {
  value: ModelSettingsTab;
  onChange: (tab: ModelSettingsTab) => void;
  disabled: boolean;
}) {
  const tabs = [
    {
      id: 'configure' as const,
      label: '模型配置',
      Icon: SlidersHorizontal,
      description: '管理搭档、调整预算',
    },
    {
      id: 'discover' as const,
      label: '发现模型',
      Icon: Search,
      description: '连接服务、添加新搭档',
    },
  ];
  return (
    <div className="model-settings-tabs" role="tablist" aria-label="模型设置分类">
      {tabs.map(({ id, label, Icon, description }, index) => (
        <button
          key={id}
          type="button"
          role="tab"
          id={`model-tab-${id}`}
          aria-controls={`model-panel-${id}`}
          aria-selected={value === id}
          tabIndex={value === id ? 0 : -1}
          disabled={disabled}
          onClick={() => onChange(id)}
          onKeyDown={(event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const next =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? tabs.length - 1
                  : (index + 1) % tabs.length;
            onChange(tabs[next].id);
            document.getElementById(`model-tab-${tabs[next].id}`)?.focus();
          }}
        >
          <Icon size={19} />
          <span>
            <strong>{label}</strong>
            <small>{description}</small>
          </span>
        </button>
      ))}
    </div>
  );
}
