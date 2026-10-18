import { Bot, ShieldCheck, Printer, Cpu, ListTodo } from 'lucide-react';

export type SettingsMainTab = 'models' | 'guardian' | 'bambu' | 'engines' | 'tasks';

export function ParentSettingsTabs({
  value,
  onChange,
  disabled,
  badges,
}: {
  value: SettingsMainTab;
  onChange: (tab: SettingsMainTab) => void;
  disabled?: boolean;
  badges?: {
    models?: number;
    guardian?: string;
    bambu?: string;
    engines?: string;
    tasks?: number;
  };
}) {
  const tabs = [
    {
      id: 'models' as const,
      label: 'AI 伙伴与模型',
      description: '管理搭档、连接与预算',
      Icon: Bot,
      badge: badges?.models ? `${badges.models} 个搭档` : undefined,
    },
    {
      id: 'guardian' as const,
      label: '家长守护与隐私',
      description: '云端授权、配额与凭据',
      Icon: ShieldCheck,
      badge: badges?.guardian,
    },
    {
      id: 'bambu' as const,
      label: '拓竹云打印设备',
      description: '账号登录、实机遥测与控制',
      Icon: Printer,
      badge: badges?.bambu,
    },
    {
      id: 'engines' as const,
      label: '工坊能力与引擎',
      description: 'Blender、切片与三维重建',
      Icon: Cpu,
      badge: badges?.engines,
    },
    {
      id: 'tasks' as const,
      label: '造物任务流水线',
      description: '最近历史与诊断日志',
      Icon: ListTodo,
      badge: badges?.tasks ? `${badges.tasks} 项` : undefined,
    },
  ];

  return (
    <nav className="parent-nav-tabs" role="tablist" aria-label="家长与设置功能分类">
      {tabs.map(({ id, label, description, Icon, badge }, index) => {
        const isSelected = value === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            id={`parent-tab-${id}`}
            aria-controls={`parent-panel-${id}`}
            aria-selected={isSelected}
            tabIndex={isSelected ? 0 : -1}
            disabled={disabled}
            className={`parent-nav-tab ${isSelected ? 'active' : ''}`}
            onClick={() => onChange(id)}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? tabs.length - 1
                    : event.key === 'ArrowLeft'
                      ? (index - 1 + tabs.length) % tabs.length
                      : (index + 1) % tabs.length;
              onChange(tabs[next].id);
              document.getElementById(`parent-tab-${tabs[next].id}`)?.focus();
            }}
          >
            <div className="parent-tab-icon-wrap">
              <Icon size={20} />
            </div>
            <div className="parent-tab-content">
              <div className="parent-tab-header">
                <strong>{label}</strong>
                {badge && <span className="parent-tab-badge">{badge}</span>}
              </div>
              <small>{description}</small>
            </div>
          </button>
        );
      })}
    </nav>
  );
}
